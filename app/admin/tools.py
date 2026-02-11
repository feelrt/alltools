from fastapi import APIRouter
from app.core.tool_registry import get_registered_tools

router = APIRouter()

@router.get("/admin/tools")
def list_tools():
    return list(get_registered_tools().values())