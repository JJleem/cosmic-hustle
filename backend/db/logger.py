"""DB 에러 로그 기록 유틸리티."""
import uuid
import traceback
from .connection import SessionLocal
from .models import SystemLog


def log_error(
    message: str,
    source: str = "pipeline",
    level: str = "error",
    stack_trace: str | None = None,
    session_id: str | None = None,
    exc: BaseException | None = None,
):
    if exc is not None and stack_trace is None:
        stack_trace = traceback.format_exc()
    db = SessionLocal()
    try:
        db.add(SystemLog(
            id=str(uuid.uuid4()),
            level=level,
            source=source,
            message=message,
            stack_trace=stack_trace,
            session_id=session_id,
        ))
        db.commit()
    except Exception:
        pass
    finally:
        db.close()
