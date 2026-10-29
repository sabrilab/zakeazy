// Génération d'une image (décor ou élément) puis, pour un élément, détourage.
// Fournisseur : fal.ai (FLUX pour générer, BiRefNet pour détourer).
// Variables d'environnement : FAL_KEY, FAL_MODEL (optionnelle).
// L'image est renvoyée en data URL pour rester utilisable dans le canevas
// (pas de souci de CORS à l'export des calques).

const MODEL = process.env.FAL_MODEL || "fal-ai/flux-pro/v1.1";

async function fal(endpoint, body) {
  const r = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`fal.ai ${endpoint} : ${r.status} ${await r.text()}`);
  return r.json();
}

async function toDataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`téléchargement impossible : ${r.status}`);
  const type = r.headers.get("content-type") || "image/png";
  return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST attendu" });
  if (!process.env.FAL_KEY) {
    return res.status(503).json({ error: "FAL_KEY manquante dans les variables d'environnement Vercel." });
  }
  const { prompt, kind = "decor", seed } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "prompt manquant" });
  try {
    const element = kind === "element";
    const gen = await fal(MODEL, {
      prompt,
      image_size: element ? { width: 1024, height: 1024 } : { width: 1088, height: 1360 },
      num_images: 1,
      output_format: element ? "png" : "jpeg",
      safety_tolerance: "2",
      ...(seed != null ? { seed } : {}),
    });
    let url = gen.images[0].url;
    if (element) {
      const cut = await fal("fal-ai/birefnet", { image_url: url, output_format: "png" });
      url = cut.image.url;
    }
    return res.status(200).json({ image: await toDataUrl(url) });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
