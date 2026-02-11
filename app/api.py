from pathlib import Path  # 1. 导入 Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.routers.health import router as health_router
from app.routers.packing import router as packing_router
from app.routers.auth import router as auth_router
from app.routers.billing import router as billing_router
from app.routers.admin import router as admin_router
from app.db import init_db

# 2. 计算根目录绝对路径
# api.py 所在位置是 .../app/api.py
# .parent 是 .../app
# .parent.parent 是 .../ (即项目根目录，main.py 和 static 所在的目录)
BASE_DIR = Path(__file__).resolve().parent.parent

def create_app() -> FastAPI:
    app = FastAPI(title="ToolHub - 3D Packing Web Pro")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def _startup():
        await init_db()

    app.include_router(health_router)
    app.include_router(packing_router)
    app.include_router(auth_router)
    app.include_router(billing_router)
    app.include_router(admin_router)

    @app.get("/", include_in_schema=False)
    def home():
        # 如果 web 也在根目录，建议同样用 BASE_DIR / "web/index.html"
        return FileResponse(BASE_DIR / "web/index.html")

    # 3. 使用绝对路径挂载 /static
    # 这样无论你在哪里运行 python，它都能准确找到 static 文件夹
    static_dir = BASE_DIR / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    # 4. 其他静态目录也建议加上 BASE_DIR 前缀，防止类似问题
    app.mount("/tools", StaticFiles(directory=BASE_DIR / "web/tools", html=True), name="tools")
    app.mount("/account", StaticFiles(directory=BASE_DIR / "web/account", html=True), name="account")
    app.mount("/admin", StaticFiles(directory=BASE_DIR / "web/admin", html=True), name="admin")

    return app