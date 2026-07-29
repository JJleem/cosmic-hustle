"""검색 수요 기반 주제 선정 — 순수 함수 단위 테스트(네트워크·LLM 호출 없음).

배경: 3개월 74편에 GSC 클릭 2회. 색인·순위는 정상인데 검색 수요가 없는 말에서 상위였다.
이 모듈은 '무엇을 쓸지'를 자동완성이 증명한 실수요로 정하는 계층이라, 랭킹이 무너지면
다시 아무도 안 찾는 주제로 돌아간다. 그 회귀를 여기서 막는다.
"""
import keyword_miner as km


def test_comparison_beats_definition():
    # 비교형("A B 차이")이 사전형("X 뜻")을 반드시 이겨야 한다.
    # 뜻/의미는 수요는 크지만 나무위키·사전이 독식해 신생 도메인이 순위를 못 잡는다.
    assert km.score_query("무기력 번아웃 차이") > km.score_query("번아웃 뜻")
    assert km.score_query("1인 가구 증가 이유") > km.score_query("1인 가구")


def test_head_keyword_is_penalised():
    # 단일어 헤드 키워드는 경쟁이 과해 이길 수 없다
    assert km.score_query("번아웃") < km.score_query("번아웃 오는 이유")


def test_china_is_not_a_comparison():
    # 회귀: '차이나'(중국)가 '차이'로 잡혀 'sol 차이나 소비 트렌드 etf'가 1위를 먹었다
    assert km.score_query("sol 차이나 소비 트렌드") < km.score_query("소비 트렌드 차이")
    # '왜곡'의 '왜', '뜻밖'의 '뜻'도 마찬가지로 오탐이면 안 된다
    assert km.score_query("기억 왜곡 사례") == km.score_query("기억 보정 사례")


def test_filter_drops_banned_ymyl_and_navigational():
    q = [
        "무기력 번아웃 차이",     # 통과
        "번아웃 증상 진단",       # YMYL
        "대통령 지지율 차이",     # 금지 주제
        "번아웃 짤 사이트",       # 네비게이셔널
    ]
    assert km.filter_candidates(q, seeds=["번아웃"]) == ["무기력 번아웃 차이"]


def test_filter_drops_drifted_queries():
    # 자동완성은 시드 문자열만 스친 무관한 질의를 자주 물어온다
    out = km.filter_candidates(["f1 번아웃 뜻", "이유빈 폰트 추천"], seeds=["번아웃"])
    assert "이유빈 폰트 추천" not in out


def test_filter_drops_already_covered():
    covered = ["무기력과 번아웃은 어떻게 다른가 (핵심 아이디어: 무기력 번아웃 차이)"]
    out = km.filter_candidates(["무기력 번아웃 차이", "번아웃 회복 순서"], covered, seeds=["번아웃"])
    assert "무기력 번아웃 차이" not in out
    assert "번아웃 회복 순서" in out


def test_ranking_puts_winnable_first():
    q = ["번아웃", "번아웃 뜻", "무기력 번아웃 차이", "번아웃 극복 방법"]
    assert km.filter_candidates(q, seeds=["번아웃"])[0] == "무기력 번아웃 차이"
