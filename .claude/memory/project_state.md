---
name: Cosmic Hustle 프로젝트 현황
description: 완료된 작업, 잔여 작업, 주요 기술 결정 사항 — 세션 간 이어받기용
type: project
---

## 최근 완료 작업 (2026-04-28)

- **시작 모드 선택**: ProjectConfig.mode ("background"|"checkin"|"full") 추가.
  background 모드에서 clarify_request·ceo_checkin 게이트 스킵.
  파일: ProjectSetupModal.tsx, app/api/research/route.ts, app/page.tsx

- **AgentImage 깜빡임 제거**: Next.js Image → CSS background-image div로 교체.
  window.Image()로 동일 URL 프리로드 후 crossfade 시작. 이전 방식은
  Next.js가 /_next/image 최적화 URL 사용해서 프리로드가 무의미했음.
  파일: web/components/AgentImage.tsx

- **DeptRoom 조직도 리디자인**:
  - Department 타입에 description·mission 필드 추가 (lib/agents.ts)
  - 최고직급자를 RANK_ORDER로 자동 판별 → 110px 리더 카드 상단 배치
  - CSS grid 수학으로 연결선 위치 정렬 (left: (2i+1)/(2N)*100%)
  - 팀원 82px 그리드, 부서 설명·미션 태그 헤더
  파일: web/components/DeptRoom.tsx

- **에셋 추가**: 캐릭터 이미지(buzz·pixel·plan·root·run), 부서 배경(3장)
  경로: web/public/characters/, web/public/departments/

## 잔여 작업

- [ ] 일부 캐릭터 working.png·done.png 미완성 (buzz·pixel·plan·root·run)
- [ ] 루트 #34D399 vs 포케 #86EFAC·핑 #6EE7B7 컬러 충돌 (모두 그린)
- [ ] design_ui 태스크 타입 HTML 프리뷰 렌더러
- [ ] Tistory 자동 포스팅 (blog 타입)
- [ ] 풀 모니터링 모드 UI (현재 checkin과 동일 동작, UI만 다름)

## 주요 기술 결정

- Claude Code SDK (@anthropic-ai/claude-code) 사용 — Anthropic API 별도 과금 없음
- 에이전트 tool 접근: plan/ka/over/fact 등 noTools:true, wiki만 Read+Glob,
  pocke만 WebSearch — 파일 전체 읽기 없음, 토큰 낭비 없음
- AgentChatPanel chat API도 noTools:true — Q&A만, 파일 접근 없음
- per-agent harness 불필요 — allowedTools가 이미 harness 역할

## 부서별 에이전트 직급 구조

Research: 플랜(차장) → 위키(대리)·포케(대리)·런(사원)
Creative: 카(과장) → 오버(사원)·픽셀(사원)·핑(인턴)
Operations: 팩트(부장) → 버즈(대리)·루트(사원)
