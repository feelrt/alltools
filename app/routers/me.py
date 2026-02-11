from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user

router = APIRouter()

@router.get("/me")
def me(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    return {
        "username": user.username,
        "points": user.points,
        "avatar": getattr(user, "avatar_url", None) or "/static/default-avatar.png"
    }