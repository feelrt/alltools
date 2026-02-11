from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.billing import AppConfig, ToolPricing, PaymentChannel, PointsPackage


async def ensure_default_configs(db: AsyncSession) -> None:
    # 注册赠送积分
    cfg = (await db.execute(select(AppConfig).where(AppConfig.key == "signup_bonus_points"))).scalar_one_or_none()
    if not cfg:
        db.add(AppConfig(key="signup_bonus_points", value="100"))

    # 装箱工具默认扣积分
    tp = (await db.execute(select(ToolPricing).where(ToolPricing.tool_key == "packing"))).scalar_one_or_none()
    if not tp:
        db.add(ToolPricing(tool_key="packing", cost_points=1, enabled=True))

    # 支付渠道开关（Stripe 的支付方式可用性取决于你账户地区配置）
    for ch in ("card", "alipay", "paypal"):
        row = (await db.execute(select(PaymentChannel).where(PaymentChannel.channel_key == ch))).scalar_one_or_none()
        if not row:
            db.add(PaymentChannel(channel_key=ch, enabled=True))

    # 默认积分套餐
    existing = (await db.execute(select(PointsPackage).limit(1))).scalar_one_or_none()
    if not existing:
        db.add_all([
            PointsPackage(name="Starter", points=200, amount_cents=299, currency="USD", enabled=True),
            PointsPackage(name="Plus", points=800, amount_cents=999, currency="USD", enabled=True),
            PointsPackage(name="Pro", points=2000, amount_cents=1999, currency="USD", enabled=True),
        ])
