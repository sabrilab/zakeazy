// Appel Claude commun aux routes : sortie JSON structurée + repli serveur.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

export function imageBlocks(dataUrls, max = 6) {
  const out = [];
  for (const d of dataUrls.slice(0, max)) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d || "");
    if (m) out.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  return out;
}

export async function askJson({ system, content, schema, effort = "medium" }) {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort, format: { type: "json_schema", schema } },
    // En cas de refus d'un classifieur, l'API relance sur un autre modèle.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") {
    const err = new Error("Demande refusée par le modèle.");
    err.status = 422;
    throw err;
  }
  return JSON.parse(response.content.find((b) => b.type === "text").text);
}

export function fail(res, err) {
  const status = err instanceof Anthropic.APIError ? err.status || 502 : err.status || 500;
  return res.status(status).json({ error: err.message });
}

export function needKey(res, name) {
  if (process.env[name]) return false;
  res.status(503).json({ error: `${name} manquante dans les variables d'environnement Vercel.` });
  return true;
}
