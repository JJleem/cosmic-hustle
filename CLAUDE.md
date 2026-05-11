# Cosmic Hustle

우주 리서치 회사. 사용자 = CEO, AI 에이전트 11명 = 직원. 주제를 던지면 에이전트들이 역할 분담해서 조사하고 리포트를 만들어줌.

---

## V2.0 아키텍처 (진행 중)

### 목표
- 에이전트 오케스트레이션을 Python FastAPI 백엔드로 분리
- SQLite → PostgreSQL + pgvector 마이그레이션
- 위키+포케 병렬 실행으로 파이프라인 속도 개선
- 향후 Anthropic API 직접 전환 시 LangGraph 도입 예정

### V2.0 기술 스택

| 레이어 | 기술 | 역할 |
|--------|------|------|
| Frontend | Next.js 15 + TypeScript | UI, SSE 수신 (기존 유지) |
| Backend | Python 3.12 + FastAPI | 에이전트 오케스트레이션, SSE 발신 |
| Orchestration | 직접 구현한 StateGraph (asyncio) | 추후 LangGraph로 교체 예정 |
| AI | Claude Code SDK (`@anthropic-ai/claude-code`) | Claude Code 구독 토큰 사용 |
| DB | PostgreSQL 16 + pgvector | 세션·리포트·위키 (벡터 검색 포함) |
| Search | Claude WebSearch 툴 | 포케가 직접 WebSearch 호출 (Tavily 미사용) |
| Hosting | AWS Lightsail (백엔드 + DB) | 프론트는 Vercel 유지 |

### 디렉토리 구조 (V2.0)

```
cosmic-hustle/
├── web/                      # Next.js 프론트엔드
│   ├── app/api/              # FastAPI 프록시 라우트 (thin wrapper) ✅
│   ├── lib/backendProxy.ts   # proxySSE / proxyJson 헬퍼 ✅
│   └── .env.local            # BACKEND_URL=http://localhost:8000
├── backend/                  # Python FastAPI
│   ├── main.py               # FastAPI 앱 진입점 ✅
│   ├── run.py                # uvicorn 실행 진입점 ✅
│   ├── requirements.txt      # 의존성 ✅
│   ├── search.py             # (미사용) Tavily 웹 검색 헬퍼 — 포케가 WebSearch 직접 사용으로 대체
│   ├── .env                  # DATABASE_URL (gitignore됨, 직접 생성)
│   ├── .env.example          # 키 양식 참고용 ✅
│   ├── alembic.ini           # Alembic 설정 ✅
│   ├── alembic/              # 스키마 마이그레이션 ✅
│   │   └── versions/001_initial.py
│   ├── migrate_sqlite.py     # SQLite → PostgreSQL 데이터 이전 스크립트 ✅
│   ├── orchestrator/         # 에이전트 파이프라인
│   │   ├── pipeline.py       # 메인 오케스트레이션 ✅
│   │   ├── agent_runner.py   # Claude CLI 서브프로세스 실행기 ✅
│   │   └── prompts.py        # 프롬프트 템플릿 ✅
│   ├── db/                   # PostgreSQL + SQLAlchemy
│   │   ├── models.py         # 테이블 정의 ✅
│   │   └── connection.py     # DB 연결 ✅
│   └── routers/              # API 라우트
│       ├── health.py         # GET /health ✅
│       ├── research.py       # POST /research, SSE 스트리밍 ✅
│       ├── wiki.py           # GET/POST /api/wiki ✅
│       └── memos.py          # GET/POST/DELETE /api/memos ✅
└── CLAUDE.md
```

### 마이그레이션 단계

