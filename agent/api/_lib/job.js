// Une génération : Claude imagine l'œuvre (réponse immédiate au navigateur avec le titre),
// puis la photo est produite en arrière-plan et rangée dans Blob.
// Moteur : Higgsfield si ses clés sont présentes, sinon la passerelle IA de Vercel.

import { randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { GenError, gatewayToken, planArtwork, renderImage, sniff } from "./gateway.js";
import { higgsfieldReady, submit as hfSubmit, waitResult as hfWait } from "./higgsfield.js";
import { countDay, saveImage, saveResult, storeReady } from "./store.js";
import { tirage } from "./zak.js";

const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 80);
const BUDGET_MS = 285_000; // sous la durée max de la fonction (300 s)

export function cleanIdea(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

export function engine() {
  return higgsfieldReady() ? "higgsfield" : "gateway";
}

async function render({ token, prompt, deadline }) {
  if (higgsfieldReady()) {
    let sub = null;
    try {
      sub = await hfSubmit(prompt);
    } catch (err) {
      // Rien n'a été facturé : on se rabat sur la passerelle si elle est là.
      if (err.code === "policy" || !token) throw err;
      console.warn("higgsfield indisponible, repli sur la passerelle :", err.code, err.detail || "");
    }
    if (sub) {
      const buf = await hfWait(sub, { deadline });
      return { buf, ...sniff(buf), engine: "higgsfield" };
    }
  }
  return { ...(await renderImage({ token, prompt })), engine: "gateway" };
}

export async function startJob(req, idee) {
  const token = gatewayToken(req);
  if (!token && !higgsfieldReady())
    throw new GenError("Aucun moteur d'images n'est disponible sur ce déploiement.", { status: 503, code: "auth" });
  if (!storeReady()) {
    // Sans stockage, Higgsfield garde l'image : on renvoie directement son identifiant de requête.
    if (!higgsfieldReady()) throw new GenError("Le stockage des œuvres n'est pas configuré.", { status: 503, code: "store" });
    const plan = await planArtwork({ token, t: tirage(), idee });
    const sub = await hfSubmit(plan.prompt);
    return { id: `hf_${sub.request_id}`, titre: plan.titre, pitch: plan.pitch, mecanique: plan.mecanique, engine: "higgsfield" };
  }

  const day = new Date().toISOString().slice(0, 10);
  if ((await countDay(day)) >= DAILY_LIMIT)
    throw new GenError("La limite d'œuvres du jour est atteinte. Reviens demain !", { status: 429, code: "daily" });

  const startedAt = Date.now();
  const id = `${day}_${randomUUID()}`;
  const t = tirage();
  const plan = await planArtwork({ token, t, idee });

  waitUntil(
    (async () => {
      const meta = { id, idee, titre: plan.titre, pitch: plan.pitch, mecanique: plan.mecanique, prompt: plan.prompt, source: plan.source };
      try {
        const img = await render({ token, prompt: plan.prompt, deadline: startedAt + BUDGET_MS });
        const url = await saveImage(id, img);
        await saveResult(id, { ...meta, status: "done", url, engine: img.engine, size: img.size, ms: Date.now() - startedAt });
      } catch (err) {
        console.error("rendu :", err?.message, err?.detail || "");
        const e = err instanceof GenError ? err : new GenError("Le moteur d'images a eu un raté.");
        await saveResult(id, { ...meta, status: "failed", error: e.message, code: e.code, ms: Date.now() - startedAt }).catch((x) =>
          console.error("statut :", x?.message),
        );
      }
    })(),
  );

  return { id, titre: plan.titre, pitch: plan.pitch, mecanique: plan.mecanique, engine: engine() };
}

export function sendError(res, err) {
  const status = err instanceof GenError ? err.status : 500;
  const code = err instanceof GenError ? err.code : "server";
  if (!(err instanceof GenError)) console.error(err);
  return res.status(status).json({ error: err instanceof GenError ? err.message : "Erreur du serveur.", code });
}
