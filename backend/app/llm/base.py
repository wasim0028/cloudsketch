from dataclasses import dataclass
from typing import Protocol


@dataclass
class Message:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class Completion:
    text: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class LLMProvider(Protocol):
    """Every provider implements this one method. Add a new provider by
    writing a class with `name`, `model` and `complete`, then registering it
    in llm/__init__.py."""

    name: str
    model: str

    def complete(self, system: str, messages: list[Message]) -> Completion: ...
