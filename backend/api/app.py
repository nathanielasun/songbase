from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.routes import songs, processing, library

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

app.include_router(songs.router, prefix="/api/songs", tags=["songs"])
app.include_router(processing.router, prefix="/api/processing", tags=["processing"])
app.include_router(library.router, prefix="/api/library", tags=["library"])

@app.get("/")
async def root():
    return {"message": "Songbase API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
