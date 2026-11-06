from openai import OpenAI

from ..config import settings
from .base import Completion, Message


class OpenAIProvider:
    name = "openai"

    def __init__(self, model: str | None = None):
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        self.model = model or "gpt-4.1"
        self.client = OpenAI(api_key=settings.openai_api_key)

    def complete(self, system: str, messages: list[Message]) -> Completion:
        resp = self.client.chat.completions.create(
            model=self.model,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            messages=[{"role": "system", "content": system}]
            + [{"role": m.role, "content": m.content} for m in messages],
        )
        u = resp.usage
        return Completion(resp.choices[0].message.content or "", u and u.prompt_tokens, u and u.completion_tokens)
