import * as E from "./engine.js";

const $ = (s) => document.querySelector(s);
const view = $("#view");
const vctx = view.getContext("2d");

const state = {
  plate: null, // HTMLImageElement | canvas
  W: 1080, H: 1350,
  sun: { x: 300, y: 640 },
  light: { azimuth: 120, elevation: 18 },
  autoLight: true,
  tilt: 0.45,
  rays: true, grade: true, grain: true,
  showGuides: true,
  elements: [],
  selected: -1,
  tool: "move", // move | sun
  layerFx: {}, // retouches par calque : { [nom]: { visible, opacity, mode } }
  selectedLayer: null,
  works: [], // œuvres générées
};

let grainLayer = null;
let renderQueued = false;

// --- Chargement --------------------------------------------------------------

function loadImage(src) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = ko;
    img.src = src;
  });
}

function fileToImage(file) {
  return loadImage(URL.createObjectURL(file));
}

async function setPlate(img) {
  const max = 2000;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = E.canvas(w * s, h * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  state.plate = c;
  state.W = c.width; state.H = c.height;
  view.width = c.width; view.height = c.height;
  grainLayer = null;
  state.sun = E.estimateSun(c);
  updateLight();
}

function addElement(img, name, opts = {}) {
  const src = E.trim(img);
  const el = {
    name: name || `Élément ${state.elements.length + 1}`,
    src, tinted: null,
    x: opts.x ?? state.W / 2,
    y: opts.y ?? state.H * 0.8,
    scale: opts.scale ?? Math.min(1, (state.H * 0.35) / src.height),
    surface: opts.surface ?? "ground",
    height: opts.height ?? 200,
    immersion: opts.immersion ?? 0.3,
    match: opts.match ?? 0.6,
    shadowOpacity: 0.55, softness: 1, contact: 0.85, shade: 0.55, rim: 0.6, reflection: 0.45,
    visible: true,
  };
  state.elements.push(el);
  state.selected = state.elements.length - 1;
  updateLight();
  refreshPanels();
}

// --- Lumière -----------------------------------------------------------------

function anchor() {
  const els = state.elements.filter((e) => e.visible);
  if (!els.length) return { x: state.W / 2, y: state.H * 0.85 };
  return {
    x: els.reduce((a, e) => a + e.x, 0) / els.length,
    y: els.reduce((a, e) => a + e.y, 0) / els.length,
  };
}

function updateLight() {
  if (state.autoLight) state.light = E.sunToLight(state.sun, anchor(), state.W, state.H);
  $("#azimuth").value = state.light.azimuth;
  $("#elevation").value = state.light.elevation;
  $("#azimuthVal").textContent = `${state.light.azimuth}°`;
  $("#elevationVal").textContent = `${state.light.elevation}°`;
  schedule();
}

// --- Calques -----------------------------------------------------------------

function buildLayers() {
  const { W, H, light, tilt } = state;
  const layers = [{ name: "Fond", group: null, ...{ canvas: state.plate, mode: "normal", opacity: 1 } }];
  const order = state.elements.map((e, i) => [e, i]).filter(([e]) => e.visible).sort((a, b) => a[0].y - b[0].y);
  for (const [el] of order) {
    E.harmonize(el, state.plate);
    const g = el.name;
    const add = (name, layer) => { if (layer.opacity > 0) layers.push({ name: `${g} · ${name}`, group: g, ...layer }); };
    // Ombres et lumières réelles extraites de la photo : elles suivent le sujet.
    for (const r of el.real || []) {
      const c = E.canvas(W, H);
      c.getContext("2d").drawImage(r.canvas, el.x - el.ox, el.y - el.oy);
      layers.push({ name: `${g} · ${r.name}`, group: g, canvas: c, mode: r.mode, opacity: 1 });
    }
    if (el.surface === "water") {
      if (el.reflection > 0) add("reflet", E.waterReflection(W, H, el, { opacity: el.reflection }));
      if (el.contact > 0) add("ombre de contact", E.contactShadow(W, H, el, tilt, { opacity: el.contact * 0.6 }));
    } else {
      if (el.shadowOpacity > 0) add("ombre portée", E.castShadow(W, H, el, light, tilt, { opacity: el.shadowOpacity, softness: el.softness }));
      if (el.surface === "ground" && el.contact > 0) add("ombre de contact", E.contactShadow(W, H, el, tilt, { opacity: el.contact }));
    }
    layers.push({ name: g, group: g, ...E.elementLayer(W, H, el) });
    if (el.shade > 0) add("ombre propre", E.selfShade(W, H, el, light, { strength: el.shade }));
    if (el.rim > 0) add("liseré de lumière", E.rimLight(W, H, el, light, { opacity: el.rim }));
  }
  if (state.rays) layers.push({ name: "Rayons de soleil", group: null, ...E.sunRays(W, H, state.sun) });
  if (state.grain) {
    if (!grainLayer || grainLayer.canvas.width !== W) grainLayer = E.grain(W, H);
    layers.push({ name: "Grain", group: null, ...grainLayer });
  }
  return layers.map((l) => ({ visible: true, ...l, ...(state.layerFx[l.name] || {}) }));
}

const MODES = { normal: "source-over", multiply: "multiply", screen: "screen", overlay: "overlay", soft_light: "soft-light" };

function flatten(layers, ctx) {
  ctx.save();
  ctx.clearRect(0, 0, state.W, state.H);
  for (const l of layers) {
    if (l.visible === false) continue;
    ctx.globalCompositeOperation = MODES[l.mode];
    ctx.globalAlpha = l.opacity;
    ctx.drawImage(l.canvas, 0, 0);
  }
  ctx.restore();
  if (state.grade) E.pastelGrade(ctx, state.W, state.H);
}

function render() {
  renderQueued = false;
  if (!state.plate) return;
  const layers = buildLayers();
  flatten(layers, vctx);
  if (state.showGuides) drawGuides();
  renderLayersList(layers);
}

function schedule() {
  if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); }
}

