"""GA4 Data API 클라이언트 — 월간 블로그 분석용."""
import json
import os
import logging
from datetime import date

logger = logging.getLogger(__name__)


def _get_client():
    """GA4 클라이언트 생성 — OAuth 토큰 우선, 없으면 서비스 계정."""
    from google.analytics.data_v1beta import BetaAnalyticsDataClient

    token_path = os.environ.get("GA4_TOKEN_JSON")
    if token_path:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        creds = Credentials.from_authorized_user_file(token_path)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(token_path, "w") as f:
                f.write(creds.to_json())
        return BetaAnalyticsDataClient(credentials=creds)

    sa_json = os.environ.get("GA4_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        raise RuntimeError("GA4_TOKEN_JSON 또는 GA4_SERVICE_ACCOUNT_JSON 환경변수 미설정")

    from google.oauth2.service_account import Credentials
    if sa_json.strip().startswith("{"):
        info = json.loads(sa_json)
    else:
        with open(sa_json) as f:
            info = json.load(f)
    scopes = ["https://www.googleapis.com/auth/analytics.readonly"]
    creds = Credentials.from_service_account_info(info, scopes=scopes)
    return BetaAnalyticsDataClient(credentials=creds)


def _property_id() -> str:
    pid = os.environ.get("GA4_PROPERTY_ID", "")
    if not pid:
        raise RuntimeError("GA4_PROPERTY_ID 환경변수 미설정")
    return f"properties/{pid}" if not pid.startswith("properties/") else pid


def fetch_site_overview(start: str, end: str) -> dict:
    """전체 사이트 요약 지표 반환."""
    from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest

    client = _get_client()
    req = RunReportRequest(
        property=_property_id(),
        date_ranges=[DateRange(start_date=start, end_date=end)],
        metrics=[
            Metric(name="sessions"),
            Metric(name="totalUsers"),
            Metric(name="newUsers"),
            Metric(name="bounceRate"),
            Metric(name="averageSessionDuration"),
            Metric(name="screenPageViews"),
        ],
    )
    resp = client.run_report(req)
    row = resp.rows[0].metric_values if resp.rows else None
    if not row:
        return {}
    return {
        "sessions": int(float(row[0].value)),
        "total_users": int(float(row[1].value)),
        "new_users": int(float(row[2].value)),
        "bounce_rate": round(float(row[3].value) * 100, 1),
        "avg_session_sec": round(float(row[4].value)),
        "page_views": int(float(row[5].value)),
    }


def fetch_page_metrics(start: str, end: str, limit: int = 20) -> list[dict]:
    """페이지별 지표 — 이탈률 내림차순."""
    from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest, OrderBy

    client = _get_client()
    req = RunReportRequest(
        property=_property_id(),
        date_ranges=[DateRange(start_date=start, end_date=end)],
        dimensions=[Dimension(name="pagePath")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="bounceRate"),
            Metric(name="averageSessionDuration"),
            Metric(name="screenPageViews"),
        ],
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="bounceRate"), desc=True)],
        limit=limit,
    )
    resp = client.run_report(req)
    pages = []
    for row in resp.rows:
        path = row.dimension_values[0].value
        # 홈·정적 페이지 제외, 블로그 포스트만
        if not path.startswith("/") or path in ("/", "/agents", "/archive"):
            continue
        mv = row.metric_values
        pages.append({
            "path": path,
            "sessions": int(float(mv[0].value)),
            "bounce_rate": round(float(mv[1].value) * 100, 1),
            "avg_session_sec": round(float(mv[2].value)),
            "page_views": int(float(mv[3].value)),
        })
    return pages


def fetch_channel_metrics(start: str, end: str) -> list[dict]:
    """유입 채널별 세션수."""
    from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest, OrderBy

    client = _get_client()
    req = RunReportRequest(
        property=_property_id(),
        date_ranges=[DateRange(start_date=start, end_date=end)],
        dimensions=[Dimension(name="sessionDefaultChannelGrouping")],
        metrics=[Metric(name="sessions"), Metric(name="bounceRate")],
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)],
        limit=10,
    )
    resp = client.run_report(req)
    return [
        {
            "channel": row.dimension_values[0].value,
            "sessions": int(float(row.metric_values[0].value)),
            "bounce_rate": round(float(row.metric_values[1].value) * 100, 1),
        }
        for row in resp.rows
    ]


def fetch_device_metrics(start: str, end: str) -> list[dict]:
    """기기 유형별 세션수."""
    from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest

    client = _get_client()
    req = RunReportRequest(
        property=_property_id(),
        date_ranges=[DateRange(start_date=start, end_date=end)],
        dimensions=[Dimension(name="deviceCategory")],
        metrics=[Metric(name="sessions"), Metric(name="bounceRate"), Metric(name="averageSessionDuration")],
        limit=5,
    )
    resp = client.run_report(req)
    return [
        {
            "device": row.dimension_values[0].value,
            "sessions": int(float(row.metric_values[0].value)),
            "bounce_rate": round(float(row.metric_values[1].value) * 100, 1),
            "avg_session_sec": round(float(row.metric_values[2].value)),
        }
        for row in resp.rows
    ]
