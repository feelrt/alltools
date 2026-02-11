from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.settings import settings
from app.db import get_db
from app.services.security import decode_token
from app.models.user import User
from app.models.admin import Admin


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="not_logged_in")
    payload = decode_token(token)
    if not payload or payload.get("type") != "user":
        raise HTTPException(status_code=401, detail="invalid_token")
    user_id = payload.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid_token")
    user = (await db.execute(select(User).where(User.id == int(user_id)))).scalar_one_or_none()
    if not user or user.is_banned:
        raise HTTPException(status_code=401, detail="user_not_found")
    return user


async def get_current_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Admin:
    token = request.cookies.get(settings.ADMIN_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="admin_not_logged_in")
    payload = decode_token(token)
    if not payload or payload.get("type") != "admin":
        raise HTTPException(status_code=401, detail="invalid_admin_token")
    admin_id = payload.get("aid")
    if not admin_id:
        raise HTTPException(status_code=401, detail="invalid_admin_token")
    admin = (await db.execute(select(Admin).where(Admin.id == int(admin_id)))).scalar_one_or_none()
    if not admin or not admin.is_active:
        raise HTTPException(status_code=401, detail="admin_not_found")
    return admin
