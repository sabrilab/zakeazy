# Atelier Zak

Un assistant de création pour **Zak Eazy**, artiste de photomontage surréaliste sous
Photoshop. Il comprend son style (thèmes, palette pastel, composition, matières) et
prend en charge la partie la plus artisanale de son travail : **les ombres et
l'intégration lumineuse** des éléments rapportés. Il livre des calques Photoshop
éditables, pas des images aplaties.

![Démo synthétique : beffroi en contre-jour, orque immergée, maison flottante](docs/img/demo_apercu.jpg)

*Démo générée sans aucune photo (`examples/demo.py`) : ombre portée et ombre propre
du beffroi en contre-jour, immersion et reflet de l'orque, rayons, étalonnage pastel.*

## Documents

1. [Analyse du style](docs/01-analyse-style.md)
2. [Décomposition des tâches d'une œuvre](docs/02-taches-creation.md)
3. [Architecture et feuille de route](docs/03-architecture.md)
4. [ADN de style (YAML)](style/zak_style.yaml) : la « mémoire » de l'agent

## Installation

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...        # pour les commandes de l'agent
```

## Utilisation

```bash
# Assembler une scène (photo de fond + PNG détourés) en calques Photoshop
python -m zak compose examples/scene_exemple.yaml -o sortie/
#   -> sortie/apercu.png, calques PNG, construire_psd.jsx
#   Photoshop : Fichier > Scripts > Parcourir... > construire_psd.jsx

# Importer l'export Instagram de Zak (zip JSON) et mesurer son style
python -m zak corpus instagram-zakeazy.zip -o corpus/

# Agent Claude
python -m zak imaginer "Lille sous la mer au coucher du soleil" -n 5
python -m zak analyse photo_de_fond.jpg      # horizon, soleil, sol
python -m zak lire oeuvre_de_zak.jpg         # décompose une œuvre
python -m zak critique sortie/apercu.png     # relecture lumière / ombres

# Démo et tests
PYTHONPATH=. python examples/demo.py
python -m pytest
```

## Récupérer les œuvres Instagram de Zak

Sur Instagram : Paramètres › Espace Comptes › Vos informations et autorisations ›
Télécharger vos informations › format **JSON**, qualité **élevée**, contenu
« Publications ». Le .zip reçu se donne tel quel à `python -m zak corpus`.

## Version web

`web/` contient l'atelier en ligne (https://zakeazy.vercel.app) : le même moteur
d'ombres porté en JavaScript (Canvas 2D), en direct dans le navigateur, avec export
des calques et du script Photoshop. Site statique sans build ; en local :
`python -m http.server -d web`.

### Génération d'œuvres (zakeazy.vercel.app)

1. `api/plan` : Claude conçoit l'œuvre dans l'univers de Zak (prompt, inspirations ou hasard) et écrit le prompt d'une vraie photo.
2. `api/image` op `scene` : la scène entière est générée d'un bloc (lumière, eau, reflets cohérents).
3. `api/analyse` : Claude repère chaque sujet, la zone de ses ombres et la lumière.
4. `api/image` op `cutout` : chaque sujet est détouré (BiRefNet).
5. `api/image` op `fill` : le décor est reconstitué sous les sujets et leurs ombres.
6. Dans le navigateur : les vraies ombres et lumières sont extraites (photo ÷ décor → Produit, et Écran), en calques qui suivent leur sujet.

Variables Vercel : `ANTHROPIC_API_KEY`, `FAL_KEY` (option : `FAL_MODEL`, `FAL_FILL_MODEL`, `CLAUDE_MODEL`).
