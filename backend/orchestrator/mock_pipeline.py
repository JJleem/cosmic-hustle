"""Mock 파이프라인 — 0토큰, UI 테스트 전용."""
import asyncio
import uuid

# ── 태스크 타입별 writer 에이전트 ID ─────────────────────────────────────
MOCK_WRITER = {
    "research":  "over",
    "blog":      "over",
    "tech":      "over",
    "marketing": "buzz",
    "design_ux": "pixel",
    "design_ui": "pixel",
    "dev":       "run",
    "dev_plan":  "over",
    "dev_spec":  "over",
}

# ── 태스크 타입별 Mock 리포트 콘텐츠 ────────────────────────────────────
MOCK_REPORTS: dict[str, str] = {

    "research": """\
## AI 코딩 도구 시장 분석 (Mock — research)

### 시장 현황

2025년 기준 AI 코딩 도구 시장 점유율:

| 도구 | 점유율 | 사용자 수 |
|------|--------|-----------|
| GitHub Copilot | 29% | 2,600만+ |
| Cursor | 18% | — |
| Claude Code | 18% | — |

JetBrains 2026년 1월 조사. Claude Code는 출시 1년 만에 무료 플랜 없이 3위 안착.

### 핵심 차별점

**SWE-bench Verified 80.8%** — 에이전틱 코딩 분야 최상위권. 1M 컨텍스트 윈도우로 대규모 코드베이스 전체 작업 가능.

### 가격 구조

- Pro: $20/월 — 개인 진입점
- Max: $100~$200/월 — Pro 대비 5~20배 사용량

### 결론

무료 플랜 없이 성능 수치만으로 시장 점유율을 확보한 이례적 사례.""",

    "blog": """\
## "코딩 도우미"가 "코딩 동료"로 진화하다 (Mock — blog)

> 커피 한 잔 시간에 읽을 수 있는 AI 코딩 도구 트렌드 정리

---

### 처음엔 자동완성이었다

2021년 GitHub Copilot이 등장했을 때, 우리는 그것을 "똑똑한 자동완성"이라고 불렀다. 탭 키 한 번으로 함수 시그니처가 완성되고, 주석만 써도 코드가 나타났다.

하지만 2025년 지금, 판이 완전히 바뀌었다.

### 숫자로 보는 변화

Claude Code의 SWE-bench 점수는 **80.8%**. 2023년 GPT-4가 1.7%였던 것과 비교하면, 2년 만에 48배 향상됐다. 이제 AI는 버그를 찾고, PR을 만들고, 테스트까지 작성한다.

### 그래서 우리는 뭘 해야 하나?

1. **맥락을 잘 설명하는 법**을 배워라 — AI의 성능은 프롬프트 품질에 비례한다
2. **리뷰어 마인드셋**을 유지하라 — 생성된 코드는 반드시 이해하고 병합해야 한다
3. **작은 태스크부터** 시작하라 — 큰 리팩토링보다 단일 함수 개선부터

### 마무리

AI 코딩 도구는 생산성 도구가 아니라 협업 도구가 되고 있다. 지금이 적응할 타이밍이다.""",

    "tech": """\
## Next.js 15 vs Remix 기술 분석 (Mock — tech)

### 개요

2025년 기준 React 기반 풀스택 프레임워크 양대산맥 비교 분석.

### 장단점 비교

| 항목 | Next.js 15 | Remix |
|------|-----------|-------|
| 렌더링 | App Router + RSC | Nested Routes + Loader |
| 캐싱 | 세분화된 캐시 제어 | 기본 HTTP 캐시 |
| 번들 크기 | 중간 (34kB gzip) | 소형 (12kB gzip) |
| 학습 곡선 | 높음 (RSC 패러다임) | 중간 (웹 표준 기반) |
| Vercel 통합 | 네이티브 최적화 | 벤더 중립 |
| 생태계 | 압도적 (npm 주간 700만+) | 성장 중 (100만+) |

### 성능 수치

- Next.js 15 Lighthouse: 평균 94점 (App Router, 정적 최적화 기준)
- Remix: 평균 97점 (스트리밍 기본 적용, 워터폴 제거)

### 도입 권장 시나리오

**Next.js 선택**: 팀 규모 5명+, SEO 중요, Vercel 배포, 기존 Pages Router 마이그레이션
**Remix 선택**: 소규모 팀, 웹 표준 중시, 멀티 플랫폼 배포, 폼 중심 앱

### 결론

Next.js는 생태계, Remix는 철학. 신규 프로젝트 기준 Next.js 15 App Router 추천 — 생태계와 레퍼런스가 압도적이다.""",

    "marketing": """\
## Claude Code 바이럴 마케팅 전략 (Mock — marketing)

### 시장 기회

개발자 대상 SaaS 시장에서 "성능 수치" 마케팅이 가장 높은 전환율. SWE-bench 80.8% 단일 지표가 $200/월 가격 저항을 낮추는 핵심 레버.

### 핵심 타겟

- **1차**: 시니어 개발자 (의사결정권, 팀 도입 영향력)
- **2차**: 스타트업 CTO (비용 대비 생산성 극대화)
- **3차**: 개인 프리랜서 (시간당 수익 극대화)

### 채널별 액션 아이템

#### Twitter/X
- "전에는 이 기능에 3시간 걸렸는데 Claude Code로 12분" 실제 사례 스레드
- SWE-bench 비교 인포그래픽 (경쟁사 대비 시각화)
- 주 3회 개발자 팁 시리즈

#### YouTube
- "Claude Code로 풀스택 앱 4시간 만들기" 라이브 코딩
- "내가 $200/월 쓰는 이유" 솔직 ROI 분석 영상

#### 커뮤니티
- 국내: 개발자 카카오 오픈채팅, OKKY, 인프런 Q&A 참여
- 해외: Hacker News Show HN, Reddit r/programming

### 핵심 KPI

- 무료 체험 → Pro 전환율 목표: 15%
- NPS 목표: 60+ (현재 추정 45)

### 결론

"성능이 마케팅"인 제품. 실사용 영상 + 수치 비교가 광고보다 강력하다. 개발자 커뮤니티 내부에서 자연 확산 구조를 만드는 것이 핵심.""",

    "design_ux": """\
## 개발자 온보딩 UX 리서치 (Mock — design_ux)

### 사용자 퍼소나

**퍼소나 A — "빠른 시작형" 김민준 (27세, 주니어 개발자)**
- 목표: 빠르게 결과물을 만들고 싶다
- 페인포인트: 문서가 너무 길다, 어디서 시작해야 할지 모른다
- 행동 패턴: 공식 문서보다 YouTube 튜토리얼 선호

**퍼소나 B — "신중한 검토형" 박지연 (34세, 시니어 개발자)**
- 목표: 팀 도입 전 리스크를 완전히 파악하고 싶다
- 페인포인트: 가격 정책이 복잡하고 비교가 어렵다
- 행동 패턴: 공식 문서 정독 후 의사결정

### 핵심 페인포인트

1. **첫 실행 장벽** — 설치부터 첫 결과까지 평균 23분 소요 (목표: 5분)
2. **맥락 파악 실패** — "얼마나 쓸 수 있는지" 토큰/시간 제한 불명확
3. **에러 메시지 불친절** — 권한 오류 발생 시 해결 경로 없음

### 사용자 여정 맵

| 단계 | 행동 | 감정 | 개선 기회 |
|------|------|------|-----------|
| 발견 | 트위터에서 데모 영상 시청 | 기대 😊 | — |
| 가입 | Pro 플랜 결제 | 망설임 😐 | 7일 무료체험 |
| 설치 | npm install + 인증 | 혼란 😕 | 원클릭 설치 마법사 |
| 첫 사용 | 간단한 질문 입력 | 만족 😄 | 샘플 프로젝트 제공 |
| 심화 | 복잡한 작업 시도 | 당혹 😟 | 인터랙티브 가이드 |

### 개선 방향 우선순위

1. **(P0)** 온보딩 첫 5분 경험 재설계 — 샘플 프로젝트 자동 로드
2. **(P1)** 사용량 대시보드 명확화 — 잔여 컨텍스트 실시간 표시
3. **(P2)** 에러 → 해결책 직결 링크 추가""",

    "design_ui": """\
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 코딩 도구 비교 대시보드</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Pretendard', -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; color: #f8fafc; }
    .subtitle { font-size: 0.875rem; color: #64748b; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.25rem; }
    .card-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card-value { font-size: 2rem; font-weight: 700; color: #f8fafc; }
    .card-sub { font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem; }
    .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-green { background: #064e3b; color: #6ee7b7; }
    .badge-blue { background: #1e3a5f; color: #93c5fd; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; }
    th { background: #0f172a; padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 0.875rem 1rem; border-top: 1px solid #334155; font-size: 0.875rem; }
    tr:hover td { background: #263348; }
    .bar-wrap { background: #334155; border-radius: 9999px; height: 6px; width: 100%; }
    .bar { height: 6px; border-radius: 9999px; background: linear-gradient(90deg, #6366f1, #8b5cf6); }
  </style>
</head>
<body>
  <h1>AI 코딩 도구 비교 대시보드</h1>
  <p class="subtitle">Mock 데이터 — design_ui 태스크 타입 테스트</p>

  <div class="grid">
    <div class="card">
      <div class="card-label">SWE-bench 1위</div>
      <div class="card-value">80.8%</div>
      <div class="card-sub">Claude Code · Verified 기준</div>
    </div>
    <div class="card">
      <div class="card-label">시장 점유율</div>
      <div class="card-value">18%</div>
      <div class="card-sub">JetBrains 2026.01 조사 <span class="badge badge-green">3위</span></div>
    </div>
    <div class="card">
      <div class="card-label">컨텍스트 윈도우</div>
      <div class="card-value">1M</div>
      <div class="card-sub">토큰 · 업계 최대 <span class="badge badge-blue">최신</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>도구</th>
        <th>SWE-bench</th>
        <th>점유율</th>
        <th>시작 가격</th>
        <th>성능 지수</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Claude Code</strong></td>
        <td>80.8%</td>
        <td>18%</td>
        <td>$20/월</td>
        <td><div class="bar-wrap"><div class="bar" style="width:80.8%"></div></div></td>
      </tr>
      <tr>
        <td>GitHub Copilot</td>
        <td>54.2%</td>
        <td>29%</td>
        <td>$10/월</td>
        <td><div class="bar-wrap"><div class="bar" style="width:54.2%; background: linear-gradient(90deg,#0ea5e9,#38bdf8)"></div></div></td>
      </tr>
      <tr>
        <td>Cursor</td>
        <td>61.7%</td>
        <td>18%</td>
        <td>$20/월</td>
        <td><div class="bar-wrap"><div class="bar" style="width:61.7%; background: linear-gradient(90deg,#10b981,#34d399)"></div></div></td>
      </tr>
    </tbody>
  </table>
</body>
</html>
```""",

    "dev": """\
## 실시간 알림 시스템 구현 (Mock — dev)

### 구현 방향

WebSocket 대신 SSE(Server-Sent Events) 채택. 단방향 스트림으로 충분하고, 재연결 로직이 브라우저 내장.

### 핵심 결정사항

| 항목 | 선택 | 이유 |
|------|------|------|
| 프로토콜 | SSE | 단방향, HTTP/2 멀티플렉싱, 재연결 자동 |
| 브로드캐스트 | Redis Pub/Sub | 다중 서버 인스턴스 대응 |
| 큐 | asyncio.Queue | 단일 서버 환경에서 오버헤드 최소화 |

### 서버 구현 (FastAPI)

```python
from fastapi import FastAPI
from sse_starlette.sse import EventSourceResponse
import asyncio

app = FastAPI()
subscribers: dict[str, asyncio.Queue] = {}

@app.get("/events/{user_id}")
async def event_stream(user_id: str):
    queue = asyncio.Queue(maxsize=100)
    subscribers[user_id] = queue

    async def generator():
        try:
            while True:
                event = await asyncio.wait_for(queue.get(), timeout=30)
                yield {"data": event}
        except asyncio.TimeoutError:
            yield {"data": '{"type":"ping"}'}  # keep-alive
        finally:
            subscribers.pop(user_id, None)

    return EventSourceResponse(generator())
```

### 클라이언트 연결

```typescript
const es = new EventSource(`/events/${userId}`);
es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  if (event.type !== "ping") handleEvent(event);
};
es.onerror = () => setTimeout(() => connect(), 3000); // 재연결
```

### 트레이드오프

- **장점**: 구현 단순, 로드밸런서 sticky session 불필요
- **단점**: 서버 → 클라이언트 단방향만 가능. 양방향 필요 시 WebSocket 전환 필요""",

    "dev_plan": """\
## 알림 서비스 개발 기획서 (Mock — dev_plan)

### 배경 및 목적

현재 사용자 이탈률 38%의 주요 원인이 "결과 확인 지연"으로 분석됨 (2025 Q3 설문). 실시간 알림 시스템 도입으로 이탈률 20% 이하로 개선 목표.

### 목표 및 성공 지표

| 지표 | 현재 | 목표 |
|------|------|------|
| 사용자 이탈률 | 38% | 20% 이하 |
| 알림 전달 지연 | 평균 12초 | 1초 이하 |
| 서버 연결 유지율 | — | 95% 이상 |

### 기술 스택 선정

- **백엔드**: FastAPI + SSE (`sse-starlette`) — 기존 스택 유지, 도입 비용 최소화
- **메시지 브로커**: Redis Pub/Sub — 다중 인스턴스 확장 대비, 팀 내 운영 경험 보유
- **프론트엔드**: EventSource API (브라우저 네이티브) — 외부 라이브러리 불필요

### 구현 범위

- [ ] SSE 엔드포인트 구현 (`GET /events/{userId}`)
- [ ] Redis 채널 구독/발행 로직
- [ ] 프론트엔드 EventSource 훅
- [ ] 알림 이력 DB 저장 (30일 보관)
- [ ] 관리자 대시보드 알림 현황 뷰

### 일정 계획

| 주차 | 작업 |
|------|------|
| 1주차 | SSE 엔드포인트 + Redis 연동 |
| 2주차 | 프론트엔드 훅 + 재연결 로직 |
| 3주차 | QA + 부하 테스트 (동시 1,000 연결) |
| 4주차 | 스테이징 배포 + 모니터링 설정 |

### 리스크

- **Redis 단일장애점**: Sentinel 구성 필요, 비용 추가 발생 가능
- **프록시 타임아웃**: Nginx/ALB SSE 설정 누락 시 30초 단절 — 설정 가이드 필수""",

    "dev_spec": """\
## 실시간 알림 기능 명세서 (Mock — dev_spec)

### 개요

사용자별 실시간 이벤트 스트리밍 기능. SSE 프로토콜 기반, 인증된 사용자에게만 제공.

### 기능 목록

| 기능 ID | 기능명 | 우선순위 | 의존관계 |
|---------|--------|----------|----------|
| NTF-001 | SSE 스트림 연결 | P0 | 인증 시스템 |
| NTF-002 | 이벤트 발행 API | P0 | NTF-001 |
| NTF-003 | 연결 재시도 | P1 | NTF-001 |
| NTF-004 | 알림 이력 저장 | P1 | DB |
| NTF-005 | 읽음 처리 | P2 | NTF-004 |

### 기능별 상세 명세

#### NTF-001 — SSE 스트림 연결

- **입력**: `userId` (path param), `Authorization` (header)
- **출력**: `text/event-stream` 응답 스트림
- **예외**:
  - 401: 인증 실패 → 스트림 즉시 종료
  - 429: 동시 연결 초과 (사용자당 최대 3개) → `{"type":"error","code":"TOO_MANY_CONNECTIONS"}`

#### NTF-002 — 이벤트 발행 API

- **입력**: `POST /internal/notify` `{"userId": "...", "type": "...", "payload": {}}`
- **출력**: `{"ok": true, "delivered": true/false}`
- **예외**: userId가 연결 중이 아닐 경우 DB에만 저장 (delivered: false)

#### NTF-003 — 연결 재시도

- 클라이언트: `EventSource` 자동 재연결 (브라우저 기본 3초)
- 서버: 30초 ping 없으면 연결 정리 (`finally` 블록에서 subscribers 제거)

### API 엔드포인트

```
GET  /api/events/{userId}          # SSE 스트림 구독
POST /api/internal/notify          # 이벤트 발행 (서버 내부용)
GET  /api/notifications?limit=50   # 알림 이력 조회
PATCH /api/notifications/{id}/read # 읽음 처리
```

### 데이터 모델

```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  delivered   BOOLEAN DEFAULT FALSE,
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON notifications(user_id, created_at DESC);
```""",
}


