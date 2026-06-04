# Cosmic Hustle

우주 리서치 회사. 사용자 = CEO, AI 에이전트 11명 = 직원. 주제를 던지면 에이전트들이 역할 분담해서 조사하고 리포트를 만들어줌.

백엔드 작업 시 `backend/` 디렉토리에서 Claude 실행 → `backend/CLAUDE.md` 로드됨.

---

## V2.0 기술 스택

| 레이어 | 기술 | 역할 |
|--------|------|------|
| Frontend | Next.js 15 + TypeScript | UI, SSE 수신 |
| Backend | Python 3.12 + FastAPI | 에이전트 오케스트레이션, SSE 발신 |
| Orchestration | 직접 구현한 asyncio 파이프라인 | 추후 LangGraph로 교체 예정 |
| AI | Claude Code SDK (`@anthropic-ai/claude-code`) | Claude Code 구독 토큰 사용 |
| DB | PostgreSQL 16 + pgvector | 세션·리포트·위키 벡터 검색 |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` | 384차원, 로컬, API키 불필요 |
| Search | Claude WebSearch 툴 | 포케가 직접 WebSearch 호출 |
| Hosting | AWS Lightsail (백엔드 + DB) | 프론트는 Vercel 유지 |

---

## 디렉토리 구조

```
cosmic-hustle/
├── web/          # Next.js 프론트엔드
├── backend/      # Python FastAPI (상세 → backend/CLAUDE.md)
└── CLAUDE.md
```

---

## 에이전트 11명

| 이름 | 직책 | 역할 | 부서 | 컬러 |
|------|------|------|------|------|
| 플랜 | 차장 | PM — 요구사항 파악, 태스크 정의 | Research | #FCD34D |
| 위키 | 대리 | 사서 — 지식 누적, 컨텍스트 제공 | Research | #C4B5FD |
| 포케 | 대리 | 리서처 — 볼따구에 정보 쑤셔넣는 햄스터형 | Research | #86EFAC |
| 런 | 사원 | 개발자 — "이미 짰어요" | Research | #67E8F9 |
| 카 (유레카) | 과장 | 분석가 — 다크서클, "찾았다!" | Creative | #A78BFA |
| 오버 | 사원 | 작가 — 베레모, 자기 글에 혼자 감동 | Creative | #F9A8D4 |
| 픽셀 | 사원 | 디자이너 — 폰트 집착, 여백에 감정이입 | Creative | #FDBA74 |
| 핑 | 인턴 | 아이디어 수집가 — 안테나에서 스파크 | Creative | #6EE7B7 |
| 팩트 | 부장 | 검토자 — 무표정, 빨간펜 | Operations | #CBD5E1 |
| 루트 | 사원 | DevOps — 수동 배포는 범죄 | Operations | #34D399 |
| 버즈 | 대리 | 마케터 — "바이럴 각이다!" | Operations | #FB923C |

캐릭터 상세 설정 → `characters.md` 참고

---

## 오케스트레이션 흐름

```
CEO 입력 (채팅 pre-flight: 플랜 확인 → writer 스타일 질문 → 모드 선택)
  → 플랜(task_type 결정) + [시맨틱 서치 백그라운드]
  → 위키 ──┐ asyncio.gather 병렬
  → 포케  ──┘  (0-data 시 자동 재시도 1회)
  → 카(분석)
  → run | over | pixel | buzz (task_type에 따라 1명)
  → 팩트(피드백 전달, 항상 통과) — writer 2회 고정 실행
  → 루트(dev 태스크만)
  → 핑 + 위키 동시(아이디어 + 위키 업데이트 + pgvector 동기화)
  → CEO
```

---

# Claude Code 행동 지침

## 1. 코딩 전 생각
- 가정을 명시적으로 밝힐 것. 불확실하면 물어볼 것.
- 여러 해석이 있으면 제시 — 혼자 선택하지 말 것.
- 더 단순한 방법이 있으면 말할 것.

## 2. 단순하게
- 요청한 것만. 투기적 기능 없음.
- 단일 사용 코드에 추상화 없음.
- 200줄짜리가 50줄로 될 수 있으면 다시 쓸 것.

## 3. 수술적 변경
- 건드려야 할 것만 건드릴 것.
- 관련 없는 코드 개선 금지.
- 기존 스타일 맞출 것.

## 4. 목표 중심 실행
- 성공 기준을 정의하고 검증까지 완료할 것.
