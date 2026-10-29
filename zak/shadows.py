"""Moteur d'ombres et de lumière d'intégration.

C'est le cœur du travail « trop précis pour être délégué » : chaque élément
détouré (animal, monument, objet) doit recevoir une ombre portée, une ombre de
contact et, sur l'eau, un reflet, tous cohérents avec UNE direction de soleil.

Convention de la lumière (plan de l'image, vue de face) :
    azimut   = d'où vient la lumière, en degrés.
               0 = de la droite, 90 = de derrière la scène (contre-jour),
               180 = de la gauche, 270 = de devant (dans le dos du spectateur).
    élévation = hauteur du soleil au-dessus de l'horizon, en degrés.

Tous les calques produits sont RGBA plein cadre, prêts à être empilés dans
Photoshop en mode Produit (multiply) pour les ombres.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from PIL import Image

from . import imageops as io


@dataclass
class Light:
    azimuth: float = 90.0
    elevation: float = 25.0

    def shadow_direction(self, ground_tilt: float) -> tuple[float, float]:
        """Vecteur (dx, dy) image de la direction où tombe l'ombre, pour 1 px
        de hauteur projetée. dy est écrasé par l'inclinaison du sol."""
        az = math.radians(self.azimuth)
        dx = -math.cos(az)
        dy = math.sin(az) * ground_tilt
        # Un plan de sol vu en perspective a toujours un peu de profondeur :
        # on évite une projection dégénérée (ombre réduite à une ligne).
        if abs(dy) < 0.04:
            dy = 0.04 if dy >= 0 else -0.04
        length = 1.0 / math.tan(math.radians(max(self.elevation, 3.0)))
        return dx * min(length, 8.0), dy * min(length, 8.0)


def _foot_line(alpha: np.ndarray) -> int:
    bbox = io.alpha_bbox(alpha)
    if bbox is None:
        raise ValueError("calque vide : rien à ombrer")
    return bbox[3] - 1


def cast_shadow(
    element: np.ndarray,
    light: Light,
    color: str = "#6F6A9A",
    opacity: float = 0.55,
    ground_tilt: float = 0.45,
    foot_y: int | None = None,
    height_above_ground: float = 0.0,
    softness: float = 1.0,
    fade: float = 0.6,
) -> np.ndarray:
    """Ombre portée d'un élément sur le plan du sol.

    La silhouette est projetée par une transformation affine ancrée sur la
    ligne de contact. La pénombre (flou) et l'atténuation augmentent avec la
    hauteur du point qui projette l'ombre, comme une vraie ombre de soleil.
    `height_above_ground` (px) décolle l'ombre pour un objet qui flotte.
    """
    h, w = element.shape[:2]
    alpha = element[..., 3]
    ground = (foot_y if foot_y is not None else _foot_line(alpha)) + height_above_ground
    bbox = io.alpha_bbox(alpha)
    obj_h = max(1.0, ground - bbox[1])

    # On ne projette que ce qui est au-dessus du sol.
    src = alpha.copy()
    src[int(min(h, max(0, math.ceil(ground)))) :, :] = 0.0

    dx, dy = light.shadow_direction(ground_tilt)
    # Transformation inverse (sortie -> source) pour Image.transform.
    a, b, c = 1.0, -dx / dy, ground * dx / dy
    d, e, f = 0.0, -1.0 / dy, ground + ground / dy
    mask_img = Image.fromarray(src.astype(np.float32), "F")
    proj = np.asarray(
        mask_img.transform((w, h), Image.AFFINE, (a, b, c, d, e, f), resample=Image.BILINEAR),
        dtype=np.float32,
    )

    # Hauteur d'origine de chaque pixel d'ombre, normalisée 0 (contact) -> 1 (sommet).
    ys = np.arange(h, dtype=np.float32)[:, None]
    t = np.clip(np.abs(ys - ground) / (abs(dy) * obj_h), 0.0, 1.0)
    t = np.broadcast_to(t, proj.shape)

    # Pénombre progressive : mélange de trois niveaux de flou.
    shadow_len = obj_h * math.hypot(dx, dy)
    r_max = max(1.5, 0.06 * shadow_len * softness)
    sharp = io.blur(proj, 1.0)
    mid = io.blur(proj, r_max * 0.4)
    soft = io.blur(proj, r_max)
    m = np.where(t < 0.5, sharp + (mid - sharp) * (t / 0.5), mid + (soft - mid) * ((t - 0.5) / 0.5))
    m = m * (1.0 - fade * t)

    out = np.zeros((h, w, 4), dtype=np.float32)
    out[..., :3] = io.hex_to_rgb(color)
    out[..., 3] = np.clip(m * opacity, 0.0, 1.0)
    return out


