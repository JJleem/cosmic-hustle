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
├── awards.py                 # 사원상 — 글별 지표 수집 + 3축 점수(성과/비용/품질)
├── quality.py                # 사원상 1축 — 고정앵커 페어와이즈 LLM 판사(Haiku+Sonnet)
├── dm.py                      # 에이전트 DM — RAG grounding 인격 대화 코어(검색·캐시·비용가드·프롬프트)
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
│   ├── blog.py               # GET/POST /api/blog/*
│   ├── awards.py             # GET /api/awards, POST /api/awards/collect (사원상)
│   └── dm.py                 # POST /api/dm (SSE), GET /api/dm/status|agents (에이전트 DM)
└── tests/                    # pytest 단위 테스트 (63개)
```

---

## 배포 현황

| 레이어 | 위치 | 비고 |
|--------|------|------|
| 백엔드 | AWS Lightsail `3.36.239.214:8000` | systemd `cosmic-backend.service` |
| DB | Lightsail 동일 서버 PostgreSQL 16 | `cosmic_hustle` DB, 마이그레이션 030까지 적용 |
| 자동배포 | GitHub Actions | `backend/` 변경 push → 자동 rsync + restart |
| 블로그 프론트 | Vercel | https://cosmic-hustle.ai.kr/ |

### 서버 SSH
```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-northeast-2.pem ubuntu@3.36.239.214
sudo systemctl status|restart|stop cosmic-backend
```
> ⚠️ 수동 API 호출(블로그 생성·`generate-quiz` 등 `X-Admin-Key` 필요한 호출)은 공인 IP(`http://3.36.239.214:8000`) 말고 **SSH 접속 후 `http://localhost:8000`** 으로 칠 것. ADMIN_KEY가 평문 HTTP로 인터넷에 노출되는 걸 막기 위함(서버는 TLS 미적용).

