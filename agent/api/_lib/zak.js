// L'univers de Zak Eazy : la grammaire qui sert à imaginer chaque œuvre.
// Repris de docs/01-analyse-style.md et style/zak_style.yaml (repo racine).

export const MECANIQUES = {
  deplacement: {
    fr: "déplacement",
    en: "a familiar monument transported intact into a faraway landscape, its foundations sitting naturally in the new ground",
  },
  immersion: {
    fr: "immersion",
    en: "the place flooded by a calm, clear sea up to the first floors, marine life swimming between the buildings",
  },
  elevation: {
    fr: "élévation",
    en: "the monument resting on top of a huge cumulus cloud floating high in the sky, its base merging into the cloud",
  },
  echelle: {
    fr: "échelle",
    en: "an animal at an impossible, gigantic scale interacting gently with the monument",
  },
  cadre: {
    fr: "cadre",
    en: "an architectural opening used as a window between two worlds, a different landscape visible through it",
  },
  metamorphose: {
    fr: "métamorphose",
    en: "an everyday element of the scene metamorphosing into nature (clouds, flowers, water)",
  },
};

export const LIEUX = [
  { fr: "le beffroi de Lille", en: "the Lille city hall belfry (tall Art Deco brick bell tower, Lille, France)" },
  { fr: "la Vieille Bourse de Lille", en: "the Vieille Bourse of Lille (ornate 17th-century Flemish Renaissance building with carved stone and red brick)" },
  { fr: "l'Opéra de Lille", en: "the Lille Opera house (neoclassical stone facade with sculpted pediment)" },
  { fr: "la Grand Place de Lille", en: "the Grand Place of Lille with its Flemish facades and the column of the Goddess" },
  { fr: "la Chambre de Commerce de Lille", en: "the Lille Chamber of Commerce with its neo-Flemish belfry" },
  { fr: "la Tour Eiffel", en: "the Eiffel Tower in Paris" },
  { fr: "l'Arc de Triomphe", en: "the Arc de Triomphe in Paris" },
  { fr: "le Mont-Saint-Michel", en: "the Mont-Saint-Michel abbey" },
  { fr: "le Burj Al Arab", en: "the Burj Al Arab sail-shaped hotel in Dubai" },
  { fr: "le Dubai Frame", en: "the Dubai Frame, a giant golden picture-frame building" },
  { fr: "le Taj Mahal", en: "the Taj Mahal" },
  { fr: "Big Ben", en: "Big Ben and the Palace of Westminster" },
  { fr: "le Colisée", en: "the Colosseum in Rome" },
  { fr: "la Sagrada Família", en: "the Sagrada Família basilica in Barcelona" },
  { fr: "Tower Bridge", en: "Tower Bridge in London" },
  { fr: "les Moaï de l'île de Pâques", en: "the Moai statues of Easter Island" },
  { fr: "l'Opéra de Sydney", en: "the Sydney Opera House" },
  { fr: "un phare breton", en: "a Breton granite lighthouse" },
  { fr: "la Tour de Pise", en: "the Leaning Tower of Pisa" },
  { fr: "le Château de Chambord", en: "the Château de Chambord" },
  { fr: "le rocher de Khao Phing Kan", en: "the Khao Phing Kan limestone rock in Phang Nga Bay, Thailand" },
  { fr: "une maison de briques de Roubaix", en: "a typical red-brick terraced house from Roubaix, northern France" },
  { fr: "la Piscine de Roubaix", en: "La Piscine in Roubaix, an Art Deco swimming pool turned museum, with its stained-glass sunburst window" },
  { fr: "la falaise d'Étretat", en: "the chalk cliffs and natural arch of Étretat, Normandy" },
  { fr: "une rue haussmannienne", en: "a Parisian Haussmann-style street with cream stone facades and wrought-iron balconies" },
  { fr: "un champ de blé du Nord", en: "a vast golden wheat field in northern France" },
  { fr: "un lac salé du désert", en: "a pink salt lake in the desert near Dubai" },
];

