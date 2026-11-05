// Higgsfield Cloud API (https://api.higgsfield.ai) : utilisé à la place de la passerelle Vercel
// dès que HF_API_KEY et HF_API_SECRET (ou HF_KEY = "id:secret") sont définis.
//   POST {base}/{HF_MODEL}           -> { request_id, status_url, cancel_url }
//   GET  {base}/requests/{id}/status -> { status: queued|in_progress|completed|failed|nsfw|canceled, images: [{url}] }
// HF_MODEL : chemin de l'endpoint du modèle, tel qu'affiché sur sa page dans la console Higgsfield.
// HF_PARAMS (facultatif) : JSON fusionné dans le corps de la requête (ex. {"quality":"high"}).

import { GenError } from "./gateway.js";

const BASE = (process.env.HF_BASE_URL || "https://api.higgsfield.ai").replace(/\/+$/, "");

export function higgsfieldKey() {
  if (process.env.HF_KEY) return process.env.HF_KEY;
  if (process.env.HF_API_KEY && process.env.HF_API_SECRET) return `${process.env.HF_API_KEY}:${process.env.HF_API_SECRET}`;
  return null;
}

export function higgsfieldModel() {
  const raw = (process.env.HF_MODEL || "").trim();
  if (!raw) return null;
  // Accepte l'URL complète copiée depuis la console ou le seul chemin.
  return raw.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "").replace(/\?.*$/, "");
}

export const higgsfieldReady = () => Boolean(higgsfieldKey() && higgsfieldModel());

function extraParams() {
  try {
    return process.env.HF_PARAMS ? JSON.parse(process.env.HF_PARAMS) : {};
  } catch {
    console.warn("HF_PARAMS n'est pas un JSON valide : ignoré");
    return {};
  }
}

async function call(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Key ${higgsfieldKey()}`, "Content-Type": "application/json", "User-Agent": "zak-eazy-agent/1.0" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { ok: r.ok, status: r.status, data, text };
}

function explain(status, text) {
  const t = (text || "").toLowerCase();
  if (status === 401 || status === 403) return new GenError("La clé Higgsfield est refusée.", { status: 503, code: "hf-auth", detail: text });
  if (status === 402 || t.includes("credit") || t.includes("balance") || t.includes("insufficient"))
    return new GenError("Le solde Higgsfield est épuisé.", { status: 402, code: "hf-credits", detail: text });
  if (status === 404) return new GenError("Modèle Higgsfield introuvable (HF_MODEL).", { status: 503, code: "hf-model", detail: text });
  if (status === 429) return new GenError("Higgsfield est saturé : réessaie dans une minute.", { status: 429, code: "rate", detail: text });
  return new GenError("Higgsfield a eu un raté.", { status: 502, code: "hf-upstream", detail: text });
}

// Soumet la génération. Les erreurs levées ici surviennent AVANT toute facturation :
// l'appelant peut alors se replier sur la passerelle Vercel.
export async function submit(prompt) {
  const model = higgsfieldModel();
  const bodies = [
    { prompt, aspect_ratio: "4:5", quality: "high", resolution: "2K", ...extraParams() },
    { prompt, aspect_ratio: "4:5", ...extraParams() },
  ];
  let last;
  for (const body of bodies) {
    const r = await call("POST", `${BASE}/${model}`, body);
    if (r.ok && r.data?.request_id) return r.data;
    console.warn(`higgsfield submit ${r.status}: ${r.text.slice(0, 400)}`);
    last = explain(r.status, r.text.slice(0, 600));
    if (r.status !== 400 && r.status !== 422) throw last;
  }
  throw last;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const imageOf = (d) => d?.images?.[0]?.url || d?.image?.url || d?.output?.[0]?.url || null;

export const HF_ID_RE = /^hf_([A-Za-z0-9-]{8,64})$/;

// Sans stockage Blob, l'identifiant public d'une génération est celui de Higgsfield, qui garde
// lui-même l'image : on lui demande simplement où en est la requête.
export async function requestStatus(requestId) {
  const r = await call("GET", `${BASE}/requests/${encodeURIComponent(requestId)}/status`);
  if (!r.ok) {
    if (r.status >= 500 || r.status === 429) return { status: "running" };
    const e = explain(r.status, r.text.slice(0, 300));
    return { status: "failed", error: e.message, code: e.code };
  }
  const s = r.data?.status;
  if (s === "completed") {
    const url = imageOf(r.data);
    return url ? { status: "done", url } : { status: "failed", error: "Higgsfield n'a renvoyé aucune image.", code: "hf-failed" };
  }
  if (s === "nsfw") return { status: "failed", error: "Le modèle a refusé cette scène. Essaie une autre idée.", code: "policy" };
  if (s === "failed" || s === "canceled") return { status: "failed", error: "Higgsfield a abandonné cette génération.", code: "hf-failed" };
  return { status: "running" };
}

export async function waitResult(job, { deadline }) {
  const url = job.status_url || `${BASE}/requests/${job.request_id}/status`;
  let delay = 4000;
  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(delay + 1000, 6000);
    const r = await call("GET", url);
    if (!r.ok) {
      if (r.status >= 500 || r.status === 429) continue;
      throw explain(r.status, r.text.slice(0, 600));
    }
    const s = r.data?.status;
    if (s === "completed") {
      const img = imageOf(r.data);
      if (!img) throw new GenError("Higgsfield n'a renvoyé aucune image.", { detail: r.text.slice(0, 300) });
      const file = await fetch(img);
      if (!file.ok) throw new GenError("Image Higgsfield introuvable.", { detail: `${file.status}` });
      return Buffer.from(await file.arrayBuffer());
    }
    if (s === "nsfw") throw new GenError("Le modèle a refusé cette scène. Essaie une autre idée.", { status: 422, code: "policy" });
    if (s === "failed" || s === "canceled") throw new GenError("Higgsfield a abandonné cette génération.", { code: "hf-failed", detail: r.text.slice(0, 300) });
  }
  throw new GenError("La génération a pris trop de temps.", { code: "timeout" });
}
