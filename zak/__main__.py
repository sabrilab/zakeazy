"""Ligne de commande : python -m zak <commande> ..."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml


def _print(obj) -> None:
    if hasattr(obj, "model_dump"):
        obj = obj.model_dump()
    elif isinstance(obj, list):
        obj = [o.model_dump() if hasattr(o, "model_dump") else o for o in obj]
    json.dump(obj, sys.stdout, ensure_ascii=False, indent=2)
    print()


def main(argv=None) -> None:
    p = argparse.ArgumentParser(prog="zak", description="Atelier Zak : photomontage surréaliste assisté")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("compose", help="assemble une scène YAML en calques Photoshop + aperçu")
    c.add_argument("scene")
    c.add_argument("-o", "--out", default="sortie")

    ci = sub.add_parser("corpus", help="importe l'export Instagram (zip/dossier) ou un dossier d'images")
    ci.add_argument("source")
    ci.add_argument("-o", "--out", default="corpus")

    cs = sub.add_parser("stats", help="statistiques de style d'un corpus importé")
    cs.add_argument("index", help="chemin de corpus.jsonl")

    for name, helptext in [
        ("lire", "Claude décompose une œuvre de Zak"),
        ("analyse", "Claude mesure lumière et perspective d'une photo de fond"),
        ("critique", "Claude critique un rendu"),
    ]:
        sp = sub.add_parser(name, help=helptext)
        sp.add_argument("image")

    ci2 = sub.add_parser("imaginer", help="Claude propose des concepts d'œuvres")
    ci2.add_argument("brief")
    ci2.add_argument("-n", type=int, default=5)

    a = p.parse_args(argv)

    if a.cmd == "compose":
        from .compose import compose
        from .photoshop import export

        scene_path = Path(a.scene)
        spec = yaml.safe_load(scene_path.read_text(encoding="utf-8"))
        comp = compose(spec, scene_path.parent)
        out = export(comp, a.out, scene_path.stem)
        print(f"{len(comp.layers)} calques -> {out}/ (apercu.png, construire_psd.jsx)")
        print(f"Lumière : {comp.light}")
    elif a.cmd == "corpus":
        from .corpus import build, summary

        index = build(a.source, a.out)
        _print(summary(index))
    elif a.cmd == "stats":
        from .corpus import summary

        _print(summary(a.index))
    else:
        from .agent import Agent

        agent = Agent()
        if a.cmd == "lire":
            _print(agent.lire_oeuvre(a.image))
        elif a.cmd == "analyse":
            _print(agent.analyser_photo(a.image))
        elif a.cmd == "critique":
            _print(agent.critiquer(a.image))
        elif a.cmd == "imaginer":
            _print(agent.imaginer(a.brief, a.n))


if __name__ == "__main__":
    main()
