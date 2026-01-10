import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.routes import processing, library, settings, acquisition, playback, stats, stats_stream, export
from backend.processing import dependencies
from backend.db import local_postgres

app = FastAPI(
    title="Songbase API",
    description="API for personalized music streaming platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(processing.router, prefix="/api/processing", tags=["processing"])
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(acquisition.router, prefix="/api/acquisition", tags=["acquisition"])
app.include_router(playback.router, prefix="/api/play", tags=["playback"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(stats_stream.router, prefix="/api/stats/stream", tags=["stats-stream"])
app.include_router(export.router, prefix="/api/export", tags=["export"])

@app.on_event("startup")
async def ensure_runtime_dependencies() -> None:
    metadata_url = os.environ.get("SONGBASE_DATABASE_URL")
    image_url = os.environ.get("SONGBASE_IMAGE_DATABASE_URL")
    if (
        not metadata_url
        or not image_url
        or local_postgres.is_local_url(metadata_url)
        or local_postgres.is_local_url(image_url)
    ):
        local_postgres.ensure_cluster()
        os.environ["SONGBASE_DATABASE_URL"] = local_postgres.metadata_url()
        os.environ["SONGBASE_IMAGE_DATABASE_URL"] = local_postgres.image_url()
    dependencies.ensure_first_run_dependencies()

@app.get("/")
async def root():
    return {"message": "Songbase API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
