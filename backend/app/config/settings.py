import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")

    class Config:
        env_file = "../.env"
        env_file_encoding = "utf-8"

settings = Settings()