def _get_mock_report(task_type: str, topic: str) -> str:
    content = MOCK_REPORTS.get(task_type, MOCK_REPORTS["research"])
    # 첫 줄 제목에 실제 topic 반영
    lines = content.strip().split("\n")
    if lines and lines[0].startswith("## "):
        lines[0] = f"## {topic} (Mock — {task_type})"
    return "\n".join(lines)


def _build_events(task_type: str, writer_id: str) -> list[tuple[float, dict]]:
    """task_type에 맞는 이벤트 시퀀스 생성."""
    is_dev = task_type == "dev"

    # pocke/ka 에이전트: dev/tech/dev_plan/dev_spec는 기술 특화 멘트
    tech_types = {"tech", "dev", "dev_plan", "dev_spec"}
    pocke_msg = "GitHub·공식 문서 위주로 검색 중..." if task_type in tech_types else "볼따구에 정보 쑤셔넣는 중..."
    pocke_done = "기술 스펙 확보 완료." if task_type in tech_types else "볼따구 터질것같아! 카 과장한테 넘길게요."
    ka_msg = "아키텍처 패턴 분석 중..." if task_type in tech_types else "패턴 분석 시작. 데이터 하나만 더..."

    # writer 멘트
    writer_starts = {
        "over":  "초안 작성 시작. 카 과장 분석이 좋은데...",
        "buzz":  "바이럴 각 잡히는데? 전략 짜볼게요.",
        "pixel": "레이아웃 구조부터 잡겠습니다.",
        "run":   "구현 방향 정리 시작. 트레이드오프 먼저.",
    }
    writer_done = {
        "over":  "완성. 팩트 부장님께.",
        "buzz":  "캠페인 플랜 완성. 팩트 확인 부탁해요.",
        "pixel": "가이드 문서 완성. 검토 부탁드려요.",
        "run":   "구현 명세 완성. 루트 사원한테 넘길게요.",
    }

    events: list[tuple[float, dict]] = [
        # plan
        (0.3, {"type": "agent_start",   "agentId": "plan",  "message": "요구사항 파악 중. 티켓 열게요."}),
        (0.3, {"type": "agent_stream",  "agentId": "plan",  "chunk": f"태스크 유형: {task_type}"}),
        (0.5, {"type": "agent_done",    "agentId": "plan",  "message": "기획 완료. 팀 투입할게요."}),
        # wiki + pocke 병렬
        (0.1, {"type": "agent_start",   "agentId": "wiki",  "message": "관련 자료 조용히 꺼내는 중..."}),
        (0.1, {"type": "agent_start",   "agentId": "pocke", "message": pocke_msg}),
        (0.4, {"type": "agent_stream",  "agentId": "pocke", "chunk": "검색 결과 수집 중..."}),
        (0.5, {"type": "agent_stream",  "agentId": "pocke", "chunk": "소스 3개 확보."}),
        (0.4, {"type": "agent_done",    "agentId": "wiki",  "message": "이전 리서치 연결됐어요."}),
        (0.3, {"type": "agent_done",    "agentId": "pocke", "message": pocke_done}),
        # ka
        (0.2, {"type": "agent_start",   "agentId": "ka",    "message": ka_msg}),
        (0.3, {"type": "agent_thinking","agentId": "ka",    "chunk": "상관관계 분석 중..."}),
        (0.5, {"type": "agent_stream",  "agentId": "ka",    "chunk": "인사이트 도출 중..."}),
        (0.5, {"type": "agent_done",    "agentId": "ka",    "message": "찾았다!!! 핵심 인사이트 잡음."}),
        # writer attempt 1
        (0.2, {"type": "agent_start",   "agentId": writer_id, "message": writer_starts.get(writer_id, "작성 시작.")}),
        (0.3, {"type": "agent_stream",  "agentId": writer_id, "chunk": "초안 작성 중..."}),
        (0.5, {"type": "agent_done",    "agentId": writer_id, "message": writer_done.get(writer_id, "초안 완성.")}),
    ]

    # dev 태스크: root 단계 추가
    if is_dev:
        events += [
            (0.2, {"type": "agent_start",  "agentId": "root", "message": "배포 파이프라인 설계 중..."}),
            (0.4, {"type": "agent_stream", "agentId": "root", "chunk": "CI/CD 스텝 정리 중..."}),
            (0.4, {"type": "agent_done",   "agentId": "root", "message": "배포 계획 완성."}),
        ]

    events += [
        # fact
        (0.1, {"type": "agent_message", "agentId": "fact", "message": "...검토 시작."}),
        (0.2, {"type": "agent_start",   "agentId": "fact", "message": "..."}),
        (0.3, {"type": "agent_thinking","agentId": "fact", "chunk": "초안 분석 중..."}),
        (0.5, {"type": "agent_done",    "agentId": "fact", "message": "피드백 전달. 수정 부탁해요."}),
        # writer attempt 2
        (0.2, {"type": "agent_message", "agentId": writer_id, "message": "팩트 피드백 반영해서 다듬을게요."}),
        (0.2, {"type": "agent_start",   "agentId": writer_id, "message": "최종본 다듬는 중..."}),
        (0.3, {"type": "agent_stream",  "agentId": writer_id, "chunk": "보강 중..."}),
        (0.5, {"type": "agent_done",    "agentId": writer_id, "message": "최종본 완성."}),
        # ping + wiki
        (0.2, {"type": "agent_start",   "agentId": "ping",  "message": "이거랑 저거 합치면?! ✨"}),
        (0.2, {"type": "agent_start",   "agentId": "wiki",  "message": "리서치 기록 업데이트 중..."}),
        (0.4, {"type": "ping_ideas", "ideas": [
            {"title": "후속 조사 주제 A", "spark": "이번 분석에서 파생된 아이디어"},
            {"title": "후속 조사 주제 B", "spark": "추가 검증이 필요한 가설"},
        ]}),
        (0.3, {"type": "agent_done",    "agentId": "ping",  "message": "아이디어 캡처 완료!"}),
        (0.3, {"type": "agent_done",    "agentId": "wiki",  "message": "위키 업데이트 완료."}),
    ]

    return events


