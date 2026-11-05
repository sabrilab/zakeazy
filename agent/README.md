# Zak Eazy Agent

Une page mobile (pensée pour le navigateur intégré d'Instagram) : on écrit une idée, ou on appuie
simplement sur le bouton, et l'agent compose une œuvre dans l'univers de Zak Eazy. Les générations
se mettent en file, chacune sur sa carte animée, et restent sur le téléphone.

Projet Vercel : `zak-eazy-agent` (équipe Downing), dossier racine `agent/`, sans étape de build.

## Comment ça marche

1. `POST /api/generate` : Claude (via la passerelle IA de Vercel) imagine l'œuvre à partir du prompt
   et de la grammaire de Zak (`api/_lib/zak.js`), puis répond tout de suite avec le titre.
2. L'image est produite en arrière-plan (`waitUntil`) : Higgsfield si ses clés sont là, sinon
   GPT Image via la passerelle. Elle est rangée dans Vercel Blob avec un petit fichier de statut.
3. `GET /api/status?ids=...` : le navigateur demande où en sont ses cartes.

Sans stockage Blob mais avec Higgsfield, l'identifiant de la génération est celui de Higgsfield, qui
garde l'image lui-même.

Aucune clé n'est envoyée au navigateur.

La passerelle IA de Vercel n'accepte les requêtes qu'une fois une carte bancaire enregistrée
sur l'équipe (ce qui débloque aussi ses crédits gratuits). Sans Claude, l'agent compose le prompt
lui-même à partir de la même grammaire.

## Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Ajoutée par Vercel quand on connecte un store Blob au projet. |
| `HF_API_KEY`, `HF_API_SECRET` | Clé de l'API Higgsfield (cloud.higgsfield.ai, API Keys). |
| `HF_MODEL` | Chemin (ou URL) de l'endpoint du modèle Higgsfield, tel que la console l'affiche. |
| `HF_PARAMS` | Facultatif : JSON ajouté au corps de la requête Higgsfield. |
| `AI_GATEWAY_API_KEY` | Facultatif : sur Vercel, le jeton OIDC du déploiement suffit. |
| `ANTHROPIC_API_KEY` | Facultatif : Claude en direct plutôt que par la passerelle. |
| `CLAUDE_MODEL`, `IMAGE_MODEL`, `IMAGE_QUALITY` | Facultatifs : modèles de la passerelle. |
| `DAILY_LIMIT` | Plafond d'œuvres par jour (80 par défaut, avec Blob). |
| `ACCESS_CODE` | Facultatif : exige `?code=...` dans le lien partagé. |
| `SELFTEST_TOKEN` | Temporaire : `/api/health?k=...&run=1` lance une génération de test. |

`GET /api/health` indique le moteur actif et si le stockage est prêt, sans rien exposer.
