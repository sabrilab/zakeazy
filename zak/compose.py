"""Assemblage d'une scène : photo de fond + éléments détourés -> pile de
calques (comme dans Photoshop) + aperçu étalonné.

Une scène se décrit en YAML/JSON (voir examples/) :

    plate: lille_grand_place.jpg     # ou canvas: {width, height, top, bottom}
    light: auto                      # ou {azimuth: 120, elevation: 18}
    ground_tilt: 0.45
    sun_rays: true
    elements:
      - name: Orque
        image: orque.png             # PNG détouré
        x: 540                       # centre horizontal du point d'appui
        y: 1180                      # ligne de contact (sol / eau)
        scale: 0.6
        surface: water               # ground | water | air
        height: 0                    # px au-dessus du sol (surface: air)
        match_color: 0.6
        haze: 0.0
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import atmosphere, color, shadows
from . import imageops as io
from .style import load_style


@dataclass
class Layer:
    name: str
    data: np.ndarray
    mode: str = "normal"
    opacity: float = 1.0
    visible: bool = True
    group: str | None = None


@dataclass
class Composition:
    width: int
    height: int
    layers: list[Layer] = field(default_factory=list)
    light: dict = field(default_factory=dict)
    preview: np.ndarray | None = None


def gradient_plate(width: int, height: int, top: str, bottom: str) -> np.ndarray:
    t = np.linspace(0, 1, height, dtype=np.float32)[:, None, None]
    rgb = io.hex_to_rgb(top) * (1 - t) + io.hex_to_rgb(bottom) * t
    out = np.ones((height, width, 4), dtype=np.float32)
    out[..., :3] = np.broadcast_to(rgb, (height, width, 3))
    return out


def _load_plate(spec: dict, base: Path, style: dict) -> np.ndarray:
    if "plate" in spec:
        return io.load(base / spec["plate"])
    c = spec.get("canvas", {})
    pal = style["colorimetrie"]["palette_reference"]
    return gradient_plate(c.get("width", 1080), c.get("height", 1350), c.get("top", pal["ciel_haut"]), c.get("bottom", pal["ciel_bas"]))


def _load_element(el: dict, base: Path) -> np.ndarray:
    img = el["image"]
    return io.load(base / img) if isinstance(img, (str, Path)) else img


def compose(spec: dict, base_dir: str | Path = ".") -> Composition:
    base = Path(base_dir)
    style = load_style()
    pal = style["colorimetrie"]["palette_reference"]
    lo = style["lumiere_et_ombres"]["defauts"]
    plate = _load_plate(spec, base, style)
    h, w = plate.shape[:2]
    comp = Composition(w, h)
    comp.layers.append(Layer("Fond", plate))

    elements = sorted(spec.get("elements", []), key=lambda e: e["y"])  # du plus loin au plus proche
    tilt = spec.get("ground_tilt", lo["inclinaison_sol"])

    light_spec = spec.get("light", "auto")
    if light_spec == "auto":
        anchor = (float(np.mean([e["x"] for e in elements])), float(np.mean([e["y"] for e in elements]))) if elements else None
        est = color.estimate_light(plate, anchor)
        light = shadows.Light(est["azimuth"], est["elevation"])
        comp.light = {**est, "source": "heuristique"}
    else:
        light = shadows.Light(light_spec["azimuth"], light_spec["elevation"])
        comp.light = {**light_spec, "source": "scène"}

    for el in elements:
        name = el.get("name", Path(str(el.get("image", "element"))).stem)
        src = io.resize(_load_element(el, base), el.get("scale", 1.0))
        bbox = io.alpha_bbox(src[..., 3])
        if bbox is None:
            continue
        foot_local = bbox[3] - 1
        cx_local = (bbox[0] + bbox[2]) / 2
        surface = el.get("surface", "ground")
        lift = el.get("height", 0) if surface == "air" else 0
        # Sur l'eau, l'élément s'enfonce d'une fraction de sa hauteur.
        sink = el.get("immersion", 0.3) * (bbox[3] - bbox[1]) if surface == "water" else 0
        x = int(round(el["x"] - cx_local))
        y = int(round(el["y"] - lift + sink - foot_local))
        x0, y0 = max(0, x + bbox[0]), max(0, y + bbox[1])
        region = (x0, y0, min(w, x + bbox[2]), min(h, y + bbox[3]))
        if el.get("match_color", 0.6) > 0 and region[2] > region[0] and region[3] > region[1]:
            src = color.match_to_plate(src, plate, el.get("match_color", 0.6), region)
        if el.get("haze", 0) > 0:
            src = color.depth_haze(src, pal["ciel_bas"], el["haze"])
        layer = io.paste(plate.shape, src, x, y)
        if surface == "water":
            layer = shadows.submerge(layer, int(el["y"]), pal["eau"], depth=max(8, int(sink)))
        sh = el.get("shadow", {})
        group = name

        if surface == "water":
            comp.layers.append(Layer(f"{name} · reflet", shadows.water_reflection(layer, pal["eau"], waterline=int(el["y"])), group=group))
            comp.layers.append(
                Layer(
                    f"{name} · ombre de contact",
                    shadows.contact_shadow(layer, opacity=sh.get("contact", 0.5), ground_tilt=tilt, foot_y=int(el["y"])),
                    mode="multiply",
                    group=group,
                )
            )
        else:
            comp.layers.append(
                Layer(
                    f"{name} · ombre portée",
                    shadows.cast_shadow(
                        layer,
                        light,
                        color=style["colorimetrie"]["palette_reference"]["ombre"],
                        opacity=sh.get("opacity", lo["opacite_ombre_portee"]),
                        ground_tilt=tilt,
                        foot_y=int(el["y"]) - lift if surface == "air" else int(el["y"]),
                        height_above_ground=lift,
                        softness=sh.get("softness", 1.0) * (2.5 if surface == "air" else 1.0),
                    ),
                    mode="multiply",
                    group=group,
                )
            )
            if surface == "ground":
                comp.layers.append(
                    Layer(
                        f"{name} · ombre de contact",
                        shadows.contact_shadow(layer, opacity=sh.get("contact", lo["opacite_ombre_contact"]), ground_tilt=tilt, foot_y=int(el["y"])),
                        mode="multiply",
                        group=group,
                    )
                )
        comp.layers.append(Layer(name, layer, group=group))
        comp.layers.append(
            Layer(f"{name} · ombre propre", shadows.self_shade(layer, light, pal["ombre"], sh.get("propre", 0.55)), mode="multiply", group=group)
        )
        comp.layers.append(Layer(f"{name} · light wrap", shadows.light_wrap(layer, plate), mode="screen", group=group))

    rays = spec.get("sun_rays", False)
    if rays:
        sun_xy = rays.get("xy") if isinstance(rays, dict) else comp.light.get("sun_xy", [w * 0.5, h * 0.3])
        comp.layers.append(Layer("Rayons de soleil", atmosphere.sun_rays(plate.shape, sun_xy, pal["soleil"]), mode="screen"))

    flat = render(comp.layers)
    grade = style["colorimetrie"]["etalonnage"]
    graded = color.pastel_grade(flat, **grade) if spec.get("grade", True) else flat
    grain_amount = spec.get("grain", 0.035)
    if grain_amount:
        grain = Layer("Grain", atmosphere.film_grain(plate.shape, grain_amount), mode="overlay", opacity=0.6)
        graded = io.blend(graded, grain.data, grain.mode, grain.opacity)
        comp.layers.append(grain)
    # L'étalonnage est livré cuit et masqué : Zak garde la main sur sa
    # propre courbe dans Photoshop (calque de réglage) et s'en sert de repère.
    comp.layers.append(Layer("Étalonnage pastel (repère)", graded, visible=False))
    comp.preview = graded
    return comp


def render(layers: list[Layer]) -> np.ndarray:
    out = None
    for layer in layers:
        if not layer.visible:
            continue
        out = layer.data.copy() if out is None else io.blend(out, layer.data, layer.mode, layer.opacity)
    return out
