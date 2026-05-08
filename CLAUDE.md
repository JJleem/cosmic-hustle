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
| Search | Tavily API | 포케 웹서칭 (기존 claude web search 대체) |
| Hosting | AWS Lightsail (백엔드 + DB) | 월 $3.50, 프론트는 Vercel 유지 |

### 디렉토리 구조 (V2.0)

```
cosmic-hustle/
├── web/                  # Next.js 프론트엔드 (기존)
│   └── app/api/         # → 점진적으로 FastAPI로 이전
├── backend/              # Python FastAPI (신규)
│   ├── main.py          # FastAPI 앱 진입점
│   ├── orchestrator/    # 에이전트 파이프라인
│   │   ├── pipeline.py  # 메인 오케스트레이션 (현 agentRunner.ts 대체)
│   │   ├── agents.py    # 에이전트 정의
│   │   └── prompts.py   # 프롬프트 템플릿
│   ├── db/              # PostgreSQL + SQLAlchemy
│   │   ├── models.py    # 테이블 정의
│   │   └── connection.py
│   └── routers/         # API 라우트
│       ├── research.py  # POST /research, SSE 스트리밍
│       ├── reports.py
│       └── wiki.py
└── CLAUDE.md
```

### 마이그레이션 단계

```
Phase 1 (현재): 환경 세팅
  - Railway 계정 + 서버 생성
  - PostgreSQL DB 생성
  - FastAPI 프로젝트 뼈대 구축

Phase 2: DB 이전
  - SQLite 스키마 → PostgreSQL 마이그레이션
  - pgvector 확장 추가 (위키 벡터 검색)
  - 기존 데이터 마이그레이션

Phase 3: 오케스트레이션 이전
  - agentRunner.ts + orchestrate() → pipeline.py
  - 위키+포케 병렬 실행 구현
  - SSE 스트리밍 FastAPI로 이전

Phase 4: Next.js API Routes 정리
  - 프론트는 FastAPI 백엔드만 바라보도록 변경
  - Next.js API Routes 제거

Phase 5 (향후): LangGraph + Anthropic API 전환
```

### API 계약 (Frontend ↔ Backend)

```
POST   /api/research          # 리서치 시작 (SSE 스트림 반환)
GET    /api/research/{id}/events?since=N  # 이벤트 재생
POST   /api/research/{id}/respond         # CEO 체크인 응답
POST   /api/research/{id}/cancel          # 취소
GET    /api/reports           # 리포트 목록
GET    /api/reports/{id}      # 리포트 상세
DELETE /api/reports/{id}
GET    /api/sessions          # 세션 목록
GET    /api/wiki/search       # 위키 검색
POST   /api/wiki/ingest       # 위키 저장
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
  → 포케(웹 리서치) → [CEO 체크인]
  → 카(분석)
  → run | over | pixel | buzz (태스크타입에 따라 1명 담당)
  → 팩트(검토) → 피드백 루프 (최대 2회)
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
- maxTurns 엄격하게 제한 (팩트 부장 1턴, 포케 3턴 등)
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
