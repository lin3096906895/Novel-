from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://novel:novel_password@localhost:15432/novel_platform"
    rag_port: int = 8000
    internal_rag_token: str = "local-dev-rag-token"
    embedding_mode: str = "local_hashing"
    embedding_base_url: str = ""
    embedding_api_key: str = ""
    embedding_model: str = "local-hashing-zh-1024"
    embedding_dimensions: int = 1024

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
