import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.connection import engine, Base
from routers import health, research, wiki, memos, versions, export, logs, thumbnail

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Cosmic Hustle API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(research.router)
app.include_router(wiki.router)
app.include_router(memos.router)
app.include_router(versions.router)
app.include_router(export.router)
app.include_router(logs.router)
app.include_router(thumbnail.router)
