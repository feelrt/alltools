from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db import get_db
from app.deps import get_current_user
from app.models.billing import ToolPricing
from app.services.points_service import spend_points


def require_and_charge(tool_key: str):
    async def _dep(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
        pricing = (await db.execute(select(ToolPricing).where(ToolPricing.tool_key == tool_key))).scalar_one_or_none()
        if not pricing or not pricing.enabled:
            raise HTTPException(status_code=403, detail="tool_disabled")
        cost = int(pricing.cost_points or 0)
        try:
            await spend_points(db, user.id, cost, reason="tool_usage", ref_type="tool", ref_id=tool_key)
        except ValueError:
            raise HTTPException(status_code=402, detail="insufficient_points")
        return True

    return _dep
