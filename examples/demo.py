"""Démo sans aucune photo : génère un décor et trois silhouettes synthétiques
(un beffroi posé au sol, une orque dans l'eau, une maison flottante), puis
lance l'assemblage complet et l'export des calques.

    python examples/demo.py   ->  examples/sortie/

À remplacer par de vraies sources (photo de fond + PNG détourés) dans
examples/scene_exemple.yaml.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from zak.compose import compose, gradient_plate
from zak import imageops as io
from zak.photoshop import export

ICI = Path(__file__).parent
W, H = 1080, 1350
HORIZON = 820


def decor() -> np.ndarray:
    plate = gradient_plate(W, H, "#8FA9DA", "#F8CDB6")
    # Soleil bas à gauche.
    ys, xs = np.mgrid[0:H, 0:W]
    d = np.hypot(xs - 300, ys - 640)
    glow = np.exp(-(d / 140) ** 2)[..., None]
    plate[..., :3] = plate[..., :3] * (1 - glow) + io.hex_to_rgb("#FFF1D0") * glow
    # Sol (place pavée) à gauche, mer à droite, sous l'horizon.
    sol = io.hex_to_rgb("#D9C3AE")
    mer = io.hex_to_rgb("#86C6CB")
    t = np.clip((ys - HORIZON) / (H - HORIZON), 0, 1)[..., None]
    sous = ys >= HORIZON
    zone_mer = sous & (xs > 560)
    zone_sol = sous & ~zone_mer
    plate[zone_sol, :3] = (sol * (0.9 + 0.1 * t))[zone_sol]
    plate[zone_mer, :3] = (mer * (0.85 + 0.15 * t))[zone_mer]
    return plate


def silhouette(size, draw_fn, fill) -> Image.Image:
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(img), fill)
    return img


def beffroi(d, f):
    d.rectangle([60, 120, 140, 600], fill=f)
    d.polygon([(50, 120), (100, 10), (150, 120)], fill=f)
    d.rectangle([40, 560, 160, 600], fill=f)


def orque(d, f):
    d.ellipse([0, 60, 360, 170], fill=f)
    d.polygon([(170, 70), (200, 0), (230, 75)], fill=f)
    d.ellipse([60, 120, 160, 150], fill=(245, 245, 245, 255))


def maison(d, f):
    d.ellipse([0, 150, 300, 260], fill=(250, 246, 240, 255))  # nuage
    d.rectangle([90, 70, 210, 170], fill=f)
    d.polygon([(80, 75), (150, 10), (220, 75)], fill=(170, 90, 80, 255))


def main():
    sources = ICI / "sources"
    sources.mkdir(exist_ok=True)
    io.save(decor(), sources / "decor.png")
    silhouette((200, 601), beffroi, (196, 150, 118, 255)).save(sources / "beffroi.png")
    silhouette((361, 171), orque, (30, 32, 40, 255)).save(sources / "orque.png")
    silhouette((301, 261), maison, (232, 214, 196, 255)).save(sources / "maison.png")

    scene = {
        "plate": "sources/decor.png",
        "light": "auto",
        "sun_rays": True,
        "elements": [
            {"name": "Beffroi", "image": "sources/beffroi.png", "x": 330, "y": 1080, "scale": 1.0, "surface": "ground"},
            {"name": "Orque", "image": "sources/orque.png", "x": 820, "y": 1040, "scale": 0.9, "surface": "water"},
            {"name": "Maison volante", "image": "sources/maison.png", "x": 760, "y": 900, "scale": 0.7, "surface": "air", "height": 420, "haze": 0.15},
        ],
    }
    comp = compose(scene, ICI)
    out = export(comp, ICI / "sortie", "demo_zak")
    print(f"{len(comp.layers)} calques exportés dans {out}")
    print("Lumière estimée :", comp.light)


if __name__ == "__main__":
    main()
