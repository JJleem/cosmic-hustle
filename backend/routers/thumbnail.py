import json
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from db.connection import get_db, SessionLocal
from db import models
from orchestrator.agent_runner import run_agent, parse_json
from orchestrator.prompts import build_prompt

router = APIRouter(prefix="/api")

PIXEL_MESSAGES = [
    "썸네일 구도 잡는 중... 16:9 캔버스 펼쳤어요.",
    "색감 레퍼런스 뽑는 중.",
    "시각 언어 정리 중... 폰트도 같이 생각하고 있어요.",
    "프롬프트 다듬는 중. 여백에 감정 넣을게요.",
]


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/reports/{report_id}/thumbnail-prompt")
async def generate_thumbnail_prompt(report_id: str, db: Session = Depends(get_db)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    topic = str(report.topic)
    content_summary = str(report.content)[:2000]

    async def stream():
        yield _sse({"type": "agent_start", "agentId": "pixel",
                    "message": "썸네일 디자인 구상 시작! 캔버스 16:9로 펼쳤어요.",
                    "ts": int(time.time() * 1000)})

        murmur_idx = 0
        collected_chunks: list[str] = []

        def on_stream(chunk: str):
            nonlocal murmur_idx
            collected_chunks.append(chunk)

        prompt = build_prompt("pixel_thumbnail", topic=topic, content_summary=content_summary)

        # murmur 메시지를 스트리밍처럼 보내기 위해 on_stream 인터셉트
        murmur_sent = [False] * len(PIXEL_MESSAGES)

        def on_stream_with_murmur(chunk: str):
            nonlocal murmur_idx
            collected_chunks.append(chunk)
            if murmur_idx < len(PIXEL_MESSAGES) and not murmur_sent[murmur_idx]:
                murmur_sent[murmur_idx] = True
                murmur_idx += 1

        result_text, _, _ = await run_agent(
            prompt,
            no_tools=True,
            max_turns=1,
            model="claude-sonnet-4-6",
            timeout=60,
            on_stream=on_stream_with_murmur,
        )

        # 중간 murmur 메시지들 전송
        for i, msg in enumerate(PIXEL_MESSAGES):
            yield _sse({"type": "agent_message", "agentId": "pixel", "message": msg})

        parsed = parse_json(result_text, {})
        result = {
            "prompt": parsed.get("prompt", "") if isinstance(parsed, dict) else "",
            "negative": parsed.get("negative", "") if isinstance(parsed, dict) else "",
        }

        # DB 저장
        db2 = SessionLocal()
        try:
            db2.query(models.Report).filter(models.Report.id == report_id).update(
                {"thumbnail_prompts": json.dumps(result, ensure_ascii=False)}
            )
            db2.commit()
        finally:
            db2.close()

        yield _sse({"type": "agent_done", "agentId": "pixel",
                    "message": "프롬프트 완성! 복사해서 Gemini에 붙여넣어요.",
                    "result": result,
                    "ts": int(time.time() * 1000)})

    return StreamingResponse(stream(), media_type="text/event-stream")
