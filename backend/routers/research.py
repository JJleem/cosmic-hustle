import asyncio
import json
import uuid
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from db.connection import get_db
from db import models
from orchestrator.pipeline import run_pipeline, pending_responses, cancelled_sessions

router = APIRouter(prefix="/api")


class ResearchRequest(BaseModel):
    topic: str
    taskType: str = "research"
    mode: str = "full"


class CheckinResponse(BaseModel):
    response: str = ""


@router.post("/research")
async def start_research(body: ResearchRequest, db: Session = Depends(get_db)):
    topic = body.topic
    task_type = body.taskType
    mode = body.mode
    session_id = str(uuid.uuid4())

    # 세션 DB 저장
    db.add(models.Session(id=session_id, topic=topic, status="working"))
    db.commit()

    seq_counter = [0]

    async def generator():
        try:
            async for event in run_pipeline(session_id, topic, task_type, mode):
                # 리포트 이벤트면 DB에도 저장
                if event.get("type") == "report":
                    try:
                        report_db = models.Report(
                            id=event.get("reportId", str(uuid.uuid4())),
                            session_id=session_id,
                            agent_id=event.get("agentId", ""),
                            topic=topic,
                            content=event.get("content", ""),
                        )
                        db.add(report_db)
                        db.commit()
                    except Exception:
                        pass

                # 이벤트 로그 DB 저장
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

            # 완료 처리
            db.query(models.Session).filter(models.Session.id == session_id).update({"status": "done"})
            db.commit()

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield {"data": json.dumps({"type": "error", "message": str(e)})}
            db.query(models.Session).filter(models.Session.id == session_id).update({"status": "error"})
            db.commit()

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
    db.query(models.Session).filter(models.Session.id == session_id).update({"status": "cancelled"})
    db.commit()
    return {"ok": True}


@router.get("/research/{session_id}/events")
def get_events(session_id: str, since: int = 0, db: Session = Depends(get_db)):
    events = (
        db.query(models.SessionEvent)
        .filter(models.SessionEvent.session_id == session_id, models.SessionEvent.seq > since)
        .order_by(models.SessionEvent.seq)
        .all()
    )
    return [{"seq": e.seq, "payload": json.loads(e.payload)} for e in events]


@router.get("/sessions")
def get_sessions(db: Session = Depends(get_db)):
    sessions = (
        db.query(models.Session)
        .order_by(models.Session.created_at.desc())
        .limit(50)
        .all()
    )
    return [{"id": s.id, "topic": s.topic, "status": s.status, "createdAt": str(s.created_at)} for s in sessions]


@router.get("/reports")
def get_reports(db: Session = Depends(get_db)):
    reports = (
        db.query(models.Report)
        .order_by(models.Report.created_at.desc())
        .limit(100)
        .all()
    )
    return [{"id": r.id, "sessionId": r.session_id, "agentId": r.agent_id,
             "topic": r.topic, "content": r.content, "createdAt": str(r.created_at)} for r in reports]


@router.get("/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        return {"error": "not found"}
    return {"id": report.id, "sessionId": report.session_id, "agentId": report.agent_id,
            "topic": report.topic, "content": report.content, "createdAt": str(report.created_at)}


@router.delete("/reports/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    db.query(models.Report).filter(models.Report.id == report_id).delete()
    db.commit()
    return {"ok": True}
