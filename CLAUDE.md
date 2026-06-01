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

## 배포 현황 (2026-05-29)

| 레이어 | 위치 | 비고 |
|--------|------|------|
| 백엔드 | AWS Lightsail `3.36.239.214:8000` | systemd `cosmic-backend.service`로 관리 |
| DB | Lightsail 동일 서버 PostgreSQL 16 | `cosmic_hustle` DB, 마이그레이션 018까지 적용 완료 |
| 자동배포 | GitHub Actions | `backend/` 변경 push → 자동 rsync + restart |
| 프론트 | 로컬 개발 중 (`localhost:3000`) | Vercel 배포 미완료 |
| 블로그 레포 | `~/Desktop/repository/cosmic-blog/` | public 레포, Vercel 배포 완료 |
| 블로그 도메인 | https://cosmic-hustle.ai.kr/ | 운영 중 |

### 서버 SSH 접속
```bash
ssh -i ~/.ssh/LightsailDefaultKey-ap-northeast-2.pem ubuntu@3.36.239.214
```
- pem 키: AWS Lightsail 콘솔에서 다운로드 (또는 기존 맥에서 AirDrop/메일)
- 서버 관리: `sudo systemctl status|restart|stop cosmic-backend`

### backend/.env (서버 — gitignore됨, 직접 생성)
```
DATABASE_URL=postgresql://cosmic:cosmic1234@localhost:5432/cosmic_hustle
ANTHROPIC_API_KEY=...
FAL_KEY=...
TORCHDYNAMO_DISABLE=1
```

---

## 새 컴퓨터에서 시작하는 법

```bash
# 0. 레포 클론
git clone https://github.com/JJleem/cosmic-hustle.git
cd cosmic-hustle

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
cd cosmic-hustle/backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# weasyprint 시스템 의존성 (PDF export용)
brew install pango

# 5. .env 파일 생성 (키는 팀 공유 또는 기존 맥에서 복사)
cat > .env << 'EOF'
DATABASE_URL=postgresql://cosmic:cosmic1234@localhost:5432/cosmic_hustle
ANTHROPIC_API_KEY=여기에_키_입력
FAL_KEY=여기에_키_입력
EOF

# 6. DB 스키마 생성
.venv/bin/alembic upgrade head

# 7. 백엔드 실행 (로컬 개발용)
.venv/bin/python run.py   # → http://localhost:8000

# 8. 프론트엔드 (별도 터미널)
cd web && npm install && npm run dev   # → http://localhost:3000

# web/.env.local — 로컬 백엔드 쓸 때:
echo "BACKEND_URL=http://localhost:8000" > web/.env.local
# 배포된 서버 백엔드 쓸 때:
echo "BACKEND_URL=http://3.36.239.214:8000" > web/.env.local
```

---

## 블로그 프로젝트 (2026-06-01 기준 — 운영 중)

### 개요
AI 에이전트 11명이 매일 1개씩 블로그 포스트를 자동 생성하는 공개 블로그.
백엔드는 cosmic-hustle Lightsail 서버 공유, 프론트는 별도 레포/Vercel.
**배포 완료 — https://cosmic-hustle.ai.kr/ 에서 운영 중**

### 레포 구조
```
~/Desktop/repository/
├── cosmic-hustle/   # 내부 도구 (private, 현재 레포)
└── cosmic-blog/     # 공개 블로그 프론트엔드 (public, 새 레포)
```

### cosmic-blog 기술 스택
- Next.js 15 + TypeScript
- Tailwind CSS
- 백엔드 API: `http://3.36.239.214:8000/api/blog/`
- 배포: Vercel (자동배포)

### 블로그 페이지 구성
| 페이지 | 경로 | 설명 |
|--------|------|------|
| 홈/목록 | `/` | 포스트 그리드, 에이전트 필터, 최신순 |
| 상세 | `/[slug]` | 본문(Markdown), 댓글, 좋아요, 조회수 |
| 에이전트 소개 | `/agents` | 11명 캐릭터 소개 |
| 아카이브 | `/archive` | 월별 포스트 목록 |

### 자동 포스트 생성 스케줄
- 매일 오전 9시 KST (APScheduler, Lightsail 서버)
- 요일별 담당 에이전트 (buzz/pocke/over/ka/pixel/ping/wiki 순환)
- Google 뉴스 RSS → Claude 트렌드 수집 → 글 생성 → Flux Kontext 썸네일

### 현재 작업 현황 (2026-06-01 기준 — 전체 완료)
- [x] 백엔드 API 완성 (`/api/blog/` 전체)
- [x] Lightsail 서버 배포 + systemd 서비스
- [x] GitHub Actions 자동배포 (backend/ 변경 시)
- [x] FAL_KEY 서버 적용 완료 — 썸네일 생성 확인됨
- [x] APScheduler 매일 09:00 KST 자동 포스팅 동작 확인
- [x] 블로그 포스트 다수 DB에 있음 (픽셀 2개 포함)
- [x] `/generate?force=true` — 오늘 날짜 중복 시 slug suffix(-2) 붙여 강제 생성
- [x] `DELETE /api/blog/posts/{id}` — 포스트 삭제 (댓글 cascade)
- [x] `PATCH /api/blog/posts/{id}` — slug / published_at / created_at 수정 가능
- [x] 생성 시 최근 2주 제목 주입 → 동일 주제 반복 방지
- [x] cosmic-blog 레포 생성 (`~/Desktop/repository/cosmic-blog/`)
- [x] Vercel 배포 완료
- [x] 도메인 연결 완료 — https://cosmic-hustle.ai.kr/

---

## 현재 상태 (2026-05-29)

### 완료된 기능 (전체 요약)

