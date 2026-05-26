import json
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from db.connection import get_db
from db import models
from db.models import SessionCheckpoint  # noqa: F401 — ensure model is loaded
from orchestrator.pipeline import run_pipeline, pending_responses, cancelled_sessions, paused_sessions
from orchestrator.mock_pipeline import run_mock_pipeline

router = APIRouter(prefix="/api")


def _ts(dt) -> int | None:
    if dt is None:
        return None
    try:
        return int(dt.replace(tzinfo=timezone.utc).timestamp())
    except Exception:
        return None


def _sse_generator(session_id: str, topic: str, db, pipeline_kwargs: dict):
    """SSE 제너레이터 팩토리. start_research / restart_session 공통 로직."""
    seq_counter = [0]

    async def generator():
        try:
            async for event in run_pipeline(**pipeline_kwargs):
                if event.get("type") == "report":
                    try:
                        db.add(models.Report(
                            id=event.get("reportId", str(uuid.uuid4())),
                            session_id=session_id,
                            agent_id=event.get("agentId", ""),
                            topic=topic,
                            content=event.get("content", ""),
                            task_type=event.get("taskType"),
                        ))
                        db.commit()
                    except Exception:
                        pass
                try:
                    seq_counter[0] += 1
                    db.add(models.SessionEvent(
                        id=str(uuid.uuid4()),
                        session_id=session_id,
                        seq=seq_counter[0],
                        payload=json.dumps(event, ensure_ascii=False),
                    ))
                    db.commit()
                except Exception:
                    pass
                yield {"data": json.dumps(event, ensure_ascii=False)}

            db.query(models.Session).filter(models.Session.id == session_id).update({"status": "done"})
            db.commit()

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield {"data": json.dumps({"type": "error", "message": str(e)})}
            db.query(models.Session).filter(models.Session.id == session_id).update({"status": "error"})
            db.commit()
        finally:
            cancelled_sessions.discard(session_id)

    return generator


class ReportStyleModel(BaseModel):
    length: str = "standard"           # brief | standard | detailed | landing | dashboard | card
    tone: str = "formal"               # formal | casual | analytical | dark | light | colorful
    writerPersonality: str | None = None  # neutral | expressive | None(auto)
    primaryColor: str | None = None    # hex 또는 색상명 (pixel_ui 전용)


class ResearchRequest(BaseModel):
    topic: str
    taskType: str = "research"
    taskTypeId: str | None = None   # frontend sends taskTypeId
    mode: str = "full"
    reportStyle: ReportStyleModel | None = None


class CheckinResponse(BaseModel):
    response: str = ""


@router.post("/research")
async def start_research(body: ResearchRequest, db: Session = Depends(get_db), mock: bool = Query(False)):
    topic = body.topic.strip() or "Mock 테스트"
    if not mock and not topic:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "topic required"}, status_code=400)

    session_id = str(uuid.uuid4())
    db.add(models.Session(id=session_id, topic=topic, status="working"))
    db.commit()

    task_type = body.taskTypeId or body.taskType

    if mock:
        async def mock_gen():
            async for event in run_mock_pipeline(session_id, topic, task_type=task_type):
                if event.get("type") == "report":
                    try:
                        db.add(models.Report(
                            id=event.get("reportId", str(uuid.uuid4())),
                            session_id=session_id,
                            agent_id=event.get("agentId", ""),
                            topic=topic,
                            content=event.get("content", ""),
                            task_type=event.get("taskType"),
                        ))
                        db.commit()
                    except Exception:
                        pass
                yield {"data": json.dumps(event, ensure_ascii=False)}
            db.query(models.Session).filter(models.Session.id == session_id).update({"status": "done"})
            db.commit()
        return EventSourceResponse(mock_gen())
    mode = body.mode
    report_style = {
        "length": body.reportStyle.length,
        "tone": body.reportStyle.tone,
        "writerPersonality": body.reportStyle.writerPersonality,
        "primaryColor": body.reportStyle.primaryColor,
    } if body.reportStyle else None

    generator = _sse_generator(session_id, topic, db, {
        "session_id": session_id, "topic": topic,
        "task_type": task_type, "mode": mode, "report_style": report_style,
    })
    return EventSourceResponse(generator())


@router.post("/research/{session_id}/respond")
async def respond_to_checkin(session_id: str, body: CheckinResponse):
    future = pending_responses.get(session_id)
    if future and not future.done():
        future.set_result(body.response)
    return {"ok": True}


@router.post("/research/{session_id}/cancel")
async def cancel_session(session_id: str, db: Session = Depends(get_db)):
    cancelled_sessions.add(session_id)
    future = pending_responses.get(session_id)
    if future and not future.done():
        future.cancel()
    db.query(models.Session).filter(
        models.Session.id == session_id
    ).update({"status": "cancelled"})
    db.commit()
    return {"ok": True}


@router.post("/research/{session_id}/pause")
async def pause_session(session_id: str, db: Session = Depends(get_db)):
    paused_sessions.add(session_id)
    future = pending_responses.get(session_id)
    if future and not future.done():
        future.cancel()
    db.query(models.Session).filter(
        models.Session.id == session_id
    ).update({"status": "paused"})
    db.commit()
    return {"ok": True}


