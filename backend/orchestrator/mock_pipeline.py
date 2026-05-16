"""Mock 파이프라인 — 0토큰, UI 테스트 전용."""
import asyncio
import uuid

MOCK_REPORT = """## AI 코딩 도구 시장 분석 (Mock 리포트)

### 개요

이 리포트는 **Mock 테스트 모드**로 생성된 샘플 데이터입니다. 실제 AI 에이전트를 실행하지 않았으며, 토큰을 소비하지 않았습니다.

---

### 시장 현황

2025년 기준 AI 코딩 도구 시장 점유율 현황:

| 도구 | 점유율 | 사용자 수 |
|------|--------|-----------|
| GitHub Copilot | 29% | 2,600만+ |
| Cursor | 18% | - |
| Claude Code | 18% | - |

JetBrains 2026년 1월 조사 기준. Claude Code는 출시 1년 만에 무료 플랜 없이 3위에 안착.

---

### 핵심 차별점

**SWE-bench Verified 80.8%** — 에이전틱 코딩 분야 최상위권 성적. 수치 하나가 마케팅 예산보다 강력하게 작동.

**1M 컨텍스트 윈도우** — 대규모 코드베이스 전체를 메모리에 올리고 작업 가능. 레거시 리팩토링, 멀티파일 작업에서 압도적.

---

### 가격 구조

- Pro: $20/월 — 개인 진입점
- Max $100/월 — Pro 대비 5배 사용량
- Max $200/월 — Pro 대비 20배 사용량 (약 30만 원/월)

PLG(Product-Led Growth) 구조: 개인 개발자 → 팀 → 엔터프라이즈 확장 경로.

---

### 결론

무료 플랜 없이 성능 수치만으로 시장 점유율을 확보한 이례적 사례. 개인 학습 목적이라면 Pro $20/월로 시작, 복잡한 작업에 집중 투입하는 것이 가장 비용 효율이 높은 전략이다."""

MOCK_EVENTS = [
    # plan
    (0.3, {"type": "session_start"}),
    (0.2, {"type": "agent_start",  "agentId": "plan",  "message": "요구사항 파악 중. 티켓 열게요."}),
    (0.4, {"type": "agent_stream", "agentId": "plan",  "chunk": "태스크 유형 분석 중..."}),
    (0.5, {"type": "agent_done",   "agentId": "plan",  "message": "기획 완료. 팀 투입할게요."}),
    # wiki + pocke 병렬
    (0.1, {"type": "agent_start",   "agentId": "wiki",  "message": "관련 자료 조용히 꺼내는 중..."}),
    (0.1, {"type": "agent_start",   "agentId": "pocke", "message": "볼따구에 정보 쑤셔넣는 중..."}),
    (0.4, {"type": "agent_stream",  "agentId": "pocke", "chunk": "검색 결과 수집 중..."}),
    (0.5, {"type": "agent_stream",  "agentId": "pocke", "chunk": "소스 3개 확보."}),
    (0.4, {"type": "agent_done",    "agentId": "wiki",  "message": "이전 리서치 연결됐어요."}),
    (0.3, {"type": "agent_done",    "agentId": "pocke", "message": "볼따구 터질것같아! 카 과장한테 넘길게요."}),
    # ka
    (0.2, {"type": "agent_start",  "agentId": "ka",    "message": "패턴 분석 시작. 데이터 하나만 더..."}),
    (0.3, {"type": "agent_thinking","agentId": "ka",    "chunk": "상관관계 분석 중..."}),
    (0.5, {"type": "agent_stream", "agentId": "ka",    "chunk": "인사이트 도출 중..."}),
    (0.5, {"type": "agent_done",   "agentId": "ka",    "message": "찾았다!!! 핵심 인사이트 잡음."}),
    # writer attempt 1
    (0.2, {"type": "agent_start",  "agentId": "over",  "message": "초안 작성 시작. 카 과장 분석이 좋은데..."}),
    (0.3, {"type": "agent_stream", "agentId": "over",  "chunk": "## 시장 개요\n\n"}),
    (0.2, {"type": "agent_stream", "agentId": "over",  "chunk": "데이터 기반 분석 정리 중..."}),
    (0.5, {"type": "agent_done",   "agentId": "over",  "message": "완성. 팩트 부장님께."}),
    (0.1, {"type": "draft_report", "agentId": "over",  "content": MOCK_REPORT}),
    (0.1, {"type": "report_version","version": 1,      "content": MOCK_REPORT, "prevFeedback": ""}),
    # fact
    (0.2, {"type": "agent_message","agentId": "fact",  "message": "...검토 시작."}),
    (0.2, {"type": "agent_start",  "agentId": "fact",  "message": "..."}),
    (0.3, {"type": "agent_thinking","agentId": "fact", "chunk": "초안 분석 중..."}),
    (0.5, {"type": "agent_done",   "agentId": "fact",  "message": "피드백 전달. 수정 부탁해요."}),
    # writer attempt 2
    (0.2, {"type": "agent_message","agentId": "over",  "message": "팩트 피드백 반영해서 다듬을게요."}),
    (0.2, {"type": "agent_start",  "agentId": "over",  "message": "최종본 다듬는 중... 이번엔 진짜다."}),
    (0.3, {"type": "agent_stream", "agentId": "over",  "chunk": "수치 보강 및 문장 정제 중..."}),
    (0.5, {"type": "agent_done",   "agentId": "over",  "message": "최종본 완성."}),
    (0.1, {"type": "report_version","version": 2,      "content": MOCK_REPORT, "prevFeedback": "수치 출처 보강 필요"}),
    # report + finalize
    (0.2, {"type": "agent_start",  "agentId": "ping",  "message": "이거랑 저거 합치면?! ✨"}),
    (0.2, {"type": "agent_start",  "agentId": "wiki",  "message": "리서치 기록 업데이트 중..."}),
    (0.4, {"type": "ping_ideas",   "ideas": [
        {"title": "비용 대비 성능 비교표 자동화", "description": "AI 코딩 도구별 SWE-bench 점수 + 월 요금 자동 갱신"},
        {"title": "팀 도입 ROI 계산기", "description": "개발자 수, 평균 연봉 입력 시 Claude Code Max 플랜 ROI 추정"},
    ]}),
    (0.3, {"type": "agent_done",   "agentId": "ping",  "message": "아이디어 캡처 완료!"}),
    (0.3, {"type": "agent_done",   "agentId": "wiki",  "message": "위키 업데이트 완료."}),
]


async def run_mock_pipeline(session_id: str, topic: str):
    report_id = str(uuid.uuid4())
    yield {"type": "session_start", "sessionId": session_id}
    await asyncio.sleep(0.1)

    for delay, event in MOCK_EVENTS:
        await asyncio.sleep(delay)
        # session_start는 이미 보냈으므로 스킵
        if event.get("type") == "session_start":
            continue
        yield event

    await asyncio.sleep(0.2)
    yield {
        "type": "report",
        "reportId": report_id,
        "agentId": "over",
        "topic": topic,
        "content": MOCK_REPORT,
    }
    await asyncio.sleep(0.3)
    yield {"type": "complete", "reportId": report_id, "topic": topic}
