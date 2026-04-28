---
tags: [network, streaming, sse, websocket, nextjs]
date: 2026-04-21
source_count: 1
---

# SSE vs WebSocket 선택 기준

## 한 줄 요약
서버→클라이언트 단방향 스트리밍이면 SSE, 양방향 실시간 통신이면 WebSocket.

## 비교

| 항목 | SSE | WebSocket |
|------|-----|-----------|
| 통신 방향 | 서버 → 클라이언트 (단방향) | 양방향 |
| 프로토콜 | HTTP 위에서 동작 | 별도 WS 프로토콜 |
| 구현 복잡도 | 낮음 | 높음 (연결 관리 필요) |
| Next.js 호환 | ReadableStream으로 바로 구현 | 추가 설정 필요 |
| Vercel 배포 | 호환 | 제한적 |

## SSE 선택이 맞는 상황
- 클라이언트가 요청 1회 → 서버가 여러 번 결과를 밀어주는 구조
- LLM 파이프라인 단계별 중간 결과 스트리밍
- 서버리스(Vercel) 환경에서 배포

## 관련 소스
- [[sources/supercent_1차면접_준비]]
