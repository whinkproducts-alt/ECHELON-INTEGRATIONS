from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Values that must never be accepted as a real secret.
_PLACEHOLDERS = {
    "change-me",
    "changeme",
    "marcus-vale-secret-key",
    "marcus-vale-echelon-key",
    "whink_local",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Environment
    MARCUS_ENV: str = "local"

    # Required: no defaults. Startup fails if any is missing. (ECHELON_API_KEY is optional.)
    DATABASE_URL: str
    API_KEY: str  # protects every Marcus route (sent as X-API-Key)
    OMNIROUTE_API_KEY: str
    ECHELON_API_KEY: str = ""  # optional: empty means Marcus runs standalone

    # OmniRoute (self-hosted gateway)
    OMNIROUTE_BASE_URL: str = "http://127.0.0.1:20128/v1"
    OMNIROUTE_MODEL: str = "gpt-4o-mini"
    # Cost estimates in USD per 1M tokens. Override in .env with your real rates.
    OMNIROUTE_PRICE_IN_PER_1M: float = 0.15
    OMNIROUTE_PRICE_OUT_PER_1M: float = 0.60
    OMNIROUTE_EMBED_PRICE_PER_1M: float = 0.02

    # Voice containers (host ports from docker-compose.yml)
    WHISPER_URL: str = "http://127.0.0.1:8767"
    KOKORO_URL: str = "http://127.0.0.1:8768"
    WHISPER_MODEL: str = "Systran/faster-whisper-base"
    KOKORO_VOICE: str = "af_bella"
    KOKORO_FORMAT: str = "mp3"  # mp3 is the smallest of the formats Kokoro supports that browsers play

    # ECHELON
    ECHELON_BASE_URL: str = "http://localhost:3000"

    # Spend cap
    MARCUS_SPEND_CAP_USD: float = 20.0
    MARCUS_SPEND_WARNING_PCT: float = 70.0

    # Scheduling (local time in Victor's current time zone)
    DEFAULT_TIMEZONE: str = "America/Edmonton"
    MORNING_BRIEFING_TIME: str = "09:00"
    EVENING_BRIEFING_TIME: str = "21:00"
    WEEKEND_CHECKIN_TIME: str = "18:00"
    MEMORY_REVIEW_TIME: str = "16:00"

    @field_validator("ECHELON_API_KEY")
    @classmethod
    def _echelon_key(cls, v: str) -> str:
        if v and v.strip().lower() in _PLACEHOLDERS:
            raise ValueError("must be a real secret or empty")
        return v.strip()

    @property
    def echelon_enabled(self) -> bool:
        return bool(self.ECHELON_API_KEY)

    @field_validator("API_KEY", "OMNIROUTE_API_KEY")
    @classmethod
    def _real_secret(cls, v: str) -> str:
        if not v or v.strip().lower() in _PLACEHOLDERS:
            raise ValueError("must be set to a real secret, not a placeholder")
        return v

    @field_validator("API_KEY")
    @classmethod
    def _api_key_long(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("API_KEY must be at least 16 characters")
        return v


settings = Settings()
