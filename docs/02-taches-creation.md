# 2. Décomposition des tâches d'une œuvre

Une œuvre = 7 à 20 h. Voici les tâches, ce qui les rend difficiles à déléguer, et ce
que l'outil peut prendre en charge. L'objectif n'est pas de remplacer le geste de Zak,
mais de lui rendre le temps qu'il passe sur les tâches mécaniques pour qu'il le passe
sur les décisions artistiques.

| # | Tâche | Part estimée *(hypothèse)* | Pourquoi c'est dur à déléguer | Ce que fait l'outil | Qui décide |
|---|---|---|---|---|---|
| 1 | **Idée** : choisir monument + mécanique + ambiance | 5 % | C'est sa signature | `zak imaginer` : propositions dans sa grammaire (6 mécaniques), à partir de son carnet d'idées | Zak |
| 2 | **Chercher « LA photo »** et les sources (animal, ciel, végétation) avec le bon angle et la bonne lumière | **25-30 %** (« la partie la plus longue ») | Il faut que perspective, focale et direction de lumière concordent entre sources | Pour chaque concept, Claude écrit les requêtes et les contraintes d'angle / lumière ; `zak analyse` vérifie qu'une photo candidate a la bonne lumière. *À venir* : recherche automatique en banque d'images + tri par compatibilité de lumière | Zak valide |
| 3 | **Lire la photo de fond** : horizon, point de fuite, direction et hauteur du soleil, plan du sol | 5 % | Se fait « à l'œil », source d'erreurs d'ombres plus tard | `zak analyse` (Claude vision) + `estimate_light` : chiffres réutilisés par le moteur d'ombres | Outil, Zak corrige |
| 4 | **Détourage** des éléments | 10-15 % | Fastidieux mais mécanique (cheveux, nageoires, plumes) | *À venir* : segmentation automatique (Sélectionner le sujet de Photoshop ou modèle de segmentation) | Outil |
| 5 | **Mise en place** : échelle, position, perspective | 5-10 % | Décision de composition | Positionnement par point d'appui (x, y) et échelle dans la scène YAML | Zak |
| 6 | **Harmonisation colorimétrique** des sources | 10 % | Chaque photo a sa balance des blancs | `match_to_plate` : dominante du décor, luminance de l'objet conservée | Outil |
| 7 | **Ombres** : portée, contact, propre, reflets, immersion | **15-20 %** (son point d'exigence) | Doit être cohérent pour TOUS les éléments avec UNE lumière ; pénombre progressive | Moteur d'ombres : 1 calque par effet, en Produit, éditable | Outil prépare, Zak retouche au pinceau |
| 8 | **Lumière d'intégration** : light wrap, rayons, brume | 5-10 % | Subtil, se dose à l'œil | `light_wrap`, `sun_rays`, `depth_haze` en calques séparés | Outil prépare, Zak dose l'opacité |
| 9 | **Étalonnage final** pastel + grain | 5 % | Sa signature colorimétrique | `pastel_grade` calé sur son corpus + grain unificateur | Zak valide |
| 10 | **Relecture critique** | continu | Repérer l'ombre qui ne va pas dans le bon sens | `zak critique` : Claude note cohérence lumière / ombres / style et propose des corrections précises | Zak |
| 11 | **Déclinaisons** (formats, versions client) | variable | Répétitif | *À venir* : recadrage 4:5 / 9:16 / 16:9 et extension de décor | Outil |

## Ce qu'on ne délègue pas

Le choix de l'idée, du lieu, de « LA photo », du cadrage et le dernier coup de pinceau.
L'outil livre toujours des **calques séparés et nommés** dans un vrai document Photoshop,
jamais une image aplatie : Zak garde la main et le plaisir de l'outil.

## Questions à poser à Zak

1. Combien de temps passe-t-il réellement sur chaque étape ci-dessus ? (pour corriger les %)
2. Peut-il partager 3 ou 4 PSD complets ? La structure de ses calques est la meilleure
   description de sa méthode d'ombres (modes, opacités, masques, ordre).
3. Où cherche-t-il ses sources (Unsplash, Pexels, Adobe Stock, ses photos) ?
4. Utilise-t-il déjà l'IA générative de Photoshop (il a travaillé sur Adobe Firefly) ?
5. Quelles étapes aime-t-il ? (à ne surtout pas automatiser)