async def run_mock_pipeline(session_id: str, topic: str, task_type: str = "research"):
    task_type = task_type if task_type in MOCK_REPORTS else "research"
    writer_id = MOCK_WRITER[task_type]
    report_id = str(uuid.uuid4())
    mock_content = _get_mock_report(task_type, topic)

    yield {"type": "session_start", "sessionId": session_id}
    await asyncio.sleep(0.1)

    events = _build_events(task_type, writer_id)

    for i, (delay, event) in enumerate(events):
        await asyncio.sleep(delay)
        yield event
        # writer 1차 완료 직후 draft_report + version 1 발행
        if event.get("agentId") == writer_id and event.get("type") == "agent_done" and \
                sum(1 for _, e in events[:i + 1] if e.get("agentId") == writer_id and e.get("type") == "agent_done") == 1:
            yield {"type": "draft_report", "agentId": writer_id, "content": mock_content}
            yield {"type": "report_version", "version": 1, "content": mock_content, "prevFeedback": ""}
        # writer 2차 완료 직후 version 2 발행
        elif event.get("agentId") == writer_id and event.get("type") == "agent_done" and \
                sum(1 for _, e in events[:i + 1] if e.get("agentId") == writer_id and e.get("type") == "agent_done") == 2:
            yield {"type": "report_version", "version": 2, "content": mock_content, "prevFeedback": "수치 출처 보강 필요"}

    await asyncio.sleep(0.2)
    yield {
        "type": "report",
        "reportId": report_id,
        "agentId": writer_id,
        "topic": topic,
        "content": mock_content,
    }
    await asyncio.sleep(0.3)
    yield {"type": "complete", "reportId": report_id, "topic": topic}
