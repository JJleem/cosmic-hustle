# 5K-C Full General Auto SEO Implementation Report

> **상태: 구현 + 테스트 완료, 미커밋·미배포 (CEO 승인 대기).** 커밋/push/배포는 별도 승인.

## 1. Summary

- Result: **구현 + 테스트 PASS** (82 passed, 회귀 0)
- Previous allowlist: `frozenset({"pixel", "ka"})`
- New allowlist: `frozenset({"pixel", "ka", "buzz", "over", "ping", "wiki"})`
- Scope: 앞으로 scheduler가 발행하는 **일반 자동 글에만** SEO marker 적용. discovery는 별도 분기 `seo_markers=True` 무변경.
- Backfill status: **미실행·금지 유지.** PR #25(백필 CLI) merge/실행 안 함. 기존 글 SEO 백필 없음.

## 2. Code Changes

- Files modified: `backend/blog_generator.py`, `backend/tests/test_seo_metadata.py` (정확히 2개, 그 외 무변경)
- Diff summary:
  - `blog_generator.py:1382` — `SEO_ENABLED_GENERAL_AGENTS`를 `{"pixel","ka"}` → `{"pixel","ka","buzz","over","ping","wiki"}`로 확장. 위 주석 3줄을 "순차 활성화" 문구에서 "5K-C 전원 활성화" 문구로 갱신(fail-safe 설명 유지).
  - `general_seo_enabled()` 헬퍼 본문 **무변경** (`return agent_id in SEO_ENABLED_GENERAL_AGENTS`).
  - `test_seo_metadata.py` 5K 섹션을 5K-C에 맞게 재구성 (아래 §3).
- Runtime change: 일반 자동 발행 시 6개 일반 에이전트 전원이 `general_seo_enabled(...) == True` → seo_markers ON. `main.py:92` 일반 분기(`seo_markers=general_seo_enabled(today_agent_id)`)와 `main.py:90` discovery 분기(`seo_markers=True`)는 **코드 무변경**. migration/프론트/비용 로직/SEO 프롬프트 **무변경**.

## 3. Tests

- Pixel True: PASS (`test_general_seo_allowlist_all_general_agents`, `test_general_seo_on_produces_fields[pixel]`)
- KA True: PASS (동 테스트 [ka])
- Buzz True: PASS (동 테스트 [buzz])
- Over True: PASS (동 테스트 [over])
- Ping True: PASS (동 테스트 [ping])
- Wiki True: PASS (동 테스트 [wiki])
- Discovery independent: PASS (`test_discovery_independent_of_general_allowlist` — 빈 allowlist monkeypatch에서도 seo_markers=True → SEO 3필드 생성 + content_type=SCIENCE 고정 유지)
- Empty allowlist fail-safe: PASS (`test_general_seo_allowlist_empty_disables_all` — 빈 frozenset monkeypatch → 6명 전원 False. `test_general_seo_off_no_fields_when_disabled[*]` — OFF 시 SEO 키·규칙 미생성)
- Content type mapping: PASS (`test_blog_post_content_type_mapping[*]` 6종 + `test_general_seo_on_produces_fields[*]`: pixel=DESIGN / ka=DATA / buzz=MARKETING / over=ESSAY / ping=IDEA / wiki=WIKI)
- AST guard: PASS (`test_scheduled_general_seo_is_allowlist_gated` — 일반 분기 seo_markers가 리터럴 True/미전달이 아니라 `general_seo_enabled(today_agent_id)` **호출**임을 AST로 강제. `test_scheduled_discovery_enables_seo_without_published_override` — discovery 분기는 리터럴 True 유지)
- Test result: **`tests/test_seo_metadata.py` 62 passed / 전체 백엔드 82 passed** (1.05s / 0.70s). 회귀 0.

## 4. Risk Controls

- Why full rollout is acceptable now: 5J(discovery)·5K-A(pixel)·5K-B(ka) 세 관찰이 순차 PASS로, (a) SEO marker 파이프라인이 본문 근거 내에서 3필드를 생성하고, (b) allowlist 게이팅이 정확히 대상만 켜며, (c) discovery 독립성·비용(추가 LLM 호출 없음)·metadata/sitemap/JSON-LD가 정상임을 실제 운영 발행으로 확인함. 남은 4개(buzz/over/ping/wiki)도 동일 파이프라인·동일 grounding 규칙을 타므로 코드 경로상 신규 리스크가 없음. 문제 시 allowlist를 빈 frozenset으로 되돌리면 즉시 전체 OFF(fail-safe 테스트로 보장).
- Wiki-specific risk: wiki는 과거 후보 검토(4B-2C/2D)에서 헬스/YMYL·출처 단정·본문 단정 잔존 리스크가 확인된 적 있음. 이번엔 wiki를 별도 보류하지 않고 전원 활성화 대상에 포함(요청 범위).
- Wiki-specific observation checks (첫 wiki 발행 관찰 때 특별 확인):
  - 본문에 없는 기관명/논문명/출처를 SEO 필드가 새로 만들지 않는지
  - 건강/의학 관련 단정을 본문보다 더 강하게 만들지 않는지
  - seo_title/seo_description/summary가 본문보다 과장되지 않는지
  - "검증됨", "공식", "의학적으로 입증" 같은 표현이 생기지 않는지
- PR #25/backfill separation: 변경 파일은 `blog_generator.py`·`test_seo_metadata.py` 2개뿐, backfill 관련 파일(`scripts/backfill_blog_seo.py`·`seo_backfill.py`·`tests/test_seo_backfill.py`)과 교집합 0. 이번 변경은 과거 글 백필이 아니라 **향후 발행 글에만** 적용되는 런타임 게이트 변경.

## 5. Prohibited Actions Confirmation

- scheduler manual run: No
- _daily_blog_job direct run: No
- generation API call: No
- DB modification: No
- migration: No
- PR #25 merge: No
- backfill CLI: No
- git push: No
- deploy: No
- service restart: No
- (추가) discovery 로직 변경: No / 프론트 수정: No / 비용 로직 수정: No / SEO 프롬프트 대규모 수정: No

## 6. Next Step

- Commit needed: Yes — `feat(seo): enable general SEO for all general agents via allowlist` (승인 후). 대상 파일 2개.
- Deploy preflight needed: Yes — 커밋+push 시 GitHub Actions `Deploy Backend` 자동배포(scp+alembic no-op+restart) 발생. 배포 후 `/health`·서버 파일 allowlist 반영·MainPID 갱신 확인 필요.
- Next observations (전원 활성화 후 각 요일 첫 일반 발행):
  - buzz / over / ping / wiki 첫 발행 시 SEO 3필드 정상·본문 근거 내 생성 확인
  - **wiki 첫 발행은 §4의 YMYL/출처 특별 체크 항목 집중 관찰**
  - pixel·ka는 계속 ON 유지 확인, discovery는 seo_markers=True 유지 확인
  - 각 관찰은 5K-A/5K-B와 동일한 읽기 전용(SELECT/GET/journalctl) 방식
