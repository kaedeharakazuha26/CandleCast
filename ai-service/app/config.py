from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=())

    model_id: str = "NeoQuasar/Kronos-base"
    tokenizer_id: str = "NeoQuasar/Kronos-Tokenizer-base"
    model_version: str = "kronos-base"
    max_context: int = 512
    max_pred_len: int = 120
    default_lookback: int = 400
    clip: float = 5.0
    device: str = "auto"
    skip_model_load: bool = False
    inference_timeout_seconds: int = 180
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"
    hf_home: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
