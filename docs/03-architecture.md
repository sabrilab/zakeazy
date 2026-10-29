# 3. Architecture de l'Atelier Zak

## Principe

**Photoshop reste l'atelier.** L'agent est un assistant qui comprend le style de Zak
et prépare les calques fastidieux ; il ne livre jamais une image aplatie.

```
                ┌──────────────────────────────────────────────┐
                │  ADN de style  (style/zak_style.yaml)        │
                │  thèmes · 6 mécaniques · palette · règles    │
                │  d'ombres · composition · matières           │
                └───────────────┬──────────────────────────────┘
                                │ recalé par
   Export Instagram ──► Corpus (zak/corpus.py) : mesures palette / luminance / lumière
                                │                 + lecture Claude de chaque œuvre
                                ▼
 ┌─────────────── Agent Claude (zak/agent.py) ───────────────┐
 │ imaginer  → concepts + requêtes de sources « LA photo »   │
 │ analyse   → horizon, soleil (azimut/élévation), sol       │
 │ lire      → décompose une œuvre existante                 │
 │ critique  → notes lumière/ombres/style + corrections      │
 └───────────────┬───────────────────────────────────────────┘
                 │ chiffres (lumière, perspective)
                 ▼
 ┌─────────── Moteur d'image (numpy) ────────────────────────┐
 │ shadows.py   ombre portée · contact · propre · reflet ·   │
 │              immersion · light wrap                       │
 │ color.py     harmonisation Lab · étalonnage pastel ·      │
 │              palette · estimation du soleil               │
 │ atmosphere.py rayons de soleil · grain                    │
 │ compose.py   scène YAML → pile de calques                 │
 └───────────────┬───────────────────────────────────────────┘
                 ▼
 photoshop.py → calques PNG + manifest.json + construire_psd.jsx
                 ▼
         Photoshop : document en calques nommés, groupés,
         modes de fusion réglés → Zak retouche
```

## Convention de lumière

Partagée par l'agent et le moteur : **azimut** = d'où vient la lumière (0° droite,
90° derrière la scène / contre-jour, 180° gauche, 270° devant), **élévation** = hauteur
du soleil. Claude mesure, le moteur projette : c'est ce qui garantit que toutes les
ombres d'une image vont dans le même sens.

## Pile de calques produite (par élément)

| Calque | Mode | Rôle |
|---|---|---|
| `X · ombre portée` | Produit | projection sur le sol, pénombre croissante, teinte violette |
| `X · ombre de contact` | Produit | occlusion sous les appuis |
| `X · reflet` (eau) | Normal | reflet inversé et ondulé |
| `X` | Normal | élément harmonisé (et immergé s'il est dans l'eau) |
| `X · ombre propre` | Produit | face opposée au soleil |
| `X · light wrap` | Écran | lumière du décor sur les bords |

Puis `Rayons de soleil` (Écran), `Grain` (Incrustation) et `Étalonnage pastel (repère)`
masqué.

## Feuille de route

| Étape | Contenu | Statut |
|---|---|---|
| v0.1 | ADN de style, moteur d'ombres, harmonisation, export Photoshop, agent Claude, import Instagram | **ce prototype** |
| v0.2 | Recalage de l'ADN sur le corpus réel ; lecture Claude de toutes ses œuvres ; tests avec de vraies photos | attend l'export Instagram |
| v0.3 | Détourage automatique ; recherche de sources en banque d'images triées par compatibilité de lumière | |
| v0.4 | **Plugin Photoshop UXP** : panneau dans Photoshop qui appelle l'agent, lit le document ouvert et crée les calques d'ombres / de réglage directement (vrais calques de réglage Courbes / Balance des couleurs) | |
| v0.5 | Apprentissage des réglages de Zak : chaque retouche qu'il fait sur un calque généré ajuste les paramètres par défaut | |

## Choix techniques

- **Python + numpy + Pillow** pour le moteur : léger, testable, portable vers un serveur
  appelé par le futur plugin.
- **Claude (`claude-opus-5-5`)** avec sorties structurées (Pydantic) : la vision mesure
  lumière et perspective, le texte raisonne dans la grammaire de Zak. L'ADN de style est
  le prompt système (mis en cache). Repli automatique côté serveur en cas de refus.
- **Export JSX** plutôt qu'un writer PSD maison : Photoshop construit lui-même un vrai
  document, groupes et modes de fusion compris. *Non testé dans Photoshop à ce stade.*
