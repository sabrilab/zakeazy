"""Opérations d'image de base (numpy + Pillow), en float32 RGBA 0-1."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageFilter


def load(path) -> np.ndarray:
    """Charge une image en float32 RGBA (H, W, 4), valeurs 0-1."""
    return to_array(Image.open(path))


def to_array(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGBA"), dtype=np.float32) / 255.0


def to_image(arr: np.ndarray) -> Image.Image:
    arr = np.clip(arr, 0.0, 1.0)
    mode = "RGBA" if arr.shape[-1] == 4 else "RGB"
    return Image.fromarray((arr * 255.0 + 0.5).astype(np.uint8), mode)


def save(arr: np.ndarray, path) -> None:
    to_image(arr).save(path)


def hex_to_rgb(value: str) -> np.ndarray:
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


def rgb_to_hex(rgb) -> str:
    r, g, b = (int(round(float(c) * 255)) for c in np.clip(rgb, 0, 1)[:3])
    return f"#{r:02X}{g:02X}{b:02X}"


def _box(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    """Moyenne glissante de demi-largeur r le long d'un axe (bords étendus)."""
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(channel: np.ndarray, radius: float) -> np.ndarray:
    """Flou quasi gaussien (sigma = radius) d'un canal 2D float : trois
    passes de flou boîte séparables, rapide même sur de grands rayons."""
    if radius <= 0.3:
        return channel
    r = max(1, int(round((np.sqrt(12 * radius * radius / 3 + 1) - 1) / 2)))
    out = channel.astype(np.float32)
    for _ in range(3):
        out = _box(_box(out, r, 0), r, 1)
    return out


def blur_rgba(arr: np.ndarray, radius: float) -> np.ndarray:
    return np.stack([blur(arr[..., c], radius) for c in range(arr.shape[-1])], axis=-1)


def erode(alpha: np.ndarray, size: int) -> np.ndarray:
    if size <= 0:
        return alpha
    img = Image.fromarray((alpha * 255).astype(np.uint8), "L")
    return np.asarray(img.filter(ImageFilter.MinFilter(size * 2 + 1)), dtype=np.float32) / 255.0


def over(dst: np.ndarray, src: np.ndarray, opacity: float = 1.0) -> np.ndarray:
    """Fusion « Normal » (alpha prémultiplié à la volée)."""
    a = src[..., 3:4] * opacity
    out_a = a + dst[..., 3:4] * (1 - a)
    rgb = src[..., :3] * a + dst[..., :3] * dst[..., 3:4] * (1 - a)
    rgb = np.divide(rgb, out_a, out=np.zeros_like(rgb), where=out_a > 1e-6)
    return np.concatenate([rgb, out_a], axis=-1)


BLEND_FUNCS = {
    "normal": lambda b, s: s,
    "multiply": lambda b, s: b * s,
    "screen": lambda b, s: 1 - (1 - b) * (1 - s),
    "overlay": lambda b, s: np.where(b < 0.5, 2 * b * s, 1 - 2 * (1 - b) * (1 - s)),
    "soft_light": lambda b, s: (1 - 2 * s) * b * b + 2 * s * b,
}


def blend(dst: np.ndarray, src: np.ndarray, mode: str = "normal", opacity: float = 1.0) -> np.ndarray:
    """Fusionne un calque RGBA sur un fond RGBA avec un mode Photoshop."""
    mixed = BLEND_FUNCS[mode](dst[..., :3], src[..., :3])
    layer = np.concatenate([mixed, src[..., 3:4]], axis=-1)
    return over(dst, layer, opacity)


def paste(canvas_shape, element: np.ndarray, x: int, y: int) -> np.ndarray:
    """Place un élément RGBA sur un calque transparent de la taille du canevas
    (x, y = coin haut-gauche, peut déborder)."""
    h, w = canvas_shape[:2]
    out = np.zeros((h, w, 4), dtype=np.float32)
    eh, ew = element.shape[:2]
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + ew, w), min(y + eh, h)
    if x1 <= x0 or y1 <= y0:
        return out
    out[y0:y1, x0:x1] = element[y0 - y : y1 - y, x0 - x : x1 - x]
    return out


def resize(arr: np.ndarray, scale: float) -> np.ndarray:
    if scale == 1:
        return arr
    h, w = arr.shape[:2]
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    # Redimensionnement en alpha prémultiplié pour éviter les franges sombres.
    pre = arr.copy()
    pre[..., :3] *= pre[..., 3:4]
    chans = [
        np.asarray(Image.fromarray(pre[..., c], "F").resize(size, Image.LANCZOS), dtype=np.float32)
        for c in range(4)
    ]
    out = np.clip(np.stack(chans, axis=-1), 0, 1)
    out[..., :3] = np.divide(out[..., :3], out[..., 3:4], out=np.zeros_like(out[..., :3]), where=out[..., 3:4] > 1e-6)
    return np.clip(out, 0, 1)


def alpha_bbox(alpha: np.ndarray, threshold: float = 0.05):
    """(x0, y0, x1, y1) de la zone opaque, ou None si vide."""
    ys, xs = np.nonzero(alpha > threshold)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
