// Passerelle IA de Vercel (AI Gateway) : Claude pour imaginer l'œuvre, GPT Image pour la photo.
// Sur Vercel, l'authentification passe par le jeton OIDC du déploiement : aucune clé à gérer.
// Une clé AI_GATEWAY_API_KEY reste possible (prioritaire), par exemple pour le dev local.

import Anthropic from "@anthropic-ai/sdk";
import { SCHEMA, STYLE_LOCK, SYSTEM, demande, templatePrompt, templateTitle } from "./zak.js";

const BASE = "https://ai-gateway.vercel.sh";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "anthropic/claude-opus-5.5";
const CLAUDE_EFFORT = process.env.CLAUDE_EFFORT || "low";
const IMAGE_MODEL = process.env.IMAGE_MODEL || "openai/gpt-image-2";
const IMAGE_QUALITY = process.env.IMAGE_QUALITY || "high";

export function gatewayToken(req) {
  return (
    process.env.AI_GATEWAY_API_KEY ||
    req.headers["x-vercel-oidc-token"] ||
    process.env.VERCEL_OIDC_TOKEN ||
    null
  );
}

export class GenError extends Error {
  constructor(message, { status = 502, code = "upstream", detail = "" } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// Traduit une réponse d'erreur de la passerelle en message lisible par Zak.
function explain(status, text) {
  const t = (text || "").toLowerCase();
  if (t.includes("customer_verification_required") || t.includes("credit card"))
    return new GenError("La passerelle IA de Vercel attend une carte bancaire pour débloquer ses crédits.", { status: 402, code: "card", detail: text });
  if (status === 402 || t.includes("insufficient") || t.includes("credit") || t.includes("balance"))
    return new GenError("Les crédits IA sont épuisés pour le moment.", { status: 402, code: "credits", detail: text });
  if (status === 429)
    return new GenError("Trop d'œuvres en même temps : réessaie dans une minute.", { status: 429, code: "rate", detail: text });
  if (t.includes("safety") || t.includes("moderation") || t.includes("content_policy") || t.includes("policy"))
    return new GenError("Le modèle a refusé cette scène. Essaie une autre idée.", { status: 422, code: "policy", detail: text });
  if (status === 401 || status === 403)
    return new GenError("La passerelle IA refuse l'accès à ce déploiement.", { status: 503, code: "auth", detail: text });
  return new GenError("Le moteur d'images a eu un raté.", { status: 502, code: "upstream", detail: text });
}

// --- Claude : le directeur artistique -------------------------------------------------

function parseJson(text) {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("pas de JSON");
  return JSON.parse(text.slice(a, b + 1));
}

function valid(plan) {
  return (
    plan &&
    typeof plan.titre === "string" && plan.titre.trim() &&
    typeof plan.scene_prompt === "string" && plan.scene_prompt.length > 40
  );
}

// Claude en direct si ANTHROPIC_API_KEY est défini, sinon via la passerelle.
function claude(token) {
  if (process.env.ANTHROPIC_API_KEY)
    return { client: new Anthropic({ maxRetries: 1 }), model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5" };
  if (token) return { client: new Anthropic({ apiKey: token, baseURL: BASE, maxRetries: 1 }), model: CLAUDE_MODEL };
  return null;
}

async function askClaude(token, t, idee, signal) {
  const c = claude(token);
  if (!c) throw new Error("aucun accès à Claude");
  const { client } = c;
  const base = {
    model: c.model,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: demande(t, idee) }],
  };
  let response;
  try {
    response = await client.messages.create(
      { ...base, output_config: { effort: CLAUDE_EFFORT, format: { type: "json_schema", schema: SCHEMA } } },
      { signal },
    );
  } catch (err) {
    // Si la passerelle ne relaie pas output_config, on redemande en JSON libre.
    if (!(err instanceof Anthropic.BadRequestError)) throw err;
    response = await client.messages.create(
      { ...base, system: `${SYSTEM}\n\nRéponds uniquement par un objet JSON {titre, pitch, mecanique, scene_prompt}.` },
      { signal },
    );
  }
  if (response.stop_reason === "refusal") throw new Error("refus");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const plan = parseJson(text);
  if (!valid(plan)) throw new Error("plan incomplet");
  return plan;
}

// Toujours une œuvre : si Claude ne répond pas à temps, on compose le prompt nous-mêmes.
export async function planArtwork({ token, t, idee }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const plan = await askClaude(token, t, idee, ctrl.signal);
    return {
      titre: plan.titre.trim().slice(0, 60),
      pitch: String(plan.pitch || "").trim().slice(0, 240),
      mecanique: plan.mecanique || t.mecanique,
      prompt: `${plan.scene_prompt.trim()}\n\n${STYLE_LOCK}`,
      source: "claude",
    };
  } catch (err) {
    console.warn("plan: repli sur le modèle de prompt :", err?.message || err);
    return {
      titre: idee ? idee.slice(0, 40) : templateTitle(t),
      pitch: idee ? "" : `${t.lieu.fr[0].toUpperCase()}${t.lieu.fr.slice(1)}, ${t.faune.fr}, ${t.ambiance.fr}.`,
      mecanique: t.mecanique,
      prompt: templatePrompt(t, idee),
      source: "modele",
    };
  } finally {
    clearTimeout(timer);
  }
}