function drawGuides() {
  const s = Math.max(state.W, state.H) / 1000;
  vctx.save();
  // Soleil
  vctx.strokeStyle = "rgba(255,255,255,.9)";
  vctx.lineWidth = 2 * s;
  vctx.beginPath();
  vctx.arc(state.sun.x, state.sun.y, 14 * s, 0, Math.PI * 2);
  vctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    vctx.beginPath();
    vctx.moveTo(state.sun.x + Math.cos(a) * 20 * s, state.sun.y + Math.sin(a) * 20 * s);
    vctx.lineTo(state.sun.x + Math.cos(a) * 28 * s, state.sun.y + Math.sin(a) * 28 * s);
    vctx.stroke();
  }
  // Sélection
  const el = state.elements[state.selected];
  if (el && el.visible) {
    const p = E.placement(el);
    vctx.setLineDash([6 * s, 4 * s]);
    vctx.strokeStyle = "rgba(255,170,130,.95)";
    vctx.strokeRect(p.x, p.y, p.w, p.h);
    vctx.setLineDash([]);
    vctx.beginPath();
    vctx.moveTo(el.x - 30 * s, el.y);
    vctx.lineTo(el.x + 30 * s, el.y);
    vctx.stroke();
  }
  vctx.restore();
}

// --- Interaction sur le canevas ------------------------------------------------

function toCanvas(ev) {
  const r = view.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * state.W, y: ((ev.clientY - r.top) / r.height) * state.H };
}

function hit(pt) {
  for (let i = state.elements.length - 1; i >= 0; i--) {
    const el = state.elements[i];
    if (!el.visible) continue;
    const p = E.placement(el);
    if (pt.x >= p.x && pt.x <= p.x + p.w && pt.y >= p.y && pt.y <= p.y + p.h) return i;
  }
  return -1;
}

let drag = null;
view.addEventListener("pointerdown", (ev) => {
  if (!state.plate) return;
  const pt = toCanvas(ev);
  view.setPointerCapture(ev.pointerId);
  const nearSun = Math.hypot(pt.x - state.sun.x, pt.y - state.sun.y) < Math.max(state.W, state.H) * 0.04;
  if (state.tool === "sun" || nearSun) {
    drag = { kind: "sun" };
    state.sun = pt; state.autoLight = true; $("#autoLight").checked = true;
    updateLight();
    return;
  }
  const i = hit(pt);
  state.selected = i;
  if (i >= 0) {
    const el = state.elements[i];
    drag = { kind: "el", dx: el.x - pt.x, dy: el.y - pt.y };
  }
  refreshPanels();
  schedule();
});
view.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const pt = toCanvas(ev);
  if (drag.kind === "sun") { state.sun = pt; updateLight(); return; }
  const el = state.elements[state.selected];
  el.x = pt.x + drag.dx; el.y = pt.y + drag.dy;
  if (state.autoLight) updateLight(); else schedule();
});
view.addEventListener("pointerup", () => { drag = null; });
view.addEventListener("wheel", (ev) => {
  const el = state.elements[state.selected];
  if (!el) return;
  ev.preventDefault();
  el.scale = Math.max(0.05, el.scale * (ev.deltaY < 0 ? 1.05 : 1 / 1.05));
  refreshPanels(); schedule();
}, { passive: false });

