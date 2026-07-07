# Cosmic Hustle SEO 작업 인수인계

작성 기준: 2026-06-30  
다음 실행 예정: **2026-07-07 08:50~09:15 KST**  
목적: 새 세션에서 이 파일만 붙여넣거나 업로드해 작업을 이어가기

---

## 1. 현재 최종 운영 상태

현재 운영은 아래 상태까지 완료됐다.

```text
운영 DB revision: 032
운영 백엔드: SEO 파이프라인 반영 완료
운영 프론트: SEO metadata / summary UI 반영 완료
자동 발행: 유지
화요일 discovery 자동 SEO: ON
그 외 일반 자동 SEO: OFF
```

운영 기준 main commit:

```text
5d7d65f6319cebcf229f3ec6b90074a4177ec0de
```

운영 서버:

```text
AWS Lightsail
IP: 3.36.239.214
백엔드 경로: /home/ubuntu/backend
systemd 서비스: cosmic-backend
```

운영 DB:

```text
PostgreSQL
Alembic revision: 032
```

현재 운영 게시글 수는 마지막 검증 기준:

```text
전체 50
공개 45
비공개 5
```

이 수치는 2026-07-07 전까지 정상 자동 발행으로 증가할 수 있다.  
7월 7일에는 기존 숫자를 고정 기대값으로 쓰지 말고, 실행 직전 실제 값을 기준으로 삼는다.

---

## 2. 완료된 핵심 작업

### DB

다음 컬럼이 `blog_posts`에 추가됐다.

```text
summary
seo_title
seo_description
content_type
updated_at
```

migration:

```text
revision = 032
down_revision = 031
```

기존 글은 다음 상태로 안전하게 유지됐다.

```text
summary = null
seo_title = null
seo_description = null
content_type = null
updated_at = COALESCE(published_at, created_at)
```

운영 DB 백업:

```text
/home/ubuntu/db_backups/cosmic_hustle_pre_032_20260629T073813Z.dump
```

---

### 백엔드 SEO 파이프라인

공용 SEO 마커:

```text
{{SEO_TITLE}}...{{/SEO_TITLE}}
{{SUMMARY}}...{{/SUMMARY}}
{{SEO_DESCRIPTION}}...{{/SEO_DESCRIPTION}}
```

공용 함수:

```text
parse_seo_metadata
resolve_seo_fields
validate_content_type
```

fallback:

```text
seo_title:
SEO 값 -> 기존 title

summary:
SEO 값 -> null

seo_description:
SEO 값 -> summary -> null
```

자동 생성 기본값:

```text
generate_blog_post(..., seo_markers=False)
generate_discovery_post(..., seo_markers=False, published=True)
```

수동 API 기본값:

```text
/api/blog/generate
seo=false

/api/blog/generate-discovery
seo=false
published=true
```

---

### 프론트

변경 파일:

```text
cosmic-blog/lib/api.ts
cosmic-blog/app/[slug]/page.tsx
```

metadata 우선순위:

```text
title:
seo_title -> title

description:
seo_description -> summary -> 기존 본문 fallback
```

같은 값이 다음에 사용된다.

```text
기본 metadata
Open Graph
Twitter
```

JSON-LD:

```text
headline:
seo_title -> title

dateModified:
updated_at -> published_at -> created_at
```

화면:

```text
h1은 항상 기존 title
summary가 있으면 본문 위에 표시
seo_description은 화면 visible text로 표시하지 않음
```

---

## 3. 운영 파일럿 결과

운영 수동 비공개 SEO 파일럿 성공 글:

```text
id:
015ac488-7f3a-409d-a073-816d2bc8f48e

slug:
discovery-2026-06-30-2

published:
false

agent_id:
pocke

content_type:
SCIENCE
```

검증 결과:

```text
SEO 3필드 정상
summary UI 정상
metadata 정상
Open Graph 정상
Twitter 정상
BlogPosting JSON-LD 정상
BreadcrumbList 정상
```

비용:

