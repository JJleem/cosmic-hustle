from fastapi import APIRouter
from sqlalchemy import text
from db.connection import SessionLocal

router = APIRouter()

@router.get("/health")
def health_check():
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "error", "db": str(e)}