// --- Panneaux ------------------------------------------------------------------

const MODE_NAMES = { normal: "Normal", multiply: "Produit", screen: "Écran", overlay: "Incrustation", soft_light: "Lumière douce" };

function renderLayersList(layers) {
  const ul = $("#layers");
  ul.innerHTML = "";
  [...layers].reverse().forEach((l) => {
    const li = document.createElement("li");
    if (l.group) li.classList.add("in-group");
    if (l.name === state.selectedLayer) li.classList.add("sel");
    if (l.visible === false) li.classList.add("off");
    li.innerHTML = `<button class="eye" aria-label="Afficher / masquer">${l.visible === false ? "◌" : "●"}</button><span class="lname"></span><span class="lmode">${MODE_NAMES[l.mode]} · ${Math.round(l.opacity * 100)}%</span>`;
    li.querySelector(".lname").textContent = l.name;
    li.querySelector(".eye").onclick = (e) => {
      e.stopPropagation();
      setFx(l.name, { visible: l.visible === false });
    };
    li.onclick = () => {
      state.selectedLayer = l.name;
      const i = state.elements.findIndex((el) => el.name === l.group);
      if (i >= 0) state.selected = i;
      refreshPanels();
      schedule();
    };
    ul.appendChild(li);
  });
  renderLayerControls(layers.find((l) => l.name === state.selectedLayer));
}

function setFx(name, fx) {
  state.layerFx[name] = { ...(state.layerFx[name] || {}), ...fx };
  schedule();
}

function renderLayerControls(layer) {
  const box = $("#layerControls");
  if (!layer) { box.innerHTML = `<p class="hint">Clique un calque pour régler son opacité et son mode de fusion, ou sur ● pour le masquer.</p>`; return; }
  if (box.dataset.layer === layer.name && box.contains(document.activeElement)) return;
  box.dataset.layer = layer.name;
  box.innerHTML = `
    <p class="lsel"></p>
    <label class="slider"><span>Opacité</span><input type="range" min="0" max="1" step="0.01"><output></output></label>
    <label class="row">Mode de fusion <select>${Object.entries(MODE_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
    <button class="btn ghost reset">Réinitialiser ce calque</button>`;
  box.querySelector(".lsel").textContent = layer.name;
  const range = box.querySelector("input");
  const out = box.querySelector("output");
  range.value = layer.opacity;
  out.textContent = `${Math.round(layer.opacity * 100)}%`;
  range.oninput = () => { out.textContent = `${Math.round(range.value * 100)}%`; setFx(layer.name, { opacity: +range.value }); };
  const sel = box.querySelector("select");
  sel.value = layer.mode;
  sel.onchange = () => setFx(layer.name, { mode: sel.value });
  box.querySelector(".reset").onclick = () => { delete state.layerFx[layer.name]; box.dataset.layer = ""; schedule(); };
}

const FIELDS = [
  ["scale", "Échelle", 0.05, 3, 0.01],
  ["shadowOpacity", "Ombre portée", 0, 1, 0.01],
  ["softness", "Douceur de la pénombre", 0.2, 3, 0.05],
  ["contact", "Ombre de contact", 0, 1, 0.01],
  ["shade", "Ombre propre", 0, 1, 0.01],
  ["rim", "Liseré de lumière", 0, 1, 0.01],
  ["match", "Harmonisation au décor", 0, 1, 0.01],
  ["height", "Hauteur de vol (px)", 0, 2000, 1, "air"],
  ["immersion", "Immersion", 0, 0.9, 0.01, "water"],
  ["reflection", "Reflet", 0, 1, 0.01, "water"],
];

