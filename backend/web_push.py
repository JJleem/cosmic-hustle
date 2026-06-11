"""웹푸시(Web Push) 발송 — 자체호스팅 VAPID 방식. 외부 서비스/비용 없음.

env:
  VAPID_PRIVATE_KEY  — base64url 인코딩 개인키 (필수, 없으면 전체 no-op)
  VAPID_PUBLIC_KEY   — 프론트로 전달 (이 모듈에선 미사용)
  VAPID_SUBJECT      — mailto:... (기본 leemjaejun@gmail.com)
"""
import os
import json
import asyncio
import logging

from db.models import PushSubscription

logger = logging.getLogger(__name__)

_DEFAULT_ICON = "https://cosmic-hustle.ai.kr/icon-192.png"


def push_enabled() -> bool:
    return bool(os.environ.get("VAPID_PRIVATE_KEY"))


def _claims() -> dict:
    # endpoint마다 새 dict로 넘겨야 pywebpush가 aud를 올바르게 채움
    return {"sub": os.environ.get("VAPID_SUBJECT", "mailto:leemjaejun@gmail.com")}


def _payload(title: str, body: str, url: str, tag: str | None = None, icon: str | None = None) -> str:
    return json.dumps({
        "title": title,
        "body": body,
        "url": url,
        "icon": icon or _DEFAULT_ICON,
        "tag": tag,
    }, ensure_ascii=False)


def _send_one(endpoint: str, p256dh: str, auth: str, payload: str) -> bool:
    """동기 발송. 반환 True=유지, False=죽은 구독(404/410 → 삭제 대상)."""
    from pywebpush import webpush, WebPushException
    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=payload,
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims=_claims(),
            timeout=10,
        )
        return True
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            return False  # 구독 만료/해지 → 정리
        logger.warning(f"웹푸시 발송 실패 ({status}): {e}")
        return True
    except Exception as e:
        logger.warning(f"웹푸시 발송 오류: {e}")
        return True


async def _fan_out(db, subs: list[PushSubscription], payload: str) -> None:
    results = await asyncio.gather(*[
        asyncio.to_thread(_send_one, s.endpoint, s.p256dh, s.auth, payload) for s in subs
    ])
    dead = [s for s, ok in zip(subs, results) if not ok]
    for s in dead:
        db.delete(s)
    if dead:
        db.commit()
        logger.info(f"만료 웹푸시 구독 {len(dead)}개 정리")


async def broadcast_new_post(db, *, title: str, url: str, agent_name: str, thumbnail_url: str | None = None) -> None:
    """전체 구독자에게 새 글 알림."""
    if not push_enabled():
        return
    subs = db.query(PushSubscription).all()
    if not subs:
        return
    payload = _payload(
        title=f"📮 {title}",
        body=f"{agent_name}의 새 글이 올라왔어요",
        url=url,
        tag="daily-post",
        icon=thumbnail_url,
    )
    await _fan_out(db, subs, payload)
    logger.info(f"새 글 웹푸시 broadcast: {len(subs)}건")


async def notify_comment_reply(db, *, client_id: str | None, post_title: str, post_slug: str,
                               agent_name: str, reply_text: str, agent_id: str | None = None) -> None:
    """특정 익명 구독자(client_id)에게 '에이전트가 답글 달았어요' 알림."""
    if not push_enabled() or not client_id:
        return
    subs = db.query(PushSubscription).filter(PushSubscription.client_id == client_id).all()
    if not subs:
        return
    icon = f"https://cosmic-hustle.ai.kr/characters/{agent_id}/default.png" if agent_id else None
    payload = _payload(
        title=f"💬 {agent_name}님이 답글을 달았어요",
        body=reply_text[:80],
        url=f"https://cosmic-hustle.ai.kr/{post_slug}#comments",
        tag=f"reply-{post_slug}",
        icon=icon,
    )
    await _fan_out(db, subs, payload)
