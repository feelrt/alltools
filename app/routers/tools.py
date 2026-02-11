from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user
from app.core.tool_registry import get_registered_tools

router = APIRouter()

@router.post("/tools/check")
def check_tool(payload: dict, user=Depends(get_current_user)):
    tool_key = payload.get("tool_key")
    tools = get_registered_tools()
    if tool_key not in tools:
        raise HTTPException(404, "Tool not found")

    cost = tools[tool_key]["cost"]
    if user.points < cost:
        return {"ok": False, "reason": "points_not_enough", "cost": cost}

    return {"ok": True, "cost": cost}