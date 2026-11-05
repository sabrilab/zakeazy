// Stockage des œuvres dans Vercel Blob : chaque génération survit à la fermeture de la page
// (le navigateur intégré d'Instagram se ferme souvent en cours de route).
//   jobs/<jour>/<uuid>.jpg (ou .png)  l'œuvre terminée
//   jobs/<jour>/<uuid>.json           écrit en dernier : statut, titre, prompt, url de l'image
// Tant que le .json n'existe pas, la génération est en cours. L'identifiant public d'une
// génération est "<jour>_<uuid>" : imprévisible, il sert aussi de lien vers l'œuvre.

import { BlobNotFoundError, head, list, put } from "@vercel/blob";

export const ID_RE = /^(\d{4}-\d{2}-\d{2})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function storeReady() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function base(id) {
  const m = ID_RE.exec(id);
  if (!m) throw new Error("identifiant invalide");
  return `jobs/${m[1]}/${m[2]}`;
}

const opts = (contentType) => ({
  access: "public",
  contentType,
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 31536000,
});

export async function saveImage(id, { buf, type, ext }) {
  const blob = await put(`${base(id)}.${ext}`, buf, opts(type));
  return blob.url;
}

// Le fichier de statut est écrit une seule fois, à la fin (succès ou échec).
export async function saveResult(id, result) {
  await put(`${base(id)}.json`, JSON.stringify(result), opts("application/json"));
}

export async function jobStatus(id) {
  let meta;
  try {
    meta = await head(`${base(id)}.json`);
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { status: "running" };
    throw err;
  }
  const r = await fetch(meta.url);
  if (!r.ok) return { status: "running" };
  const data = await r.json();
  if (data.status === "done" && data.url) return { status: "done", url: data.url };
  return { status: "failed", error: data.error || "Échec de la génération.", code: data.code || "upstream" };
}

// Nombre de générations terminées (ou échouées) un jour donné, pour le plafond quotidien.
export async function countDay(day) {
  let n = 0;
  let cursor;
  do {
    const page = await list({ prefix: `jobs/${day}/`, cursor, limit: 1000 });
    n += page.blobs.filter((b) => b.pathname.endsWith(".json")).length;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return n;
}
