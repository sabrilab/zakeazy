// Directeur artistique : Claude imagine une œuvre dans l'univers de Zak et
// écrit le prompt d'UNE photographie complète (lumière, reflets et matières
// cohérents). La scène est ensuite décomposée en calques (voir analyse.js).
// Variable d'environnement : ANTHROPIC_API_KEY.

import { STYLE_YAML } from "./_style.js";
import { askJson, fail, imageBlocks, needKey } from "./_claude.js";

const SYSTEM = `Tu es le directeur artistique de Zak Eazy, artiste français de photomontage
surréaliste sous Photoshop. Tu conçois une œuvre dans son univers EXACT (ADN ci-dessous).
Un modèle d'image génère la scène en UNE photographie, puis elle est décomposée en calques
(chaque sujet détouré, décor reconstitué, ombres et reflets extraits).

Le réalisme photographique du milieu est la priorité absolue :
- Une idée forte et lisible : un lieu ou monument reconnaissable + une mécanique surréaliste.
- Écris "scene_prompt" en anglais comme la description d'une vraie photo : boîtier plein
  format, focale, hauteur et angle de prise de vue, heure et direction du soleil.
- Décris physiquement le milieu : eau (transparence, ridules, écume, caustiques, reflets
  inversés exacts, ligne d'immersion mouillée), ciel (nuages volumétriques, voile
  atmosphérique), sol (matière, humidité), végétation. Les sujets touchent leur milieu :
  ombres de contact, ombres portées dans la direction du soleil, éclaboussures, reflets.
- Échelle crédible et perspective unique. Monuments fidèles à la réalité.
- Palette pastel de Zak (lavande, pêche, turquoise laiteux), noirs relevés, grain fin.
- 1 à 4 sujets principaux bien séparés les uns des autres (ils seront détourés) :
  liste-les dans "sujets" avec un nom court en français.
- Pas de texte, pas de cadre, pas de personnage reconnaissable.
- Si des images d'inspiration sont jointes, reprends-en l'esprit (lieu, palette,
  composition) sans les copier.

ADN de style de Zak (YAML) :
${STYLE_YAML}`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titre", "pitch", "mecanique", "ambiance", "palette", "scene_prompt", "sujets"],
  properties: {
    titre: { type: "string" },
    pitch: { type: "string", description: "1-2 phrases, en français" },
    mecanique: { type: "string", enum: ["deplacement", "immersion", "elevation", "echelle", "cadre", "metamorphose"] },
    ambiance: { type: "string" },
    palette: { type: "array", items: { type: "string" } },
    scene_prompt: { type: "string", description: "prompt photo en anglais, 80-160 mots" },
    sujets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "description"],
        properties: { nom: { type: "string" }, description: { type: "string" } },
      },
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST attendu" });
  if (needKey(res, "ANTHROPIC_API_KEY")) return;
  const { prompt = "", inspirations = [], hasard = null } = req.body || {};
  const content = imageBlocks(inspirations);
  let ask = prompt.trim()
    ? `Demande : ${prompt.trim()}`
    : "Pas de demande précise : surprends-moi avec une œuvre inédite, forte et typique de Zak.";
  if (hasard) ask += `\nContraintes tirées au sort (à respecter) : ${hasard}`;
  if (inspirations.length) ask += `\n${inspirations.length} image(s) d'inspiration jointe(s).`;
  content.push({ type: "text", text: ask });
  try {
    return res.status(200).json(await askJson({ system: SYSTEM, content, schema: SCHEMA }));
  } catch (err) {
    return fail(res, err);
  }
}
