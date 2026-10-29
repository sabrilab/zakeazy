# 1. Analyse du style de Zak Eazy

> Version 0.1, construite uniquement à partir de sources publiques (interviews et
> articles 2020-2025). Les images elles-mêmes n'ont pas encore été analysées :
> dès que l'export Instagram de Zak sera disponible, `python -m zak corpus` mesurera
> palettes, luminances et directions de lumière sur toutes ses œuvres, et
> `python -m zak lire` décomposera chaque image. Les points marqués *(hypothèse)*
> sont à confirmer avec Zak.

## Qui il est

Zakarya « Zak Eazy », né à Roubaix, basé à Lille. Bac architecture puis études
d'art, autodidacte de Photoshop (tutos YouTube), photomontage depuis l'âge de 12 ans.
Chef de projet graphique à Paris pendant 3-4 ans, puis freelance. Publie depuis 2019,
représenté par Cosmopola. Clients : Adobe (série *Photoshop Stories FR*, Adobe MAX,
Firefly), Audi, Volkswagen, Perrier, Decathlon, Chris Brown (*The Auracles*),
Auraskypool. Expositions : *Need Some Break* (Transphotographiques 2021, Lille),
Hôtel Barrière Lille (2025). Devise : « La tête dans les nuages, les pieds sur terre ».

## Thèmes

| Axe | Ce qu'on observe | Exemples cités |
|---|---|---|
| Architecture | Le monument reconnaissable est presque toujours le point focal. Il « adore l'architecture ». | Beffroi, Vieille Bourse, Opéra, Grand Place, Chambre de Commerce, Carlton (Lille) ; Burj Al Arab, Burj Khalifa, Dubai Frame, Atlantis (Dubaï) ; Tour Eiffel, Big Ben, Taj Mahal, Opéra de Sydney, Pise, Moaï |
| Nature | Sa « principale source d'inspiration » : mer, falaises, jungle, nuages, couchers de soleil | Rocher de Khao Phing Kan, *Lille-Tropical* |
| Faune déplacée | Animaux hors de leur milieu, souvent marins | Orques autour du beffroi, pieuvre géante sur la Chambre de Commerce, dauphins (*New Wave*), flamants roses (*Flamingo*) |
| Voyage | Montrer sa région en « voyageant d'un pays à un autre » | *Need Some Break* : le beffroi de Lille posé en Thaïlande |
| Intention | Voir le quotidien « sous un autre angle », provoquer « curiosité et questionnement », lecture ouverte « du féerique à l'apocalyptique » | |

### Les six mécaniques surréalistes

Elles servent de grammaire à l'agent (`mecanique` dans les schémas Claude) :

1. **Déplacement** : un monument familier transporté dans un paysage lointain.
2. **Immersion** : la ville envahie par l'eau ou la jungle, la faune nage entre les bâtiments.
3. **Élévation** : monument posé sur un nuage, flottant dans le ciel.
4. **Échelle** : animal ou objet à une taille impossible.
5. **Cadre** : un élément sert de fenêtre entre deux mondes (Dubai Frame, ancien / nouveau Dubaï).
6. **Métamorphose** : un objet du quotidien se transforme (panier de basket → nuage de fleurs).

## Colorimétrie

- **Pastel, doux, lumineux.** Tous les articles le relèvent ; Zak attribue cette palette
  à l'influence de **Miyazaki**. Il dit être passé de tons sombres à ses débuts à des tons clairs.
- *(hypothèse)* Heure dorée / coucher de soleil dominant : ciels bleu lavande → pêche,
  eaux turquoise laiteux, pierre crème.
- *(hypothèse)* **Pas de noir pur** : point noir relevé, ombres teintées (violet / bleu-gris)
  plutôt que neutres.
- Paramètres de départ dans [`style/zak_style.yaml`](../style/zak_style.yaml)
  (`colorimetrie.etalonnage`), à recaler sur le corpus.

## Lumière et ombres (le cœur du problème)

Citation clé (Transphotographiques 2021) : il prend un **« grand soin des ombres des
animaux, des rayons du soleil »**. L'idée est surréaliste, le détail doit être réaliste.
C'est précisément là que le travail devient « trop précis et artisanal » :

- une seule source principale, et **tous** les éléments rapportés doivent s'y conformer ;
- l'ombre portée de chaque élément doit suivre la direction et la hauteur du soleil de la photo de fond ;
- ombres de contact sous chaque appui (sinon l'élément « flotte » comme un autocollant) ;
- sur l'eau : reflets ondulés, immersion partielle, pas d'ombre dure ;
- ombre propre : un objet en contre-jour a sa face visible dans l'ombre ;
- rayons de soleil volumétriques qui traversent la scène.

## Composition

- Il part de **« LA photo »** : une image source forte dont il respecte perspective et
  angle de vue, puis il « imagine un autre monde autour ».
- Monument central ou au tiers, souvent légère contre-plongée *(hypothèse)*.
- Horizon assez bas, grand ciel qui porte l'ambiance *(hypothèse)*.
- Profondeur par perspective atmosphérique.
- Diffusion Instagram : format portrait 4:5.

## Matières et textures

Façades photographiques réelles (brique et pierre sculptée flamande), eau lisse et
miroitante, nuages volumineux, végétation tropicale dense, peau lisse et brillante des
mammifères marins. *(hypothèse)* Un grain fin unifié fond les sources entre elles.

## Processus déclaré

- **7 à 20 h par œuvre** (8-15 h selon Maze 2020).
- **80 % intuition** (« 80% of the time is just feeling, I open Photoshop »), 20 % idée
  précise, tirée d'un **carnet de 50+ idées**.
- **Étape la plus longue : trouver les bonnes images et les bons points de vue**
  (banques libres de droits, photographes amis, ses propres photos, balades en ville).
- Photoshop surtout, quelques autres outils non nommés.

## Influences

Salvador Dalí (découverte du surréalisme à l'université), Hayao Miyazaki (palette),
Julien Tabet (ami, l'a poussé à publier), Dragon Ball Z (planète de Kaio), la publicité,
son père (dessinateur de mondes fantastiques avec lui enfant).

## Sources

- [Cosmopola, fiche artiste](https://cosmopola.de/visual-artists/zak-eazy)
- [Maze, « Lille fantasmée de Zak Eazy » (2020)](https://maze.fr/2020/04/lille-fantasmee-de-zak-eazy/)
- [Transphotographiques, « SurréaLille » (2021)](https://www.transphotographiques.com/2021/09/zak-eazy-need-some-break/)
- [Blow, interview (2021)](https://www.blow-ent.com/2021/01/14/blow-focus/zak-eazy/)
- [Daily Geek Show](https://dailygeekshow.com/zak-eazy-artiste/)
- [Demilked](https://www.demilked.com/surreal-digital-manipulations-zak-eazy/)
- [Magzoid, série Dubaï](https://magzoid.com/surrealistic-digital-art-of-dubai-landmarks-win-french-artist-zak-eazy-fans/)
- [Bored Panda / TVOvermind, 55 œuvres](https://tvovermind.com/?p=1321011)
- [Cosmopola, Photoshop Stories FR](https://cosmopola.de/heimat/2025/04/photoshop-stories-fr-zak-eazy-hero-video)
