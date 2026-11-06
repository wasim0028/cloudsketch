from ..config import settings
from .base import Completion, LLMProvider, Message

PROVIDERS = {
    "claude": "app.llm.claude:ClaudeProvider",
    "openai": "app.llm.openai_provider:OpenAIProvider",
    "ollama": "app.llm.ollama:OllamaProvider",
    "mock": "app.llm.mock:MockProvider",
}


def get_provider(name: str | None = None, model: str | None = None) -> LLMProvider:
    """Swap providers per request or via LLM_PROVIDER / LLM_MODEL env vars."""
    import importlib

    name = name or settings.llm_provider
    if name not in PROVIDERS:
        raise ValueError(f"Unknown provider '{name}'. Options: {', '.join(PROVIDERS)}")
    mod, cls = PROVIDERS[name].split(":")
    return getattr(importlib.import_module(mod), cls)(model or settings.llm_model)


__all__ = ["Completion", "LLMProvider", "Message", "get_provider", "PROVIDERS"]