```text
trend:     $0.047016
content:   $0.06422625
thumbnail: $0.04
total:     $0.15124225
```

이 파일럿 글은 삭제하지 않았다.

이유:

```text
blog_post_cost.post_id
NOT NULL
ON DELETE CASCADE
```

게시글을 삭제하면 비용 기록도 같이 삭제되기 때문이다.

추가 메모:

```text
published=false 글은 공개 목록에는 노출되지 않지만,
slug를 알면 상세 접근은 가능하다.
```

---

## 4. Git / PR / 배포 완료 상태

백엔드 SEO 본체 커밋:

```text
f2fef3e6de1b01fe846a0645ad9193a48c483283
feat: add SEO metadata pipeline for blog posts
```

PR:

```text
#23
MERGED
merge commit:
d7359cde7d99b4f343749a2a700221663bb2de5f
```

화요일 discovery 자동 SEO 활성화 커밋:

```text
e87524d69595d4baf9ed2901b534edfe5b924611
feat: enable SEO for scheduled discovery posts
```

PR:

```text
#24
MERGED
merge commit:
5d7d65f6319cebcf229f3ec6b90074a4177ec0de
```

GitHub Actions 자동배포 성공:

```text
Deploy Backend
run: 28414902814
job: 84195619446
```

배포 후:

```text
cosmic-backend active/running
MainPID: 1160919
NRestarts: 0
DB revision: 032
/health: 200
```

---

## 5. 현재 자동 발행 설정

운영 `backend/main.py` 상태:

### 화요일 discovery

```python
generate_discovery_post(
    recent_titles=recent_titles,
    seo_markers=True,
)
```

`published` 인자는 전달하지 않는다.

따라서:

```text
seo_markers=True
published=True 기본값
content_type=SCIENCE
```

### 일반 자동 생성

다음 에이전트는 아직 SEO OFF다.

```text
buzz
over
ka
pixel
ping
wiki
```

일반 자동 `generate_blog_post`에는 `seo_markers` 인자가 전달되지 않는다.

### 스케줄

```text
CronTrigger(hour=9, minute=0, timezone="Asia/Seoul")
```

매일 오전 9시 KST 유지.

---

## 6. 다음 실행일

다음 단계는 **5J 첫 Discovery 자동 SEO 발행 관찰**이다.

실행일:

```text
2026-07-07 화요일
```

권장 관찰 시간:

```text
08:50~09:15 KST
```

중요:

```text
scheduler를 수동 실행하지 않는다.
_daily_blog_job을 직접 호출하지 않는다.
generate-discovery API를 호출하지 않는다.
서비스를 재시작해 job 실행을 유도하지 않는다.
```

자동 실행을 지켜보고 읽기 전용으로 검증한다.

---

# 7. 2026-07-07 실행용 프롬프트

아래 내용을 새 세션에 그대로 붙여넣는다.

---

## Cosmic Hustle SEO 개선 — 5J 첫 Discovery 자동 SEO 발행 관찰

운영 환경에는 화요일 discovery 자동 발행 경로에만 `seo_markers=True`가 반영돼 있습니다.

현재 상태:

```text
운영 main commit:
5d7d65f6319cebcf229f3ec6b90074a4177ec0de

운영 DB:
revision 032

화요일 discovery 자동 발행:
seo_markers=True
published 기본값=True

그 외 일반 자동 발행:
seo_markers 미전달
SEO OFF

스케줄:
매일 09:00 KST
```

이번 단계에서는 2026년 7월 7일 화요일 오전 9시에 실행되는 첫 자동 discovery SEO 발행을 관찰하고 검증합니다.

수동 생성, scheduler 직접 실행, 코드 수정, 배포는 하지 마세요.

---

### 1. 관찰 시간

```text
2026-07-07 08:50~09:15 KST
```

09:15에도 실제 생성 로그가 진행 중이면 해당 job이 끝날 때까지 읽기 전용으로 관찰할 수 있습니다.

---

### 2. 실행 전 기록