function refreshPanels() {
  const list = $("#elements");
  list.innerHTML = "";
  state.elements.forEach((el, i) => {
    const li = document.createElement("li");
    li.className = i === state.selected ? "sel" : "";
    li.innerHTML = `<input type="checkbox" ${el.visible ? "checked" : ""} aria-label="Visible"><span></span><button class="del" aria-label="Supprimer">✕</button>`;
    li.querySelector("span").textContent = el.name;
    li.querySelector("input").onchange = (e) => { el.visible = e.target.checked; schedule(); };
    li.querySelector(".del").onclick = (e) => {
      e.stopPropagation();
      state.elements.splice(i, 1);
      state.selected = Math.min(state.selected, state.elements.length - 1);
      refreshPanels(); schedule();
    };
    li.onclick = (e) => { if (e.target.tagName !== "INPUT") { state.selected = i; refreshPanels(); schedule(); } };
    list.appendChild(li);
  });

  const box = $("#props");
  const el = state.elements[state.selected];
  if (!el) { box.innerHTML = `<p class="hint">Sélectionne un élément sur l'image ou dans la liste.</p>`; return; }
  box.innerHTML = `
    <label class="row">Nom <input id="p-name" type="text"></label>
    <div class="seg" role="radiogroup" aria-label="Surface">
      ${["ground", "water", "air"].map((s) => `<button data-s="${s}" class="${el.surface === s ? "on" : ""}">${{ ground: "Au sol", water: "Dans l'eau", air: "En l'air" }[s]}</button>`).join("")}
    </div>`;
  box.querySelector("#p-name").value = el.name;
  box.querySelector("#p-name").oninput = (e) => { el.name = e.target.value; refreshList(); schedule(); };
  box.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { el.surface = b.dataset.s; refreshPanels(); schedule(); }));
  for (const [key, label, min, max, step, only] of FIELDS) {
    if (only && el.surface !== only) continue;
    const row = document.createElement("label");
    row.className = "slider";
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const input = row.querySelector("input");
    const out = row.querySelector("output");
    input.value = el[key];
    out.textContent = (+el[key]).toFixed(step >= 1 ? 0 : 2);
    input.oninput = () => { el[key] = +input.value; out.textContent = (+input.value).toFixed(step >= 1 ? 0 : 2); schedule(); };
    box.appendChild(row);
  }
}

function refreshList() {
  document.querySelectorAll("#elements li span").forEach((s, i) => (s.textContent = state.elements[i].name));
}

// Contrôles globaux
$("#azimuth").oninput = (e) => { state.autoLight = false; $("#autoLight").checked = false; state.light.azimuth = +e.target.value; $("#azimuthVal").textContent = `${e.target.value}°`; schedule(); };
$("#elevation").oninput = (e) => { state.autoLight = false; $("#autoLight").checked = false; state.light.elevation = +e.target.value; $("#elevationVal").textContent = `${e.target.value}°`; schedule(); };
$("#autoLight").onchange = (e) => { state.autoLight = e.target.checked; updateLight(); };
$("#tilt").oninput = (e) => { state.tilt = +e.target.value; $("#tiltVal").textContent = (+e.target.value).toFixed(2); schedule(); };
for (const k of ["rays", "grade", "grain", "showGuides"]) {
  $(`#${k}`).onchange = (e) => { state[k] = e.target.checked; schedule(); };
}
$("#toolSun").onclick = () => setTool(state.tool === "sun" ? "move" : "sun");
function setTool(t) {
  state.tool = t;
  $("#toolSun").classList.toggle("on", t === "sun");
  view.style.cursor = t === "sun" ? "crosshair" : "default";
}

$("#plateInput").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  await setPlate(await fileToImage(f));
  $("#empty").hidden = true;
  schedule();
};
$("#elementInput").onchange = async (e) => {
  if (!state.plate) await loadDemoPlate();
  for (const f of e.target.files) addElement(await fileToImage(f), f.name.replace(/\.[^.]+$/, ""));
  e.target.value = "";
  schedule();
};

// Glisser-déposer : 1er fichier opaque = décor, PNG transparents = éléments.
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  for (const f of e.dataTransfer.files) {
    if (!f.type.startsWith("image/")) continue;
    const img = await fileToImage(f);
    if (!state.plate || /jpe?g/.test(f.type)) { await setPlate(img); $("#empty").hidden = true; }
    else addElement(img, f.name.replace(/\.[^.]+$/, ""));
  }
  schedule();
});

// --- Export ----------------------------------------------------------------------

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$("#exportPng").onclick = () => {
  const c = E.canvas(state.W, state.H);
  flatten(buildLayers(), c.getContext("2d"));
  c.toBlob((b) => download(b, "atelier-zak.png"), "image/png");
};

const PS_BLEND = { normal: "BlendMode.NORMAL", multiply: "BlendMode.MULTIPLY", screen: "BlendMode.SCREEN", overlay: "BlendMode.OVERLAY", soft_light: "BlendMode.SOFTLIGHT" };
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "calque";