### .env (로컬 및 서버 공통 키 목록)
```
DATABASE_URL=postgresql://cosmic:cosmic1234@localhost:5432/cosmic_hustle
ANTHROPIC_API_KEY=...
FAL_KEY=...
TORCHDYNAMO_DISABLE=1
GA4_PROPERTY_ID=539592160
GA4_SERVICE_ACCOUNT_JSON=/path/to/ga_service_account.json
INDEXNOW_KEY=...  # IndexNow(Bing·Naver 등) 색인 통보용, 없으면 IndexNow no-op
REVALIDATE_SECRET=...  # 발행 시 프론트(Next.js) ISR 캐시 즉시 갱신용 공유키. 프론트 /api/revalidate의 X-Revalidate-Secret 헤더와 동일값. 없으면 revalidate no-op
GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON=/path/to/sa.json  # 레거시/거의 불필요. Google Indexing 통보 기능은 제거됨(SA를 GSC 소유자로 못 붙임 → 403). 현재는 gsc_client의 GSC SA 폴백으로만 잔존(보통 GSC_TOKEN_JSON 사용)
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
ADMIN_KEY=...           # X-Admin-Key 헤더값. 블로그 수동생성·DM IP제한 우회 등 관리 호출에 필요
DM_DAILY_BUDGET_KRW=500 # 선택. 에이전트 DM 일일 글로벌 지출 상한(원). 초과 시 기능 자동 OFF
DM_IP_DAILY_LIMIT=5     # 선택. DM IP당 일일 메시지 수. X-Admin-Key 호출은 무제한
DM_CACHE_DIST=0.22      # 선택. 시맨틱 캐시 히트 임계 코사인거리(작을수록 엄격). 미설정 시 0.22
DM_SHOW_DIST=0.55       # 선택. 출처 칩 노출 임계 코사인거리(이보다 가까운 청크만 노출)
USD_KRW=1400            # 선택. DM 비용 원화 환산 환율(지출 상한 계산용)
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
| `_awards_metrics_job` | 매일 06:30 KST | 사원상 — 이번 달 글별 GSC/GA 지표 수집(`blog_post_metrics`) |
| `_awards_judge_job` | 매일 09:25 KST | 사원상 — 새 글 품질 판정(앵커 대비 페어와이즈, `only_missing`이라 기존 글 스킵) |
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

### 모델 교체 시 확인할 것

모델 ID만 바꾸면 조용히 깨진다. 2026-08-30 Sonnet 4.6 → 5 교체 때 응답 파싱이
전부 터져 9/1 자동 생성이 3회 재시도 모두 실패했다
(`'ThinkingBlock' object has no attribute 'text'`).

- **응답 파싱** — `content[0].text`를 쓰지 말 것. 모델에 따라 첫 블록이 ThinkingBlock일
  수 있다. 항상 `anthropic_text.text_of(message)`로 text 블록만 이어 붙인다.
- **thinking 기본값** — Sonnet 5는 `thinking` 미지정에도 adaptive thinking이 켜진다.
  Sonnet 4.6은 명시해야 켜졌다.
- **거부되는 파라미터** — 최신 모델은 `temperature`·`top_p`·`budget_tokens`와
  assistant prefill을 400으로 거부한다. 교체 전 grep으로 확인한다.
- **max_tokens** — 응답이 JSON이면 잘림에 주의. 한국어는 토큰을 많이 먹는다.

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
GET    /api/blog/posts/popular?days=7&limit=3  # 최근 고유조회+사람 좋아요/댓글 기반 인기글
GET    /api/blog/posts/{slug}
POST   /api/blog/generate
DELETE /api/blog/posts/{id}
PATCH  /api/blog/posts/{id}
GET    /api/awards?period=YYYY-MM             # 사원상 3축 점수표 (프론트 대시보드용, 공개)
POST   /api/awards/collect?period=YYYY-MM     # GSC/GA 지표 수집 (X-Admin-Key)
GET    /api/awards/reference                  # 고정 레퍼런스 세트(앵커) 목록
POST   /api/awards/reference                  # 앵커 교체 [{slug,note}] (X-Admin-Key)
POST   /api/awards/judge                      # 품질 페어와이즈 판정 실행 (X-Admin-Key)
POST   /api/dm                                # 에이전트 DM (SSE). body:{agent_id,message,history[]}
GET    /api/dm/status                         # 기능 on/off + 남은 예산 + 내 IP 남은 횟수
GET    /api/dm/agents                         # DM 가능 에이전트 목록(11명)
```

### 에이전트 DM (포트폴리오 데모)
독자가 11명 중 한 명을 골라 DM처럼 대화. RAG grounding(그 에이전트 과거 블로그 글 + wiki 코퍼스)으로
환각 차단, 출처 칩 노출. 모델 Haiku 고정. 코어 로직 `dm.py`, 라우터 `routers/dm.py`.
- **비용 가드**: 일일 글로벌 지출 상한(`DM_DAILY_BUDGET_KRW`, 기본 500원) 초과 시 자동 OFF + 안내.
  IP당 일일 횟수(`DM_IP_DAILY_LIMIT`, 기본 5). `X-Admin-Key`면 IP제한 우회(라이브 시연용).
- **시맨틱 캐시**: 같은 에이전트 유사질문(코사인거리 < `DM_CACHE_DIST` 0.22) 재사용 → LLM 스킵·비용 0.
  실측: 패러프레이즈 0.04~0.21 / 무관 0.76+ 라 0.22가 안전.
- **환각 가드**: 세계관(회사·동료·사건)은 근거 없으면 인격에 맞게 "모른다". 출처 칩은 충분히 가까운
  청크(거리 < `DM_SHOW_DIST` 0.55)만 노출.
- 메시지당 ~6원(Haiku, 입력 ~3k토큰=페르소나+청크) → 500원 상한 = 하루 ~80통(캐시 제외).
- ⚠️ **과거 글 grounding은 `blog_posts.embedding` 필요** — 마이그 027 이후 글은 자동 부여,
  이전 글은 `POST /api/blog/_backfill-embeddings`(X-Admin-Key) 1회 실행 필요.

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
