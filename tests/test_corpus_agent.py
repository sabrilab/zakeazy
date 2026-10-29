import json
from types import SimpleNamespace

import numpy as np

from zak import corpus
from zak import imageops as io
from zak.agent import Agent, Concepts


def test_import_export_instagram(tmp_path):
    root = tmp_path / "export"
    (root / "media" / "posts" / "202105").mkdir(parents=True)
    img = np.ones((40, 32, 4), np.float32)
    img[..., :3] = [0.9, 0.75, 0.8]
    io.save(img, root / "media" / "posts" / "202105" / "a.png")
    caption = "Lille fÃ©erique #surrealism #lille"  # mojibake typique des exports Meta
    posts = [{"media": [{"uri": "media/posts/202105/a.png", "creation_timestamp": 1620000000, "title": caption}]}]
    content = root / "your_instagram_activity" / "content"
    content.mkdir(parents=True)
    (content / "posts_1.json").write_text(json.dumps(posts), encoding="utf-8")

    index = corpus.build(root, tmp_path / "corpus")
    row = json.loads(index.read_text(encoding="utf-8").splitlines()[0])
    assert row["caption"].startswith("Lille féerique")
    assert row["hashtags"] == ["surrealism", "lille"]
    assert row["mesures"]["palette"]
    s = corpus.summary(index)
    assert s["oeuvres"] == 1 and s["hashtags_frequents"][0] == "surrealism"


class FakeMessages:
    def __init__(self):
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(stop_reason="end_turn", parsed_output=Concepts(concepts=[]))


def test_agent_envoie_style_et_fallback():
    fake = FakeMessages()
    agent = Agent(client=SimpleNamespace(beta=SimpleNamespace(messages=fake)))
    assert agent.imaginer("Lille sous la mer", 3) == []
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["fallbacks"] == "default"
    assert "Zak Eazy" in call["system"][0]["text"] and "lumiere_et_ombres" in call["system"][0]["text"]


def test_style_web_synchronise():
    """web/api/_style.js doit refléter style/zak_style.yaml (scripts/sync_style.py)."""
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    yaml_text = (root / "style" / "zak_style.yaml").read_text(encoding="utf-8")
    js = (root / "web" / "api" / "_style.js").read_text(encoding="utf-8")
    assert json.dumps(yaml_text, ensure_ascii=False) in js