$("#exportPsd").onclick = async () => {
  const btn = $("#exportPsd");
  btn.disabled = true; btn.textContent = "Préparation…";
  try {
    const zip = new JSZip();
    const layers = buildLayers();
    const manifest = { name: "atelier_zak", width: state.W, height: state.H, light: state.light, layers: [] };
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      const file = `${String(i).padStart(2, "0")}_${slug(l.name)}.png`;
      const c = E.canvas(state.W, state.H);
      c.getContext("2d").drawImage(l.canvas, 0, 0);
      zip.file(file, await new Promise((ok) => c.toBlob(ok, "image/png")));
      manifest.layers.push({ file, name: l.name, blend: PS_BLEND[l.mode], opacity: Math.round(l.opacity * 1000) / 10, visible: l.visible !== false, group: l.group });
    }
    const flat = E.canvas(state.W, state.H);
    flatten(layers, flat.getContext("2d"));
    const fi = String(layers.length).padStart(2, "0");
    zip.file(`${fi}_etalonnage_pastel_repere.png`, await new Promise((ok) => flat.toBlob(ok, "image/png")));
    manifest.layers.push({ file: `${fi}_etalonnage_pastel_repere.png`, name: "Étalonnage pastel (repère)", blend: PS_BLEND.normal, opacity: 100, visible: false, group: null });
    zip.file("apercu.png", await new Promise((ok) => flat.toBlob(ok, "image/png")));
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    const jsx = await (await fetch("construire_psd.jsx.txt")).text();
    zip.file("construire_psd.jsx", jsx.replace("__MANIFEST__", JSON.stringify(manifest)));
    zip.file("LISEZMOI.txt", "Dans Photoshop : Fichier > Scripts > Parcourir... > construire_psd.jsx\nLe script reconstruit le document en calques (modes de fusion et groupes compris) et l'enregistre en .psd dans ce dossier.\nDézippe d'abord l'archive.");
    download(await zip.generateAsync({ type: "blob" }), "atelier-zak-calques.zip");
  } finally {
    btn.disabled = false; btn.textContent = "Calques Photoshop (.zip)";
  }
};

// --- Démo ----------------------------------------------------------------------------

async function loadDemoPlate() {
  await setPlate(await loadImage("demo/decor.png"));
  $("#empty").hidden = true;
}

$("#demo").onclick = loadDemo;
async function loadDemo() {
  state.elements = [];
  await loadDemoPlate();
  addElement(await loadImage("demo/beffroi.png"), "Beffroi", { x: 330, y: 1080, scale: 1, surface: "ground" });
  addElement(await loadImage("demo/orque.png"), "Orque", { x: 820, y: 1040, scale: 0.9, surface: "water" });
  addElement(await loadImage("demo/maison.png"), "Maison volante", { x: 760, y: 900, scale: 0.7, surface: "air", height: 420 });
  state.selected = 0;
  refreshPanels();
  schedule();
}

// Onglets
document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== b.dataset.tab));
}));


// --- Génération d'œuvres -------------------------------------------------------------

const HASARD = {
  lieux: ["le beffroi de Lille", "la Vieille Bourse de Lille", "l'Opéra de Lille", "la Grand Place de Lille", "la Tour Eiffel", "l'Arc de Triomphe", "le Mont-Saint-Michel", "le Burj Al Arab", "le Taj Mahal", "Big Ben", "le Colisée", "la Sagrada Família", "Tower Bridge", "les Moaï de l'île de Pâques", "l'Opéra de Sydney", "un phare breton", "la Tour de Pise", "le Château de Chambord", "le Pont du Gard", "une gare Art nouveau"],
  mecaniques: ["déplacement", "immersion", "élévation", "échelle", "cadre", "métamorphose"],
  faune: ["des orques", "une baleine à bosse", "des raies manta", "des flamants roses", "des méduses lumineuses", "une pieuvre géante", "des dauphins", "des tortues de mer", "des carpes koï", "un cerf blanc", "des éléphants", "des montgolfières", "des cerisiers en fleurs", "une jungle tropicale"],
  ambiances: ["coucher de soleil pastel", "aube brumeuse rose", "heure dorée", "ciel de nuages cotonneux", "lumière d'après l'orage", "crépuscule lavande"],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const inspirations = []; // data URLs
const resources = new Map(); // nom -> HTMLImageElement

function status(msg, kind = "") {
  const el = $("#genStatus");
  el.textContent = msg;
  el.className = `gen-status ${kind}`;
}

async function shrinkToDataUrl(file, max = 1024) {
  const img = await fileToImage(file);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = E.canvas(w * s, h * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

function renderChips() {
  const box = $("#inspoList");
  box.innerHTML = "";
  inspirations.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "chip img";
    b.style.backgroundImage = `url(${d})`;
    b.title = "Retirer";
    b.onclick = () => { inspirations.splice(i, 1); renderChips(); };
    box.appendChild(b);
  });
  for (const [name, img] of resources) {
    const b = document.createElement("button");
    b.className = "chip img res";
    b.style.backgroundImage = `url(${img.src})`;
    b.title = `${name} (retirer)`;
    b.onclick = () => { resources.delete(name); renderChips(); };
    box.appendChild(b);
  }
}

$("#inspoInput").onchange = async (e) => {
  for (const f of e.target.files) if (inspirations.length < 6) inspirations.push(await shrinkToDataUrl(f));
  e.target.value = "";
  renderChips();
};
$("#resInput").onchange = async (e) => {
  for (const f of e.target.files) resources.set(f.name.replace(/\.[^.]+$/, ""), await fileToImage(f));
  e.target.value = "";
  renderChips();
};

async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ error: `${r.status} ${r.statusText}` }));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

