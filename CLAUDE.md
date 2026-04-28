# Cosmic Hustle

우주 리서치 회사. 사용자 = CEO, AI 에이전트 11명 = 직원. 주제를 던지면 에이전트들이 역할 분담해서 조사하고 리포트를 만들어줌.

## 기술 스택

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

## 완료된 작업

- [x] 11명 에이전트 파이프라인 + CEO 체크인 게이트 2곳
- [x] 태스크 타입 시스템 (taskTypes.ts, agentPrompts.ts variant)
- [x] 세션 이벤트 소싱 — 탭 닫아도 세션 유지, 재접속 복원
- [x] 취소 API
- [x] 태스크 타입 5→9개 + OutputFormat 개념
- [x] 부서 6→3개 (Research / Creative / Operations)
- [x] ProjectSetupModal 태스크 타입 칩 선택 UI
- [x] HologramPartition 디졸브 애니메이션
- [x] DeptRoom / OfficePage 리디자인 (한글 상태, 밝기 개선)
- [x] AgentChatPanel — 에이전트 클릭 시 슬라이드인 대화 패널
  - 기록 기반 질문 (DB, 무료): 마지막 작업, 총 작업 건수
  - 성찰형 질문 (API): 버튼 눌릴 때만 호출, 1~3문장
  - API: GET /api/agent/[id]/history, POST /api/agent/[id]/chat
  - 페르소나: lib/agentPersonas.ts

## 다음 작업

### 진행 중: ProjectSetupModal 시작 모드 선택

CEO가 프로젝트 시작 시 3가지 모드 중 선택:

- **백그라운드** — 결과만 받기, UI 업데이트 최소화
- **체크인** — 플랜 확인 + 포케 후 체크인 2곳만 개입 (현재 기본값)
- **풀 모니터링** — 모든 에이전트 상태 실시간 확인

`ProjectConfig`에 `mode: "background" | "checkin" | "full"` 필드 추가.
파이프라인 route.ts에서 mode에 따라 체크인 게이트 스킵 여부 결정.

### 잔여 작업

- [ ] OutputFormat 렌더러 — design_ui 타입 결과물 HTML 프리뷰
- [ ] Tistory 자동 포스팅 — blog 타입 결과물 발행