09:00 전에 다음을 기록하세요.

```text
현재 시각
운영 DB revision
전체 게시글 수
published=true 수
published=false 수
가장 최근 게시글 id/slug/agent_id
cosmic-backend MainPID
NRestarts
/health 결과
```

게시글 수는 7월 1일부터 7월 6일까지 정상 자동 발행으로 증가했을 수 있으므로 실제 값을 기준으로 합니다.

---

### 3. 전날 일반 자동 글 SEO OFF 확인

가능하면 2026년 7월 6일 월요일 자동 생성 글을 확인하세요.

기대:

```text
일반 agent 글
published=true
seo_title=null
summary=null
seo_description=null
```

일반 자동 SEO가 아직 OFF인지 확인하는 목적입니다.

기존 글은 수정하지 마세요.

---

### 4. 09:00 scheduler 실행 확인

09:00 이후 서버 로그에서 실제 자동 job 시작을 확인하세요.

확인:

```text
_daily_blog_job 시작
today_agent_id = pocke
generate_discovery_post 진입
job 시작 시각
job 종료 시각
job 실행 횟수
```

기대:

```text
실행 1회
중복 실행 없음
```

로그에 `seo_markers=True`가 직접 출력되지 않더라도 운영 코드와 생성 결과로 확인할 수 있습니다.

---

### 5. 실행 지연 또는 실패 시

09:00 직후 글이 없다고 수동으로 실행하지 마세요.

순서대로 확인:

```text
scheduler가 시작됐는지
job이 진행 중인지
LLM/트렌드/썸네일 단계인지
오류로 종료됐는지
DB commit이 됐는지
```

09:15까지 시작 로그가 없으면 다음만 보고하고 멈춥니다.

```text
scheduler 미실행
수동 재현 안 함
서비스 재시작 안 함
```

job 실패 시:

```text
신규 DB 행
비용 기록
LLM 호출
트렌드 호출
썸네일 호출
오류 로그
```

만 확인하고 재실행하지 않습니다.

---

### 6. 신규 게시글 식별

실행 직전 이후 생성된 글을 DB에서 확인하세요.

예상 slug:

```text
discovery-2026-07-07
```

suffix가 붙을 수 있으므로 다음도 함께 확인합니다.

```text
created_at
published_at
agent_id
title
scheduler 로그
```

기대:

```text
신규 글 정확히 1건
agent_id=pocke
published=true
content_type=SCIENCE
```

---

### 7. DB 필드 검증

신규 글에서 확인:

```text
id
agent_id
title
slug
content
thumbnail_url
tags
published
published_at
created_at
updated_at
seo_title
summary
seo_description
content_type
```

기대:

```text
published=true
content_type=SCIENCE
seo_title 존재
summary 존재
seo_description 존재
updated_at 존재
```

SEO 필드는:

```text
null 아님
빈 문자열 아님
공백 문자열 아님
마커 문자열 없음
본문과 의미적으로 일치
```

---

### 8. 본문 파싱 확인

다음 마커가 본문에 남아 있지 않아야 합니다.

```text
{{SEO_TITLE}}
{{/SEO_TITLE}}
{{SUMMARY}}
{{/SUMMARY}}
{{SEO_DESCRIPTION}}
{{/SEO_DESCRIPTION}}
{{THUMBNAIL
{{TAGS
```

추가 확인:

```text
썸네일 URL 존재
tags 정상
이미지 placeholder 잔존 없음
summary가 본문에 중복 삽입되지 않음
본문 구조 정상
```

---

### 9. 목록 / 상세 API

목록 API:

```text
신규 글 공개 목록 노출
중복 노출 없음
```

상세 API:

```text
DB와 API 값 일치
published=true
content_type=SCIENCE
SEO 3필드 존재
embedding 미포함
```

---

### 10. 운영 프론트

신규 공개 글 URL에서 확인:

```text
HTTP 200
h1 = 원본 title
summary UI 표시
summary 위치 = 상단 정보 뒤, 본문 직전
seo_description은 visible text 미표시
본문 정상
태그 정상
썸네일 정상
댓글 영역 정상
관련 글 정상
공유 영역 정상
```

모바일 390px:

```text
가로 스크롤 없음
summary 박스 정상
제목 줄바꿈 정상
본문 여백 정상
```

---

### 11. SSR Metadata

실제 SSR HTML에서 확인:

```text
title = seo_title + 기존 title template
meta description = seo_description
canonical = 신규 slug URL
```

Open Graph:

```text
og:title = seo_title
og:description = seo_description
og:image 존재
```

Twitter:

```text
twitter:title = seo_title
twitter:description = seo_description
twitter:image 존재
```

---

### 12. JSON-LD

BlogPosting:

```text
headline = seo_title
datePublished = published_at
dateModified = updated_at
mainEntityOfPage 존재
author 존재
publisher 존재
image 존재
```

BreadcrumbList:

```text
존재
JSON 파싱 가능
신규 글 URL 정상
```

없어야 하는 값:

```text
undefined
문자열 "null"
깨진 JSON
```

---

### 13. SEO 품질

기록:

```text
원본 title
seo_title
summary
seo_description
각 문자열 길이
```

권장 범위:

```text
seo_title: 25~60자
summary: 50~180자
seo_description: 80~160자
```

평가:

```text
양호
보완 필요
실패
```

길이가 조금 벗어나도 재생성하지 마세요.

---

### 14. 본문과 SEO 내부 정합성

외부 웹 검색 없이 본문과 SEO 필드끼리 비교하세요.

확인:

```text
SEO title 핵심 주제가 본문에 존재
summary 내용이 본문에 존재
seo_description 내용이 본문에 존재
본문에 없는 인물/기관/연도/연구/통계 추가 없음
건강·의학 효능 과장 없음
수치는 본문에도 동일하게 존재
SEO가 본문보다 더 강하게 단정하지 않음
```

---

### 15. 비용

신규 글 비용 기록 확인:

```text
trend
content
thumbnail
본문 이미지
기타
총비용
```

수동 파일럿 참고값:

```text
$0.15124225
```

참고값일 뿐 실패 기준은 아닙니다.

---

### 16. 로그

job 시작부터 종료까지 확인:

```text
Traceback
ERROR
500
timeout
ValueError
TypeError
UndefinedColumn
duplicate key
SEO parser warning
marker parsing warning
image generation failure
transaction rollback
scheduler skipped
maximum instances
misfire
```

비치명 warning은 오류와 구분해 기록하세요.

---

### 17. 중복 실행

확인:

```text
job 실행 1회
신규 글 1건
중복 slug 없음
비용 기록이 한 글에 연결
misfire 없음
max_instances 충돌 없음
중복 scheduler process 없음
```

---

### 18. 일반 자동 SEO OFF 유지

확인:

```text
generate_blog_post 자동 호출에는 seo_markers 미전달
월·수·목·금·토·일 일반 자동 SEO OFF
수동 API 기본값 seo=false
```

이번 성공만으로 일반 SEO를 활성화하지 마세요.

---

### 19. 신규 글 처리

이번 글은 정상 자동 공개 글이므로 검증이 정상이라면 그대로 유지합니다.

금지:

```text
삭제
비공개 전환
내용 수정
SEO 필드 수동 수정
재생성
```

문제가 있어도 임의 수정하지 말고 결과만 보고하세요.

---

### 20. Sitemap

기존 sitemap에 신규 공개 글이 포함되는지 읽기 전용으로 확인하세요.

즉시 안 보이면 기존 ISR/캐시 정책 범위에서 다시 읽기 확인할 수 있습니다.

금지:

```text
sitemap 코드 수정
Vercel 재배포
cache purge
revalidate 변경
```

---

### 금지 사항

```text
수동 생성 API 호출
scheduler 직접 실행
_daily_blog_job 직접 실행
서비스 재시작
코드 수정
백엔드 재배포
프론트 재배포
DB migration
DB 직접 수정
기존 글 백필
일반 자동 SEO 활성화
파일럿 글 삭제
신규 자동 글 수정/삭제
```