@router.post("/research/{session_id}/restart")
async def restart_session(session_id: str, db: Session = Depends(get_db), fresh: bool = Query(False)):
    from fastapi.responses import JSONResponse as _JSONResponse

    checkpoint_row = (
        db.query(models.SessionCheckpoint)
        .filter(models.SessionCheckpoint.session_id == session_id)
        .order_by(models.SessionCheckpoint.created_at.desc())
        .first()
    )
    if not checkpoint_row:
        if not fresh:
            # 원본 세션 topic 반환 — 프론트가 fresh=true로 재시도하거나 새 임무 안내
            original = db.query(models.Session).filter(models.Session.id == session_id).first()
            topic = original.topic if original else ""
            return _JSONResponse({"error": "checkpoint not found", "topic": topic}, status_code=404)
        # fresh=true: 체크포인트 없이 처음부터 재실행
        original = db.query(models.Session).filter(models.Session.id == session_id).first()
        if not original:
            return _JSONResponse({"error": "session not found"}, status_code=404)
        topic = str(original.topic)
        paused_sessions.discard(session_id)
        new_session_id = str(uuid.uuid4())
        db.add(models.Session(id=new_session_id, topic=topic, status="working"))
        db.commit()
        generator = _sse_generator(new_session_id, topic, db, {
            "session_id": new_session_id, "topic": topic,
            "task_type": "research", "mode": "full",
        })
        return EventSourceResponse(generator())

    checkpoint = json.loads(str(checkpoint_row.payload))
    topic = checkpoint.get("topic", "")
    new_session_id = str(uuid.uuid4())

    db.add(models.Session(id=new_session_id, topic=topic, status="working"))
    db.commit()
    paused_sessions.discard(session_id)

    generator = _sse_generator(new_session_id, topic, db, {
        "session_id": new_session_id,
        "topic": topic,
        "task_type": checkpoint.get("resolved_task_type", "research"),
        "mode": checkpoint.get("mode", "full"),
        "ceo_notes": checkpoint.get("ceo_notes", ""),
        "report_style": checkpoint.get("report_style"),
        "checkpoint": checkpoint,
    })
    return EventSourceResponse(generator())


@router.get("/research/{session_id}/events")
def get_events(session_id: str, since: int = 0, db: Session = Depends(get_db)):
    session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if not session:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "session not found"}, status_code=404)

    q = db.query(models.SessionEvent).filter(
        models.SessionEvent.session_id == session_id
    )
    if since > 0:
        q = q.filter(models.SessionEvent.seq > since)
    events = q.order_by(models.SessionEvent.seq).all()

    return {
        "status": session.status,
        "events": [{"seq": e.seq, "event": json.loads(str(e.payload))} for e in events],
    }


@router.get("/sessions")
def get_sessions(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Session)
        .order_by(models.Session.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": s.id,
            "topic": s.topic,
            "status": s.status,
            "createdAt": _ts(s.created_at),
            "completedAt": _ts(s.completed_at),
        }
        for s in rows
    ]


@router.get("/reports")
def get_reports(
    q: str = Query(default=""),
    agent: str = Query(default=""),
    date: str = Query(default=""),
    tag: str = Query(default=""),
    sort: str = Query(default="newest"),
    db: Session = Depends(get_db),
):
    query = db.query(models.Report)

    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            models.Report.topic.ilike(term) | models.Report.content.ilike(term)
        )
    if agent.strip():
        query = query.filter(models.Report.agent_id == agent.strip())
    if tag.strip():
        query = query.filter(models.Report.tags.ilike(f'%"{tag.strip()}"%'))
    if date.strip():
        now = datetime.now(timezone.utc)
        if date == "today":
            cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif date == "week":
            cutoff = now - timedelta(days=7)
        elif date == "month":
            cutoff = now - timedelta(days=30)
        else:
            cutoff = None
        if cutoff:
            query = query.filter(models.Report.created_at >= cutoff)

    if sort == "oldest":
        query = query.order_by(models.Report.created_at.asc())
    elif sort == "name":
        query = query.order_by(models.Report.topic.asc())
    else:
        query = query.order_by(models.Report.created_at.desc())

    rows = query.limit(200).all()
    return [_serialize_report(r) for r in rows]


@router.get("/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not r:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "not found"}, status_code=404)
    return _serialize_report(r)


class ReportUpdate(BaseModel):
    topic: str | None = None
    content: str | None = None
    tags: list[str] | None = None


def _serialize_report(r: models.Report) -> dict:
    return {
        "id": r.id,
        "sessionId": r.session_id,
        "agentId": r.agent_id,
        "topic": r.topic,
        "content": r.content,
        "tags": json.loads(str(r.tags)) if r.tags else [],
        "thumbnailPrompts": json.loads(str(r.thumbnail_prompts)) if r.thumbnail_prompts else None,
        "taskType": r.task_type,
        "createdAt": _ts(r.created_at),
    }


@router.patch("/reports/{report_id}")
def update_report(report_id: str, body: ReportUpdate, db: Session = Depends(get_db)):
    updates: dict = {}
    if body.topic is not None:
        updates["topic"] = body.topic
    if body.content is not None:
        updates["content"] = body.content
    if body.tags is not None:
        updates["tags"] = json.dumps(body.tags, ensure_ascii=False)
    if not updates:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "no fields to update"}, status_code=400)
    db.query(models.Report).filter(models.Report.id == report_id).update(updates)
    db.commit()
    r = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not r:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "not found"}, status_code=404)
    return _serialize_report(r)


@router.delete("/reports/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    db.query(models.Report).filter(models.Report.id == report_id).delete()
    db.commit()
    return {"ok": True}
