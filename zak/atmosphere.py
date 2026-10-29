"""Atmosphère : rayons de soleil volumétriques et grain unificateur."""

from __future__ import annotations

import numpy as np

from . import imageops as io


def sun_rays(
    shape,
    sun_xy: tuple[float, float],
    color: str = "#FFE3B0",
    n_rays: int = 48,
    spread: float = 0.55,
    reach: float = 1.1,
    strength: float = 0.45,
    seed: int = 7,
) -> np.ndarray:
    """Calque de rayons (à fusionner en Écran) partant de `sun_xy`."""
    h, w = shape[:2]
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = xs - sun_xy[0], ys - sun_xy[1]
    ang = np.arctan2(dy, dx)
    dist = np.hypot(dx, dy) / (max(h, w) * reach)
    # Profil angulaire : bruit 1D lissé, contrasté.
    prof = rng.random(n_rays * 8).astype(np.float32)
    prof = np.convolve(np.tile(prof, 3), np.ones(5) / 5, mode="same")[n_rays * 8 : n_rays * 16]
    prof = np.clip((prof - prof.mean()) / (prof.std() + 1e-6) * 0.5 + 0.5, 0, 1) ** 2
    idx = ((ang + np.pi) / (2 * np.pi) * len(prof)).astype(int) % len(prof)
    rays = prof[idx] * spread + (1 - spread) * 0.3
    falloff = np.clip(1 - dist, 0, 1) ** 2
    glow = np.exp(-(dist * 6) ** 2)
    alpha = np.clip(rays * falloff + glow * 0.8, 0, 1) * strength
    alpha = io.blur(alpha, max(h, w) / 300)
    out = np.zeros((h, w, 4), dtype=np.float32)
    out[..., :3] = io.hex_to_rgb(color)
    out[..., 3] = alpha
    return out


def film_grain(shape, amount: float = 0.035, seed: int = 3) -> np.ndarray:
    """Grain fin commun à toute l'image : il fond les sources photo entre
    elles. Calque gris 50 % à fusionner en Incrustation (overlay)."""
    h, w = shape[:2]
    rng = np.random.default_rng(seed)
    noise = io.blur(rng.normal(0, 1, (h, w)).astype(np.float32), 0.6)
    out = np.zeros((h, w, 4), dtype=np.float32)
    out[..., :3] = np.clip(0.5 + noise * amount * 3, 0, 1)[..., None]
    out[..., 3] = 1.0
    return out
