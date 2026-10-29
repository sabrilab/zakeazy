"""Colorimétrie : harmoniser les sources entre elles et appliquer
l'étalonnage pastel caractéristique de Zak Eazy."""

from __future__ import annotations

import math

import numpy as np

from . import imageops as io

# --- Conversions sRGB <-> Lab (D65) -----------------------------------------

_M = np.array(
    [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]],
    dtype=np.float32,
)
_M_INV = np.linalg.inv(_M).astype(np.float32)
_WHITE = np.array([0.95047, 1.0, 1.08883], dtype=np.float32)


def _lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _gamma(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    xyz = _lin(rgb) @ _M.T / _WHITE
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


def lab_to_rgb(lab: np.ndarray) -> np.ndarray:
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], axis=-1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * _WHITE
    return _gamma(xyz @ _M_INV.T)


# --- Harmonisation ----------------------------------------------------------


def _stats(lab: np.ndarray, weights: np.ndarray):
    wsum = weights.sum()
    if wsum < 1e-6:
        return np.zeros(3), np.ones(3)
    mean = (lab * weights[..., None]).sum(axis=(0, 1)) / wsum
    var = (((lab - mean) ** 2) * weights[..., None]).sum(axis=(0, 1)) / wsum
    return mean, np.sqrt(var) + 1e-3


def match_to_plate(element: np.ndarray, plate: np.ndarray, strength: float = 0.6, region=None) -> np.ndarray:
    """Transfert de couleur (Reinhard, espace Lab) : l'élément détouré prend
    la lumière et la dominante de la photo de fond. `region` = (x0, y0, x1, y1)
    pour n'échantillonner que la zone où l'élément sera posé."""
    src = rgb_to_lab(element[..., :3])
    ref_img = plate if region is None else plate[region[1] : region[3], region[0] : region[2]]
    ref = rgb_to_lab(ref_img[..., :3])
    s_mean, s_std = _stats(src, element[..., 3])
    r_mean, r_std = _stats(ref, ref_img[..., 3] if ref_img.shape[-1] == 4 else np.ones(ref.shape[:2]))
    # La dominante (a, b) suit le décor ; la luminance reste en grande partie
    # celle de l'objet : une orque doit rester sombre sur une mer claire.
    w_mean = np.array([0.25, 1.0, 1.0], dtype=np.float32)
    w_std = np.array([0.0, 0.5, 0.5], dtype=np.float32)
    scale = 1 + (r_std / s_std - 1) * w_std
    out = (src - s_mean) * scale + s_mean + (r_mean - s_mean) * w_mean
    res = element.copy()
    res[..., :3] = element[..., :3] * (1 - strength) + lab_to_rgb(out) * strength
    return res


def pastel_grade(
    img: np.ndarray,
    noir_releve: float = 0.10,
    blanc_max: float = 0.97,
    saturation: float = 0.88,
    teinte_ombres: str = "#7A6FB0",
    teinte_lumieres: str = "#FFD2B0",
    force_split: float = 0.18,
) -> np.ndarray:
    """Étalonnage « pastel Zak » : noirs relevés, hautes lumières adoucies,
    légère désaturation, ombres vers la lavande et lumières vers la pêche."""
    rgb = img[..., :3]
    # Courbe : relève du point noir + épaule douce dans les hautes lumières.
    rgb = noir_releve + (blanc_max - noir_releve) * (1 - (1 - rgb) ** 1.15)
    lum = (rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))[..., None]
    rgb = lum + (rgb - lum) * saturation
    sh = io.hex_to_rgb(teinte_ombres)
    hi = io.hex_to_rgb(teinte_lumieres)
    w_sh = np.clip(1 - lum * 2, 0, 1) * force_split
    w_hi = np.clip(lum * 2 - 1, 0, 1) * force_split
    # Split toning en mode « Lumière douce » pour garder la luminance.
    rgb = rgb * (1 - w_sh) + io.BLEND_FUNCS["soft_light"](rgb, sh) * w_sh
    rgb = rgb * (1 - w_hi) + io.BLEND_FUNCS["soft_light"](rgb, hi) * w_hi
    out = img.copy()
    out[..., :3] = np.clip(rgb, 0, 1)
    return out


def depth_haze(element: np.ndarray, color: str, amount: float) -> np.ndarray:
    """Perspective atmosphérique : plus c'est loin, plus ça se fond dans le ciel."""
    out = element.copy()
    out[..., :3] = element[..., :3] * (1 - amount) + io.hex_to_rgb(color) * amount
    return out


# --- Analyse -----------------------------------------------------------------


def extract_palette(img: np.ndarray, k: int = 6, iters: int = 12, seed: int = 0) -> list[tuple[str, float]]:
    """Palette dominante par k-moyennes en Lab. Retourne [(hex, part)] trié."""
    rgb = img[..., :3]
    mask = img[..., 3] > 0.5 if img.shape[-1] == 4 else np.ones(rgb.shape[:2], bool)
    px = rgb[mask]
    if len(px) == 0:
        return []
    rng = np.random.default_rng(seed)
    if len(px) > 20000:
        px = px[rng.choice(len(px), 20000, replace=False)]
    lab = rgb_to_lab(px)
    centers = lab[rng.choice(len(lab), min(k, len(lab)), replace=False)]
    for _ in range(iters):
        d = ((lab[:, None, :] - centers[None]) ** 2).sum(-1)
        lbl = d.argmin(1)
        for j in range(len(centers)):
            if (lbl == j).any():
                centers[j] = lab[lbl == j].mean(0)
    counts = np.bincount(lbl, minlength=len(centers)) / len(lab)
    order = np.argsort(-counts)
    return [(io.rgb_to_hex(lab_to_rgb(centers[j])), float(counts[j])) for j in order]


def estimate_light(plate: np.ndarray, anchor: tuple[float, float] | None = None) -> dict:
    """Estimation heuristique du soleil sur la photo de fond : zone la plus
    lumineuse du tiers supérieur, convertie en azimut / élévation par rapport
    au point d'ancrage (par défaut le centre bas de l'image).
    Approximation à valider : l'analyse Claude (`zak analyse`) est plus fiable."""
    h, w = plate.shape[:2]
    lum = plate[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lum = io.blur(lum, max(h, w) / 40)
    top = lum[: max(1, int(h * 0.6))]
    sy, sx = np.unravel_index(np.argmax(top), top.shape)
    ax, ay = anchor if anchor else (w / 2, h * 0.85)
    horiz = (sx - ax) / (w / 2)  # -1 gauche, +1 droite
    # Soleil visible dans le cadre => contre-jour (lumière venant de derrière).
    azimuth = math.degrees(math.atan2(1.0, horiz))
    elevation = float(np.interp(sy / h, [0.0, 0.6], [55.0, 8.0]))
    return {
        "sun_xy": [int(sx), int(sy)],
        "azimuth": round(azimuth, 1),
        "elevation": round(elevation, 1),
        "sun_color": io.rgb_to_hex(plate[sy, sx, :3]),
    }