**코어 파이프라인**
- 엔드투엔드 파이프라인 (plan → wiki+pocke 병렬 → ka → writer → fact → ping+wiki)
- SSE 실시간 스트리밍, 포케 WebSearch 직접 사용, 팩트 항상 통과 + writer 2회 고정 실행
- 태스크 중단·재시작 (`POST /api/research/{id}/pause|restart` + checkpoint 3단계)
- PDF/Excel export, 리포트 버전 관리 + diff 뷰, 타임라인 간트 뷰
- 에러 로그 시스템 (`system_logs` DB + `GET/POST /api/logs` + 루트 워크스페이스 탭)
- 에이전트별 CLAUDE.md + cwd 격리, 토큰 최적화 (plan·pocke Haiku, ~30%→~17%)

**UI / 오피스**
- 오피스 퍼스트 레이아웃 (헤더 슬림화, 사령부 서랍, 에이전트 클릭 live 스트림)
- 사원증 UI (TeamRoster.tsx, `web/public/id/*.png` 11개)
- Zustand 5 스토어 3개 분리 (agentStore / sessionStore / dataStore)
- pytest 단위 테스트 52개 (types/prompts/pipeline 전체 커버)

**위키 페이지** (`web/app/wiki/page.tsx`) — 2026-05-27 완성
- D3 v7 지식 그래프: 코사인 유사도 엣지 + Leiden 커뮤니티 클러스터 + convex hull 오버레이
- 백엔드 서버사이드 spring_layout 3D 좌표 → 클라이언트 alphaDecay(0.05) 빠른 정착
- 검색 필터, 타임라인 슬라이더 (createdAt 기준), 클러스터 범례
- **카메라 고정**: zoom.filter()로 노드 클릭 시 pan 차단 / ResizeObserver는 SVG 크기만 갱신
- **노드 드래그**: 표준 D3 drag 패턴 (isDragging 플래그 없음, event.active 정상 동작)
- 소스 노드 그래프에서 제거 → 사이드 패널 "출처 문서" 섹션으로 이동
- 인라인 편집: Pencil 버튼 → textarea → PATCH /api/wiki/{id} → 즉시 반영
- 위키 대리 인트로 토스트 (talk_0~2 애니메이션, 68px 이미지, 12s 타이머, ⏸ 버튼)
- 폴더 탭 진입 시 별도 폴더 안내 토스트, `?` 버튼으로 탭별 재표시
- **IndexedDB 폴더 영속화**: 브라우저 재방문/페이지 이동 후에도 이전 폴더 자동 복원 UI
  - `saveHandleToIDB` / `loadHandleFromIDB` / `clearHandleFromIDB` 헬퍼
  - 복원 UI: 폴더명 표시 + "이어서 계속" / "다른 폴더" 버튼
  - `restoreFolder`: queryPermission → requestPermission → 파일 재스캔
  - 폴더 변경 버튼: `disconnectFolder()` → IDB 클리어 + 상태 전체 초기화
- ingest-local 완료 → DB 자동 upsert + 그래프 탭 자동 이동

**백엔드 위키 API** (`backend/routers/wiki.py`)
- `GET /api/wiki/graph` — concept 노드만 반환, sourceDocs[] 필드 첨부 (소스 노드 제거)
- `GET /api/wiki/{entry_id}` — 단일 항목 조회
- `PATCH /api/wiki/{entry_id}` — 내용 수정 + 재임베딩 (upsert_wiki_entry)
- `POST /api/wiki/ingest-local` — concept → DB 자동 upsert
- `POST /api/wiki/sync` — wiki/concepts/ 폴더 전체 DB 동기화

### 파이프라인 핵심 동작

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

### 남은 로드맵

```
파이프라인 개선
[ ] 병렬 실행 확대 — 카 완료 후 writer 준비 overlap (현재 순차)
[ ] 배경 리서치 — CEO가 다른 일 하는 동안 실행, 완료 알림

새 기능
[ ] 에이전트 expression 시스템 — agentStore+SSE 구조 완료, sad/err/happy 이미지 파일만 추가하면 됨
[ ] 리포트 → Notion/슬랙 내보내기
[ ] 정기 리서치 예약 — cron 기반 ("매주 월요일 경쟁사 동향")
[ ] 멀티 프로젝트 동시 실행 (현재 1개만)

장기
[ ] AWS Lightsail 배포
[ ] Phase 5: LangGraph + Anthropic API 전환
[ ] 3D 회의실 UI
[ ] Gemini Imagen 썸네일 자동 생성 (pixel_thumbnail 프롬프트 완료, Google AI Studio 무료 티어)
```

---

## API 계약

```
POST   /api/research                        # 리서치 시작 (SSE 스트림)
GET    /api/research/{id}/events?since=N    # 이벤트 재생
POST   /api/research/{id}/respond           # CEO 체크인 응답
POST   /api/research/{id}/cancel            # 취소
POST   /api/research/{id}/pause             # 일시정지 (checkpoint 저장)
POST   /api/research/{id}/restart           # 재시작 (checkpoint에서 복구)
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
POST   /api/wiki/ingest-local               # 로컬 파일 → concept+source 마크다운 변환 + DB upsert
GET    /api/wiki/graph                      # 전체 그래프 (nodes + links, concept만)
GET    /api/wiki/{entry_id}                 # 단일 위키 항목 조회
PATCH  /api/wiki/{entry_id}                 # 위키 내용 수정 + 재임베딩
POST   /api/wiki/sync                       # wiki/concepts/ 폴더 전체 DB 동기화
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
  → 팩트(피드백 전달, 항상 통과) — writer 2회 고정 실행
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
- maxTurns 제한 (팩트 1턴, 포케 8턴, 포케 재조사/재시도 5턴)
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
