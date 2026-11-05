// POST /api/generate  { idee?: string }  ->  202 { id, titre, pitch, mecanique }
// L'image arrive ensuite via GET /api/status?ids=<id>.

import { timingSafeEqual } from "node:crypto";
import { cleanIdea, sendError, startJob } from "./_lib/job.js";

function allowed(req) {
  const code = process.env.ACCESS_CODE;
  if (!code) return true;
  const given = Buffer.from(String(req.headers["x-zak-code"] || ""));
  const want = Buffer.from(code);
  return given.length === want.length && timingSafeEqual(given, want);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST attendu.", code: "method" });
  }
  if (!allowed(req)) return res.status(401).json({ error: "Lien d'accès invalide.", code: "access" });
  try {
    const job = await startJob(req, cleanIdea(req.body?.idee));
    return res.status(202).json(job);
  } catch (err) {
    return sendError(res, err);
  }
}
