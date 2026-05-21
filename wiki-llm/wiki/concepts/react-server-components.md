---
tags: [react, nextjs, rsc, performance, rendering, frontend, app-router]
date: 2026-05-21
source_count: 1
---

# React Server Component (RSC) — 렌더링·성능·설계 기준

Next.js 13+ App Router 기준. RSC와 Client Component(CC)의 구조적 차이, 성능 수치, 선택 기준을 정리한다.

---

## 핵심 구분

| 항목 | Server Component | Client Component |
|------|-----------------|------------------|
| 실행 위치 | 서버 전용 | 서버(pre-render) + 클라이언트(hydration) |
| JS 번들 포함 | ✗ | ✓ |
| 인터랙션 | 불가 | onClick·useState·useEffect 지원 |
| 데이터 패칭 | 서버 직접 접근, 워터폴 없음 | 하이드레이션 후 fetch, 워터폴 리스크 |
| SEO | 유리 | 제한적 |
| 브라우저 API | 접근 불가 | window·localStorage 가능 |
| 실시간 업데이트 | 불가 | 웹소켓·폴링 가능 |
| 선언 방법 | 기본값 (선언 불필요) | 파일 최상단 `'use client'` |

---

## 성능 수치 (Next.js App Router, 2023–2025)

**TTI — 제품 목록 페이지 기준**

| 렌더링 방식 | TTI |
|------------|-----|
| RSC | 1.6s |
| SSR | 3.2s |
| CSR | 4.3s |

RSC가 CSR 대비 약 63% 빠름. 개선의 주원인은 번들 축소가 아니라 **클라이언트-서버 왕복 제거** 자체.

**번들 크기**  
App Router 전면 전환 시 First Load JS 50–70% 감소. 단, 혼합 도입만으로는 효과 미미 — 전면 전환 여부에 종속된 이분법적 결과.

**LCP — 프로덕션 사례**  
- DoorDash: LCP 약 65% 감소  
- GeekyAnts Lighthouse: 50 → 90+

---

## 데이터 패칭 패턴

**RSC 권장 패턴**
```tsx
// 서버 단일 라운드트립, 워터폴 없음
const [data1, data2] = await Promise.all([fetchA(), fetchB()]);
```

**React 19 `cache()` — N+1 방지**
```tsx
import { cache } from 'react';
const getUser = cache(async (id: string) => db.user.findUnique({ where: { id } }));
// 여러 컴포넌트에서 동일 인자로 호출해도 실제 요청은 1회
```

**CC `useEffect` 패칭의 위험**  
하이드레이션 완료 후 실행 → 초기 렌더링과 데이터 사이 공백 발생 → 워터폴 누적.

---

## `'use client'` 경계 설계 원칙

**핵심 규칙**: 경계를 컴포넌트 트리 **최하위 leaf 노드**로 밀어낼 것.

경계를 상위에 배치하면 하위 트리 전체가 클라이언트 번들에 편입되어 RSC 도입 효과가 소멸한다.

**잘못된 패턴**
```tsx
// ❌ 상위 레이아웃에 'use client' → 하위 정적 콘텐츠도 모두 CC
'use client';
export default function Layout({ children }) { ... }
```

**올바른 패턴 — 컴포지션**
```tsx
// ✅ Server Component가 CC를 children으로 수신
// page.tsx (Server Component)
import InteractiveButton from './InteractiveButton'; // 'use client'
export default function Page() {
  return (
    <article>
      <StaticContent />         {/* 서버 렌더, 번들 포함 안 됨 */}
      <InteractiveButton />     {/* 클라이언트 번들 최소화 */}
    </article>
  );
}
```

---

## 선택 기준 요약

**Server Component 적합**
- 정적 콘텐츠 렌더링
- DB·외부 API 직접 접근 (API Key 노출 없이)
- SEO 필수 페이지
- 초기 로드 성능 우선

**Client Component 적합**
- 이벤트 핸들러 (onClick, onChange 등)
- useState·useEffect 의존 로직
- 브라우저 API (window, localStorage, navigator)
- 실시간 업데이트 (웹소켓, 폴링)

---

## 결론

RSC는 콘텐츠 중심·SEO 필수·데이터 패칭 복잡도가 높은 서비스에서 TTI·LCP·번들을 동시에 개선하는 현재 가장 검증된 전략이다. 도입 성패는 기술 선택이 아니라 `'use client'` 경계를 얼마나 하위로 설계하는지 — 팀의 컴포넌트 설계 규율에 달려 있다.

---

## 소스

- [리액트 서버 컴포넌트 vs 클라이언트 컴포넌트 성능 비교 리포트 (2026-05-21)](../sources/Report_리액트_서버_컴포넌트_vs_클라이언트_컴포넌트_성능_비교__목표__React_Server_Component와_Client_Component의_렌더링_방식_번들_크기_TTI_데이터_패칭_측면에서_성능_차이를_분석하고_사용_기준을_제시한다____범위__Next_js_13__App_Router_기준__2023_2025년_공식_문서_벤치마크_실사례_중심__모바일_데스크탑_공통_고려__.md)