export const FAUNE = [
  { fr: "des orques", en: "a pod of orcas" },
  { fr: "une baleine à bosse", en: "a humpback whale" },
  { fr: "des raies manta", en: "manta rays" },
  { fr: "des flamants roses", en: "a flock of pink flamingos" },
  { fr: "des méduses", en: "translucent jellyfish" },
  { fr: "une pieuvre géante", en: "a giant octopus" },
  { fr: "des dauphins", en: "a pod of dolphins" },
  { fr: "des tortues de mer", en: "sea turtles" },
  { fr: "des carpes koï", en: "koi carp" },
  { fr: "un cerf blanc", en: "a white stag" },
  { fr: "des éléphants", en: "a family of elephants" },
  { fr: "des montgolfières", en: "colorful hot air balloons" },
  { fr: "des cerisiers en fleurs", en: "cherry trees in full bloom" },
  { fr: "une jungle tropicale", en: "a lush tropical jungle" },
  { fr: "une girafe", en: "a giraffe" },
  { fr: "un ours polaire", en: "a polar bear" },
  { fr: "un héron cendré", en: "a grey heron" },
  { fr: "une barque de pêcheur", en: "a weathered wooden fishing boat" },
  { fr: "une Fiat 500 vintage", en: "a pastel vintage Fiat 500" },
  { fr: "une cabine téléphonique rouge", en: "a red British telephone box" },
  { fr: "un bocal en verre géant", en: "a giant glass jar" },
  { fr: "une serre victorienne", en: "a Victorian glass greenhouse" },
];

