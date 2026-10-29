"""Recopie style/zak_style.yaml dans web/api/_style.js (utilisé par l'agent en ligne)."""

import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
text = (root / "style" / "zak_style.yaml").read_text(encoding="utf-8")
(root / "web" / "api" / "_style.js").write_text(
    "// Copie de style/zak_style.yaml (générée par scripts/sync_style.py, ne pas éditer).\n"
    f"export const STYLE_YAML = {json.dumps(text, ensure_ascii=False)};\n",
    encoding="utf-8",
)