---

### 완료 보고 형식

1. 관찰 시작·종료 시각
2. 실행 전 DB revision
3. 실행 전 게시글 수
4. 실행 전 MainPID/NRestarts
5. 실행 전 `/health`
6. 전날 일반 자동 글 SEO OFF 확인 결과
7. scheduler job 시작 시각
8. scheduler job 종료 시각
9. scheduler 실행 횟수
10. 신규 생성 행 수
11. 신규 글 id와 slug
12. agent_id
13. published 결과
14. content_type 결과
15. 원본 title
16. seo_title과 길이
17. summary와 길이
18. seo_description과 길이
19. published_at/updated_at 결과
20. 본문 SEO 마커 잔존 여부
21. THUMBNAIL/TAGS/IMAGE 처리 결과
22. 목록 API 결과
23. 상세 API 결과
24. 운영 프론트 HTTP 결과
25. h1과 summary UI 결과
26. 모바일 결과
27. SSR title/meta 결과
28. Open Graph/Twitter 결과
29. JSON-LD 결과
30. SEO 품질 평가
31. 본문과 SEO 내부 정합성 결과
32. 비용 총액
33. 비용 세부 내역
34. 서버 로그 오류 여부
35. scheduler misfire/중복 실행 여부
36. sitemap 반영 결과
37. 일반 자동 SEO OFF 유지 여부
38. 수동 API 기본값 유지 여부
39. 신규 글 유지 결과
40. 기존 게시글 변경 여부
41. 최종 게시글 수
42. 최종 DB revision
43. 발견한 문제
44. 일반 자동 SEO 활성화 단계 진행 가능 여부

자동 실행 관찰과 검증만 완료하고, 일반 에이전트 SEO 활성화나 기존 글 백필로 넘어가지 마세요.

---

# 8. 5J 이후 예정 순서

5J가 정상 완료되면 다음 후보 단계는 아래 순서가 안전하다.

```text
1. 일반 에이전트 자동 SEO를 1~2개씩 순차 활성화
2. 실제 자동 발행 결과 검증
3. 나머지 일반 에이전트 활성화
4. 기존 공개 글 백필 전용 설계
5. 기존 글 백필 파일럿
6. 전체 백필 여부 결정
```

일반 생성기 6개를 한 번에 모두 켜지 않는다.

---

# 9. 새 세션 시작 문장

새 세션에서 이 파일을 업로드하거나 내용을 붙여넣고 아래처럼 시작한다.

```text
첨부한 Cosmic Hustle SEO 인수인계 문서를 기준으로 작업을 이어가자.
오늘은 2026년 7월 7일이고, 5J 첫 discovery 자동 SEO 발행 관찰 단계부터 진행해줘.
수동 생성이나 scheduler 직접 실행은 하지 말고 자동 실행을 관찰·검증만 해줘.
```


첨부한 `cosmic_hustle_seo_handoff_2026-06-30.md` 문서를 기준으로 작업을 이어가자.

현재 상태:

* 운영 main commit: `5d7d65f6319cebcf229f3ec6b90074a4177ec0de`
* 화요일 discovery 자동 SEO: ON
* 일반 자동 SEO: OFF
* PR #25는 Draft 상태로 동결
* PR #25 head: `8f48633fa80016d11a06f41fcd0659297089127d`
* PR #25는 merge하거나 운영에서 실행하지 말 것

오늘은 2026년 7월 7일이며, 5J 첫 discovery 자동 SEO 발행 관찰 단계부터 진행해줘.

관찰 시간:

* 08:50 KST부터 사전 상태 기록
* 09:00 KST 자동 scheduler 실행 관찰
* 생성 완료 후 DB/API/프론트/metadata/비용/로그 검증

금지:

