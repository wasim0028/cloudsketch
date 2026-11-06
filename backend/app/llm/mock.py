"""Deterministic offline provider: builds a small diagram from keywords in the
prompt. Lets you run the whole pipeline, UI and eval without an API key, and
serves as a naive baseline when comparing real models."""

import re

from .base import Completion, Message

KEYWORDS = [
    ("alb", "ALB", "aws-elb", "Load balancer"),
    ("load balancer", "ALB", "aws-elb", "Load balancer"),
    ("api gateway", "ApiGateway", "aws-api-gateway", "API Gateway"),
    ("eks", "EKS", "aws-eks", "EKS cluster"),
    ("lambda", "Lambda", "aws-lambda", "Lambda"),
    ("ecs", "ECS", "aws-ecs", "ECS service"),
    ("gke", "GKE", "gcp-gke", "GKE cluster"),
    ("aks", "AKS", "azure-aks", "AKS cluster"),
    ("rds", "RDS", "aws-rds", "RDS"),
    ("postgres", "RDS", "aws-rds", "Postgres"),
    ("dynamo", "DynamoDB", "aws-dynamodb", "DynamoDB"),
    ("redis", "Cache", "aws-elasticache", "Redis"),
    ("elasticache", "Cache", "aws-elasticache", "Redis"),
    ("s3", "S3", "aws-s3", "S3 bucket"),
    ("sqs", "Queue", "aws-sqs", "SQS queue"),
]


class MockProvider:
    name = "mock"

    def __init__(self, model: str | None = None):
        self.model = model or "keyword-baseline"

    def complete(self, system: str, messages: list[Message]) -> Completion:
        text = messages[-1].content.lower()
        # Edit mode: append the requested component to the existing DSL
        current = re.search(r"<current_diagram>\n(.*?)\n</current_diagram>", messages[-1].content, re.S)
        found: dict[str, tuple[str, str]] = {}
        for kw, name, icon, label in KEYWORDS:
            if kw in text and name not in found:
                found[name] = (icon, label)
        if current:
            dsl = current.group(1)
            for name, (icon, label) in found.items():
                if not re.search(rf"^\s*{name}\b", dsl, re.M):
                    dsl += f'\n{name} [icon: {icon}, label: "{label}"]'
            return Completion(dsl)

        lines = ["User [icon: user]", "Cloud [icon: aws-cloud] {"]
        lines += [f'  {n} [icon: {i}, label: "{l}"]' for n, (i, l) in found.items()]
        lines.append("}")
        chain = ["User", *found.keys()]
        if len(chain) > 1:
            lines.append(" > ".join(chain))
        return Completion("\n".join(lines))
