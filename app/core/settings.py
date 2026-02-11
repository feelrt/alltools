from __future__ import annotations

from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# 1. 强制加载 .env
ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH)

class Settings(BaseSettings):
    # --- App ---
    APP_NAME: str = "ToolHub"

    # --- Auth ---
    JWT_SECRET: str = "change-me"
    JWT_ALG: str = "HS256"
    JWT_EXPIRE_DAYS: int = 14
    COOKIE_NAME: str = "toolhub_token"
    ADMIN_COOKIE_NAME: str = "toolhub_admin_token"

    # --- Database ---
    DATABASE_URL: str = "sqlite+aiosqlite:///./toolhub.db"

    # --- Google OAuth ---
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://127.0.0.1:8000/api/v1/auth/google/callback"

    # --- Admin bootstrap ---
    DEFAULT_ADMIN_USERNAME: str = "feelrt"
    DEFAULT_ADMIN_PASSWORD: str = "000000"

    # ================= Lemon Squeezy 配置 =================
    LEMONSQUEEZY_API_KEY: str = ""
    LEMONSQUEEZY_STORE_ID: str = ""
    LEMONSQUEEZY_WEBHOOK_SECRET: str = ""
    # ======================================================

    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()