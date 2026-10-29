"""L'agent : Claude, nourri de l'ADN de style de Zak, qui lit des œuvres,
analyse une photo de fond, propose des concepts et critique un rendu.

Toutes les réponses sont structurées (Pydantic) pour alimenter directement
les outils d'image (direction du soleil -> moteur d'ombres, etc.).
Identifiants : ANTHROPIC_API_KEY ou profil `ant auth login`.
"""

from __future__ import annotations

import base64
import io as _io
from pathlib import Path
from typing import Literal

import anthropic
from PIL import Image
from pydantic import BaseModel, Field

from .style import style_text

MODEL = "claude-opus-5-5"

SYSTEM = """Tu es l'assistant de création de Zak Eazy, artiste français de photomontage
surréaliste sous Photoshop. Tu connais son ADN visuel, résumé ci-dessous. Tu
raisonnes comme un retoucheur exigeant : cohérence de la lumière, justesse des
ombres, perspective, intégration colorimétrique. Tu réponds en français.

Convention de lumière utilisée par les outils (plan de l'image, vue de face) :
azimut = d'où vient la lumière en degrés (0 = de la droite, 90 = de derrière la
scène / contre-jour, 180 = de la gauche, 270 = de devant) ; élévation = hauteur
du soleil au-dessus de l'horizon en degrés. Les coordonnées sont des fractions
0-1 de la largeur / hauteur de l'image, origine en haut à gauche.

ADN de style (YAML) :
"""

Mecanique = Literal["deplacement", "immersion", "elevation", "echelle", "cadre", "metamorphose", "autre"]


class Lumiere(BaseModel):
    azimut: float = Field(description="degrés, convention ci-dessus")
    elevation: float = Field(description="degrés au-dessus de l'horizon")
    couleur: str = Field(description="hex de la lumière principale")
    soleil_xy: list[float] | None = Field(None, description="position du soleil [x, y] en fractions, s'il est visible")
    confiance: float = Field(description="0-1")


class LectureOeuvre(BaseModel):
    titre_propose: str
    monument_ou_lieu: str | None
    mecanique: Mecanique
    description: str
    elements: list[str] = Field(description="éléments détourés / sources identifiables")
    palette: list[str] = Field(description="5-7 couleurs hex dominantes")
    lumiere: Lumiere
    traitement_ombres: str = Field(description="comment les ombres sont construites : portées, contact, reflets, teinte, douceur")
    matieres_textures: list[str]
    composition: str = Field(description="cadrage, horizon, point focal, profondeur")
    sources_a_trouver: list[str] = Field(description="les photos qu'il a fallu trouver pour la faire, avec angle et lumière")


class AnalysePhoto(BaseModel):
    horizon_y: float = Field(description="fraction de hauteur")
    point_de_fuite: list[float] | None
    lumiere: Lumiere
    inclinaison_sol: float = Field(description="0.2 (sol vu rasant) à 0.8 (vu de haut)")
    surfaces: list[str] = Field(description="zones où poser des éléments : sol, eau, toits, ciel, avec position")
    ambiance: str
    conseils_integration: list[str]


class Source(BaseModel):
    role: str = Field(description="ex. photo de fond, animal, ciel, végétation")
    requete: str = Field(description="requête de recherche en anglais pour banque d'images")
    contraintes: str = Field(description="angle de vue, focale, direction et heure de la lumière à respecter")


class Concept(BaseModel):
    titre: str
    pitch: str
    monument_ou_lieu: str
    mecanique: Mecanique
    ambiance_lumiere: str
    palette: list[str]
    sources: list[Source]
    points_delicats: list[str] = Field(description="ombres, reflets, échelle : ce qui demandera le plus de soin")


class Concepts(BaseModel):
    concepts: list[Concept]


class Probleme(BaseModel):
    zone: str
    gravite: Literal["mineur", "moyen", "bloquant"]
    constat: str
    correction: str = Field(description="geste Photoshop ou paramètre d'outil précis")


class Critique(BaseModel):
    note_coherence_lumiere: int = Field(description="0-10")
    note_ombres: int = Field(description="0-10")
    note_fidelite_style: int = Field(description="0-10")
    problemes: list[Probleme]
    synthese: str


def _image_block(path: str | Path, max_side: int = 1568) -> dict:
    img = Image.open(path).convert("RGB")
    img.thumbnail((max_side, max_side))
    buf = _io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(buf.getvalue()).decode()},
    }


class Agent:
    def __init__(self, client: anthropic.Anthropic | None = None, model: str = MODEL, effort: str = "high"):
        self.client = client or anthropic.Anthropic()
        self.model = model
        self.effort = effort
        # Le préfixe système (ADN de style) est stable : mis en cache.
        self.system = [{"type": "text", "text": SYSTEM + style_text(), "cache_control": {"type": "ephemeral"}}]

    def _ask(self, content: list, schema: type[BaseModel]):
        response = self.client.beta.messages.parse(
            model=self.model,
            max_tokens=16000,
            system=self.system,
            messages=[{"role": "user", "content": content}],
            output_format=schema,
            output_config={"effort": self.effort},
            # En cas de refus d'un classifieur, l'API relance sur un autre modèle.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason == "refusal":
            raise RuntimeError(f"Requête refusée : {response.stop_details}")
        return response.parsed_output

    def lire_oeuvre(self, image: str | Path) -> LectureOeuvre:
        return self._ask(
            [_image_block(image), {"type": "text", "text": "Voici une œuvre de Zak. Décompose-la comme si tu devais la refaire."}],
            LectureOeuvre,
        )

    def analyser_photo(self, image: str | Path) -> AnalysePhoto:
        return self._ask(
            [_image_block(image), {"type": "text", "text": "Photo de fond candidate. Mesure la lumière et la perspective pour y intégrer des éléments."}],
            AnalysePhoto,
        )

    def imaginer(self, brief: str, n: int = 5) -> list[Concept]:
        prompt = f"Propose {n} concepts d'œuvres dans l'univers de Zak, variés dans leurs mécaniques. Brief : {brief}"
        return self._ask([{"type": "text", "text": prompt}], Concepts).concepts

    def critiquer(self, rendu: str | Path, intention: str = "") -> Critique:
        text = "Rendu en cours. Critique-le comme Zak le ferait, en priorité la cohérence lumière / ombres."
        if intention:
            text += f" Intention : {intention}"
        return self._ask([_image_block(rendu), {"type": "text", "text": text}], Critique)