* scheduler 수동 실행
* `_daily_blog_job` 직접 실행
* 생성 API 호출
* 서비스 재시작
* DB 수정
* PR #25 merge
* 백필 CLI 실행
* 일반 자동 SEO 활성화

자동 실행을 읽기 전용으로 관찰하고 결과만 정리해줘.

---

# 10. 5J 실행 결과 — 첫 Discovery 자동 SEO 발행 관찰 (2026-07-07, 화)

## 판정: **PASS**

09:00 KST 자동 scheduler가 정시에 자동 실행되어 discovery 글 1건을 정상 발행했다.
읽기 전용(SELECT / GET / journalctl 조회)으로만 관찰했으며, 운영을 일절 변경하지 않았다.

## 명시 사항 (CEO 확정)

- **09:00 KST 자동 scheduler 실행 성공** — cron 정시 발화(created_at `00:00:00.013 UTC` = 09:00:00 KST), 09:01:30 KST 발행 완료.
- **discovery 글 1건 정상 발행** — slug `discovery-2026-07-07`, post_id `2a2e4c6f-67a6-4a21-94cb-1b6c0afb7e2a`, agent=pocke, content_type=SCIENCE, published=true.
- **일반 자동 SEO는 실행되지 않음** — 오늘 생성 글은 discovery 1건뿐. `main.py:92` 일반 `generate_blog_post(...)`에 `seo_markers` 미전달, 전날 `buzz-2026-07-06` SEO 3필드 전부 null 확인.
- **수동 실행 / DB 수정 / 서비스 재시작 / PR #25 merge / 백필 CLI 실행 없음** — 금지 항목 전부 미수행. (조회용 읽기 전용 헬퍼 `/tmp/qq_ro.py`는 관찰 종료 시 삭제. 운영 코드·설정·DB 무변경.)
- **og:url / article:modified_time / JSON-LD description 정합성은 프론트 metadata 후속 개선 항목으로 분리** — discovery 파이프라인 결함 아님. cosmic-blog generateMetadata의 기존 동작이며 canonical·JSON-LD url로 보완돼 색인 영향 경미.
- **이번 PASS를 근거로 일반 자동 SEO를 일괄 활성화하지 않음** — 다음 단계(§8: 일반 에이전트 1~2개씩 순차 활성화)는 CEO 별도 지시 시에만 진행.

## 검증 요약

| 항목 | 결과 |
|------|------|
| 운영 DB revision | 032 (head) |
| MainPID / NRestarts | 1208894 / 0 |
| /health | 200 |
| 게시글 수 (실행 후) | 총 57 / 공개 52 / 비공개 5 (실행 전 56/51/5) |
| SEO title / summary / seo_description 길이 | 44 / 126 / 112자 (전부 권장 범위 내) |
| 본문 마커 누출 | 없음 |
| embedding | 존재 |
| 중복 slug / 중복 글 | 없음 (1건) |
| 목록 / 상세 / 관련 API | 200 / 200 / 200 |
| 프론트 상세 | 200, h1=원본 title, summary 렌더, 썸네일 200, hydration 오류 없음 |
| SSR metadata | title(seo_title+템플릿)·description·canonical·og:title/type/image·twitter·robots 정상 / **og:url·article:modified_time 부재(후속)** |
| JSON-LD | BlogPosting + BreadcrumbList 파싱 정상, 필수 필드 전부 존재, null/undefined 없음 / **description은 본문 폴백(후속)** |
| sitemap | 신규 slug 포함, lastmod `2026-07-07T00:01:30.542Z`(=updated_at) |
| 비용 | 4 phase(topic_pick/trend/content/thumbnail) 모두 post_id 연결, 총 **$0.18920825**, 중복 없음 |
| 로그 | 09:00 정시 자동 실행, ERROR/misfire/중복 없음 (앱 INFO 로그는 핸들러 미설정으로 미기록 — 전 구간 정상 패턴) |

## 후속 항목