def contact_shadow(
    element: np.ndarray,
    color: str = "#3E3A5C",
    opacity: float = 0.85,
    band: int | None = None,
    ground_tilt: float = 0.45,
    foot_y: int | None = None,
) -> np.ndarray:
    """Ombre de contact (occlusion) : courte, dense, juste sous les appuis.
    C'est elle qui « pose » un élément au sol et évite l'effet autocollant."""
    h, w = element.shape[:2]
    alpha = element[..., 3]
    bbox = io.alpha_bbox(alpha)
    foot = foot_y if foot_y is not None else bbox[3] - 1
    band = band or max(3, int(0.06 * (bbox[3] - bbox[1])))
    top = max(0, foot - band)
    strip = alpha[top : foot + 1].copy()
    # Les appuis : on pondère les lignes proches du sol.
    weights = np.linspace(0.2, 1.0, strip.shape[0], dtype=np.float32)[:, None]
    profile = (strip * weights).max(axis=0)  # présence par colonne
    flat_h = max(2, int(band * ground_tilt))
    mask = np.zeros((h, w), dtype=np.float32)
    y0 = max(0, foot - flat_h // 2)
    y1 = min(h, y0 + flat_h)
    mask[y0:y1] = profile[None, :]
    mask = io.blur(mask, max(1.0, flat_h * 0.6))
    out = np.zeros((h, w, 4), dtype=np.float32)
    out[..., :3] = io.hex_to_rgb(color)
    out[..., 3] = np.clip(mask * opacity * 1.6, 0.0, opacity)
    return out


def water_reflection(
    element: np.ndarray,
    water_color: str = "#7FC3C9",
    opacity: float = 0.45,
    waterline: int | None = None,
    ripple_amp: float = 3.0,
    ripple_period: float = 7.0,
    length: float = 0.8,
    tint: float = 0.35,
) -> np.ndarray:
    """Reflet inversé, ondulé et atténué sous la ligne d'eau (orques,
    dauphins, flamants, façades au bord de l'eau)."""
    h, w = element.shape[:2]
    alpha = element[..., 3]
    bbox = io.alpha_bbox(alpha)
    wl = waterline if waterline is not None else bbox[3] - 1
    obj_h = wl - bbox[1]
    depth = int(max(1, obj_h * length))
    out = np.zeros_like(element)
    water = io.hex_to_rgb(water_color)
    xs = np.arange(w)
    for k in range(1, min(depth, h - wl)):
        src_y = wl - k
        if src_y < 0:
            break
        row = element[src_y]
        shift = ripple_amp * (k / depth + 0.2) * math.sin(k / ripple_period * 2 * math.pi)
        src_x = np.clip(np.round(xs - shift).astype(int), 0, w - 1)
        r = row[src_x].copy()
        r[:, :3] = r[:, :3] * (1 - tint) + water * tint
        r[:, 3] *= (1.0 - k / depth) ** 1.5
        out[wl + k] = r
    out = io.blur_rgba(out, 0.8)
    out[..., 3] *= opacity
    return out


def self_shade(
    element: np.ndarray,
    light: Light,
    color: str = "#6F6A9A",
    strength: float = 0.55,
) -> np.ndarray:
    """Ombre propre : la face de l'objet opposée au soleil s'assombrit.
    En contre-jour (azimut proche de 90°) toute la face visible passe à
    l'ombre ; avec une lumière latérale, un dégradé traverse l'objet.
    Calque à fusionner en Produit (multiply)."""
    alpha = element[..., 3]
    bbox = io.alpha_bbox(alpha)
    if bbox is None:
        return np.zeros_like(element)
    az = math.radians(light.azimuth)
    backlit = max(0.0, math.sin(az))  # 1 = plein contre-jour
    side = math.cos(az)  # >0 : soleil à droite
    w = element.shape[1]
    xs = (np.arange(w, dtype=np.float32) - bbox[0]) / max(1, bbox[2] - bbox[0])
    across = np.clip(xs if side < 0 else 1 - xs, 0, 1)  # 1 = côté opposé au soleil
    amount = backlit * 0.7 + (1 - backlit) * across * abs(side)
    out = np.zeros_like(element)
    out[..., :3] = io.hex_to_rgb(color)
    out[..., 3] = alpha * np.clip(amount, 0, 1)[None, :] * strength
    return out


def submerge(
    element: np.ndarray, waterline: int, water_color: str = "#7FC3C9", visibility: float = 0.35, depth: int = 40
) -> np.ndarray:
    """Immerge la partie de l'élément sous la ligne d'eau : teintée et
    presque effacée, comme vue à travers l'eau."""
    out = element.copy()
    h = element.shape[0]
    if waterline >= h:
        return out
    rows = np.arange(h, dtype=np.float32)[:, None]
    below = rows > waterline
    fade = np.clip(1 - (rows - waterline) / max(1, depth), 0, 1) * visibility
    out[..., 3] = np.where(below, element[..., 3] * fade, element[..., 3])
    tint = io.hex_to_rgb(water_color)
    out[..., :3] = np.where(below[..., None], element[..., :3] * 0.4 + tint * 0.6, element[..., :3])
    return out


def light_wrap(
    element: np.ndarray, background: np.ndarray, width: int = 6, strength: float = 0.55
) -> np.ndarray:
    """Habillage lumineux : la lumière du décor « déborde » sur les bords de
    l'élément. Retourne un calque à fusionner en Écran (screen), découpé sur
    l'élément."""
    alpha = element[..., 3]
    inner = io.blur(io.erode(alpha, width), width * 0.6)
    edge = np.clip(alpha - inner, 0.0, 1.0)
    bg_blur = io.blur_rgba(background, width * 2.0)
    out = np.zeros_like(element)
    out[..., :3] = bg_blur[..., :3]
    out[..., 3] = edge * strength * alpha
    return out
