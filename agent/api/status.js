// GET /api/status?ids=<id>,<id>  ->  { jobs: { <id>: { status: running|done|failed, url?, error? } } }

import { HF_ID_RE, requestStatus } from "./_lib/higgsfield.js";
import { ID_RE, jobStatus } from "./_lib/store.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "GET attendu." });
  const ids = String(req.query.ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ID_RE.test(s) || HF_ID_RE.test(s))
    .slice(0, 12);
  if (!ids.length) return res.status(400).json({ error: "ids manquants." });
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const hf = HF_ID_RE.exec(id);
        return [id, hf ? await requestStatus(hf[1]) : await jobStatus(id)];
      } catch (err) {
        console.error("status :", id, err?.message);
        return [id, { status: "running" }];
      }
    }),
  );
  return res.status(200).json({ jobs: Object.fromEntries(entries) });
}
