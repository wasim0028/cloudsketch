import httpx

from ..config import settings
from .base import Completion, Message


class OllamaProvider:
    """Local models via Ollama's /api/chat (e.g. qwen2.5-coder, llama3.1)."""

    name = "ollama"

    def __init__(self, model: str | None = None):
        self.model = model or "qwen2.5-coder:7b"

    def complete(self, system: str, messages: list[Message]) -> Completion:
        r = httpx.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": self.model,
                "stream": False,
                "options": {"temperature": settings.llm_temperature},
                "messages": [{"role": "system", "content": system}]
                + [{"role": m.role, "content": m.content} for m in messages],
            },
            timeout=300,
        )
        r.raise_for_status()
        data = r.json()
        return Completion(data["message"]["content"], data.get("prompt_eval_count"), data.get("eval_count"))
