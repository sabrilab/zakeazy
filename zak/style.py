"""Chargement de l'ADN visuel (style/zak_style.yaml)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

STYLE_PATH = Path(__file__).resolve().parent.parent / "style" / "zak_style.yaml"


@lru_cache(maxsize=None)
def load_style(path: str | None = None) -> dict:
    with open(path or STYLE_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def style_text(path: str | None = None) -> str:
    """Le YAML brut, utilisé tel quel comme contexte pour l'agent Claude."""
    return Path(path or STYLE_PATH).read_text(encoding="utf-8")
