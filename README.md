# Cosmic Hustle

우주 리서치 회사 시뮬레이터. CEO(사용자)가 주제를 던지면 AI 에이전트 11명이 역할 분담해서 조사·분석·작성까지 처리하고 리포트를 만들어준다.

## 기술 스택

- Next.js 15 (App Router) + TypeScript
- Claude Code SDK (`@anthropic-ai/claude-code`) — Claude Code 구독 토큰 사용
- SQLite + Drizzle ORM (better-sqlite3)
- Tailwind CSS + shadcn/ui
- Zustand / SSE 스트리밍 + 이벤트 소싱

## 에이전트 11명

| 이름 | 직책 | 부서 |
|------|------|------|
| 플랜 | 차장 (PM) | Research |
| 위키 | 대리 (사서) | Research |
| 포케 | 대리 (리서처) | Research |
| 런 | 사원 (개발자) | Research |
| 카 | 과장 (분석가) | Creative |
| 오버 | 사원 (작가) | Creative |
| 픽셀 | 사원 (디자이너) | Creative |
| 핑 | 인턴 (아이디어) | Creative |
| 팩트 | 부장 (검토자) | Operations |
| 루트 | 사원 (DevOps) | Operations |
| 버즈 | 대리 (마케터) | Operations |

## 태스크 타입 9개

`research` / `blog` / `tech` / `marketing` / `design_ux` / `design_ui` / `dev` / `dev_plan` / `dev_spec`

## 시작하기

```bash
cd web
npm install
npm run dev
```

`http://localhost:3000` 접속 후 프로젝트 주제 입력.

## 오케스트레이션 흐름

```
CEO 입력 → 플랜 → 위키 → 포케 → [CEO 체크인] → 카 → writer → 팩트 → 핑+위키 → CEO
```

- `background` 모드: 체크인 게이트 스킵, 자동 완주
- `checkin` 모드: 2곳에서 CEO 확인 후 진행
