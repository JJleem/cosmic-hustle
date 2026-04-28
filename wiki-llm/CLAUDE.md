# Personal LLM Wiki — CLAUDE.md

이 저장소는 개인 학습 기록 및 지식 누적을 위한 LLM Wiki 패턴 기반 지식 베이스입니다.
Claude는 이 파일을 읽고 아래 워크플로우와 규칙을 따릅니다.

---

## 폴더 구조

```
molt-wiki/
├── raw/                  # 원본 소스 보관 (PDF, txt, URL 내용 등 가공 전 파일)
├── wiki/
│   ├── concepts/         # 개념 정리 페이지 (하나의 개념 = 하나의 .md 파일)
│   ├── sources/          # 소스별 요약 페이지 (원본 1개 = 요약 1개)
│   ├── index.md          # 전체 카테고리별 페이지 목록 (진입점)
│   └── log.md            # 작업 이력 (ingest, update, query 기록)
└── CLAUDE.md             # 이 파일 — Claude 행동 지침
```

---

## 워크플로우

### Ingest (소스 추가)

`raw/`에 새 파일이 추가되거나 사용자가 ingest를 요청하면:

1. 원본 파일을 읽고 핵심 내용 파악
2. `wiki/sources/<제목>.md` 요약 페이지 생성 (frontmatter 포함)
3. 관련 개념이 `wiki/concepts/`에 없으면 새 개념 페이지 생성, 있으면 내용 보강
4. `wiki/index.md`의 해당 카테고리에 링크 추가
5. `wiki/log.md`에 항목 기록

### Query (질문 응답)

사용자가 특정 주제에 대해 질문하면:

1. `wiki/index.md`를 먼저 확인해 관련 페이지 목록 파악
2. 관련 `concepts/` 및 `sources/` 페이지를 읽어 컨텍스트 확보
3. 답변 제공
4. 답변 품질이 충분하고 재사용 가치가 있으면 `wiki/concepts/`에 새 페이지로 저장하거나 기존 페이지 보강
5. `wiki/log.md`에 query 항목 기록

### Lint (품질 점검)

사용자가 lint를 요청하거나 주기적으로 수행:

1. **모순 점검**: 동일 개념에 대해 서로 다른 설명이 있는 페이지 탐지
2. **Stale 점검**: `source_count`가 0이거나 링크가 끊긴 개념 페이지 탐지
3. **Orphan 점검**: `wiki/index.md`에 등록되지 않은 페이지 탐지
4. 발견된 문제를 목록으로 보고하고, 사용자 승인 후 수정

---

## 개념 페이지 작성 금지 사항

- **placeholder 절대 금지**: "내용을 직접 보강해주세요" 같은 문구로 빈 파일을 만들지 않는다
- 개념 페이지를 생성할 때는 반드시 소스 파일을 실제로 읽고 해당 개념에 관련된 핵심 내용을 추출하여 본문을 채운다
- 내용이 부족하더라도 소스에서 확인된 사실만으로 최소한의 실질적인 내용을 작성한다

---

## 페이지 작성 규칙

- 모든 페이지는 **마크다운** 형식
- 본문은 **한국어** 사용 (인용·코드·고유명사 제외)
- 모든 페이지 상단에 **YAML frontmatter** 필수:

```yaml
---
tags: [태그1, 태그2]
date: YYYY-MM-DD
source_count: 0
---
```

- `tags`: 해당 페이지의 분류 키워드 (소문자, 복수 가능)
- `date`: 페이지 최초 생성일 또는 마지막 업데이트일
- `source_count`: 이 페이지를 뒷받침하는 소스 수 (concepts 페이지 기준)

---

## log.md 항목 형식

```
## [YYYY-MM-DD] action | title
```

- `action`: `ingest` / `update` / `query` / `lint`
- `title`: 대상 소스명 또는 질문 요약
- 항목은 최신순(위에서 아래로) 정렬
