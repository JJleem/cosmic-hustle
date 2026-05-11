"""
SQLite → PostgreSQL 데이터 마이그레이션 스크립트

사용법:
  cd backend
  python migrate_sqlite.py

기존 web/cosmic-hustle.db 데이터를 PostgreSQL로 복사.
이미 존재하는 row는 ON CONFLICT DO NOTHING으로 스킵.
"""
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import sqlalchemy as sa
from db.connection import engine

SQLITE_PATH = Path(__file__).parent.parent / "web" / "cosmic-hustle.db"


def ts_to_dt(value) -> datetime | None:
    """SQLite timestamp(int 또는 float) → datetime."""
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).replace(tzinfo=None)
    except Exception:
        return None


def migrate():
    if not SQLITE_PATH.exists():
        print(f"SQLite DB 없음: {SQLITE_PATH}")
        sys.exit(1)

    sqlite = sqlite3.connect(str(SQLITE_PATH))
    sqlite.row_factory = sqlite3.Row

    with engine.begin() as pg:
        # ── sessions ──────────────────────────────────────────────
        rows = sqlite.execute("SELECT * FROM sessions").fetchall()
        if rows:
            pg.execute(sa.text("""
                INSERT INTO sessions (id, topic, status, created_at, completed_at)
                VALUES (:id, :topic, :status, :created_at, :completed_at)
                ON CONFLICT (id) DO NOTHING
            """), [
                {
                    "id": r["id"],
                    "topic": r["topic"],
                    "status": r["status"],
                    "created_at": ts_to_dt(r["created_at"]),
                    "completed_at": ts_to_dt(r["completed_at"]),
                }
                for r in rows
            ])
        print(f"sessions    : {len(rows)}행 처리")

        # ── reports ───────────────────────────────────────────────
        rows = sqlite.execute("SELECT * FROM reports").fetchall()
        if rows:
            pg.execute(sa.text("""
                INSERT INTO reports (id, session_id, agent_id, topic, content, created_at)
                VALUES (:id, :session_id, :agent_id, :topic, :content, :created_at)
                ON CONFLICT (id) DO NOTHING
            """), [
                {
                    "id": r["id"],
                    "session_id": r["session_id"],
                    "agent_id": r["agent_id"],
                    "topic": r["topic"],
                    "content": r["content"],
                    "created_at": ts_to_dt(r["created_at"]),
                }
                for r in rows
            ])
        print(f"reports     : {len(rows)}행 처리")

        # ── session_events ────────────────────────────────────────
        rows = sqlite.execute("SELECT * FROM session_events").fetchall()
        if rows:
            pg.execute(sa.text("""
                INSERT INTO session_events (id, session_id, seq, payload, created_at)
                VALUES (:id, :session_id, :seq, :payload, :created_at)
                ON CONFLICT (id) DO NOTHING
            """), [
                {
                    "id": r["id"],
                    "session_id": r["session_id"],
                    "seq": r["seq"],
                    "payload": r["payload"],
                    "created_at": ts_to_dt(r["created_at"]),
                }
                for r in rows
            ])
        print(f"session_events: {len(rows)}행 처리")

        # ── memos ─────────────────────────────────────────────────
        rows = sqlite.execute("SELECT * FROM memos").fetchall()
        if rows:
            pg.execute(sa.text("""
                INSERT INTO memos (id, text, created_at)
                VALUES (:id, :text, :created_at)
                ON CONFLICT (id) DO NOTHING
            """), [
                {
                    "id": r["id"],
                    "text": r["text"],
                    "created_at": ts_to_dt(r["created_at"]),
                }
                for r in rows
            ])
        print(f"memos       : {len(rows)}행 처리")

    sqlite.close()
    print("\n마이그레이션 완료")


if __name__ == "__main__":
    migrate()
