// Moteur d'image de l'Atelier Zak, version navigateur (Canvas 2D).
// Port de zak/shadows.py, zak/color.py et zak/atmosphere.py : mêmes
// conventions de lumière, mêmes calques, mêmes modes de fusion.
//
// Lumière : azimut = d'où vient la lumière (0° droite, 90° derrière la
// scène / contre-jour, 180° gauche, 270° devant) ; élévation = hauteur du
// soleil au-dessus de l'horizon.

export const STYLE = {
  palette: {
    ciel_haut: "#9FB8E0", ciel_bas: "#F6C8B8", soleil: "#FFE3B0",
    eau: "#7FC3C9", ombre: "#6F6A9A", contact: "#3E3A5C",
  },
  grade: { noir: 0.10, blanc: 0.97, saturation: 0.88, ombres: "#7A6FB0", lumieres: "#FFD2B0", split: 0.18 },
};

const RAD = Math.PI / 180;

export function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function hexToRgb(hex) {
  const v = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
}

// Zone opaque d'une image : on recadre chaque élément sur son contenu.
export function trim(img) {
  const c = canvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return c;
  const out = canvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext("2d").drawImage(c, -x0, -y0);
  return out;
}

// Silhouette unie (pour les ombres).
function silhouette(src, color) {
  const c = canvas(src.width, src.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// Couleur moyenne d'une zone du décor.
export function averageColor(plate, x, y, w, h) {
  const c = canvas(1, 1);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(plate, Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h), 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${d[0]},${d[1]},${d[2]})`;
}

// Direction de l'ombre (dx, dy) en px d'image par px de hauteur.
export function shadowDirection(light, tilt) {
  const az = light.azimuth * RAD;
  let dx = -Math.cos(az);
  let dy = Math.sin(az) * tilt;
  if (Math.abs(dy) < 0.04) dy = dy >= 0 ? 0.04 : -0.04;
  const len = Math.min(8, 1 / Math.tan(Math.max(3, light.elevation) * RAD));
  return [dx * len, dy * len];
}

// Géométrie d'un élément placé : coin haut-gauche, taille, sol.
export function placement(el) {
  const w = el.src.width * el.scale;
  const h = el.src.height * el.scale;
  const lift = el.surface === "air" ? el.height : 0;
  const sink = el.surface === "water" ? el.immersion * h : 0;
  const ground = el.y; // ligne de sol / d'eau
  const bottom = ground - lift + sink; // bas de l'objet
  return { x: el.x - w / 2, y: bottom - h, w, h, ground, lift, sink };
}

// --- Calques par élément ----------------------------------------------------

export function castShadow(W, H, el, light, tilt, opts = {}) {
  const out = canvas(W, H);
  const ctx = out.getContext("2d");
  const p = placement(el);
  const sil = silhouette(el.src, opts.color || STYLE.palette.ombre);
  const [dx, dy] = shadowDirection(light, tilt);
  const G = p.ground;
  const softness = (opts.softness ?? 1) * (el.surface === "air" ? 2.5 : 1);
  const shadowLen = (G - p.y) * Math.hypot(dx, dy);
  const rMax = Math.max(1.5, 0.06 * shadowLen * softness);
  const fade = opts.fade ?? 0.6;
  // Pénombre progressive : l'objet est découpé en bandes horizontales, chaque
  // bande projetée avec un flou proportionnel à sa hauteur au-dessus du sol.
  const bands = 10;
  const bandH = el.src.height / bands;
  for (let i = 0; i < bands; i++) {
    const sy = i * bandH;
    const yTop = p.y + sy * el.scale;
    const t = Math.min(1, Math.max(0, (G - yTop) / Math.max(1, G - p.y)));
    ctx.save();
    ctx.setTransform(1, 0, -dx, -dy, G * dx, G + G * dy);
    ctx.filter = `blur(${(1 + (rMax - 1) * t).toFixed(1)}px)`;
    ctx.globalAlpha = 1 - fade * t;
    // Légère superposition entre bandes pour éviter les coutures.
    ctx.drawImage(sil, 0, sy, sil.width, bandH + 1, p.x, yTop, p.w, (bandH + 1) * el.scale);
    ctx.restore();
  }
  return { canvas: out, mode: "multiply", opacity: opts.opacity ?? 0.55 };
}

export function contactShadow(W, H, el, tilt, opts = {}) {
  const out = canvas(W, H);
  const ctx = out.getContext("2d");
  const p = placement(el);
  const sil = silhouette(el.src, opts.color || STYLE.palette.contact);
  const band = Math.max(3, el.src.height * 0.06);
  const flatH = Math.max(2, band * el.scale * tilt);
  const foot = el.surface === "water" ? p.ground : p.y + p.h;
  ctx.filter = `blur(${Math.max(1, flatH * 0.6).toFixed(1)}px)`;
  ctx.drawImage(sil, 0, el.src.height - band, sil.width, band, p.x, foot - flatH / 2, p.w, flatH);
  ctx.drawImage(out, 0, 0); // renforce la densité
  return { canvas: out, mode: "multiply", opacity: opts.opacity ?? 0.85 };
}

export function selfShade(W, H, el, light, opts = {}) {
  const out = canvas(W, H);
  const ctx = out.getContext("2d");
  const p = placement(el);
  const az = light.azimuth * RAD;
  const backlit = Math.max(0, Math.sin(az));
  const side = Math.cos(az);
  drawElement(ctx, el, p);
  ctx.globalCompositeOperation = "source-in";
  const g = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
  const [r, gg, b] = hexToRgb(opts.color || STYLE.palette.ombre).map((v) => Math.round(v * 255));
  const amount = (across) => Math.min(1, backlit * 0.7 + (1 - backlit) * across * Math.abs(side));
  // across = 1 du côté opposé au soleil.
  const left = side < 0 ? 0 : 1;
  g.addColorStop(0, `rgba(${r},${gg},${b},${amount(left)})`);
  g.addColorStop(1, `rgba(${r},${gg},${b},${amount(1 - left)})`);
  ctx.fillStyle = g;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  return { canvas: out, mode: "multiply", opacity: opts.strength ?? 0.55 };
}

// Liseré de lumière du côté du soleil (rim light directionnel).
export function rimLight(W, H, el, light, opts = {}) {
  const out = canvas(W, H);
  const ctx = out.getContext("2d");
  const p = placement(el);
  const az = light.azimuth * RAD;
  const width = Math.max(2, Math.min(p.w, p.h) * 0.03);
  const sx = Math.cos(az) * width;
  const sy = -Math.abs(Math.sin(az)) * width * 0.5 - (Math.sin(az) < 0 ? 0 : width * 0.3);
  ctx.drawImage(silhouette(el.src, opts.color || STYLE.palette.soleil), p.x, p.y, p.w, p.h);
  ctx.globalCompositeOperation = "destination-out";
  ctx.filter = `blur(${(width * 0.6).toFixed(1)}px)`;
  ctx.drawImage(el.src, p.x - sx, p.y - sy, p.w, p.h);
  return { canvas: out, mode: "screen", opacity: opts.opacity ?? 0.6 };
}

export function waterReflection(W, H, el, opts = {}) {
  const out = canvas(W, H);
  const p = placement(el);
  const wl = p.ground;
  const above = Math.max(1, wl - p.y); // partie émergée
  const depth = above * (opts.length ?? 0.8);
  // Partie émergée retournée sous la ligne d'eau, en bandes ondulées.
  const flip = canvas(W, Math.ceil(depth) + 2);
  const f = flip.getContext("2d");
  const amp = opts.ripple ?? 3;
  const srcH = (above / p.h) * el.src.height;
  for (let k = 0; k < depth; k += 2) {
    const shift = amp * (k / depth + 0.2) * Math.sin((k / 7) * 2 * Math.PI);
    const sy = srcH - (k / el.scale) - 2 / el.scale;
    if (sy < 0) break;
    f.save();
    f.translate(0, k + 2);
    f.scale(1, -1);
    f.drawImage(el.src, 0, sy, el.src.width, 2 / el.scale, p.x + shift, 0, p.w, 2);
    f.restore();
  }
  f.globalCompositeOperation = "source-atop";
  f.globalAlpha = 0.4;
  f.fillStyle = opts.water || STYLE.palette.eau;
  f.fillRect(0, 0, flip.width, flip.height);
  f.globalAlpha = 1;
  f.globalCompositeOperation = "destination-in";
  const g = f.createLinearGradient(0, 0, 0, depth);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  f.fillStyle = g;
  f.fillRect(0, 0, flip.width, flip.height);
  const ctx = out.getContext("2d");
  ctx.filter = "blur(0.8px)";
  ctx.drawImage(flip, 0, wl);
  return { canvas: out, mode: "normal", opacity: opts.opacity ?? 0.45 };
}

// Dessine l'élément, immergé si besoin, teinté vers le décor.
export function drawElement(ctx, el, p = placement(el), plate = null) {
  if (el.surface !== "water" || p.sink <= 0) {
    ctx.drawImage(el.tinted || el.src, p.x, p.y, p.w, p.h);
    return;
  }
  const src = el.tinted || el.src;
  const cut = (p.ground - p.y) / el.scale; // ligne d'eau dans la source
  ctx.drawImage(src, 0, 0, src.width, cut, p.x, p.y, p.w, cut * el.scale);
  const under = canvas(p.w, p.sink);
  const u = under.getContext("2d");
  u.drawImage(src, 0, cut, src.width, src.height - cut, 0, 0, p.w, p.sink);
  u.globalCompositeOperation = "source-atop";
  u.fillStyle = STYLE.palette.eau;
  u.globalAlpha = 0.6;
  u.fillRect(0, 0, p.w, p.sink);
  u.globalAlpha = 1;
  u.globalCompositeOperation = "destination-in";
  const g = u.createLinearGradient(0, 0, 0, p.sink);
  g.addColorStop(0, "rgba(0,0,0,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  u.fillStyle = g;
  u.fillRect(0, 0, p.w, p.sink);
  ctx.drawImage(under, p.x, p.ground);
}

export function elementLayer(W, H, el) {
  const out = canvas(W, H);
  drawElement(out.getContext("2d"), el);
  return { canvas: out, mode: "normal", opacity: 1 };
}

// Harmonisation : la dominante du décor sous l'élément teinte ce dernier
// (mode Couleur), sa luminance propre est conservée.
export function harmonize(el, plate) {
  if (!el.match) { el.tinted = null; return; }
  const p = placement(el);
  const avg = averageColor(plate, p.x, p.y, p.w, p.h);
  const c = canvas(el.src.width, el.src.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(el.src, 0, 0);
  ctx.globalCompositeOperation = "color";
  ctx.globalAlpha = el.match * 0.5;
  ctx.fillStyle = avg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(el.src, 0, 0);
  el.tinted = c;
}

// --- Atmosphère ------------------------------------------------------------

export function sunRays(W, H, sun, opts = {}) {
  const out = canvas(W, H);
  const ctx = out.getContext("2d");
  const reach = Math.max(W, H) * 1.3;
  let seed = opts.seed ?? 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const color = opts.color || STYLE.palette.soleil;
  const [r, g, b] = hexToRgb(color).map((v) => Math.round(v * 255));
  const n = opts.rays ?? 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI + rand() * 0.05;
    const wdt = 0.012 + rand() * 0.03;
    const alpha = Math.pow(rand(), 2) * 0.55;
    const grad = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, reach);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(sun.x, sun.y);
    ctx.lineTo(sun.x + Math.cos(a - wdt) * reach, sun.y + Math.sin(a - wdt) * reach);
    ctx.lineTo(sun.x + Math.cos(a + wdt) * reach, sun.y + Math.sin(a + wdt) * reach);
    ctx.closePath();
    ctx.fill();
  }
  const glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, Math.max(W, H) * 0.18);
  glow.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const blurred = canvas(W, H);
  const bctx = blurred.getContext("2d");
  bctx.filter = `blur(${Math.max(W, H) / 300}px)`;
  bctx.drawImage(out, 0, 0);
  return { canvas: blurred, mode: "screen", opacity: opts.strength ?? 0.45 };
}

export function grain(W, H, amount = 0.035) {
  const out = canvas(W, H);
  const ctx = out.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * amount * 255 * 2;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: out, mode: "overlay", opacity: 0.6 };
}

// Étalonnage « pastel Zak » (port de color.pastel_grade).
export function pastelGrade(ctx, W, H, g = STYLE.grade) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const sh = hexToRgb(g.ombres), hi = hexToRgb(g.lumieres);
  const soft = (b, s) => (1 - 2 * s) * b * b + 2 * s * b;
  for (let i = 0; i < d.length; i += 4) {
    let c = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
    c = c.map((v) => g.noir + (g.blanc - g.noir) * (1 - Math.pow(1 - v, 1.15)));
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    c = c.map((v) => lum + (v - lum) * g.saturation);
    const wSh = Math.min(1, Math.max(0, 1 - lum * 2)) * g.split;
    const wHi = Math.min(1, Math.max(0, lum * 2 - 1)) * g.split;
    for (let k = 0; k < 3; k++) {
      c[k] = c[k] * (1 - wSh) + soft(c[k], sh[k]) * wSh;
      c[k] = c[k] * (1 - wHi) + soft(c[k], hi[k]) * wHi;
      d[i + k] = Math.max(0, Math.min(255, c[k] * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Estimation du soleil : zone la plus lumineuse du haut de l'image.
export function estimateSun(plate) {
  const s = 64;
  const c = canvas(s, s);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.filter = "blur(3px)";
  ctx.drawImage(plate, 0, 0, s, s);
  const d = ctx.getImageData(0, 0, s, Math.round(s * 0.6)).data;
  let best = -1, bx = s / 2, by = s * 0.3;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (l > best) { best = l; bx = (i / 4) % s; by = Math.floor(i / 4 / s); }
  }
  const W = plate.naturalWidth || plate.width, H = plate.naturalHeight || plate.height;
  return { x: (bx + 0.5) / s * W, y: (by + 0.5) / s * H };
}

// Soleil visible dans le cadre -> azimut / élévation par rapport à un point.
export function sunToLight(sun, anchor, W, H) {
  const horiz = (sun.x - anchor.x) / (W / 2);
  const azimuth = Math.atan2(1, horiz) / RAD;
  const t = Math.min(0.6, Math.max(0, sun.y / H));
  const elevation = 55 + (8 - 55) * (t / 0.6);
  return { azimuth: Math.round(azimuth), elevation: Math.round(elevation) };
}
