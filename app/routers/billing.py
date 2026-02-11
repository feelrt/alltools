import hmac
import hashlib
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.db import get_db
from app.deps import get_current_user
from app.core.settings import settings
from app.models.user import User
from app.models.billing import PointsPackage, PaymentOrder
from app.models.points import PointsWallet, PointsLedger

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


class CreateCheckoutIn(BaseModel):
    package_id: int


@router.get("/packages")
async def list_packages(db: AsyncSession = Depends(get_db)):
    # 记得去数据库给你的套餐填上 ls_variant_id (在 Lemon Squeezy 后台商品详情页找)
    result = await db.execute(select(PointsPackage).where(PointsPackage.enabled == True))
    return result.scalars().all()


@router.post("/checkout")
async def create_checkout(payload: CreateCheckoutIn, user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    if not settings.LEMONSQUEEZY_API_KEY:
        raise HTTPException(status_code=500, detail="lemonsqueezy_not_configured")

    pkg = (await db.execute(select(PointsPackage).where(PointsPackage.id == payload.package_id))).scalar_one_or_none()
    if not pkg or not pkg.ls_variant_id:
        raise HTTPException(status_code=404, detail="package_invalid_or_no_variant_id")

    # 1. 创建本地订单
    order = PaymentOrder(
        user_id=user.id,
        package_id=pkg.id,
        amount_cents=pkg.amount_cents,
        currency=pkg.currency,
        status="pending",
        provider="lemonsqueezy"
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    # 2. 请求 Lemon Squeezy 创建 Checkout 链接
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.lemonsqueezy.com/v1/checkouts",
            headers={
                "Authorization": f"Bearer {settings.LEMONSQUEEZY_API_KEY}",
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json"
            },
            json={
                "data": {
                    "type": "checkouts",
                    "attributes": {
                        "checkout_data": {
                            "custom": {
                                "user_id": str(user.id),
                                "order_id": str(order.id)  # 传过去，回调时传回来
                            }
                        }
                    },
                    "relationships": {
                        "store": {"data": {"type": "stores", "id": settings.LEMONSQUEEZY_STORE_ID}},
                        "variant": {"data": {"type": "variants", "id": pkg.ls_variant_id}}
                    }
                }
            }
        )

        if resp.status_code != 201:
            print(f"LS Error: {resp.text}")
            raise HTTPException(status_code=500, detail="checkout_create_failed")

        data = resp.json()
        checkout_url = data["data"]["attributes"]["url"]

        order.checkout_url = checkout_url
        await db.commit()

        return {"checkout_url": checkout_url}


@router.post("/webhook")
async def ls_webhook(request: Request, x_signature: str = Header(None), db: AsyncSession = Depends(get_db)):
    # 验签
    if not x_signature: raise HTTPException(status_code=401, detail="No signature")
    raw_body = await request.body()
    secret = settings.LEMONSQUEEZY_WEBHOOK_SECRET.encode()
    digest = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(digest, x_signature): raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event_name = payload.get("meta", {}).get("event_name")

    if event_name == "order_created":
        data = payload.get("data", {})
        attributes = data.get("attributes", {})
        custom = attributes.get("checkout_data", {}).get("custom", {})

        local_order_id = custom.get("order_id")
        ls_order_id = str(data.get("id"))

        if local_order_id:
            order = (await db.execute(
                select(PaymentOrder).where(PaymentOrder.id == int(local_order_id)))).scalar_one_or_none()
            if order and order.status == "pending":
                order.status = "paid"
                order.external_id = ls_order_id
                order.paid_at = datetime.utcnow()

                # 发货积分
                pkg = (await db.execute(
                    select(PointsPackage).where(PointsPackage.id == order.package_id))).scalar_one_or_none()
                points = pkg.points if pkg else 0

                w = (await db.execute(
                    select(PointsWallet).where(PointsWallet.user_id == order.user_id))).scalar_one_or_none()
                if not w:
                    w = PointsWallet(user_id=order.user_id, balance=0)
                    db.add(w)
                    await db.flush()
                w.balance += points

                db.add(PointsLedger(user_id=order.user_id, change=points, reason="purchase", ref_type="ls",
                                    ref_id=ls_order_id))
                await db.commit()
                return {"status": "processed"}

    return {"status": "ignored"}