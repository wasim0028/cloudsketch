from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM
    llm_provider: str = "claude"  # claude | openai | ollama | mock
    llm_model: str | None = None  # empty = provider default
    llm_temperature: float = 0.2
    llm_max_tokens: int = 4000
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"

    # Services
    parser_url: str = "http://localhost:7070"
    # Postgres in docker-compose; SQLite fallback keeps local experiments simple
    database_url: str = "sqlite:///./cloudsketch.db"
    cors_origins: str = "http://localhost:5173"


settings = Settings()