export const AMBIANCES = [
  { fr: "coucher de soleil pastel", en: "pastel sunset, low sun just above the horizon, peach and lavender sky" },
  { fr: "aube brumeuse rose", en: "misty pink dawn, soft diffused low sun, light fog in the distance" },
  { fr: "heure dorée", en: "golden hour, warm low-angle sunlight, long soft shadows" },
  { fr: "ciel de nuages cotonneux", en: "bright afternoon with huge voluminous cumulus clouds, soft sunlight" },
  { fr: "lumière d'après l'orage", en: "light after a storm, sun breaking through dramatic clouds, wet glistening surfaces" },
  { fr: "crépuscule lavande", en: "lavender dusk, sun just set, glowing horizon, first lights in windows" },
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function tirage() {
  const m = pick(Object.keys(MECANIQUES));
  return { lieu: pick(LIEUX), mecanique: m, faune: pick(FAUNE), ambiance: pick(AMBIANCES) };
}

// Verrou de style ajouté à chaque prompt, quelle que soit sa source.
export const STYLE_LOCK =
  "Style: a single, seamless, photorealistic photograph, as if shot on location, in the surreal photomontage style of the French artist Zak Eazy. " +
  "One sun, one coherent light direction for every element; accurate contact shadows, cast shadows and reflections; water, wet stone and clouds rendered physically. " +
  "Soft pastel color grade inspired by Miyazaki palettes: lavender-tinted shadows, peach highlights, milky turquoise water, cream stone, lifted blacks, never pure black, fine unified film grain. " +
  "Vertical 4:5 composition, low horizon, big sky. No text, no letters, no watermark, no frame, no recognizable people.";

export function templatePrompt(t, idee = "") {
  const m = MECANIQUES[t.mecanique].en;
  const base = idee
    ? `A surreal but believable scene: ${idee}.`
    : `A surreal but believable scene featuring ${t.lieu.en}, with ${t.faune.en}: ${m}.`;
  return [
    base,
    `Shot on a full-frame camera with a 35mm lens from a slightly low angle, ${t.ambiance.en}.`,
    "The monument is the focal point, faithful to reality in every architectural detail; the animals or elements interact physically with their surroundings (splashes, ripples, wet lines, soft contact shadows).",
    "Atmospheric perspective with tinted haze in the distance.",
    STYLE_LOCK,
  ].join(" ");
}

export function templateTitle(t) {
  const titres = {
    deplacement: `Voyage de ${t.lieu.fr.replace(/^(le|la|les|l')\s?/i, "")}`,
    immersion: `Marée haute`,
    elevation: `La tête dans les nuages`,
    echelle: `Géants`,
    cadre: `Entre deux mondes`,
    metamorphose: `Métamorphose`,
  };
  return titres[t.mecanique] || "Sans titre";
}

export const SYSTEM = `Tu es le directeur artistique de Zak Eazy, artiste français (Lille, Roubaix) de photomontage
surréaliste sous Photoshop. Devise : « La tête dans les nuages, les pieds sur terre ».
Tu imagines UNE œuvre inédite dans son univers exact, et tu écris le prompt d'un modèle d'image
qui la produira en une seule photographie.

Son univers :
- Des monuments réels et reconnaissables (Lille surtout : beffroi, Vieille Bourse, Opéra, Grand Place,
  Chambre de Commerce ; Dubaï : Burj Al Arab, Dubai Frame ; et Tour Eiffel, Taj Mahal, Big Ben...),
  la nature (mer, falaises, jungle, nuages, couchers de soleil) et une faune déplacée (orques, baleines,
  raies manta, pieuvre géante, dauphins, flamants roses).
- Six mécaniques : déplacement (monument transporté dans un paysage lointain), immersion (ville
  envahie par l'eau ou la jungle), élévation (monument sur un nuage), échelle (animal gigantesque),
  cadre (fenêtre entre deux mondes), métamorphose (objet du quotidien qui se transforme).
- Palette pastel, douce et lumineuse (influence Miyazaki) : ombres lavande, hautes lumières pêche,
  eau turquoise laiteux, pierre crème, noirs relevés, grain fin.
- Surréaliste dans l'idée, réaliste dans le détail : une seule source de lumière (soleil bas),
  ombres de contact, ombres portées cohérentes, reflets inversés exacts sur l'eau, rayons de soleil.
- Composition : le monument en point focal, légère contre-plongée, horizon bas, grand ciel,
  perspective atmosphérique, format portrait 4:5.

Règles pour "scene_prompt" (en anglais, 90 à 170 mots) :
- Décris une vraie photo : boîtier plein format, focale, hauteur et angle de prise de vue,
  heure et direction du soleil.
- Décris physiquement le milieu : eau (transparence, ridules, écume, caustiques, reflets, ligne
  mouillée sur la pierre), ciel (nuages volumétriques, voile atmosphérique), sol, végétation.
- Les sujets touchent leur milieu : ombres de contact, éclaboussures, reflets, échelle crédible.
- Monuments fidèles à la réalité. Pas de texte, pas de cadre, pas de personne reconnaissable.
- Une idée forte et lisible au premier coup d'œil, comme un post Instagram de Zak.

Si l'utilisateur écrit une idée ou un prompt, c'est la priorité absolue : garde chacun de ses
éléments (sujet, lieu, animaux, objets, ambiance, cadrage, couleurs) sans en remplacer ni en
ajouter de contradictoires. Ton rôle est alors de le traduire en anglais et de l'enrichir dans le
style de Zak (lumière, matières, ombres, palette). S'il écrit déjà un prompt détaillé, reste au plus
près de ses mots. Les contraintes tirées au sort ne servent qu'à compléter ce qu'il ne précise pas.

"titre" : titre poétique en français, 1 à 4 mots, comme ceux de Zak (ex. « Need Some Break »,
« New Wave », « Flamingo », « Lille-Tropical »), parfois en anglais.
"pitch" : une phrase en français qui raconte l'image.`;

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titre", "pitch", "mecanique", "scene_prompt"],
  properties: {
    titre: { type: "string" },
    pitch: { type: "string" },
    mecanique: { type: "string", enum: Object.keys(MECANIQUES) },
    scene_prompt: { type: "string" },
  },
};

export function demande(t, idee) {
  const tirage = `lieu : ${t.lieu.fr} ; mécanique : ${MECANIQUES[t.mecanique].fr} ; avec ${t.faune.fr} ; ambiance : ${t.ambiance.fr}.`;
  return idee
    ? `Prompt de l'utilisateur : « ${idee} ».\n` +
        `Respecte-le fidèlement. Seulement pour ce qu'il ne précise pas, tu peux t'inspirer de : ${tirage}`
    : `Pas d'idée imposée : surprends avec une œuvre forte et typique de Zak.\nContraintes tirées au sort : ${tirage}`;
}
