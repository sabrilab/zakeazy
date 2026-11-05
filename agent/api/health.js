// GET /api/health : état de la configuration (sans jamais exposer de secret).
// Avec ?k=<SELFTEST_TOKEN> (variable facultative, à supprimer après les tests) : solde de la
// passerelle IA, et &run=1 lance une vraie génération pour un test de bout en bout.

import { timingSafeEqual } from "node:crypto";
import { CONFIG, credits, gatewayToken, probeClaude } from "./_lib/gateway.js";
import { cleanIdea, engine, sendError, startJob } from "./_lib/job.js";
import { higgsfieldKey, higgsfieldModel } from "./_lib/higgsfield.js";
import { storeReady } from "./_lib/store.js";

function selftest(req) {
  const want = process.env.SELFTEST_TOKEN;
  if (!want || !req.query.k) return false;
  const a = Buffer.from(String(req.query.k));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = gatewayToken(req);
  const hf = engine() === "higgsfield";
  const out = { ok: (Boolean(token) || hf) && (storeReady() || hf), engine: engine(), gateway: Boolean(token), store: storeReady() };
  if (!selftest(req)) return res.status(200).json(out);

  out.config = { ...CONFIG, HF_KEY: Boolean(higgsfieldKey()), HF_MODEL: higgsfieldModel() };
  out.auth = process.env.AI_GATEWAY_API_KEY ? "api-key" : req.headers["x-vercel-oidc-token"] ? "oidc-header" : process.env.VERCEL_OIDC_TOKEN ? "oidc-env" : "none";
  if (token) out.credits = await credits(token).catch((e) => ({ error: e.message }));
  if (req.query.probe === "1") out.claude = await probeClaude(token);
  if (req.query.run === "1") {
    try {
      out.job = await startJob(req, cleanIdea(req.query.idee));
    } catch (err) {
      return sendError(res, err);
    }
  }
  return res.status(200).json(out);
}
