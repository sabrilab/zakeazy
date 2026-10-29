"""Corpus des œuvres de Zak : import de l'export officiel Instagram
(« Télécharger vos informations », format JSON) ou d'un simple dossier
d'images, puis mesures objectives pour recaler l'ADN de style.

Sortie : <dossier>/corpus.jsonl (une ligne par image) et images copiées.
"""

from __future__ import annotations

import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import color
from . import imageops as io

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def _fix(text: str) -> str:
    """Les exports Meta encodent l'UTF-8 en latin-1 (« Ã© » au lieu de « é »)."""
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def _unpack(source: Path, workdir: Path) -> Path:
    if source.is_file() and zipfile.is_zipfile(source):
        dest = workdir / "_export"
        with zipfile.ZipFile(source) as z:
            z.extractall(dest)  # extractall neutralise les chemins absolus et « .. »
        return dest
    return source


def _posts_from_export(root: Path) -> list[dict]:
    posts = []
    for jf in sorted(root.rglob("posts_*.json")) + sorted(root.rglob("reels.json")):
        data = json.loads(jf.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("ig_reels_media", [])
        for p in data:
            media = p.get("media", [])
            caption = _fix(p.get("title") or (media[0].get("title", "") if media else ""))
            ts = p.get("creation_timestamp") or (media[0].get("creation_timestamp") if media else None)
            for i, m in enumerate(media):
                uri = m.get("uri", "")
                path = root / uri
                if not path.exists():
                    hits = list(root.rglob(Path(uri).name))
                    path = hits[0] if hits else path
                posts.append(
                    {
                        "id": f"{ts}_{i}",
                        "date": datetime.fromtimestamp(ts, timezone.utc).date().isoformat() if ts else None,
                        "caption": caption,
                        "hashtags": re.findall(r"#(\w+)", caption),
                        "carousel_index": i,
                        "source": str(path),
                    }
                )
    return posts


def _posts_from_folder(root: Path) -> list[dict]:
    return [
        {"id": p.stem, "date": None, "caption": "", "hashtags": [], "carousel_index": 0, "source": str(p)}
        for p in sorted(root.rglob("*"))
        if p.suffix.lower() in IMAGE_EXT
    ]


def measure(img: np.ndarray) -> dict:
    """Mesures colorimétriques d'une œuvre (sur une version réduite)."""
    small = io.resize(img, min(1.0, 512 / max(img.shape[:2])))
    lab = color.rgb_to_lab(small[..., :3])
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    L = lab[..., 0]
    return {
        "palette": color.extract_palette(small, k=6),
        "luminance_moyenne": round(float(L.mean()), 1),
        "noir_p2": round(float(np.percentile(L, 2)), 1),
        "blanc_p98": round(float(np.percentile(L, 98)), 1),
        "chroma_moyenne": round(float(chroma.mean()), 1),
        "lumiere": color.estimate_light(small),
        "format": f"{img.shape[1]}x{img.shape[0]}",
    }


def build(source: str | Path, out_dir: str | Path) -> Path:
    out = Path(out_dir)
    (out / "images").mkdir(parents=True, exist_ok=True)
    root = _unpack(Path(source), out)
    posts = _posts_from_export(root) or _posts_from_folder(root)
    index = out / "corpus.jsonl"
    with index.open("w", encoding="utf-8") as f:
        for post in posts:
            src = Path(post["source"])
            if not src.exists() or src.suffix.lower() not in IMAGE_EXT - {".heic"}:
                continue  # vidéos et formats non lus : on garde la trace ailleurs
            dest = out / "images" / f"{post['id']}{src.suffix.lower()}"
            shutil.copy2(src, dest)
            post["image"] = str(dest.relative_to(out))
            post["mesures"] = measure(io.load(dest))
            f.write(json.dumps(post, ensure_ascii=False) + "\n")
    return index


def summary(index: str | Path) -> dict:
    """Statistiques agrégées pour recaler style/zak_style.yaml."""
    rows = [json.loads(line) for line in Path(index).read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows:
        return {"oeuvres": 0}
    m = [r["mesures"] for r in rows]
    tags: dict[str, int] = {}
    for r in rows:
        for t in r["hashtags"]:
            tags[t.lower()] = tags.get(t.lower(), 0) + 1
    colors: dict[str, float] = {}
    for x in m:
        for hexa, share in x["palette"]:
            colors[hexa] = colors.get(hexa, 0) + share
    return {
        "oeuvres": len(rows),
        "periode": [min((r["date"] for r in rows if r["date"]), default=None), max((r["date"] for r in rows if r["date"]), default=None)],
        "luminance_moyenne": round(float(np.mean([x["luminance_moyenne"] for x in m])), 1),
        "noir_releve_median_L": round(float(np.median([x["noir_p2"] for x in m])), 1),
        "chroma_moyenne": round(float(np.mean([x["chroma_moyenne"] for x in m])), 1),
        "elevation_soleil_mediane": round(float(np.median([x["lumiere"]["elevation"] for x in m])), 1),
        "couleurs_frequentes": sorted(colors, key=colors.get, reverse=True)[:12],
        "hashtags_frequents": sorted(tags, key=tags.get, reverse=True)[:20],
    }
