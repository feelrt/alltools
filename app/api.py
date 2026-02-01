from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers.health import router as health_router
from app.routers.packing import router as packing_router

def create_app() -> FastAPI:
    app = FastAPI(title="ToolHub - 3D Packing Web Pro")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Serve the website (tool hub + tools) as static files
    
    # API routers
    app.include_router(health_router)
    app.include_router(packing_router)

    # Serve website at root (so / is the ToolHub home)
    app.mount("/", StaticFiles(directory="web", html=True), name="web")

    return app