```
Phase 1 ✅  FastAPI 뼈대 구축
  - FastAPI 프로젝트 구조, DB 모델, 라우터 전체 구현
  - Claude CLI 서브프로세스 기반 agent_runner 구현

Phase 2 🔶  DB 이전 (준비 완료, PostgreSQL 연결 대기)
  - Alembic 마이그레이션 설정 완료 (alembic/versions/001_initial.py)
  - SQLite → PostgreSQL 데이터 이전 스크립트 완료 (migrate_sqlite.py)
  - 로컬: localhost:5432/cosmic_hustle
  - 배포: AWS Lightsail RDS (나중에 .env DATABASE_URL만 교체)
  - pgvector 추가는 Phase 5(LangGraph 전환) 때 같이 진행

Phase 3 ✅  오케스트레이션 완성
  - pipeline.py: asyncio.Queue 패턴, murmur 백그라운드 태스크, 타이핑 효과
  - CEO 체크인 게이트: plan+fact (dev는 plan+root) 두 곳에서만 체크인
  - 팩트 피드백 루프 최대 3회
  - 리포트 스타일 3가지 프리셋 (standard/formal, detailed/analytical, brief/casual)

Phase 4 ✅  Next.js → FastAPI 프록시 연결
  - web/lib/backendProxy.ts: proxySSE / proxyJson 헬퍼
  - web/app/api/ 모든 라우트가 FastAPI(localhost:8000)로 프록시
  - memos 라우터 추가 (FastAPI + Next.js 양쪽)

Phase 4.5 ✅  포케 WebSearch 직접 사용으로 전환 (Tavily 제거)
  - Tavily 의존성 완전 제거 (TAVILY_API_KEY 불필요)
  - 포케: no_tools → WebSearch+WebFetch 허용, max_turns 1→5
  - pocke_recheck: Tavily 수집 → WebSearch 직접 검색 (max_turns=3)
  - 모든 pocke_* 프롬프트에서 {search_results} 주입 제거

Phase 5 ❌  LangGraph + Anthropic API 전환 (향후)
  - pipeline.py → LangGraph StateGraph로 교체
  - Claude Code SDK → Anthropic API 직접 호출
  - pgvector 위키 벡터 검색 추가
```

### 새 컴퓨터에서 시작하는 법

```bash
# 1. PostgreSQL 설치 및 실행 (macOS)
brew install postgresql@16
brew services start postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# 2. DB/유저 생성 (최초 1회)
psql postgres -c "CREATE USER cosmic WITH PASSWORD 'cosmic1234';"
psql postgres -c "CREATE DATABASE cosmic_hustle OWNER cosmic;"

# 3. Python 의존성 설치 (venv)
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 4. .env 파일 생성
echo "DATABASE_URL=postgresql://cosmic:cosmic1234@localhost:5432/cosmic_hustle" > .env

# 5. DB 스키마 생성
.venv/bin/alembic upgrade head

# 6. 백엔드 서버 실행
.venv/bin/python run.py   # → http://localhost:8000

# 7. 기존 SQLite 데이터 이전 (선택)
.venv/bin/python migrate_sqlite.py

# 8. 프론트엔드 (별도 터미널)
cd web && npm run dev   # → http://localhost:3000
# web/.env.local 에 BACKEND_URL=http://localhost:8000 있어야 함
```

### 현재 상태 (2026-05-11)

```
✅ 로컬 환경 완전 세팅 (macOS, PostgreSQL 16, Python 3.12 venv)
✅ 엔드투엔드 파이프라인 동작 확인
✅ Tavily 제거 — 포케 WebSearch 직접 사용
✅ 에러 복구 강화 — WikiViewer/MemoBoard 로드 실패 시 에러+재시도 버튼
✅ 프로젝트 설정 화면 모달 → 전체 페이지 전환

✅ 고도화 #1: 에이전트 말하기 애니메이션
  - AgentImage.tsx: active 상태에서 talk_0→1→2→1→0 프레임 싸이클 (110ms/frame)
  - 입 닫힘 후 200~500ms 랜덤 pause로 자연스럽게

✅ 고도화 #2: Draft Report 실시간 표시
  - page.tsx: liveDraft state 추가, draft_report 이벤트 수신 시 set
  - ProjectWorkView: 스트림 없을 때 초안 내용 + "팩트 검토 중" 표시

✅ 고도화 #3: 에이전트 소요 시간 표시
  - 썸네일 스트립: 완료된 에이전트 ✓ → 소요시간 (예: 45s)
  - 스트림 로그 헤더: 현재 에이전트 live 경과 타이머 (1초 갱신)

✅ 고도화 #4: agent_thinking 시각화
  - pipeline.py: 플랜/위키/포케/카/팩트 agent_start 직후 thinking 힌트 발송
  - ProjectWorkView: 스트림 비어있을 때 💭 힌트 텍스트 표시

[ ] Phase 5: LangGraph + Anthropic API 전환 (추후)
[ ] 다음 고도화 아이디어: 타임라인 뷰, 실시간 로그 검색/필터, expression 세트 확대
```

### API 계약 (Frontend ↔ Backend)

```
POST   /api/research                      # 리서치 시작 (SSE 스트림 반환)
GET    /api/research/{id}/events?since=N  # 이벤트 재생
POST   /api/research/{id}/respond         # CEO 체크인 응답
POST   /api/research/{id}/cancel          # 취소
GET    /api/reports                       # 리포트 목록
GET    /api/reports/{id}                  # 리포트 상세
PATCH  /api/reports/{id}                  # 리포트 수정 (topic, content)
DELETE /api/reports/{id}
GET    /api/sessions                      # 세션 목록
GET    /api/memos                         # 메모 목록
POST   /api/memos                         # 메모 생성
DELETE /api/memos/{id}                    # 메모 삭제
GET    /api/wiki/search                   # 위키 검색
POST   /api/wiki/ingest                   # 위키 저장
```

