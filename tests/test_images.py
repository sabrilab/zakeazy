import json

import numpy as np

from zak import color, shadows
from zak import imageops as io
from zak.compose import compose, gradient_plate
from zak.photoshop import export


def tower(h=200, w=200):
    el = np.zeros((h, w, 4), np.float32)
    el[60:160, 90:110] = [0.8, 0.7, 0.6, 1.0]
    return el  # pied à y=159, centre x=100


def centroid(alpha):
    ys, xs = np.nonzero(alpha > 0.05)
    return xs.mean(), ys.mean()


def test_ombre_opposee_au_soleil():
    el = tower()
    droite = shadows.cast_shadow(el, shadows.Light(azimuth=0, elevation=30))  # soleil à droite
    gauche = shadows.cast_shadow(el, shadows.Light(azimuth=180, elevation=30))
    assert centroid(droite[..., 3])[0] < 100 < centroid(gauche[..., 3])[0]


def test_contre_jour_ombre_vers_le_spectateur_et_plus_longue_si_soleil_bas():
    el = tower(400, 200)
    el[:] = 0
    el[60:160, 90:110] = [0.8, 0.7, 0.6, 1.0]
    haut = shadows.cast_shadow(el, shadows.Light(90, 60), fade=0)
    bas = shadows.cast_shadow(el, shadows.Light(90, 15), fade=0)
    assert centroid(haut[..., 3])[1] > 159
    assert np.nonzero(bas[..., 3] > 0.05)[0].max() > np.nonzero(haut[..., 3] > 0.05)[0].max()


def test_ombre_de_contact_sous_les_appuis():
    cs = shadows.contact_shadow(tower())
    x, y = centroid(cs[..., 3])
    assert abs(x - 100) < 3 and abs(y - 159) < 6


def test_lab_aller_retour():
    rgb = np.random.default_rng(0).random((8, 8, 3)).astype(np.float32)
    assert np.allclose(color.lab_to_rgb(color.rgb_to_lab(rgb)), rgb, atol=2e-3)


def test_etalonnage_pastel_releve_les_noirs():
    img = np.zeros((4, 4, 4), np.float32)
    img[..., 3] = 1
    assert color.pastel_grade(img)[..., :3].min() >= 0.08


def test_harmonisation_garde_un_objet_sombre_sombre():
    orque = np.zeros((10, 10, 4), np.float32)
    orque[..., :3] = 0.08
    orque[..., 3] = 1
    mer = np.ones((10, 10, 4), np.float32)
    mer[..., :3] = [0.5, 0.78, 0.8]
    out = color.match_to_plate(orque, mer, strength=1.0)
    assert out[..., :3].mean() < 0.3


def test_composition_et_export_photoshop(tmp_path):
    spec = {
        "canvas": {"width": 240, "height": 300},
        "light": {"azimuth": 120, "elevation": 20},
        "sun_rays": True,
        "elements": [
            {"name": "Tour", "image": tower(), "x": 120, "y": 250, "surface": "ground"},
            {"name": "Orque", "image": tower(), "x": 60, "y": 260, "surface": "water"},
        ],
    }
    comp = compose(spec)
    assert comp.preview.shape == (300, 240, 4)
    out = export(comp, tmp_path, "test")
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert len(manifest["layers"]) == len(comp.layers)
    assert all((out / l["file"]).exists() for l in manifest["layers"])
    assert {"BlendMode.MULTIPLY", "BlendMode.SCREEN"} <= {l["blend"] for l in manifest["layers"]}
    assert "app.documents.add" in (out / "construire_psd.jsx").read_text(encoding="utf-8")


def test_flou_conserve_la_moyenne():
    a = np.zeros((50, 50), np.float32)
    a[25, 25] = 1
    b = io.blur(a, 4)
    assert abs(b.sum() - 1) < 0.05 and b.max() < 0.1
