"""실험실 리포트 — 스케줄·질문 선택 단위 테스트(DB·LLM 호출 없음).

이 리포트의 유일한 가치는 '우리만 가진 1차 자료'와 '정직함'이다. 데이터가 답할 수 없는
질문으로 회차가 나가면 지어낸 결론이 실리게 되므로, 그 미스매치를 여기서 막는다.
"""
from datetime import date, timedelta

import lab_report
from blog_generator import is_lab_day, LAB_QUESTIONS


def test_lab_day_is_first_saturday_only():
    lab_days = [d for d in (date(2026, 8, 1) + timedelta(days=i) for i in range(365)) if is_lab_day(d)]
    assert len(lab_days) == 12                       # 월 1회
    assert all(d.weekday() == 5 for d in lab_days)    # 토요일
    assert all(d.day <= 7 for d in lab_days)          # 첫째 주
    assert len({(d.year, d.month) for d in lab_days}) == 12  # 한 달에 두 번 나오지 않음


def test_prev_period_wraps_year():
    assert lab_report._prev_period("2026-08") == "2026-07"
    assert lab_report._prev_period("2027-01") == "2026-12"


def test_question_skips_what_data_cannot_answer():
    # 회귀: 창간호(2026-08, 7월 리포트)는 키워드 타기팅 이전이라 검증 대상이 0개였는데
    # 로테이션이 하필 '타깃 검색어가 노출로 이어졌나'를 뽑아 답할 수 없는 질문이 걸렸다.
    data = {"keyword_check": {"targeted": 0}, "quality_count": 28, "collab_count": 0}
    for i in range(len(LAB_QUESTIONS)):
        q = lab_report.pick_question(data, LAB_QUESTIONS, i)
        assert "타깃 검색어" not in q and "협업" not in q


def test_question_allows_supported_topics():
    data = {"keyword_check": {"targeted": 12}, "quality_count": 30, "collab_count": 2}
    picked = {lab_report.pick_question(data, LAB_QUESTIONS, i) for i in range(len(LAB_QUESTIONS))}
    assert any("타깃 검색어" in q for q in picked)


def test_question_never_empty_even_with_no_data():
    data = {"keyword_check": {"targeted": 0}, "quality_count": 0, "collab_count": 0}
    assert lab_report.pick_question(data, LAB_QUESTIONS, 0) in LAB_QUESTIONS
