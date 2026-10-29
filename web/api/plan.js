// Directeur artistique : Claude imagine une œuvre dans l'univers de Zak et la
// découpe en calques (un décor + des éléments à générer ou fournis), avec la
// lumière que le moteur d'ombres utilisera.
// Variable d'environnement : ANTHROPIC_API_KEY.

import Anthropic from "@anthropic-ai/sdk";
import { STYLE_YAML } from "./_style.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const SYSTEM = `Tu es le directeur artistique de Zak Eazy, artiste français de photomontage
surréaliste sous Photoshop. Tu conçois une œuvre dans son univers EXACT (ADN ci-dessous)
et tu la découpes en calques pour un pipeline : un modèle d'image génère séparément le
décor puis chaque élément, les éléments sont détourés automatiquement, puis un moteur
ajoute ombres portées, ombres de contact, reflets, rayons et étalonnage pastel.

Règles pour que le résultat ait la qualité de Zak :
- Une idée forte et lisible : un lieu ou monument reconnaissable + une mécanique surréaliste.
- Le DÉCOR est une photographie réaliste, vide des éléments rapportés, avec une perspective
  claire (horizon, sol ou eau où poser les éléments) et le soleil visible ou évident.
  Format portrait 4:5. Pas de texte, pas de cadre.
- Chaque ÉLÉMENT est un sujet unique, entier, photoréaliste, isolé sur fond uni gris clair,
  sans ombre portée au sol (le moteur la fera), éclairé depuis la MÊME direction que le
  soleil du décor (précise-le dans le prompt : "lit from the left", "backlit", etc.).
- 1 à 4 éléments. Pense profondeur : un élément proche, un moyen, un lointain.
- Prompts d'image en anglais, précis sur la matière, l'angle de vue (cohérent avec
  l'horizon du décor) et la lumière dorée pastel. Le reste en français.
- Coordonnées en fractions 0-1 de l'image (origine en haut à gauche). y d'un élément =
  sa ligne d'appui (sol, ligne d'eau, ou sol sous lui s'il vole). Les éléments au sol ou
  dans l'eau ont y > horizon_y. hauteur = hauteur de l'élément en fraction de l'image.
- Lumière : azimut = d'où vient la lumière (0 droite, 90 contre-jour depuis le fond,
  180 gauche, 270 depuis le spectateur) ; elevation en degrés.
- Si des ressources (PNG fournis par Zak) sont listées, utilise-les quand elles servent
  l'idée : mets leur nom exact dans "ressource" et laisse "prompt" vide.
- Si des images d'inspiration sont jointes, reprends-en l'esprit (lieu, palette,
  composition) sans les copier.

ADN de style de Zak (YAML) :
${STYLE_YAML}`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titre", "pitch", "mecanique", "ambiance", "palette", "horizon_y", "lumiere", "decor", "elements"],
  properties: {
    titre: { type: "string" },
    pitch: { type: "string", description: "1-2 phrases, en français" },
    mecanique: { type: "string", enum: ["deplacement", "immersion", "elevation", "echelle", "cadre", "metamorphose"] },
    ambiance: { type: "string" },
    palette: { type: "array", items: { type: "string" } },
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
    decor: {
      type: "object",
      additionalProperties: false,
      required: ["prompt", "description"],
      properties: { prompt: { type: "string" }, description: { type: "string" } },
    },
    elements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "prompt", "ressource", "surface", "x", "y", "hauteur", "altitude"],
        properties: {
          nom: { type: "string" },
          prompt: { type: "string" },
          ressource: { type: "string", description: "nom exact d'une ressource fournie, sinon chaîne vide" },
          surface: { type: "string", enum: ["ground", "water", "air"] },
          x: { type: "number" },
          y: { type: "number" },
          hauteur: { type: "number" },
          altitude: { type: "number", description: "fraction de hauteur au-dessus du sol si surface=air, sinon 0" },
        },
      },
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST attendu" });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "ANTHROPIC_API_KEY manquante dans les variables d'environnement Vercel." });
  }
  const { prompt = "", inspirations = [], ressources = [], hasard = null } = req.body || {};

  const content = [];
  for (const dataUrl of inspirations.slice(0, 6)) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  let ask = prompt.trim()
    ? `Demande : ${prompt.trim()}`
    : "Pas de demande précise : surprends-moi avec une œuvre inédite, forte et typique de Zak.";
  if (hasard) ask += `\nContraintes tirées au sort (à respecter) : ${hasard}`;
  if (inspirations.length) ask += `\n${inspirations.length} image(s) d'inspiration jointe(s).`;
  if (ressources.length) ask += `\nRessources disponibles (PNG détourés) : ${ressources.map((r) => `"${r}"`).join(", ")}.`;
  content.push({ type: "text", text: ask });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      // En cas de refus d'un classifieur, l'API relance sur un autre modèle.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "Demande refusée par le modèle.", details: response.stop_details });
    }
    const text = response.content.find((b) => b.type === "text")?.text;
    return res.status(200).json(JSON.parse(text));
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status || 502 : 500;
    return res.status(status).json({ error: err.message });
  }
}
