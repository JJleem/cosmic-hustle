# Backend — Cosmic Hustle

Python 3.12 + FastAPI. 에이전트 오케스트레이션, 블로그 자동화, GA 분석.
프로젝트 전체 구조 → 루트 `CLAUDE.md` 참고.

---

## 디렉토리 구조

```
backend/
├── main.py                   # FastAPI 앱 + APScheduler (블로그/메모리/GA 자동화)
├── run.py                    # uvicorn 실행 진입점
├── blog_generator.py         # 블로그 포스트 생성 + 에이전트 메모리 업데이트
├── ga_client.py              # GA4 Data API 클라이언트
├── ga_monthly.py             # 월간 GA 분석 파이프라인 (카→버즈→메모리→이메일)
├── requirements.txt
├── .env                      # gitignore됨, 직접 생성
├── agents/                   # 에이전트별 CLAUDE.md (per-agent 컨텍스트)
├── orchestrator/
│   ├── pipeline.py           # 메인 오케스트레이션 (_Pipeline 클래스)
│   ├── agent_runner.py       # asyncio 서브프로세스 실시간 스트리밍
│   ├── prompts.py            # 프롬프트 템플릿 + TASK_CONFIG + WRITER_AGENT_ID
│   └── types.py              # Pydantic v2 모델 (PlanResult, KaResult 등 7개)
├── db/
│   ├── models.py             # 테이블 정의
│   ├── connection.py         # DB 연결
│   ├── embedder.py           # SentenceTransformer 싱글톤
│   ├── wiki_store.py         # semantic_search / upsert_wiki_entry
│   └── logger.py             # log_error() — DB 에러 로그 기록
├── routers/
│   ├── health.py             # GET /health
│   ├── research.py           # POST /research, SSE 스트리밍
│   ├── wiki.py               # GET/POST /api/wiki
│   ├── memos.py              # GET/POST/DELETE /api/memos
│   ├── versions.py           # GET /api/sessions/{id}/versions
│   ├── export.py             # GET /api/reports/{id}/export?format=pdf|excel
│   ├── logs.py               # GET/POST /api/logs
│   └── blog.py               # GET/POST /api/blog/*
└── tests/                    # pytest 단위 테스트 (52개)
```

---

## 배포 현황

| 레이어 | 위치 | 비고 |
|--------|------|------|
| 백엔드 | AWS Lightsail `3.36.239.214:8000` | systemd `cosmic-backend.service` |
| DB | Lightsail 동일 서버 PostgreSQL 16 | `cosmic_hustle` DB, 마이그레이션 021까지 적용 |
| 자동배포 | GitHub Actions | `backend/` 변경 push → 자동 rsync + restart |
| 블로그 프론트 | Vercel | https://cosmic-hustle.ai.kr/ |

### 서버 SSH
```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-northeast-2.pem ubuntu@3.36.239.214
sudo systemctl status|restart|stop cosmic-backend
```

### .env (로컬 및 서버 공통 키 목록)
```
DATABASE_URL=postgresql://cosmic:cosmic1234@localhost:5432/cosmic_hustle
ANTHROPIC_API_KEY=...
FAL_KEY=...
TORCHDYNAMO_DISABLE=1
GA4_PROPERTY_ID=539592160
GA4_SERVICE_ACCOUNT_JSON=/path/to/ga_service_account.json
INDEXNOW_KEY=...  # IndexNow(Bing·Naver 등) 색인 통보용, 없으면 IndexNow no-op
GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON=/path/to/sa.json  # 선택. 없으면 GA4 서비스계정 재사용. Indexing API 활성화 + GSC 소유자 등록 필요
GSC_SITE_URL=https://cosmic-hustle.ai.kr/  # 선택. GSC 검색어 수집용 속성 URL(URL-prefix는 끝에 /, 도메인 속성은 sc-domain:cosmic-hustle.ai.kr). 사전작업: Cloud에서 "Search Console API" 활성화(Indexing API와 별개). 미설정/실패 시 GSC 섹션 no-op
GSC_TOKEN_JSON=/home/ubuntu/backend/gsc_token.json  # 선택(권장). GSC 검색어 수집 자격증명 — 사이트 소유자 본인 OAuth 토큰. 새 GSC UI가 SA 이메일을 거부해 SA를 못 붙이므로 본인 계정 토큰 사용. 발급: scripts/generate_gsc_token.py. 없으면 GOOGLE_INDEXING/GA4 SA로 폴백(단 SA가 GSC 소유자여야 함)
VAPID_PUBLIC_KEY=...   # 웹푸시 공개키 — 프론트가 /api/blog/push/vapid-public-key로 받아감
VAPID_PRIVATE_KEY=...  # 웹푸시 개인키 — 절대 커밋·노출 금지. 없으면 웹푸시 전체 no-op
VAPID_SUBJECT=mailto:leemjaejun@gmail.com  # 선택 (기본값 동일)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=leemjaejun@gmail.com
SMTP_PASSWORD=...  # Gmail 앱 비밀번호 (띄어쓰기 없이 16자리)
REPORT_EMAIL=leemjaejun@gmail.com
```
서버 JSON 경로: `/home/ubuntu/backend/ga_service_account.json`

