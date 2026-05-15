# Cosmic Hustle

우주 리서치 회사. 사용자 = CEO, AI 에이전트 11명 = 직원. 주제를 던지면 에이전트들이 역할 분담해서 조사하고 리포트를 만들어줌.

---

## V2.0 기술 스택

| 레이어 | 기술 | 역할 |
|--------|------|------|
| Frontend | Next.js 15 + TypeScript | UI, SSE 수신 |
| Backend | Python 3.12 + FastAPI | 에이전트 오케스트레이션, SSE 발신 |
| Orchestration | 직접 구현한 asyncio 파이프라인 | 추후 LangGraph로 교체 예정 |
| AI | Claude Code SDK (`@anthropic-ai/claude-code`) | Claude Code 구독 토큰 사용 |
| DB | PostgreSQL 16 + pgvector | 세션·리포트·위키 벡터 검색 |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` | 384차원, 로컬, API키 불필요 |
| Search | Claude WebSearch 툴 | 포케가 직접 WebSearch 호출 |
| Hosting | AWS Lightsail (백엔드 + DB) | 프론트는 Vercel 유지 |

---

## 디렉토리 구조

```
cosmic-hustle/
├── web/                          # Next.js 프론트엔드
│   ├── app/api/                  # FastAPI 프록시 라우트 (thin wrapper)
│   │   └── logs/route.ts         # GET/POST /api/logs 프록시
│   ├── lib/
│   │   ├── backendProxy.ts       # proxySSE / proxyJson 헬퍼
│   │   ├── useErrorLogger.ts     # console.error 인터셉트 → POST /api/logs
│   │   └── stores/               # Zustand 5 스토어
│   │       ├── agentStore.ts     # 에이전트 상태 (status/speaking/stream 등)
│   │       ├── sessionStore.ts   # 세션 상태 (phase/topic/mode 등)
│   │       └── dataStore.ts      # 데이터 (reports/handoffs/chatFeed 등)
│   ├── components/
│   │   ├── AgentImage.tsx        # talk_0~2 프레임 애니메이션
│   │   ├── ProjectSetupModal.tsx # 채팅 pre-flight UI (플랜+writer 질문)
│   │   ├── ProjectWorkView.tsx   # 실시간 스트림 뷰 + 간트 차트 + 버전 diff
│   │   ├── BottomAgentBar.tsx    # 에이전트 상태 바
│   │   ├── dashboard/
│   │   │   ├── ReportBoard.tsx   # thin orchestrator (선택 상태만)
│   │   │   ├── ReportList.tsx    # 리포트 목록
│   │   │   └── ReportViewer.tsx  # 리포트 상세 + diff
│   │   └── workspaces/
│   │       └── RootWorkspace.tsx # 배포 체크리스트 + 에러 로그 탭 + 터미널
│   └── .env.local                # BACKEND_URL=http://localhost:8000
├── backend/                      # Python FastAPI
│   ├── main.py                   # FastAPI 앱 진입점
│   ├── run.py                    # uvicorn 실행 진입점
│   ├── requirements.txt          # 의존성 (pytest, pytest-asyncio 포함)
│   ├── .env                      # DATABASE_URL (gitignore됨, 직접 생성)
│   ├── .env.example              # 키 양식 참고용
│   ├── agents/                   # 에이전트별 CLAUDE.md (per-agent 컨텍스트)
│   │   ├── plan/CLAUDE.md
│   │   ├── wiki/CLAUDE.md
│   │   ├── pocke/CLAUDE.md
│   │   ├── ka/CLAUDE.md
│   │   ├── over/CLAUDE.md
│   │   ├── fact/CLAUDE.md
│   │   ├── run/CLAUDE.md
│   │   ├── pixel/CLAUDE.md
│   │   ├── buzz/CLAUDE.md
│   │   ├── ping/CLAUDE.md
│   │   └── root/CLAUDE.md
│   ├── orchestrator/
│   │   ├── pipeline.py           # 메인 오케스트레이션 (_Pipeline 클래스)
│   │   ├── agent_runner.py       # asyncio 서브프로세스 실시간 스트리밍
│   │   ├── prompts.py            # 프롬프트 템플릿 + TASK_CONFIG + WRITER_AGENT_ID
│   │   └── types.py              # Pydantic v2 모델 (PlanResult, KaResult 등 7개)
│   ├── db/
│   │   ├── models.py             # 테이블 정의 (SystemLog 포함)
│   │   ├── connection.py         # DB 연결
│   │   ├── embedder.py           # SentenceTransformer 싱글톤
│   │   ├── wiki_store.py         # semantic_search / upsert_wiki_entry
│   │   └── logger.py             # log_error() — DB 에러 로그 기록
│   ├── routers/
│   │   ├── health.py             # GET /health
│   │   ├── research.py           # POST /research, SSE 스트리밍
│   │   ├── wiki.py               # GET/POST /api/wiki
│   │   ├── memos.py              # GET/POST/DELETE /api/memos
│   │   ├── versions.py           # GET /api/sessions/{id}/versions
│   │   ├── export.py             # GET /api/reports/{id}/export?format=pdf|excel
│   │   └── logs.py               # GET/POST /api/logs
│   └── tests/                    # pytest 단위 테스트 (52개)
│       ├── conftest.py           # db/agent_runner 모킹
│       ├── test_types.py         # Pydantic 모델 검증
│       ├── test_prompts.py       # build_prompt / TASK_CONFIG 일관성
│       └── test_pipeline_utils.py# _parse_typed / _Pipeline 유틸리티
└── CLAUDE.md
```

---

## 새 컴퓨터에서 시작하는 법

```bash
# 1. PostgreSQL 설치 및 실행 (macOS)
brew install postgresql@16
brew services start postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# 2. DB/유저 생성 (최초 1회)
psql postgres -c "CREATE USER cosmic WITH PASSWORD 'cosmic1234';"
psql postgres -c "CREATE DATABASE cosmic_hustle OWNER cosmic;"

