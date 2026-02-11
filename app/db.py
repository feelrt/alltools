from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.settings import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            # 如果业务逻辑没有抛出异常，执行 commit 持久化数据
            await session.commit()
        except Exception:
            # 如果发生错误，回滚事务
            await session.rollback()
            raise


async def init_db() -> None:
    """启动时自动建表，并写入默认配置/管理员。"""
    from app.models import all_models  # noqa: F401
    from sqlalchemy import text
    from app.services.bootstrap_defaults import ensure_default_configs
    from app.services.admin_bootstrap import ensure_default_admin

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # sqlite 性能小优化
        if settings.DATABASE_URL.startswith("sqlite"):
            await conn.execute(text("PRAGMA journal_mode=WAL;"))
            await conn.execute(text("PRAGMA synchronous=NORMAL;"))

    # 写入默认配置与管理员
    async with AsyncSessionLocal() as session:
        await ensure_default_configs(session)
        await ensure_default_admin(session)
        await session.commit()