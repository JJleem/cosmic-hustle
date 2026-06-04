# 작업 노트 — 2026-06-04

## 오늘 완료된 작업

### 1. 조회수 IP 중복 방지 (migration 023)
- `blog_view_log(post_id, ip_hash, date)` 테이블 추가
- `POST /posts/{slug}/view`: 같은 IP+포스트 하루 1회만 view_count/daily_visits 증가

### 2. 댓글 알림 이메일
- 유저 댓글 등록 시 leemjaejun@gmail.com으로 이메일 발송
- `routers/blog.py` → `_notify_comment()` 함수
- SMTP 실패해도 댓글 저장에 영향 없음

### 3. GA 월간 스냅샷 + 에이전트 메모리 히스토리 (migration 024)
- `ga_monthly_snapshot`: 월별 GA 수치 원본 보존
- `agent_memory_history`: 매월 업데이트 전 메모리 스냅샷 저장
- `_delta_str()`: 이전 달 대비 수치 변화량 계산
- 에이전트 메모리에 `[성장 분석]` 섹션 추가 — 전달 대비 무엇이 나아졌는지 인식

### 4. 블로그 트렌드 수집 전면 개선

#### RSS 쿼리 교체
| 에이전트 | 전 | 후 |
|---------|----|----|
| pocke | `AI 인공지능 테크 스타트업 최신 뉴스` | `AI 앱 서비스 새기능 업데이트` |
| over | `요즘 화제 감성 라이프스타일 에세이 주제` (0개) | `요즘 사람들 관심사 일상` |
| ka | `데이터 분석 비즈니스 인사이트 트렌드` | `소비자 조사 통계 결과 트렌드` |
| wiki | `이번주 화제 키워드 트렌딩 토픽` (0개) | `요즘 뜨는 이슈 키워드` |
| ping | `신박한 아이디어 혁신 스타트업 새로운 서비스` | `신기한 과학 발견 연구 결과` (WebSearch 폴백용) |

#### WebSearch 도입 (ping만)
- `_WEBSEARCH_AGENTS = {"ping"}`
- 최신 과학 발견 + 출처(매체명+날짜) 강제
- WebSearch 실패 시 RSS 폴백

#### 픽셀 소재 교체 로직
- 직전 픽셀 글 제목에 AI/웹개발 키워드 포함 시 → 일상 디자인 쿼리로 자동 교체
- `_PIXEL_AI_KEYWORDS = {"AI", "인공지능", "웹디자인", ...}`

### 5. 블로그 공통 규칙 추가
- 절대 금지 주제: 정치·선거·페미니즘·특정 인물 논란 등
- 출처 규칙: WebSearch 출처 없는 내용 사실로 단정 금지

---

## 미완료 — 다음 작업

### 버즈(buzz) WebSearch 적용
현재 RSS 사용 중. WebSearch가 더 나은 것 확인됨.

**핵심 발견**: 프롬프트 방향이 중요
- ❌ "바이럴된 마케팅 캠페인 찾아줘" → WebSearch가 일반론 기사 반환
- ✅ "화제 브랜드·팝업·콜라보·광고 찾아줘" → 구체적 실사례 반환

**테스트에서 나온 결과 예시:**
```
- 포켓몬 30주년 팝업 (성수동 트렌드팟, 5/1~31) (출처: 팝가)
- 포켓몬 시크릿 포레스트 서울숲 6/21까지 (출처: LOOXK)
- SKZOO 공항 테마 팝업 성수 (스트레이 키즈) (출처: LOOXK)
- 입생로랑 뷰티 LOVESTORE 팝업 연무장길 (출처: dategom)
```

**구현 방법:**
`blog_generator.py`의 `_WEBSEARCH_AGENTS`에 `"buzz"` 추가 + `_WEBSEARCH_PROMPTS`에 buzz 프롬프트 추가:

```python
_WEBSEARCH_AGENTS = {"ping", "buzz"}

_WEBSEARCH_PROMPTS = {
    "ping": "...",  # 기존
    "buzz": (
        "2026년 최근 한 달 내 한국에서 화제가 된 브랜드, 제품, 콜라보, 팝업스토어, 광고를 찾아줘. "
        "사람들이 줄 서거나 SNS에 올린 것들. 정치 제외. "
        "반드시 아래 형식으로 5개만:\n"
        "- [브랜드/제품명]: [무슨 일이 있었는지 한 줄] (출처: 매체명)"
    ),
}
```

---

## 현재 RSS 쿼리 전체 현황

```python
AGENT_SEARCH_QUERIES = {
    "buzz":  "마케팅 바이럴 캠페인 소셜미디어 트렌드",  # → WebSearch로 교체 예정
    "pocke": "AI 앱 서비스 새기능 업데이트",
    "over":  "요즘 사람들 관심사 일상",
    "ka":    "소비자 조사 통계 결과 트렌드",
    "pixel": "디자인 UX 브랜딩 비주얼 트렌드",
    "ping":  "신기한 과학 발견 연구 결과",   # WebSearch 폴백용
    "wiki":  "요즘 뜨는 이슈 키워드",
}
_WEBSEARCH_AGENTS = {"ping"}  # → {"ping", "buzz"} 로 변경 예정
```

---

## 배포 현황
- 서버: AWS Lightsail `3.36.239.214:8000`
- 마이그레이션: 024까지 적용 완료
- GitHub Actions 자동배포 중
