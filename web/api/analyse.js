// Lecture de la scène générée par Claude (vision) : position de chaque sujet,
// type d'appui et lumière, pour guider le détourage et le moteur d'ombres.
// Variable d'environnement : ANTHROPIC_API_KEY.

import { askJson, fail, imageBlocks, needKey } from "./_claude.js";

const SYSTEM = `Tu analyses une photographie surréaliste pour la décomposer en calques Photoshop.
Pour chaque sujet demandé, donne sa boîte englobante la plus serrée possible qui contient
TOUT le sujet (y compris la partie immergée visible), en fractions 0-1 de la largeur et
de la hauteur (origine en haut à gauche). Donne aussi la boîte de la zone où il projette
ses ombres et reflets sur son milieu (sol, eau, nuage), qui peut déborder du sujet.
appui_y = ligne où le sujet touche son milieu (sol, ligne d'eau) ; s'il vole, la ligne
du sol sous lui. Lumière : azimut = d'où vient la lumière (0 droite, 90 contre-jour
depuis le fond, 180 gauche, 270 depuis le spectateur), élévation en degrés ; position
du soleil en fractions même s'il est hors cadre (valeurs < 0 ou > 1 permises).`;

const BOX = { type: "array", items: { type: "number" }, description: "[x0, y0, x1, y1] en fractions" };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sujets", "lumiere", "horizon_y"],
  properties: {
    horizon_y: { type: "number" },
    lumiere: {
      type: "object",
      additionalProperties: false,
      required: ["soleil_x", "soleil_y", "azimut", "elevation"],
      properties: {
        soleil_x: { type: "number" },
        soleil_y: { type: "number" },
        azimut: { type: "number" },
        elevation: { type: "number" },
      },
    },
    sujets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "bbox", "zone_ombres", "surface", "appui_y"],
        properties: {
          nom: { type: "string" },
          bbox: BOX,
          zone_ombres: BOX,
          surface: { type: "string", enum: ["ground", "water", "air"] },
          appui_y: { type: "number" },
        },
      },
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST attendu" });
  if (needKey(res, "ANTHROPIC_API_KEY")) return;
  const { image, sujets = [] } = req.body || {};
  const content = imageBlocks([image], 1);
  if (!content.length) return res.status(400).json({ error: "image manquante" });
  const liste = sujets.length ? sujets.map((s) => `- ${s.nom} : ${s.description}`).join("\n") : "(repère toi-même les 1 à 4 sujets principaux)";
  content.push({ type: "text", text: `Sujets à repérer :\n${liste}` });
  try {
    return res.status(200).json(await askJson({ system: SYSTEM, content, schema: SCHEMA, effort: "high" }));
  } catch (err) {
    return fail(res, err);
  }
}
