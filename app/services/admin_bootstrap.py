from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.settings import settings
from app.models.admin import Admin
from app.services.security import hash_password


async def ensure_default_admin(db: AsyncSession) -> None:
    admin = (await db.execute(select(Admin).where(Admin.username == settings.DEFAULT_ADMIN_USERNAME))).scalar_one_or_none()
    if admin:
        return
    db.add(Admin(username=settings.DEFAULT_ADMIN_USERNAME, password_hash=hash_password(settings.DEFAULT_ADMIN_PASSWORD)))
