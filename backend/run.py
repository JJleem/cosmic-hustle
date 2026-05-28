import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    # host="0.0.0.0" — 외부 접속 허용 (Lightsail 배포용)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