---

## 새 컴퓨터에서 시작하는 법

```bash
# 1. PostgreSQL 설치 (macOS)
brew install postgresql@16
brew services start postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# 2. DB/유저 생성
psql postgres -c "CREATE USER cosmic WITH PASSWORD 'cosmic1234';"
psql postgres -c "CREATE DATABASE cosmic_hustle OWNER cosmic;"

# 3. pgvector 빌드
git clone --branch v0.8.2 https://github.com/pgvector/pgvector.git /tmp/pgvector
cd /tmp/pgvector
PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config make && make install
psql -U $(whoami) -d cosmic_hustle -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 4. venv + 의존성
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
brew install pango  # weasyprint PDF용

# 5. .env 생성 후 마이그레이션
.venv/bin/alembic upgrade head

# 6. 실행
.venv/bin/python run.py   # → http://localhost:8000
```

---

## APScheduler 자동화 작업

| 작업 | 시간 | 설명 |
|------|------|------|
| `_daily_blog_job` | 매일 09:00 KST | 블로그 포스트 생성 |
| `_memory_update_job` | 매일 09:05 KST | 어제 포스트 반응 → 에이전트 메모리 업데이트 |
| `_user_reply_job` | 매일 09:10 KST | 유저 댓글에 에이전트 대댓글 |
| `_ga_monthly_job` | 매월 1일 06:00 KST | GA4 분석 → 메모리 업데이트 → 이메일 |

