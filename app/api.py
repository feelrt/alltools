from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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

    # 1) 先注册 API（永远不跟静态站冲突）
    app.include_router(health_router)
    app.include_router(packing_router)

    # 2) 根路径返回工具大厅首页
    @app.get("/", include_in_schema=False)
    def home():
        return FileResponse("web/index.html")

    # 3) 工具静态资源统一挂到 /tools
    #    例如：/tools/packing/index.html
    app.mount("/tools", StaticFiles(directory="web/tools", html=True), name="tools")

    # 4) 公共资源（可选）：如果你 web/assets 下有公共文件
    #    例如：/assets/app.css
    #app.mount("/assets", StaticFiles(directory="web/assets"), name="assets")

    return app
