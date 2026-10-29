"""Export vers Photoshop : un dossier de calques PNG + un script .jsx qui
reconstruit le document avec les bons modes de fusion et opacités.

Zak garde ainsi le plaisir de Photoshop : l'outil prépare les calques
fastidieux (ombres, reflets, light wrap), il les retouche au pinceau.
Dans Photoshop : Fichier > Scripts > Parcourir... > construire_psd.jsx
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import imageops as io
from .compose import Composition

PS_BLEND = {
    "normal": "BlendMode.NORMAL",
    "multiply": "BlendMode.MULTIPLY",
    "screen": "BlendMode.SCREEN",
    "overlay": "BlendMode.OVERLAY",
    "soft_light": "BlendMode.SOFTLIGHT",
}

_JSX = r"""#target photoshop
// Généré par l'Atelier Zak — reconstruit la composition calque par calque.
(function () {
    var here = new File($.fileName).parent;
    var manifest = %(manifest)s;
    var doc = app.documents.add(manifest.width, manifest.height, 300, manifest.name,
                                NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
    var groups = {};
    for (var i = 0; i < manifest.layers.length; i++) {
        var L = manifest.layers[i];
        var src = app.open(new File(here + "/" + L.file));
        var dup = src.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
        src.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = doc;
        dup.name = L.name;
        dup.blendMode = eval(L.blend);
        dup.opacity = L.opacity;
        if (L.group) {
            if (!groups[L.group]) {
                groups[L.group] = doc.layerSets.add();
                groups[L.group].name = L.group;
                groups[L.group].move(dup, ElementPlacement.PLACEBEFORE);
            }
            dup.move(groups[L.group], ElementPlacement.INSIDE);
        }
        dup.visible = L.visible;
    }
    // Supprime le calque transparent initial.
    var base = doc.artLayers[doc.artLayers.length - 1];
    if (base.name !== manifest.layers[0].name) { base.remove(); }
    doc.saveAs(new File(here + "/" + manifest.name + ".psd"), new PhotoshopSaveOptions(), true);
})();
"""


def _slug(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower() or "calque"


def export(comp: Composition, out_dir: str | Path, name: str = "composition") -> Path:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    layers = []
    for i, layer in enumerate(comp.layers):
        fname = f"{i:02d}_{_slug(layer.name)}.png"
        io.save(layer.data, out / fname)
        layers.append(
            {
                "file": fname,
                "name": layer.name,
                "blend": PS_BLEND[layer.mode],
                "opacity": round(layer.opacity * 100, 1),
                "visible": layer.visible,
                "group": layer.group,
            }
        )
    manifest = {"name": name, "width": comp.width, "height": comp.height, "light": comp.light, "layers": layers}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "construire_psd.jsx").write_text(_JSX % {"manifest": json.dumps(manifest, ensure_ascii=False)}, encoding="utf-8")
    if comp.preview is not None:
        io.save(comp.preview, out / "apercu.png")
    return out
