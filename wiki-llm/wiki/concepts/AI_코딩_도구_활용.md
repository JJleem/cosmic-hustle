---
tags: [ai코딩, claude-code, cursor, codex, 개발도구]
date: 2026-04-22
source_count: 1
---

# AI 코딩 도구 활용

## 주요 도구 비교

| 도구 | 특징 | 비용 |
|------|------|------|
| **Claude Code** | 로컬 작업 직접 확인, VS Code 통합, Hooks로 Git 자동화 | $200/월 |
| **Cursor** | 가성비 우수, Composer 2는 140페이지에 14% 토큰만 소비 | $20/월 |
| **Codex** | 병렬 활용으로 코드 검증 강화, 토큰 가성비 우수 | - |

## Claude Code 특징

- 로컬 파일 직접 읽기/쓰기 가능 (로컬 작업 확인 가능)
- VS Code 통합 지원
- Hooks로 Git 작업 자동화
- 터미널 CLI 대비 Desktop App은 1.2-2배 토큰 소비

## 환경 설정 권장사항

- Windows 환경보다 **WSL/Linux 기반**에서 실행 속도 향상
- 터미널 CLI 방식이 Desktop App보다 토큰 효율 우수

## 코드 리뷰 전략

- 비싼 모델(Claude) + 저렴한 모델(Codex) **병렬 활용**
- 최종적으로 개발자가 문제 해결 여부 판단
- 코드의 단순성과 이해가능성 평가 필수
- Verification Agent로 검증 단계 추가

## Sources

- [[sources/20260422_KakaoTalk_Chat_[캐슬] AI 정보 공유방_2026-04-22-12-40-45.md]]
