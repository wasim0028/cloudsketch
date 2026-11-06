import anthropic

from ..config import settings
from .base import Completion, Message


class ClaudeProvider:
    name = "claude"

    def __init__(self, model: str | None = None):
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        self.model = model or "claude-sonnet-5-5"
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def complete(self, system: str, messages: list[Message]) -> Completion:
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=settings.llm_max_tokens,
            temperature=settings.llm_temperature,
            system=system,
            messages=[{"role": m.role, "content": m.content} for m in messages],
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        return Completion(text, resp.usage.input_tokens, resp.usage.output_tokens)