# 3. pgvector 소스 빌드 (brew pgvector는 postgresql@16 미지원)
git clone --branch v0.8.2 https://github.com/pgvector/pgvector.git /tmp/pgvector
cd /tmp/pgvector
PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config make
PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config make install
psql -U $(whoami) -d cosmic_hustle -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 4. Python 의존성 설치 (venv)
cd /path/to/cosmic-hustle/backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# weasyprint 시스템 의존성 (PDF export용)
brew install pango

# 5. .env 파일 생성
echo "DATABASE_URL=postgresql://cosmic:cosmic1234@localhost:5432/cosmic_hustle" > .env

# 6. DB 스키마 생성
.venv/bin/alembic upgrade head

# 7. 백엔드 실행
.venv/bin/python run.py   # → http://localhost:8000

# 8. 프론트엔드 (별도 터미널)
cd web && npm install && npm run dev   # → http://localhost:3000
# web/.env.local 에 BACKEND_URL=http://localhost:8000 있어야 함
```

---

## 현재 상태 (2026-05-15)

### 완료된 기능

- 엔드투엔드 파이프라인 동작 (plan → wiki+pocke 병렬 → ka → writer → fact 루프 → ping+wiki)
- SSE 실시간 스트리밍 (청크 단위)
- 포케 WebSearch 직접 사용 (Tavily 제거)
- 포케 0-data 버그 수정 + 자동 1회 재시도
- 오버 무한 작업 버그 수정
- AgentImage talk 애니메이션: talk_0~2만 표시, 다른 레이어 차단
- 에이전트별 CLAUDE.md + cwd 격리 (토큰 절감)
- 프로젝트 생성 UI → 채팅 pre-flight 교체 (플랜 → writer 순차 질문)
- PDF/Excel export (`GET /api/reports/{id}/export?format=pdf|excel`)
- 리포트 버전 관리 + diff 뷰 (v1/v2/v3 탭)
- 타임라인 간트 뷰
- pgvector 위키 시맨틱 서치
- 에러 처리 강화 (503/502 구분, 에러 배너 타이핑 효과)
- **UI 전면 개편 완료** — 오피스 퍼스트 레이아웃
  - 탭 제거, 오피스가 기본 화면
  - 대시보드 → 우측 사령부 서랍 (리포트/히스토리/메모)
  - 헤더 슬림화 (임무 상태 + 사령부/설정/임무배정 버튼)
  - 플랜 클릭 → 임무 배정 모달 직접 연결
  - 에이전트 클릭 시 live 스트림 + thinking 힌트 표시
  - holo-scan 애니메이션, floor-glow, console-glow-top
  - 파이프라인 바 에이전트 미니 아바타
  - 13인치 반응형 개선
- 에이전트 11명 사원증 이미지 제작 완료 (`web/public/id/{agentId}.png`) — 실버 ID카드 프레임 3D 일러스트
- **엔터프라이즈 리팩토링 완료 (Phase 1~3)**
  - Phase 2: ReportBoard 936→42줄 컴포넌트 분리 (ReportList, ReportViewer, reportUtils)
  - Phase 3-A: `orchestrator/types.py` Pydantic v2 모델 7개 (`_parse_typed` 헬퍼)
  - Phase 3-B: Zustand 5 스토어 3개 분리 — `page.tsx` 984→728줄, useState 25→2개
  - Phase 3-C: pytest 단위 테스트 52개 (types/prompts/pipeline 전체 커버)
  - 버그 수정: pipeline.py `ka.get()` dict 접근 패턴 3곳 → `.conclusion` 속성 접근
  - 버그 수정: `speak` useCallback `[agent]` 의존성 무한루프 → `getState()` 직접 호출
- **루트 에러 로그 시스템**
  - `system_logs` DB 테이블 + Alembic 005 마이그레이션
  - `db/logger.py` `log_error()` — 파이프라인 7개 except 블록 연결
  - `GET/POST /api/logs` (level/source/session_id 필터)
  - 프론트 `console.error` 인터셉트 훅 (`useErrorLogger`)
  - Root 에이전트 워크스페이스 — 에러 로그 탭 (level 필터, stack_trace 펼치기)

### 남은 로드맵

```
파이프라인 개선
[ ] 병렬 실행 확대 — 카 완료 후 writer 준비 overlap (현재 순차)
[ ] 태스크 중단·재시작 — 런 사원 dev 태스크용
[ ] 배경 리서치 — CEO가 다른 일 하는 동안 실행, 완료 알림

