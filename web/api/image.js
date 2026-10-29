// Opérations d'image via fal.ai :
//   op "scene"  : génère la photographie complète (FLUX)
//   op "cutout" : détoure le sujet principal d'un recadrage (BiRefNet)
//   op "fill"   : reconstitue le décor sous un masque (FLUX Fill)
// Variables d'environnement : FAL_KEY, FAL_MODEL et FAL_FILL_MODEL (optionnelles).
// Les images sont renvoyées en data URL pour rester exploitables dans le
// canevas (pas de souci de CORS à l'export des calques).

import { needKey } from "./_claude.js";

// v1.1 en 1088x1360 : JPEG d'environ 0,5 Mo, sous la limite de réponse Vercel (4,5 Mo).
const MODEL = process.env.FAL_MODEL || "fal-ai/flux-pro/v1.1";
const FILL_MODEL = process.env.FAL_FILL_MODEL || "fal-ai/flux-pro/v1/fill";

async function fal(endpoint, body) {
  const r = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`fal.ai ${endpoint} : ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function toDataUrl(url) {
  if (url.startsWith("data:")) return url;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`téléchargement impossible : ${r.status}`);
  const type = r.headers.get("content-type") || "image/png";
  return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
}

const OPS = {
  async scene({ prompt, seed }) {
    const out = await fal(MODEL, {
      prompt,
      image_size: { width: 1088, height: 1360 },
      num_images: 1,
      output_format: "jpeg",
      safety_tolerance: "2",
      ...(seed != null ? { seed } : {}),
    });
    return out.images[0].url;
  },
  async cutout({ image }) {
    const out = await fal("fal-ai/birefnet", { image_url: image, output_format: "png" });
    return out.image.url;
  },
  async fill({ image, mask, prompt }) {
    const out = await fal(FILL_MODEL, {
      image_url: image,
      mask_url: mask,
      prompt: prompt || "empty background, same scene and lighting, nothing in the masked area",
      output_format: "jpeg",
      safety_tolerance: "2",
    });
    return out.images[0].url;
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST attendu" });
  if (needKey(res, "FAL_KEY")) return;
  const body = req.body || {};
  const op = OPS[body.op];
  if (!op) return res.status(400).json({ error: `op inconnue : ${body.op}` });
  try {
    return res.status(200).json({ image: await toDataUrl(await op(body)) });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