// --- GPT Image : la photographie ------------------------------------------------------

export function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return { type: "image/jpeg", ext: "jpg" };
  if (buf[0] === 0x89 && buf[1] === 0x50) return { type: "image/png", ext: "png" };
  if (buf.slice(8, 12).toString() === "WEBP") return { type: "image/webp", ext: "webp" };
  return { type: "image/jpeg", ext: "jpg" };
}

// Du plus précis au plus simple : si la passerelle refuse un paramètre (400), on retire.
function attempts(prompt) {
  const openai = { quality: IMAGE_QUALITY, output_format: "jpeg", output_compression: 92, moderation: "low" };
  return [
    { model: IMAGE_MODEL, prompt, n: 1, size: "1088x1360", quality: IMAGE_QUALITY, providerOptions: { openai } },
    { model: IMAGE_MODEL, prompt, n: 1, size: "1024x1536", providerOptions: { openai } },
    { model: IMAGE_MODEL, prompt, n: 1, size: "1024x1536" },
  ];
}

export async function renderImage({ token, prompt }) {
  let last;
  for (const body of attempts(prompt)) {
    const r = await fetch(`${BASE}/v1/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (r.ok) {
      const item = JSON.parse(text)?.data?.[0];
      if (item?.b64_json) {
        const buf = Buffer.from(item.b64_json, "base64");
        return { buf, ...sniff(buf), size: body.size };
      }
      if (item?.url) {
        const img = await fetch(item.url);
        if (!img.ok) throw new GenError("Image générée introuvable.", { detail: `${img.status}` });
        const buf = Buffer.from(await img.arrayBuffer());
        return { buf, ...sniff(buf), size: body.size };
      }
      throw new GenError("Le moteur d'images n'a rien renvoyé.", { detail: text.slice(0, 300) });
    }
    console.warn(`image: ${r.status} (${body.size}) ${text.slice(0, 400)}`);
    last = explain(r.status, text.slice(0, 600));
    if (r.status !== 400 || last.code === "policy") throw last;
  }
  throw last;
}

export async function credits(token) {
  const r = await fetch(`${BASE}/v1/credits`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 300) };
}

// Test minimal de la passerelle (texte seulement), pour /api/health?k=...&probe=1.
export async function probeClaude(token) {
  const c = claude(token);
  if (!c) return { ok: false, error: "aucun accès à Claude" };
  try {
    const r = await c.client.messages.create({ model: c.model, max_tokens: 16, messages: [{ role: "user", content: "Réponds juste : ok" }] });
    return { ok: true, via: process.env.ANTHROPIC_API_KEY ? "anthropic" : "gateway", text: r.content.filter((b) => b.type === "text").map((b) => b.text).join("").slice(0, 40) };
  } catch (err) {
    return { ok: false, status: err?.status || null, error: String(err?.message || err).slice(0, 300) };
  }
}

export const CONFIG = { CLAUDE_MODEL, CLAUDE_EFFORT, IMAGE_MODEL, IMAGE_QUALITY };
