import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.routers.operacao import router as operacao_router
from app.services.realtime_cozinha import realtime_cozinha_manager

logger = logging.getLogger("uvicorn.error")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PAINEL_HTML = PROJECT_ROOT / "painel" / "index.html"
PWA_DIR = PROJECT_ROOT / "pwa"
PWA_HTML = PWA_DIR / "index.html"
HOMOLOG_HTML = PROJECT_ROOT / "homolog" / "index.html"
load_dotenv(PROJECT_ROOT / ".env")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        try:
            await realtime_cozinha_manager.start()
        except Exception as exc:
            logger.error("Realtime cozinha não iniciou: %s", exc)
    yield
    await realtime_cozinha_manager.stop()


app = FastAPI(
    title="Cervejariadoedy API",
    description="Backend da Cervejariadoedy — monorepo independente",
    version="0.2.0",
    lifespan=lifespan,
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

app.include_router(operacao_router)

app.mount("/pwa", StaticFiles(directory=PWA_DIR), name="pwa")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cervejariadoedy-backend"}


@app.get("/api/info")
def info() -> dict[str, str]:
    return {
        "name": "Cervejariadoedy",
        "env": os.getenv("APP_ENV", "development"),
    }


@app.get("/painel")
def painel_cozinha() -> FileResponse:
    return FileResponse(PAINEL_HTML, media_type="text/html")


@app.get("/cliente")
def pwa_cliente() -> FileResponse:
    return FileResponse(
        PWA_HTML,
        media_type="text/html",
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/homolog")
def homolog_mesas() -> FileResponse:
    """Página clicável com links de teste por mesa (homologação local)."""
    return FileResponse(
        HOMOLOG_HTML,
        media_type="text/html",
        headers={"Cache-Control": "no-cache"},
    )
