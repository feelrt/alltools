from __future__ import annotations

from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.core.settings import settings
from app.db import get_db
from app.models.user import User
from app.models.billing import AppConfig
from app.services.security import hash_password, verify_password, create_token
from app.services.points_service import add_points
from app.models.points import PointsWallet, PointsLedger
from app.deps import get_current_user
from fastapi.responses import RedirectResponse


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    phone: str | None = Field(default=None, max_length=32)


class LoginIn(BaseModel):
    identity: str = Field(description="email 或 username")
    password: str


@router.post("/register")
async def register(payload: RegisterIn, response: Response, db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="username_required")

    exists = (await db.execute(select(User).where(or_(User.email == email, User.username == username)))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail="user_exists")

    user = User(
        email=email,
        username=username,
        password_hash=hash_password(payload.password),
        phone=(payload.phone.strip() if payload.phone else None),
        auth_provider="local",
        email_verified=False,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    await db.flush()

    # 注册赠送积分（可后台配置）
    cfg = (await db.execute(select(AppConfig).where(AppConfig.key == "signup_bonus_points"))).scalar_one_or_none()
    bonus = int(cfg.value) if cfg else 0
    if bonus > 0:
        await add_points(db, user.id, bonus, reason="signup_bonus", ref_type="user", ref_id=str(user.id))

    token = create_token({"type": "user", "uid": user.id})
    response.set_cookie(settings.COOKIE_NAME, token, httponly=True, samesite="lax")
    return {"ok": True, "user": {"id": user.id, "email": user.email, "username": user.username}}


@router.post("/login")
async def login(payload: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    identity = payload.identity.strip()
    user = (await db.execute(select(User).where(or_(User.email == identity.lower(), User.username == identity)))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="invalid_credentials")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="invalid_credentials")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="banned")

    user.last_login_at = datetime.utcnow()
    token = create_token({"type": "user", "uid": user.id})
    response.set_cookie(settings.COOKIE_NAME, token, httponly=True, samesite="lax")
    return {"ok": True, "user": {"id": user.id, "email": user.email, "username": user.username}}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(settings.COOKIE_NAME)
    return {"ok": True}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "username": user.username, "phone": user.phone}


@router.get("/points")
async def my_points(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    w = (await db.execute(select(PointsWallet).where(PointsWallet.user_id == user.id))).scalar_one_or_none()
    ledger = (await db.execute(
        select(PointsLedger)
        .where(PointsLedger.user_id == user.id)
        .order_by(PointsLedger.id.desc())
        .limit(50)
    )).scalars().all()
    return {
        "balance": w.balance if w else 0,
        "ledger": [
            {
                "change": l.change,
                "reason": l.reason,
                "note": l.note,
                "created_at": l.created_at.isoformat(),
            }
            for l in ledger
        ],
    }


@router.get("/google/login")
async def google_login(request: Request):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="google_not_configured")
    # 极简实现：省略 state 存储，生产环境建议加 state 防 CSRF
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
    }
    from urllib.parse import urlencode

    return {"auth_url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)}




@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    # 检查配置
    if not (settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET):
        raise HTTPException(status_code=400, detail="google_not_configured")

    async with httpx.AsyncClient(timeout=15) as client:
        # 换取 Token
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="google_token_exchange_failed")

        tokens = token_resp.json()
        id_token = tokens.get("id_token")
        if not id_token:
            raise HTTPException(status_code=400, detail="google_no_id_token")

        # 获取用户信息
        info_resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
        )
        if info_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="google_tokeninfo_failed")
        info = info_resp.json()

    email = (info.get("email") or "").lower()
    sub = info.get("sub")
    if not email or not sub:
        raise HTTPException(status_code=400, detail="google_profile_incomplete")

    # --- 用户查找/创建逻辑 (保持不变) ---
    user = (await db.execute(select(User).where(User.google_sub == sub))).scalar_one_or_none()
    if not user:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user:
            user.google_sub = sub
            user.auth_provider = "google"
            user.email_verified = True
        else:
            # 新建用户
            base_username = email.split("@")[0][:60]
            candidate = base_username
            i = 1
            while (await db.execute(select(User).where(User.username == candidate))).scalar_one_or_none():
                i += 1
                candidate = f"{base_username}{i}"[:64]

            user = User(
                email=email,
                username=candidate,
                password_hash=hash_password("google-login-no-password"),
                auth_provider="google",
                google_sub=sub,
                email_verified=True,
            )
            db.add(user)
            await db.flush()

            # 注册赠送积分
            cfg = (
                await db.execute(select(AppConfig).where(AppConfig.key == "signup_bonus_points"))).scalar_one_or_none()
            bonus = int(cfg.value) if cfg else 0
            if bonus > 0:
                await add_points(db, user.id, bonus, reason="signup_bonus", ref_type="user", ref_id=str(user.id))

    # --- 关键修改部分 ---

    # 1. 生成 Token
    token = create_token({"type": "user", "uid": user.id})

    # 2. 创建重定向响应，跳转到个人中心
    response = RedirectResponse(url="/account/profile.html")

    # 3. 在这个重定向响应里种下 Cookie
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax"
    )

    # 4. 返回响应，浏览器会自动跳转
    return response
