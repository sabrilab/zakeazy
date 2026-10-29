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
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = E.canvas(img.naturalWidth * s, img.naturalHeight * s);
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
    if (el.surface === "water") {
      layers.push({ name: `${g} · reflet`, group: g, ...E.waterReflection(W, H, el, { opacity: el.reflection }) });
      layers.push({ name: `${g} · ombre de contact`, group: g, ...E.contactShadow(W, H, el, tilt, { opacity: el.contact * 0.6 }) });
    } else {
      layers.push({ name: `${g} · ombre portée`, group: g, ...E.castShadow(W, H, el, light, tilt, { opacity: el.shadowOpacity, softness: el.softness }) });
      if (el.surface === "ground") {
        layers.push({ name: `${g} · ombre de contact`, group: g, ...E.contactShadow(W, H, el, tilt, { opacity: el.contact }) });
      }
    }
    layers.push({ name: g, group: g, ...E.elementLayer(W, H, el) });
    layers.push({ name: `${g} · ombre propre`, group: g, ...E.selfShade(W, H, el, light, { strength: el.shade }) });
    layers.push({ name: `${g} · liseré de lumière`, group: g, ...E.rimLight(W, H, el, light, { opacity: el.rim }) });
  }
  if (state.rays) layers.push({ name: "Rayons de soleil", group: null, ...E.sunRays(W, H, state.sun) });
  if (state.grain) {
    if (!grainLayer || grainLayer.canvas.width !== W) grainLayer = E.grain(W, H);
    layers.push({ name: "Grain", group: null, ...grainLayer });
  }
  return layers;
}

const MODES = { normal: "source-over", multiply: "multiply", screen: "screen", overlay: "overlay", soft_light: "soft-light" };

function flatten(layers, ctx) {
  ctx.save();
  ctx.clearRect(0, 0, state.W, state.H);
  for (const l of layers) {
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

function renderLayersList(layers) {
  const ul = $("#layers");
  ul.innerHTML = "";
  const names = { normal: "Normal", multiply: "Produit", screen: "Écran", overlay: "Incrustation" };
  [...layers].reverse().forEach((l) => {
    const li = document.createElement("li");
    if (l.group) li.classList.add("in-group");
    li.innerHTML = `<span class="lname"></span><span class="lmode">${names[l.mode]} · ${Math.round(l.opacity * 100)}%</span>`;
    li.querySelector(".lname").textContent = l.name;
    ul.appendChild(li);
  });
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
      manifest.layers.push({ file, name: l.name, blend: PS_BLEND[l.mode], opacity: Math.round(l.opacity * 1000) / 10, visible: true, group: l.group });
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

refreshPanels();
loadDemo();