---

## 기존 기술 스택 (V1, 참고용)

- Next.js 15 (App Router) + TypeScript
- Claude Code SDK (`@anthropic-ai/claude-code`) — Anthropic API 별도 과금 없이 Claude Code 구독 토큰 사용
- SQLite + Drizzle ORM (better-sqlite3, 동기)
- Tailwind CSS + shadcn/ui
- Zustand (클라이언트 상태관리)
- SSE 스트리밍 + 이벤트 소싱 (sessionEvents 테이블)

## 에이전트 11명 · 부서 3개

| 이름                | 직책 | 역할                                         | 부서       | 컬러    |
| ------------------- | ---- | -------------------------------------------- | ---------- | ------- |
| 플랜                | 차장 | PM — 요구사항 파악, 태스크 정의              | Research   | #FCD34D |
| 위키                | 대리 | 사서 — 지식 누적, 컨텍스트 제공              | Research   | #C4B5FD |
| 포케                | 대리 | 리서처 — 볼따구에 정보 쑤셔넣는 햄스터형     | Research   | #86EFAC |
| 런                  | 사원 | 개발자 — "이미 짰어요"                       | Research   | #67E8F9 |
| 카 (풀네임: 유레카) | 과장 | 분석가 — 다크서클, "찾았다!"                 | Creative   | #A78BFA |
| 오버                | 사원 | 작가 — 베레모, 자기 글에 혼자 감동           | Creative   | #F9A8D4 |
| 픽셀                | 사원 | 디자이너 — 폰트 집착, 여백에 감정이입        | Creative   | #FDBA74 |
| 핑                  | 인턴 | 아이디어 수집가 — 안테나에서 스파크          | Creative   | #6EE7B7 |
| 팩트                | 부장 | 검토자 — 무표정, 빨간펜, 감정 제거 행성 출신 | Operations | #CBD5E1 |
| 루트                | 사원 | DevOps — 수동 배포는 범죄                    | Operations | #34D399 |
| 버즈                | 대리 | 마케터 — "바이럴 각이다!"                    | Operations | #FB923C |

캐릭터 상세 설정 + 이미지 생성 프롬프트 → `characters.md` 참고

## 오케스트레이션 흐름

```
CEO 입력
  → 플랜(요구사항·태스크타입 결정) → [CEO 확인 요청]
  → 위키(과거 지식)
  → 포케(WebSearch 직접 검색 → 팩트 추출, max_turns=5) → [CEO 체크인]
  → 카(분석)
  → run | over | pixel | buzz (태스크타입에 따라 1명 담당)
  → 팩트(검토) → 피드백 루프 (최대 3회)
  → 루트(배포 계획, dev 태스크만)
  → 핑 + 위키 동시(아이디어 캡처 + 위키 업데이트)
  → CEO
```

## 태스크 타입 (9개)

| id        | 이름             | writer  | outputFormat |
| --------- | ---------------- | ------- | ------------ |
| research  | 리서치 보고서    | 오버    | report       |
| blog      | 블로그 포스팅    | 오버    | blog_post    |
| tech      | 기술 리서치      | 오버    | report       |
| marketing | 마케팅 전략      | 버즈    | document     |
| design_ux | UX 리서치/기획   | 픽셀    | document     |
| design_ui | UI 디자인 (HTML) | 픽셀    | html         |
| dev       | 개발 구현        | 런+루트 | document     |
| dev_plan  | 개발 기획서      | 오버    | document     |
| dev_spec  | 기능 명세서      | 오버    | document     |

## 토큰 최적화 원칙

- 에이전트 간 전체 컨텍스트 전달 X, 구조화된 JSON 핸드오프만
- maxTurns 제한 (팩트 부장 1턴, 포케 5턴, 포케 재조사 3턴)
- 병렬 실행 가능한 구간 묶기 (핑 + 위키 동시)

## 세션 지속성 구조

- `sessionEvents` 테이블: 모든 SSE 이벤트를 seq 순서로 DB 저장
- 탭 닫힘 감지 → localStorage에 sessionId 보존
- 재접속 시 `/api/research/[sessionId]/events?since=N` 으로 배치 재생
- 취소: `/api/research/[sessionId]/cancel` POST → cancelledSessions Set + DB status 업데이트

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