GA 수동 실행: `POST /api/ga/run-monthly?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

---

## 블로그 프로젝트

AI 에이전트 11명이 매일 1개씩 자동 생성하는 공개 블로그.
**https://cosmic-hustle.ai.kr/** — 운영 중

- 프론트: `~/Desktop/repository/cosmic-blog/` (Vercel 자동배포)
- 백엔드 API: `/api/blog/*` (이 레포, Lightsail 서버)
- 스케줄: 매일 09:00 KST, 요일별 에이전트 순환 (buzz/pocke/over/ka/pixel/ping/wiki)
- 파이프라인: Google 뉴스 RSS → Claude 트렌드 수집 → 글 생성 → Flux Kontext 썸네일
- 에이전트 메모리: `agent_memory` 테이블 — 일일(조회수/댓글) + 월간(GA) 자동 업데이트

---

## 파이프라인 핵심 동작

```
writer attempt 1 → 팩트(피드백만, 항상 통과) → writer attempt 2 → 완료
```
- 팩트는 절대 passed:false 반환 안 함 (프롬프트 강제)
- 라이터 정확히 2번 실행 (초안 → 수정본)
- 포케 max_turns=8 (ToolSearch 1 + WebSearch 최대 6 + JSON 출력 1)

### 에이전트 모델 배정

| 에이전트 | 모델 |
|---------|------|
| wiki, fact, ping, root, plan, pocke | Haiku |
| ka, over, pixel, buzz, run | Sonnet |

### 태스크 타입 (9개)

| id | 이름 | writer | outputFormat |
|----|------|--------|--------------|
| research | 리서치 보고서 | 오버 | report |
| blog | 블로그 포스팅 | 오버 | blog_post |
| tech | 기술 리서치 | 오버 | report |
| marketing | 마케팅 전략 | 버즈 | document |
| design_ux | UX 리서치/기획 | 픽셀 | document |
| design_ui | UI 디자인 (HTML) | 픽셀 | html |
| dev | 개발 구현 | 런+루트 | document |
| dev_plan | 개발 기획서 | 오버 | document |
| dev_spec | 기능 명세서 | 오버 | document |

---

## API 계약

```
POST   /api/research                        # 리서치 시작 (SSE 스트림)
GET    /api/research/{id}/events?since=N    # 이벤트 재생
POST   /api/research/{id}/respond           # CEO 체크인 응답
POST   /api/research/{id}/cancel|pause|restart
GET    /api/reports                         # 리포트 목록
GET    /api/reports/{id}
PATCH  /api/reports/{id}
DELETE /api/reports/{id}
GET    /api/reports/{id}/export?format=pdf|excel
GET    /api/sessions/{id}/versions
GET    /api/memos
POST   /api/memos
DELETE /api/memos/{id}
GET    /api/wiki/search?q=
POST   /api/wiki/ingest|ingest-local|sync
GET    /api/wiki/graph
GET    /api/wiki/{id}
PATCH  /api/wiki/{id}
GET    /api/logs?level=&source=&session_id=
POST   /api/logs
POST   /api/ga/run-monthly                  # GA 분석 수동 트리거
GET    /api/blog/posts
GET    /api/blog/posts/{slug}
POST   /api/blog/generate
DELETE /api/blog/posts/{id}
PATCH  /api/blog/posts/{id}
```

## SSE 이벤트 타입

```
session_start / agent_start / agent_done / agent_stream
agent_message / agent_thinking / agent_expression
draft_report / report_version / report
ping_ideas / clarify_request / ceo_checkin
complete / error
```

---

## 토큰 최적화

- 에이전트별 CLAUDE.md + cwd 격리 (`agents/{id}/`) — 거대한 루트 CLAUDE.md 로딩 차단
- 에이전트 간 전체 컨텍스트 전달 X, 구조화된 JSON 핸드오프만
- maxTurns 제한 (팩트 1턴, 포케 8턴)
- 병렬 실행: 위키+포케 동시, 핑+위키업데이트 동시

## 세션 지속성

- `sessionEvents` 테이블: 모든 SSE 이벤트를 seq 순서로 DB 저장
- 재접속 시 `/api/research/{id}/events?since=N` 으로 배치 재생

---

## 남은 로드맵

```
파이프라인
[ ] 병렬 실행 확대 — 카 완료 후 writer 준비 overlap
[ ] 배경 리서치 — CEO가 다른 일 하는 동안 실행, 완료 알림

새 기능
[ ] 에이전트 expression 시스템 — sad/err/happy 이미지 파일만 추가하면 됨
[ ] 리포트 → Notion/슬랙 내보내기
[ ] 정기 리서치 예약 — cron 기반
[ ] 멀티 프로젝트 동시 실행

장기
[ ] Phase 5: LangGraph + Anthropic API 전환
[ ] 3D 회의실 UI
```

---

# Claude Code 행동 지침

## 1. 코딩 전 생각
- 가정을 명시적으로 밝힐 것. 불확실하면 물어볼 것.
- 여러 해석이 있으면 제시 — 혼자 선택하지 말 것.
- 더 단순한 방법이 있으면 말할 것.

## 2. 단순하게
- 요청한 것만. 투기적 기능 없음.
- 단일 사용 코드에 추상화 없음.
- 200줄짜리가 50줄로 될 수 있으면 다시 쓸 것.

## 3. 수술적 변경
- 건드려야 할 것만 건드릴 것.
- 관련 없는 코드 개선 금지.
- 기존 스타일 맞출 것.

## 4. 목표 중심 실행
- 성공 기준을 정의하고 검증까지 완료할 것.
