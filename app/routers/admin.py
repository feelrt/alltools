from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.settings import settings
from app.db import get_db
from app.deps import get_current_admin
from app.models.admin import Admin
from app.models.user import User
from app.models.points import PointsWallet, PointsLedger
from app.models.billing import AppConfig, ToolPricing, PaymentChannel, PointsPackage
from app.services.security import verify_password, hash_password, create_token
from sqlalchemy.orm import selectinload
from sqlalchemy import update

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class AdminLoginIn(BaseModel):
    username: str
    password: str


class ChangePwdIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=128)


class NewAdminIn(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class SetIntValue(BaseModel):
    value: int


class SetToolPricingIn(BaseModel):
    cost_points: int = Field(ge=0)
    enabled: bool = True


class SetChannelIn(BaseModel):
    enabled: bool = True


class PackageIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    points: int = Field(ge=1)
    amount_cents: int = Field(ge=1)
    currency: str = Field(default="USD", max_length=8)
    enabled: bool = True


class AdjustPointsIn(BaseModel):
    user_id: int
    amount: int
    note: str | None = Field(default=None, max_length=255)

# 1. 确保 UserOut 定义正确
class UserOut(BaseModel):
    id: int
    email: str | None
    username: str | None
    is_active: bool
    balance: int = 0  # 必须有这个字段

    class Config:
        orm_mode = True

@router.post("/login")
async def admin_login(payload: AdminLoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    admin = (await db.execute(select(Admin).where(Admin.username == payload.username.strip()))).scalar_one_or_none()
    if not admin or not admin.is_active:
        raise HTTPException(status_code=400, detail="invalid_credentials")
    if not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status_code=400, detail="invalid_credentials")
    token = create_token({"type": "admin", "aid": admin.id})
    response.set_cookie(settings.ADMIN_COOKIE_NAME, token, httponly=True, samesite="lax")
    return {"ok": True}


@router.post("/logout")
async def admin_logout(response: Response):
    response.delete_cookie(settings.ADMIN_COOKIE_NAME)
    return {"ok": True}


@router.get("/me")
async def admin_me(admin: Admin = Depends(get_current_admin)):
    return {"id": admin.id, "username": admin.username}


@router.post("/change-password")
async def change_password(payload: ChangePwdIn, admin: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    if not verify_password(payload.old_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="wrong_password")
    admin.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"ok": True}


@router.post("/admins")
async def create_admin(payload: NewAdminIn, _: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    exists = (await db.execute(select(Admin).where(Admin.username == payload.username.strip()))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail="admin_exists")
    db.add(Admin(username=payload.username.strip(), password_hash=hash_password(payload.password)))
    await db.commit()
    return {"ok": True}


@router.get("/config/signup_bonus_points")
async def get_signup_bonus(_: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    cfg = (await db.execute(select(AppConfig).where(AppConfig.key == "signup_bonus_points"))).scalar_one_or_none()
    return {"value": int(cfg.value) if cfg else 0}


@router.put("/config/signup_bonus_points")
async def set_signup_bonus(payload: SetIntValue, _: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    cfg = (await db.execute(select(AppConfig).where(AppConfig.key == "signup_bonus_points"))).scalar_one_or_none()
    if not cfg:
        cfg = AppConfig(key="signup_bonus_points", value=str(int(payload.value)))
        db.add(cfg)
    else:
        cfg.value = str(int(payload.value))
        cfg.updated_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


@router.get("/tools/{tool_key}")
async def get_tool_pricing(tool_key: str, _: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(ToolPricing).where(ToolPricing.tool_key == tool_key))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    return {"tool_key": row.tool_key, "cost_points": row.cost_points, "enabled": row.enabled}


@router.put("/tools/{tool_key}")
async def set_tool_pricing(tool_key: str, payload: SetToolPricingIn, _: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(ToolPricing).where(ToolPricing.tool_key == tool_key))).scalar_one_or_none()
    if not row:
        row = ToolPricing(tool_key=tool_key, cost_points=payload.cost_points, enabled=payload.enabled)
        db.add(row)
    else:
        row.cost_points = payload.cost_points
        row.enabled = payload.enabled
        row.updated_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


@router.get("/payment-channels")
async def list_channels(_: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(PaymentChannel))).scalars().all()
    return [{"channel_key": r.channel_key, "enabled": r.enabled} for r in rows]


@router.put("/payment-channels/{channel_key}")
async def set_channel(channel_key: str, payload: SetChannelIn, _: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(PaymentChannel).where(PaymentChannel.channel_key == channel_key))).scalar_one_or_none()
    if not row:
        row = PaymentChannel(channel_key=channel_key, enabled=payload.enabled)
        db.add(row)
    else:
        row.enabled = payload.enabled
        row.updated_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


@router.get("/packages")
async def list_packages(_: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(PointsPackage).order_by(PointsPackage.id.desc()))).scalars().all()
    return [
        {"id": r.id, "name": r.name, "points": r.points, "amount_cents": r.amount_cents, "currency": r.currency, "enabled": r.enabled}
        for r in rows
    ]


@router.post("/packages")
async def create_package(payload: PackageIn, _: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    pkg = PointsPackage(**payload.model_dump())
    db.add(pkg)
    await db.commit()
    return {"ok": True}


@router.put("/packages/{package_id}")
async def update_package(package_id: int, payload: PackageIn, _: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    pkg = (await db.execute(select(PointsPackage).where(PointsPackage.id == package_id))).scalar_one_or_none()
    if not pkg:
        raise HTTPException(status_code=404, detail="package_not_found")
    for k, v in payload.model_dump().items():
        setattr(pkg, k, v)
    await db.commit()
    return {"ok": True}


# 2. 修改 list_users 接口
@router.get("/users")
async def list_users(_: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    # 1. 查出前 200 个用户
    users = (await db.execute(select(User).order_by(User.id.desc()).limit(200))).scalars().all()

    out = []
    # 2. 遍历用户，手动去 PointsWallet 表查积分
    for u in users:
        # 单独查这个用户的钱包
        w = (await db.execute(select(PointsWallet).where(PointsWallet.user_id == u.id))).scalar_one_or_none()

        out.append({
            "id": u.id,
            "email": u.email,
            "username": u.username,
            "phone": u.phone,
            # 这里的逻辑是：如果找到钱包 w 就用 w.balance，没找到就给 0
            # 这种写法绝对不会报错，也不依赖 User 模型里的 relationship
            "balance": w.balance if w else 0
        })
    return out


@router.post("/points/adjust")
async def adjust_points(payload: AdjustPointsIn, _: Admin = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    print(f"--- [DEBUG] 开始调整积分: User {payload.user_id}, 变动 {payload.amount} ---")
    if payload.amount == 0:
        return {"ok": True}  # 0 不变动
    w = (await db.execute(
        select(PointsWallet).where(PointsWallet.user_id == payload.user_id).with_for_update())).scalar_one_or_none()

    if not w:
        print("--- [DEBUG] 用户无钱包，新建钱包 ---")
        w = PointsWallet(user_id=payload.user_id, balance=0)
        db.add(w)
        await db.flush()
    # 3. 【关键】这行必须和 if 对齐（在 if 外面），这样无论是否有钱包都会执行
    w.balance += payload.amount

    # 保存一下最终余额，防止 commit 后对象过期
    final_balance = w.balance

    # 4. 记录流水
    db.add(PointsLedger(
        user_id=payload.user_id,
        change=payload.amount,
        reason="admin_adjust",
        ref_type="admin",
        ref_id="manual",
        note=payload.note
    ))

    # 5. 提交
    await db.commit()

    return {"ok": True, "balance": final_balance}
