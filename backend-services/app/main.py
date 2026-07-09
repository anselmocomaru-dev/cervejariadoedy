import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

app = FastAPI(
    title="Cervejariadoedy API",
    description="Backend da Cervejariadoedy — monorepo independente",
    version="0.1.0",
)

_cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:8080")
_cors_origins = [origin.strip() for origin in _cors_raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cervejariadoedy-backend"}


@app.get("/api/info")
def info() -> dict[str, str]:
    return {
        "name": "Cervejariadoedy",
        "env": os.getenv("APP_ENV", "development"),
    }
