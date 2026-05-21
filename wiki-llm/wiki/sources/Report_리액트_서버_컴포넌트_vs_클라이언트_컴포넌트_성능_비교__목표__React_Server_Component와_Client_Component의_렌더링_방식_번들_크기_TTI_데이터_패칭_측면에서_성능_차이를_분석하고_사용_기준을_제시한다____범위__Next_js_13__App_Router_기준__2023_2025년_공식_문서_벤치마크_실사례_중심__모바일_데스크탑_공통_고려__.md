---
tags: [react, nextjs, rsc, performance, rendering, frontend]
date: 2026-05-21
source_count: 1
---

# 리액트 서버 컴포넌트 vs 클라이언트 컴포넌트 성능 비교

> 원본 리포트: 오버 작성, 2026-05-21  
> 범위: Next.js 13+ App Router, 2023–2025년 공식 문서·벤치마크·프로덕션 사례

---

## 핵심 요약

React Server Component(RSC)와 Client Component(CC)의 성능 차이를 4개 축(렌더링·번들·TTI·데이터 패칭)에서 분석.

### 렌더링 구조
- RSC: 서버에서만 실행, JS 번들 포함 안 됨 — 번들 감소 구조적 보장
- CC: `'use client'` 선언, 서버 사전 렌더링 + 클라이언트 하이드레이션 추가 발생

### 수치 근거

| 지표 | RSC | SSR | CSR |
|------|-----|-----|-----|
| TTI (제품 목록 기준) | 1.6s | 3.2s | 4.3s |
| First Load JS (전면 전환 시) | −50~70% | — | 기준 |
| LCP (DoorDash 사례) | −65% | — | 기준 |
| LCP (GeekyAnts Lighthouse) | 90+ | — | 50 |

TTI 개선 주원인: 번들 축소가 아닌 클라이언트-서버 왕복 제거.

### 데이터 패칭
- RSC: 서버 단일 라운드트립, `Promise.all` 병렬 패칭 → 워터폴 구조적 제거
- React 19 `cache()`: 컴포넌트 간 동일 요청 자동 중복 제거 (N+1 방지)
- CC `useEffect` 패칭: 하이드레이션 완료 후 실행 → 워터폴 리스크 잔존

### 사용 기준
- **Server Component**: 정적 콘텐츠, DB/외부 API 직접 접근, SEO 필수, 초기 로드 우선
- **Client Component**: 이벤트 핸들러, useState·useEffect, 브라우저 API, 실시간 업데이트

### 아키텍처 원칙
`'use client'` 경계를 컴포넌트 트리 최하위 leaf 노드로 밀어낼 것. 상위 배치 시 하위 트리 전체가 클라이언트 번들에 편입되어 RSC 효과 소멸. 혼재 필요 시 Server Component가 Client Component를 `children`으로 수신하는 컴포지션 패턴 적용.

---

## 관련 개념 페이지

- [React Server Component (RSC) — 렌더링·성능·설계 기준](../concepts/react-server-components.md)