async function generate(random) {
  const btns = [$("#genBtn"), $("#genRandom")];
  btns.forEach((b) => (b.disabled = true));
  const t0 = performance.now();
  try {
    const hasard = random
      ? `lieu : ${pick(HASARD.lieux)} ; mécanique : ${pick(HASARD.mecaniques)} ; avec ${pick(HASARD.faune)} ; ambiance : ${pick(HASARD.ambiances)}`
      : null;
    status("1/5 · Claude imagine la scène dans l'univers de Zak…");
    const plan = await api("api/plan", { prompt: random ? "" : $("#genPrompt").value, inspirations, hasard });

    status(`2/5 · « ${plan.titre} » : prise de vue photoréaliste…`);
    const { image: sceneUrl } = await api("api/image", { op: "scene", prompt: plan.scene_prompt, seed: Math.floor(Math.random() * 1e9) });
    const scene = await loadImage(sceneUrl);

    status("3/5 · Claude repère les sujets, leurs ombres et la lumière…");
    const lecture = await api("api/analyse", { image: sceneUrl, sujets: plan.sujets });

    status(`4/5 · Détourage de ${lecture.sujets.length} sujet(s)…`);
    const cutouts = await Promise.all(lecture.sujets.map((s) => cutoutSubject(scene, s)));

    status("5/5 · Reconstitution du décor derrière les sujets…");
    const plate = await cleanPlate(scene, lecture.sujets, cutouts, plan);

    buildWork(plan, lecture, scene, plate, cutouts);
    const secs = ((performance.now() - t0) / 1000).toFixed(0);
    status(`« ${plan.titre} » prête en ${secs} s. ${plan.pitch}`, "ok");
  } catch (err) {
    status(`Échec : ${err.message}`, "err");
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function boxPx(box, W, H, pad = 0) {
  const [x0, y0, x1, y1] = box;
  const pw = (x1 - x0) * pad, ph = (y1 - y0) * pad;
  const X0 = Math.floor(clamp01(x0 - pw) * W), Y0 = Math.floor(clamp01(y0 - ph) * H);
  const X1 = Math.ceil(clamp01(x1 + pw) * W), Y1 = Math.ceil(clamp01(y1 + ph) * H);
  return { x: X0, y: Y0, w: Math.max(1, X1 - X0), h: Math.max(1, Y1 - Y0) };
}

// Recadre le sujet (avec marge), le détoure, et le replace dans un calque
// plein cadre à sa position exacte.
async function cutoutSubject(scene, s) {
  const W = scene.naturalWidth, H = scene.naturalHeight;
  const r = boxPx(s.bbox, W, H, 0.12);
  const crop = E.canvas(r.w, r.h);
  crop.getContext("2d").drawImage(scene, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const { image } = await api("api/image", { op: "cutout", image: crop.toDataURL("image/png") });
  const cut = await loadImage(image);
  const full = E.canvas(W, H);
  full.getContext("2d").drawImage(cut, r.x, r.y, r.w, r.h);
  return full;
}

function feathered(W, H, rects, blur) {
  const c = E.canvas(W, H);
  const ctx = c.getContext("2d");
  ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = "#fff";
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
  return c;
}

// Décor sans les sujets ni leurs ombres : masque = sujets dilatés + zones
// d'ombres, rempli par l'IA, puis recollé sur la photo d'origine pour que
// tout ce qui est hors masque reste au pixel près.
async function cleanPlate(scene, sujets, cutouts, plan) {
  const W = scene.naturalWidth, H = scene.naturalHeight;
  const grow = Math.round(W * 0.012);
  const mask = E.canvas(W, H);
  const m = mask.getContext("2d");
  m.fillStyle = "#000";
  m.fillRect(0, 0, W, H);
  m.filter = `blur(${grow}px)`;
  for (const c of cutouts) {
    const sil = E.canvas(W, H);
    const sctx = sil.getContext("2d");
    sctx.drawImage(c, 0, 0);
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 3; k++) m.drawImage(sil, 0, 0); // dilatation par flou empilé
  }
  m.filter = "none";
  m.drawImage(feathered(W, H, sujets.map((s) => boxPx(s.zone_ombres, W, H)), grow), 0, 0);
  // Masque binaire pour le remplissage.
  const md = m.getImageData(0, 0, W, H);
  for (let i = 0; i < md.data.length; i += 4) {
    const v = md.data[i] > 20 ? 255 : 0;
    md.data[i] = md.data[i + 1] = md.data[i + 2] = v;
  }
  m.putImageData(md, 0, 0);

  const sceneCanvas = E.canvas(W, H);
  sceneCanvas.getContext("2d").drawImage(scene, 0, 0);
  let filled;
  try {
    const { image } = await api("api/image", {
      op: "fill",
      image: sceneCanvas.toDataURL("image/jpeg", 0.92),
      mask: mask.toDataURL("image/png"),
      prompt: `${plan.ambiance}. The same place without ${sujets.map((s) => s.nom).join(", ")}: continue the background, water, sky and ground seamlessly with identical lighting and perspective.`,
    });
    filled = await loadImage(image);
  } catch (err) {
    console.warn("Remplissage impossible, décor d'origine conservé :", err);
    return sceneCanvas;
  }
  // Recollage : photo d'origine hors masque, remplissage dedans (bord adouci).
  const soft = E.canvas(W, H);
  const sctx = soft.getContext("2d");
  sctx.filter = `blur(${Math.max(2, grow / 2)}px)`;
  sctx.drawImage(mask, 0, 0);
  const fillLayer = E.canvas(W, H);
  const f = fillLayer.getContext("2d");
  f.drawImage(filled, 0, 0, W, H);
  f.globalCompositeOperation = "destination-in";
  // Le masque est en niveaux de gris : on le convertit en alpha.
  const alpha = sctx.getImageData(0, 0, W, H);
  for (let i = 0; i < alpha.data.length; i += 4) alpha.data[i + 3] = alpha.data[i];
  sctx.putImageData(alpha, 0, 0);
  f.drawImage(soft, 0, 0);
  const out = E.canvas(W, H);
  const o = out.getContext("2d");
  o.drawImage(scene, 0, 0);
  o.drawImage(fillLayer, 0, 0);
  return out;
}

// Ombres et lumières réelles d'un sujet : ce qui différencie la photo du
// décor reconstitué dans sa zone. Produit (photo / décor) pour ce qui
// assombrit, Écran pour ce qui éclaircit : recomposées, elles redonnent la
// photo d'origine au pixel près, et suivent le sujet quand on le déplace.
function realEffects(scene, plate, zone, cutout, W, H) {
  const r = boxPx(zone, W, H, 0.05);
  const sc = E.canvas(W, H).getContext("2d", { willReadFrequently: true });
  sc.drawImage(scene, 0, 0, W, H);
  const pc = E.canvas(W, H).getContext("2d", { willReadFrequently: true });
  pc.drawImage(plate, 0, 0, W, H);
  const cc = E.canvas(W, H).getContext("2d", { willReadFrequently: true });
  cc.drawImage(cutout, 0, 0);
  const zoneMask = feathered(W, H, [r], Math.round(W * 0.01)).getContext("2d").getImageData(r.x, r.y, r.w, r.h).data;
  const S = sc.getImageData(r.x, r.y, r.w, r.h).data;
  const P = pc.getImageData(r.x, r.y, r.w, r.h).data;
  const C = cc.getImageData(r.x, r.y, r.w, r.h).data;
  const mul = new ImageData(r.w, r.h);
  const scr = new ImageData(r.w, r.h);
  for (let i = 0; i < S.length; i += 4) {
    const a = (zoneMask[i] / 255) * (1 - C[i + 3] / 255);
    for (let k = 0; k < 3; k++) {
      const s = S[i + k] / 255, p = P[i + k] / 255;
      mul.data[i + k] = 255 * (s < p ? s / Math.max(p, 1 / 255) : 1);
      scr.data[i + k] = 255 * (s > p ? 1 - (1 - s) / Math.max(1 - p, 1 / 255) : 0);
    }
    mul.data[i + 3] = scr.data[i + 3] = 255 * a;
  }
  const toLayer = (img) => {
    const c = E.canvas(W, H);
    c.getContext("2d").putImageData(img, r.x, r.y);
    return c;
  };
  return { shadow: toLayer(mul), light: toLayer(scr) };
}

function trimWithOffset(full) {
  const ctx = full.getContext("2d", { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, full.width, full.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const c = E.canvas(x1 - x0 + 1, y1 - y0 + 1);
  c.getContext("2d").drawImage(full, -x0, -y0);
  return { src: c, x0, y0 };
}

function buildWork(plan, lecture, scene, plate, cutouts) {
  setPlate(plate);
  const { W, H } = state;
  state.elements = [];
  state.layerFx = {};
  state.selectedLayer = null;
  lecture.sujets.forEach((s, i) => {
    const t = trimWithOffset(cutouts[i]);
    if (!t) return;
    const fx = realEffects(scene, plate, s.zone_ombres, cutouts[i], W, H);
    const x = t.x0 + t.src.width / 2, y = t.y0 + t.src.height; // base du sujet
    state.elements.push({
      name: s.nom, src: t.src, tinted: null, x, y, ox: x, oy: y, scale: 1,
      surface: s.surface === "air" ? "air" : "ground", height: 0, immersion: 0, match: 0,
      // Les vraies ombres sont dans les calques extraits ; les effets du
      // moteur restent disponibles (à 0) pour un sujet qu'on déplace.
      shadowOpacity: 0, softness: 1, contact: 0, shade: 0, rim: 0, reflection: 0,
      real: [
        { name: "ombres et reflets réels", canvas: fx.shadow, mode: "multiply" },
        { name: "lumières réelles", canvas: fx.light, mode: "screen" },
      ],
      visible: true,
    });
  });
  // Ressources PNG fournies : posées au premier plan avec les effets du moteur.
  let k = 0;
  for (const [name, img] of resources) {
    const src = E.trim(img);
    addElement(img, name, { x: W * (0.3 + 0.4 * (k++ % 2)), y: H * 0.88, scale: Math.min(1, (H * 0.25) / src.height) });
  }
  state.selected = state.elements.length ? 0 : -1;
  state.sun = { x: lecture.lumiere.soleil_x * W, y: lecture.lumiere.soleil_y * H };
  state.autoLight = false;
  $("#autoLight").checked = false;
  state.light = { azimuth: Math.round(lecture.lumiere.azimut), elevation: Math.round(lecture.lumiere.elevation) };
  // La photo porte déjà sa lumière et sa colorimétrie.
  for (const k2 of ["rays", "grade", "grain"]) { state[k2] = false; $(`#${k2}`).checked = false; }
  updateLight();
  saveWork(plan);
  refreshPanels();
  schedule();
}

function snapshot() {
  return {
    plate: state.plate, W: state.W, H: state.H, sun: { ...state.sun }, light: { ...state.light },
    autoLight: state.autoLight, tilt: state.tilt, layerFx: structuredClone(state.layerFx),
    rays: state.rays, grade: state.grade, grain: state.grain,
    elements: state.elements.map((e) => ({ ...e })),
  };
}

function saveWork(plan) {
  const thumb = E.canvas(120, 150);
  thumb.getContext("2d").drawImage(state.plate, 0, 0, 120, 150);
  state.works.unshift({ plan, thumb: thumb.toDataURL("image/jpeg", 0.7), snap: snapshot() });
  renderWorks();
}

function renderWorks() {
  const box = $("#works");
  box.innerHTML = "";
  state.works.forEach((w, i) => {
    const b = document.createElement("button");
    b.className = "work";
    b.innerHTML = `<img alt=""><span></span>`;
    b.querySelector("img").src = w.thumb;
    b.querySelector("span").textContent = w.plan.titre;
    b.title = w.plan.pitch;
    b.onclick = () => restore(i);
    box.appendChild(b);
  });
}

function restore(i) {
  const s = state.works[i].snap;
  Object.assign(state, { plate: s.plate, W: s.W, H: s.H, sun: { ...s.sun }, light: { ...s.light }, autoLight: s.autoLight, tilt: s.tilt, layerFx: structuredClone(s.layerFx), rays: s.rays, grade: s.grade, grain: s.grain });
  for (const k of ["rays", "grade", "grain"]) $(`#${k}`).checked = s[k];
  state.elements = s.elements.map((e) => ({ ...e }));
  state.selected = 0;
  view.width = s.W; view.height = s.H;
  grainLayer = null;
  $("#autoLight").checked = s.autoLight;
  updateLight();
  refreshPanels();
  status(`${state.works[i].plan.titre} : ${state.works[i].plan.pitch}`, "ok");
}

$("#genBtn").onclick = () => generate(false);
$("#genRandom").onclick = () => generate(true);

refreshPanels();
loadDemo();