1. (선택) 프론트 `og:url`, `article:modified_time` 추가 검토 — 우선순위 낮음.
2. (선택) JSON-LD BlogPosting description을 seo_description으로 통일 검토.
3. 다음 단계 게이트: 일반 에이전트 자동 SEO 순차 활성화(1~2개씩) — CEO 지시 대기, 일괄 금지.
4. discovery 실 단가 ≈$0.189/건 반영(파일럿 $0.151보다 소폭↑) — 백필 비용 재산정 시 사용.

---

# 11. 5K-A 구현 — Pixel 일반 자동 SEO 단일 활성화 (2026-07-07, 화 / 로컬 변경만)

## 상태: **로컬 코드 변경 + 테스트 완료, 미배포 (배포 별도 승인 대기)**

일반 에이전트 자동 SEO를 일괄 활성화하지 않고, **allowlist 방식으로 Pixel 1명만** 켜는 최소 변경을 로컬에 구현했다. 운영 배포·scheduler 실행·생성·DB 수정 없음.

## 변경 내용 (backend, 3파일)

- `blog_generator.py` (`_GENERAL_CONTENT_TYPE_BY_AGENT` 직후):
  ```python
  SEO_ENABLED_GENERAL_AGENTS = frozenset({"pixel"})
  def general_seo_enabled(agent_id: str) -> bool:
      return agent_id in SEO_ENABLED_GENERAL_AGENTS
  ```
- `main.py`: `_daily_blog_job` import에 `general_seo_enabled` 추가 + 일반 분기 호출에 `seo_markers=general_seo_enabled(today_agent_id)` 전달. discovery 분기(`generate_discovery_post(..., seo_markers=True)`)는 무변경.
- `tests/test_seo_metadata.py`: 5K-A 테스트 6개 추가 + 기존 가드 1개 갱신(`test_scheduled_general_generation_keeps_seo_off` → `test_scheduled_general_seo_is_allowlist_gated`: 일반 호출 seo_markers가 리터럴 True/미전달이 아니라 `general_seo_enabled(today_agent_id)` 호출임을 AST로 강제 → 일괄 활성화 실수 차단).

## 동작 근거

- **Pixel만 ON:** allowlist=`{"pixel"}`. `general_seo_enabled`가 pixel만 True, buzz/over/ka/ping/wiki는 False → 기존 동작 유지. Pixel SEO ON 시 content_type="DESIGN"(코드 매핑).
- **discovery 무영향:** discovery는 별도 분기(pocke, `seo_markers=True` 명시)라 allowlist를 조회하지 않음. 빈 allowlist에서도 discovery SEO 유지됨을 테스트로 확인.
- **fail-safe:** allowlist를 비우면 pixel 포함 일반 SEO 전부 OFF.
- **비용 무영향:** seo_markers는 system 프롬프트에 SEO 규칙만 추가, 추가 LLM 호출 없음.

## 테스트 결과

- SEO 파일 **56 passed**, 백엔드 전체 **76 passed** (0.5s, 전부 mock/AST — 실제 생성·DB·scheduler 없음).

## PR #25와의 관계

- **무관.** PR #25(`feat: add safe SEO backfill CLI`, Draft)는 `scripts/backfill_blog_seo.py`·`seo_backfill.py`·`tests/test_seo_backfill.py`만 건드림 — 5K-A 변경 파일과 교집합 0.

## 운영 배포 전 남은 단계

1. 로컬 변경 커밋 (backend main.py/blog_generator.py/tests + 이 문서). ⚠️ 서버는 scp 배포 방식이므로 backend push 시 GitHub Actions 자동배포와 서버 실제 파일 정합 확인 필요.
2. **배포는 CEO 별도 승인 후** 진행.
3. 배포되면 **2026-07-10(금) 09:00 KST Pixel 자동 발행을 5J와 동일한 읽기전용 방식으로 관찰**(글 1건·SEO 3필드·content_type=DESIGN·비용·metadata·중복 없음·다른 요일 OFF 유지 확인).
4. Pixel 관찰 PASS 시에만 다음 에이전트를 allowlist에 1명 추가(5K-B).
