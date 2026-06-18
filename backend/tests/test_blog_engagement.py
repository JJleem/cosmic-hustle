import importlib.util
from pathlib import Path
from types import SimpleNamespace


def _load_blog_router():
    path = Path(__file__).parents[1] / "routers" / "blog.py"
    spec = importlib.util.spec_from_file_location("blog_router_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_popularity_score_uses_only_recent_human_activity():
    blog = _load_blog_router()

    assert blog._popularity_score(unique_views=8, human_likes=2, human_comments=3) == 27
    assert blog._popularity_score(unique_views=8, human_likes=0, human_comments=0) == 8


def test_vote_result_separates_human_and_agent_votes():
    blog = _load_blog_router()
    rows = [
        SimpleNamespace(voter_key="agent:buzz", side="a", display_name="버즈", anon_avatar=None),
        SimpleNamespace(voter_key="agent:fact", side="b", display_name="팩트", anon_avatar=None),
        SimpleNamespace(voter_key="human-1", side="a", display_name="지구인", anon_avatar=1),
        SimpleNamespace(voter_key="human-2", side="a", display_name="화성인", anon_avatar=2),
    ]

    result = blog._split_vote_rows(rows, my_voter_key="human-2")

    assert result["vote_a"] == 3
    assert result["vote_b"] == 1
    assert result["human_vote_a"] == 2
    assert result["human_vote_b"] == 0
    assert result["human_vote_count"] == 2
    assert result["agent_vote_a"] == 1
    assert result["agent_vote_b"] == 1
    assert result["agent_vote_count"] == 2
    assert result["my_vote"] == "a"