새 기능
[ ] 사원증 UI — /public/id/ PNG 활용, 사이드 드로어 팀원 탭 or 호버 팝업 (누끼 작업 필요)
[ ] 에이전트 expression 시스템 (sad/err/happy 이미지 파일 추가)
[ ] 리포트 → Notion/슬랙 내보내기
[ ] 정기 리서치 예약 — cron 기반 ("매주 월요일 경쟁사 동향")
[ ] 멀티 프로젝트 동시 실행 (현재 1개만)

장기
[ ] AWS Lightsail 배포
[ ] Phase 5: LangGraph + Anthropic API 전환
[ ] 3D 회의실 UI
```

---

## API 계약

```
POST   /api/research                        # 리서치 시작 (SSE 스트림)
GET    /api/research/{id}/events?since=N    # 이벤트 재생
POST   /api/research/{id}/respond           # CEO 체크인 응답
POST   /api/research/{id}/cancel            # 취소
GET    /api/reports                         # 리포트 목록
GET    /api/reports/{id}                    # 리포트 상세
PATCH  /api/reports/{id}                    # 리포트 수정
DELETE /api/reports/{id}
GET    /api/reports/{id}/export?format=pdf|excel  # PDF/Excel 다운로드
GET    /api/sessions/{id}/versions          # 리포트 버전 히스토리
GET    /api/memos                           # 메모 목록
POST   /api/memos                           # 메모 생성
DELETE /api/memos/{id}
GET    /api/wiki/search?q=                  # 위키 시맨틱 서치
POST   /api/wiki/ingest                     # 위키 저장 + 임베딩
GET    /api/logs?level=&source=&session_id= # 에러 로그 조회 (최신순, 최대 200)
POST   /api/logs                            # 에러 로그 저장 (프론트엔드 → 백엔드)
```

## SSE 이벤트 타입

```
session_start   — 세션 시작 { sessionId }
agent_start     — 에이전트 시작 { agentId, message, ts }
agent_done      — 에이전트 완료 { agentId, message, ts }
agent_stream    — 실시간 텍스트 청크 { agentId, chunk }
agent_message   — 말풍선 메시지 { agentId, message }
agent_thinking  — thinking 힌트 { agentId, chunk }
agent_expression— 표정 변경 { agentId, expression }
draft_report    — 초안 완성 { agentId, topic, content }
report_version  — 버전 저장 { version, content, prevFeedback }
report          — 최종 리포트 { reportId, agentId, topic, content }
ping_ideas      — 핑 아이디어 { ideas }
clarify_request — 명확화 요청 { questions }
ceo_checkin     — CEO 체크인 { agentId, summary, keyFacts }
complete        — 완료 { reportId, topic }
error           — 오류 { message }
```

---

## 에이전트 11명

| 이름 | 직책 | 역할 | 부서 | 컬러 |
|------|------|------|------|------|
| 플랜 | 차장 | PM — 요구사항 파악, 태스크 정의 | Research | #FCD34D |
| 위키 | 대리 | 사서 — 지식 누적, 컨텍스트 제공 | Research | #C4B5FD |
| 포케 | 대리 | 리서처 — 볼따구에 정보 쑤셔넣는 햄스터형 | Research | #86EFAC |
| 런 | 사원 | 개발자 — "이미 짰어요" | Research | #67E8F9 |
| 카 (유레카) | 과장 | 분석가 — 다크서클, "찾았다!" | Creative | #A78BFA |
| 오버 | 사원 | 작가 — 베레모, 자기 글에 혼자 감동 | Creative | #F9A8D4 |
| 픽셀 | 사원 | 디자이너 — 폰트 집착, 여백에 감정이입 | Creative | #FDBA74 |
| 핑 | 인턴 | 아이디어 수집가 — 안테나에서 스파크 | Creative | #6EE7B7 |
| 팩트 | 부장 | 검토자 — 무표정, 빨간펜 | Operations | #CBD5E1 |
| 루트 | 사원 | DevOps — 수동 배포는 범죄 | Operations | #34D399 |
| 버즈 | 대리 | 마케터 — "바이럴 각이다!" | Operations | #FB923C |

캐릭터 상세 설정 → `characters.md` 참고

## 오케스트레이션 흐름

```
CEO 입력 (채팅 pre-flight: 플랜 확인 → writer 스타일 질문 → 모드 선택)
  → 플랜(task_type 결정) + [시맨틱 서치 백그라운드]
  → 위키 ──┐ asyncio.gather 병렬
  → 포케  ──┘  (0-data 시 자동 재시도 1회)
  → 카(분석)
  → run | over | pixel | buzz (task_type에 따라 1명)
  → 팩트(검토) → 피드백 루프 최대 3회, 각 버전 DB 저장
  → 루트(dev 태스크만)
  → 핑 + 위키 동시(아이디어 + 위키 업데이트 + pgvector 동기화)
  → CEO
```

## 태스크 타입 (9개)

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

## 토큰 최적화

- 에이전트별 CLAUDE.md + cwd 격리 (`backend/agents/{id}/`) — 거대한 루트 CLAUDE.md 로딩 차단
- 에이전트 간 전체 컨텍스트 전달 X, 구조화된 JSON 핸드오프만
- maxTurns 제한 (팩트 1턴, 포케 5턴, 포케 재조사 3턴)
- 병렬 실행 구간: 위키+포케 동시, 핑+위키업데이트 동시

## 세션 지속성

- `sessionEvents` 테이블: 모든 SSE 이벤트를 seq 순서로 DB 저장
- 재접속 시 `/api/research/{id}/events?since=N` 으로 배치 재생
- 취소: `/api/research/{id}/cancel` → cancelledSessions Set + DB status 업데이트

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
