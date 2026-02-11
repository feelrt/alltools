from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.points import PointsWallet, PointsLedger


async def get_balance(db: AsyncSession, user_id: int) -> int:
    wallet = (await db.execute(select(PointsWallet).where(PointsWallet.user_id == user_id))).scalar_one_or_none()
    if not wallet:
        wallet = PointsWallet(user_id=user_id, balance=0)
        db.add(wallet)
        await db.flush()
    return wallet.balance


async def add_points(
    db: AsyncSession,
    user_id: int,
    amount: int,
    reason: str,
    ref_type: str | None = None,
    ref_id: str | None = None,
    note: str | None = None,
) -> int:
    if amount <= 0:
        return await get_balance(db, user_id)
    wallet = (await db.execute(select(PointsWallet).where(PointsWallet.user_id == user_id).with_for_update())).scalar_one_or_none()
    if not wallet:
        wallet = PointsWallet(user_id=user_id, balance=0)
        db.add(wallet)
        await db.flush()
        # 再锁一次（sqlite 下 with_for_update 无效，但事务仍可用）
        wallet = (await db.execute(select(PointsWallet).where(PointsWallet.user_id == user_id))).scalar_one()
    wallet.balance += amount
    db.add(PointsLedger(user_id=user_id, change=amount, reason=reason, ref_type=ref_type, ref_id=ref_id, note=note))
    await db.flush()
    return wallet.balance


async def spend_points(
    db: AsyncSession,
    user_id: int,
    cost: int,
    reason: str,
    ref_type: str | None = None,
    ref_id: str | None = None,
    note: str | None = None,
) -> int:
    if cost <= 0:
        return await get_balance(db, user_id)
    wallet = (await db.execute(select(PointsWallet).where(PointsWallet.user_id == user_id).with_for_update())).scalar_one_or_none()
    if not wallet:
        wallet = PointsWallet(user_id=user_id, balance=0)
        db.add(wallet)
        await db.flush()
        wallet = (await db.execute(select(PointsWallet).where(PointsWallet.user_id == user_id))).scalar_one()
    if wallet.balance < cost:
        raise ValueError("insufficient_points")
    wallet.balance -= cost
    db.add(PointsLedger(user_id=user_id, change=-cost, reason=reason, ref_type=ref_type, ref_id=ref_id, note=note))
    await db.flush()
    return wallet.balance
