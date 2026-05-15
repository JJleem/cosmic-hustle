"""
테스트 픽스처 및 모의 객체 설정.
db/agent_runner 등 외부 의존성을 sys.modules에서 먼저 패치해 pipeline import가 실패하지 않도록 함.
"""
import sys
from unittest.mock import MagicMock, AsyncMock

# DB 관련 모듈 패치 (PostgreSQL 연결 불필요)
_db_mock = MagicMock()
sys.modules.setdefault("db", _db_mock)
sys.modules.setdefault("db.wiki_store", MagicMock(semantic_search=MagicMock(), sync_concepts_dir=MagicMock()))
sys.modules.setdefault("db.connection", MagicMock(SessionLocal=MagicMock()))
sys.modules.setdefault("db.models", MagicMock())
sys.modules.setdefault("db.embedder", MagicMock())
sys.modules.setdefault("db.logger", MagicMock(log_error=MagicMock()))
