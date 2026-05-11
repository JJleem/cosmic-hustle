import asyncio
import json
import uuid
from datetime import timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from db.connection import get_db
from db import models
from orchestrator.pipeline import run_pipeline, pending_responses, cancelled_sessions

router = APIRouter(prefix="/api")


def _ts(dt) -> int | None:
    """datetime → Unix timestamp(seconds). None if dt is None."""
    if dt is None:
        return None
    try:
        return int(dt.replace(tzinfo=timezone.utc).timestamp())
    except Exception:
        return None


class ReportStyleModel(BaseModel):
    length: str = "standard"   # brief | standard | detailed
    tone: str = "formal"       # formal | casual | analytical


class ResearchRequest(BaseModel):
    topic: str
    taskType: str = "research"
    taskTypeId: str | None = None   # frontend sends taskTypeId
    mode: str = "full"
    reportStyle: ReportStyleModel | None = None


class CheckinResponse(BaseModel):
    response: str = ""


@router.post("/research")
async def start_research(body: ResearchRequest, db: Session = Depends(get_db)):
    topic = body.topic.strip()
    if not topic:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "topic required"}, status_code=400)

    task_type = body.taskTypeId or body.taskType
    mode = body.mode
    report_style = {"length": body.reportStyle.length, "tone": body.reportStyle.tone} if body.reportStyle else None
    session_id = str(uuid.uuid4())

    db.add(models.Session(id=session_id, topic=topic, status="working"))
    db.commit()

    seq_counter = [0]

    async def generator():
        try:
            async for event in run_pipeline(session_id, topic, task_type, mode, report_style=report_style):
                if event.get("type") == "report":
                    try:
                        db.add(models.Report(
                            id=event.get("reportId", str(uuid.uuid4())),
                            session_id=session_id,
                            agent_id=event.get("agentId", ""),
                            topic=topic,
                            content=event.get("content", ""),
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

            db.query(models.Session).filter(
                models.Session.id == session_id
            ).update({"status": "done"})
            db.commit()

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield {"data": json.dumps({"type": "error", "message": str(e)})}
            db.query(models.Session).filter(
                models.Session.id == session_id
            ).update({"status": "error"})
            db.commit()
        finally:
            cancelled_sessions.discard(session_id)

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
        "events": [{"seq": e.seq, "event": json.loads(e.payload)} for e in events],
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
def get_reports(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Report)
        .order_by(models.Report.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": r.id,
            "sessionId": r.session_id,
            "agentId": r.agent_id,
            "topic": r.topic,
            "content": r.content,
            "createdAt": _ts(r.created_at),
        }
        for r in rows
    ]


@router.get("/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not r:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "not found"}, status_code=404)
    return {"id": r.id, "sessionId": r.session_id, "agentId": r.agent_id,
            "topic": r.topic, "content": r.content, "createdAt": _ts(r.created_at)}


class ReportUpdate(BaseModel):
    topic: str | None = None
    content: str | None = None


@router.patch("/reports/{report_id}")
def update_report(report_id: str, body: ReportUpdate, db: Session = Depends(get_db)):
    updates: dict = {}
    if body.topic is not None:
        updates["topic"] = body.topic
    if body.content is not None:
        updates["content"] = body.content
    if not updates:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "no fields to update"}, status_code=400)
    db.query(models.Report).filter(models.Report.id == report_id).update(updates)
    db.commit()
    r = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not r:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "not found"}, status_code=404)
    return {"id": r.id, "sessionId": r.session_id, "agentId": r.agent_id,
            "topic": r.topic, "content": r.content, "createdAt": _ts(r.created_at)}


@router.delete("/reports/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    db.query(models.Report).filter(models.Report.id == report_id).delete()
    db.commit()
    return {"ok": True}
