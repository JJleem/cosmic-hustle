---
tags: [interview, supercent, ai-engineering, llm, pipeline]
date: 2026-04-21
source_count: 1
---

# 슈퍼센트 AI Application Engineer — 1차 면접 준비

**면접일:** 2026년 5월 6일  
**원본 파일:** `raw/supercent_interview_prep.md`

---

## 핵심 프로젝트 요약

### Centinel — 광고 소재 생성 파이프라인
- **입력:** 장르명 하나
- **출력:** 광고 소재 6종 (hook + mainCopy)
- **구조:** Google Play 차트 수집 → Claude 4단계 앙상블 분석 → Vision 스크린샷 분석 → 소재 생성
- **최적화:** 토큰 비용 89% 절감, iOS 통합, 피드백 루프, FOMO 편향 제거

### Centiment — 앱스토어 리뷰 감성 분석
- 슈퍼센트 게임 26개 타이틀 리뷰 분석
- Centinel 소재 생성에 "실제 유저 언어" 주입하기 위한 연장선

---

## 주요 기술 판단 근거 (꺼내쓸 답변)

| 질문 | 핵심 답변 |
|------|-----------|
| 왜 4단계 앙상블? | 단일 모델 = 단일 관점. 병렬 전문가 시각으로 후보군 확장 |
| Haiku vs Sonnet 분리 기준 | 판단/선별/종합 → Sonnet, 패턴 인식/분류/반복 → Haiku |
| SSE vs WebSocket | 서버→클라이언트 단방향 스트리밍 → SSE. 양방향 불필요 |
| Vision 캐싱 TTL 없는 이유 | 앱 업데이트 시 URL 변경 → 자연 무효화 |
| FOMO 편향 발견/해결 | CTR 기준 선별 제거 → hook+mainCopy 품질 기반으로 전환 |
| google-play-scraper 선택 이유 | 공식 API 접근 제한 + 프로토타이핑 속도. 프로덕션에서는 Sensor Tower로 |
| 프로덕션 전환 시 문제점 3가지 | Rate Limit 핸들링, 스크래퍼 의존성 리스크, Vision 비용 모니터링 부재 |
| 동시 요청 처리 | 요청 큐 + 제한된 병렬 처리 필요. Vision 캐싱으로 재분석 비용 절감 |

---

## 자기소개 핵심 메시지
- **"만들어서 증명하는"** 개발자
- AI를 쓰는 게 아니라 **조직이 체감할 변화**를 만드는 엔지니어
- C-Hub (GS인증 1등급) → Centinel/Centiment 흐름으로 성장 입증

---

## 역질문 선택지
1. UA팀 광고 소재 기획의 병목 지점
2. AI Application Engineer가 단기적으로 해결했으면 하는 문제
3. 내부 데이터 → AI 파이프라인 연결 논의 현황 (RAG 연동 방향 자연스럽게 연결)

---

## 주의사항
- 현 회사 부정 금지 → "내가 가고 싶은 방향이 명확해진 것"으로 프레이밍
- 백엔드 경험 없음 인정 → 단 "서비스 전반 만드는 감각"으로 커버
