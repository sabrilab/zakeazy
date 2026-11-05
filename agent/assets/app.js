// Zak Eazy Agent : prompt + bouton, file de générations façon atelier, cartes animées, visionneuse.
// Aucune clé ici : le navigateur ne parle qu'à /api/generate et /api/status.

(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const local = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };

  const KEY = "zea:jobs:v1";
  const MAX_ACTIVE = 3; // générations simultanées, le reste attend en file
  const MAX_QUEUED = 8;
  const KEEP = 60;
  const GIVE_UP = 7 * 60_000;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|Line\//i.test(navigator.userAgent);
  const easeOut = "cubic-bezier(.16,1,.3,1)";

  // Code d'accès facultatif passé dans le lien (?code=...) : mémorisé puis retiré de l'adresse.
  {
    const u = new URL(location.href);
    if (u.searchParams.has("code")) {
      local.set("zea:code", u.searchParams.get("code"));
      u.searchParams.delete("code");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    }
  }
  const accessCode = local.get("zea:code", "");

  // --- État -------------------------------------------------------------------------
  let jobs = (local.get(KEY, []) || []).filter((j) => j && j.lid && j.state);
  for (const j of jobs) {
    // Une requête interrompue par la fermeture de la page repart de la file.
    if (j.state === "composing") j.state = "queued";
  }
  const save = () => {
    // Au-delà de KEEP cartes, on oublie les plus anciennes déjà terminées.
    for (let i = jobs.length - 1; jobs.length > KEEP && i >= 0; i--) {
      if (jobs[i].state === "done" || jobs[i].state === "failed") jobs.splice(i, 1);
    }
    local.set(KEY, jobs);
  };
  const byLid = (lid) => jobs.find((j) => j.lid === lid);
  const alive = (j) => jobs.includes(j);
  const isActive = (j) => j.state === "composing" || j.state === "rendering";
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  // Durée typique d'un rendu, apprise sur ce téléphone.
  function eta() {
    const a = (local.get("zea:eta", []) || []).filter((n) => n > 8000 && n < 400000).sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length / 2)] : 70000;
  }
  function learn(ms) {
    const a = local.get("zea:eta", []) || [];
    a.unshift(ms);
    local.set("zea:eta", a.slice(0, 9));
  }
  const etaText = () => {
    const s = Math.round((eta() + 12000) / 1000);
    return s < 75 ? `≈ ${Math.max(20, Math.round(s / 10) * 10)} s` : `≈ ${Math.round(s / 60)} min`;
  };

  // --- Éléments ---------------------------------------------------------------------
  const grid = $("#grid");
  const dock = $("#dock");
  const input = $("#ideaInput");
  const clearBtn = $("#ideaClear");
  const promptBox = $("#prompt");
  const go = $("#go");
  const goLabel = $("#goLabel");
  const goSub = $("#goSub");
  const chips = $("#chips");
  const countEl = $("#count");
  const foot = $("#foot");
  const cards = new Map();
  let booted = false;

  // --- Toast ------------------------------------------------------------------------
  let toastTimer = 0;
  function toast(msg, ms = 2800) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  }
  const buzz = (p) => {
    try {
      navigator.vibrate?.(p);
    } catch {}
  };

  // --- Étapes affichées -------------------------------------------------------------
  const COMPOSE = ["Imagine la scène…", "Choisit le monument…", "Repère la lumière…", "Écrit le prompt…"];
  const RENDER = [
    [0.3, "Prise de vue…"],
    [0.46, "Pose du décor…"],
    [0.62, "Ombres et reflets…"],
    [0.78, "Étalonnage pastel…"],
    [0.9, "Derniers détails…"],
    [2, "Presque prête…"],
  ];

  function progress(j, now = Date.now()) {
    if (j.state === "composing") return 0.03 + 0.13 * (1 - Math.exp(-(now - (j.startedAt || now)) / 7000));
    if (j.state === "rendering") {
      const t = now - (j.acceptedAt || now);
      return Math.min(0.97, 0.16 + 0.8 * (1 - Math.exp(-t / (eta() * 0.5))));
    }
    return j.state === "done" ? 1 : 0;
  }

  function queuePos(j) {
    const q = jobs.filter((x) => x.state === "queued").reverse();
    return q.indexOf(j) + 1;
  }

  function labelFor(j, p) {
    switch (j.state) {
      case "queued": {
        if (j.notBefore > Date.now()) return "Patiente un instant…";
        const pos = queuePos(j);
        return pos > 1 ? `En file · n° ${pos}` : "En file d'attente";
      }
      case "composing":
        return COMPOSE[Math.floor((Date.now() - (j.startedAt || 0)) / 3400) % COMPOSE.length];
      case "rendering":
        return RENDER.find(([lim]) => p < lim)[1];
      case "done":
        return "Développement…";
      default:
        return "Raté";
    }
  }

  // --- Cartes -----------------------------------------------------------------------
  function build(j) {
    const el = document.createElement("article");
    el.className = "card";
    el.dataset.lid = j.lid;
    el.style.setProperty("--d", `-${(Math.random() * 9).toFixed(2)}s`);
    el.innerHTML =
      '<div class="media"><div class="aurora"></div><div class="grain"></div><div class="scan"></div>' +
      '<img class="art" alt="" decoding="async"><div class="flash"></div></div>' +
      '<div class="info"><div class="state"><span class="dot"></span><span class="label"></span><span class="pct"></span></div>' +
      '<h3 class="title"></h3><p class="pitch"></p><div class="skeleton"></div><p class="err"></p>' +
      '<button type="button" class="retry">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9m0-5v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      'Réessayer</button><button type="button" class="drop">Retirer</button><div class="meter"><i></i></div></div>';
    const img = el.querySelector(".art");
    img.addEventListener("load", () => reveal(el));
    img.addEventListener("error", () => artError(el, img));
    img.addEventListener("dragstart", (e) => e.preventDefault());
    return el;
  }

  const OPT = location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
  const optimized = (u, w, q = 78) => `/_vercel/image?url=${encodeURIComponent(u)}&w=${w}&q=${q}`;

  function setArt(el, j) {
    const img = el.querySelector(".art");
    if (img.dataset.src === j.url) return;
    img.dataset.src = j.url;
    delete img.dataset.fell;
    if (OPT) {
      img.sizes = el.classList.contains("feature") ? "(min-width: 980px) 940px, 100vw" : "(min-width: 720px) 32vw, 50vw";
      img.srcset = [384, 640, 1080].map((w) => `${optimized(j.url, w)} ${w}w`).join(", ");
      img.src = optimized(j.url, 640);
    } else {
      img.src = j.url;
    }
  }

  function artError(el, img) {
    if (!img.dataset.src) return;
    if (!img.dataset.fell) {
      // L'optimiseur d'images n'a pas répondu : on charge l'original.
      img.dataset.fell = "1";
      img.removeAttribute("srcset");
      img.src = img.dataset.src;
      return;
    }
    const j = byLid(el.dataset.lid);
    if (j && j.state === "done") {
      j.lost = true;
      fail(j, "Image introuvable.", "lost");
    }
  }

  function reveal(el) {
    const j = byLid(el.dataset.lid);
    if (!j || j.state !== "done" || el.classList.contains("revealed")) return;
    const live = booted && j.doneAt && Date.now() - j.doneAt < 90_000;
    if (live && !reduce) {
      el.classList.add("just-done");
      setTimeout(() => el.classList.remove("just-done"), 1300);
    }
    requestAnimationFrame(() => el.classList.add("revealed"));
    if (j.fresh && !el.querySelector(".badge")) {
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = "Nouvelle";
      el.append(b);
    }
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.setAttribute("aria-label", `Ouvrir « ${j.titre || "Sans titre"} »`);
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function paint(j, el = cards.get(j.lid)) {
    if (!el) return;
    if (el.dataset.state !== j.state) {
      el.dataset.state = j.state;
      if (j.state !== "done") {
        el.classList.remove("revealed");
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-label");
        el.querySelector(".badge")?.remove();
      }
    }
    const p = progress(j);
    const lab = el.querySelector(".label");
    const text = labelFor(j, p);
    if (lab.textContent !== text) {
      lab.textContent = text;
      if (booted && !reduce) {
        lab.classList.remove("swap");
        void lab.offsetWidth;
        lab.classList.add("swap");
      }
    }
    setText(el.querySelector(".pct"), isActive(j) ? `${Math.round(p * 100)} %` : "");
    el.querySelector(".meter i").style.transform = `scaleX(${p.toFixed(3)})`;
    const title = el.querySelector(".title");
    if (!el._typing) {
      if (j.titre) {
        setText(title, j.titre);
        title.classList.remove("idea");
      } else if (j.idee) {
        setText(title, `« ${j.idee} »`);
        title.classList.add("idea");
      } else setText(title, "");
    }
    setText(el.querySelector(".pitch"), j.pitch || "");
    setText(el.querySelector(".err"), j.state === "failed" ? j.error || "La génération a échoué." : "");
    if (j.state === "done" && j.url) setArt(el, j);
  }

  function typeTitle(j) {
    const el = cards.get(j.lid);
    const node = el?.querySelector(".title");
    if (!node || reduce || !j.titre) return paint(j);
    const text = j.titre;
    let i = 0;
    el._typing = true;
    node.classList.remove("idea");
    node.classList.add("typing");
    node.textContent = "";
    const step = () => {
      if (!alive(j)) return;
      node.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(step, 30 + Math.random() * 45);
      else {
        el._typing = false;
        setTimeout(() => node.classList.remove("typing"), 900);
      }
    };
    step();
  }

  // Réordonne la grille avec une animation FLIP (les cartes glissent à leur nouvelle place).
  function flip(mutate) {
    const before = new Map([...grid.children].map((el) => [el, el.getBoundingClientRect()]));
    mutate();
    if (reduce || !booted) return;
    for (const el of grid.children) {
      const a = before.get(el);
      if (!a || el.classList.contains("leave")) continue;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      const s = a.width / b.width;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.01) continue;
      el.animate(
        [
          { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${s})` },
          { transformOrigin: "0 0", transform: "none" },
        ],
        { duration: 620, easing: easeOut },
      );
    }
  }

  function render() {
    flip(() => {
      const keep = new Set(jobs.map((j) => j.lid));
      for (const [lid, el] of cards) {
        if (keep.has(lid)) continue;
        cards.delete(lid);
        if (reduce || !booted) el.remove();
        else {
          el.classList.add("leave");
          el.addEventListener("animationend", () => flip(() => el.remove()), { once: true });
        }
      }
      let prev = null;
      jobs.forEach((j, i) => {
        let el = cards.get(j.lid);
        if (!el) {
          el = build(j);
          cards.set(j.lid, el);
          if (booted && !reduce) {
            el.classList.add("enter");
            el.addEventListener("animationend", () => el.classList.remove("enter"), { once: true });
          }
        }
        el.classList.toggle("feature", jobs.length === 1);
        const ref = prev ? prev.nextSibling : grid.firstChild;
        if (ref !== el) grid.insertBefore(el, ref);
        prev = el;
        paint(j, el);
      });
      document.body.classList.toggle("has-jobs", jobs.length > 0);
    });
    updateChrome();
  }

  function updateChrome() {
    const done = jobs.filter((j) => j.state === "done").length;
    const run = jobs.filter(isActive).length;
    const q = jobs.filter((j) => j.state === "queued").length;
    const parts = [];
    if (run + q) parts.push(`${run + q} en cours`);
    if (done) parts.push(`${done} œuvre${done > 1 ? "s" : ""}`);
    setText(countEl, parts.join(" · "));
    foot.hidden = done === 0;
    const idea = input.value.trim();
    let sub;
    if (run || q) sub = `${run} en cours${q ? ` · ${q} en file` : ""}${idea ? " · avec ton prompt" : ""}`;
    else sub = `${idea ? "Avec ton prompt" : "Surprise"} · ${etaText()}`;
    setText(goSub, sub);
  }

  // --- File d'attente ---------------------------------------------------------------
  let pumpTimer = 0;
  function pump() {
    clearTimeout(pumpTimer);
    const now = Date.now();
    let free = MAX_ACTIVE - jobs.filter(isActive).length;
    let wake = Infinity;
    for (const j of jobs.filter((x) => x.state === "queued").reverse()) {
      if (free <= 0) break;
      if (j.notBefore > now) {
        wake = Math.min(wake, j.notBefore - now);
        continue;
      }
      free--;
      start(j);
    }
    if (wake < Infinity) pumpTimer = setTimeout(pump, wake + 50);
    updateChrome();
    tickOn();
  }

  function addJob(idee) {
    if (jobs.filter((j) => j.state === "queued").length >= MAX_QUEUED) {
      toast("La file est pleine : laisse sortir quelques œuvres.");
      return null;
    }
    const j = { lid: rid(), state: "queued", idee: idee || "", titre: "", pitch: "", createdAt: Date.now() };
    jobs.unshift(j);
    save();
    render();
    pump();
    return j;
  }

  async function start(j) {
    Object.assign(j, { state: "composing", startedAt: Date.now(), error: "", code: "", notBefore: 0 });
    save();
    paint(j);
    let r;
    let data = {};
    try {
      const headers = { "Content-Type": "application/json" };
      if (accessCode) headers["x-zak-code"] = accessCode;
      r = await fetch("/api/generate", { method: "POST", headers, body: JSON.stringify({ idee: j.idee }) });
      data = await r.json().catch(() => ({}));
    } catch {
      if (alive(j)) later(j, "network");
      return pump();
    }
    if (!alive(j)) return pump();
    if (r.status === 202 && data.id) {
      Object.assign(j, { id: data.id, titre: data.titre || "", pitch: data.pitch || "", state: "rendering", acceptedAt: Date.now(), engine: data.engine });
      save();
      paint(j);
      typeTitle(j);
      poll();
    } else if (data.code === "rate") {
      later(j, "rate");
    } else if (data.code === "access") {
      fail(j, "Ce lien n'ouvre pas l'atelier : demande un nouveau lien.", "access");
      toast("Lien d'accès invalide.");
    } else if (r.status >= 500 && !data.code) {
      later(j, "network");
    } else {
      fail(j, data.error || "Le serveur n'a pas répondu.", data.code);
    }
    pump();
  }

  function later(j, why) {
    j.tries = (j.tries || 0) + 1;
    if (j.tries > 4) return fail(j, why === "rate" ? "Trop de demandes en même temps. Réessaie dans un moment." : "Pas de réseau pour le moment.", why);
    Object.assign(j, { state: "queued", notBefore: Date.now() + (why === "rate" ? 15000 : 4000) * j.tries });
    if (why === "rate") toast("Beaucoup d'œuvres en même temps : celle-ci attend son tour.");
    save();
    paint(j);
  }

  function fail(j, error, code) {
    Object.assign(j, { state: "failed", error: error || "La génération a échoué.", code: code || "" });
    save();
    paint(j);
    updateChrome();
  }

  function finish(j, url) {
    Object.assign(j, { state: "done", url, doneAt: Date.now(), fresh: true });
    if (j.acceptedAt) learn(j.doneAt - j.acceptedAt);
    save();
    paint(j);
    updateChrome();
    buzz([12, 50, 12]);
    if (document.hidden) document.title = "✦ Œuvre prête · Zak Eazy Agent";
  }

  function retry(j) {
    Object.assign(j, { state: "queued", tries: 0, notBefore: 0, error: "", code: "", id: undefined, url: undefined, titre: "", pitch: "", lost: false });
    jobs = [j, ...jobs.filter((x) => x !== j)];
    save();
    render();
    pump();
  }

  // --- Suivi des rendus (une requête pour toutes les cartes en cours) ------------------
  let pollTimer = 0;
  let polling = false;
  function poll(delay) {
    clearTimeout(pollTimer);
    const list = jobs.filter((j) => j.state === "rendering" && j.id);
    if (!list.length || document.hidden) return;
    const now = Date.now();
    // Inutile de demander avant ~40 % du temps habituel ; ensuite toutes les 3,5 s.
    const first = Math.min(...list.map((j) => (j.acceptedAt || 0) + Math.min(25000, eta() * 0.4) - now));
    pollTimer = setTimeout(check, delay ?? Math.max(3500, first));
  }

  async function check() {
    if (polling) return;
    polling = true;
    const list = jobs.filter((j) => j.state === "rendering" && j.id).slice(0, 12);
    try {
      const r = await fetch(`/api/status?ids=${list.map((j) => j.id).join(",")}`, { cache: "no-store" });
      if (r.ok) {
        const res = (await r.json()).jobs || {};
        for (const j of list) {
          if (!alive(j) || j.state !== "rendering") continue;
          const s = res[j.id];
          if (s?.status === "done" && s.url) finish(j, s.url);
          else if (s?.status === "failed") fail(j, s.error, s.code);
          else if (Date.now() - (j.acceptedAt || 0) > GIVE_UP) fail(j, "La génération s'est perdue en route.", "timeout");
        }
      }
    } catch {}
    polling = false;
    poll();
    pump();
  }

  // Animation des jauges tant que quelque chose tourne.
  let ticker = 0;
  function tickOn() {
    if (ticker || !jobs.some((j) => isActive(j) || j.state === "queued")) return;
    ticker = setInterval(() => {
      const busy = jobs.filter((j) => isActive(j) || j.state === "queued");
      if (!busy.length) {
        clearInterval(ticker);
        ticker = 0;
        return;
      }
      busy.forEach((j) => paint(j));
    }, 450);
  }

  // --- Prompt -----------------------------------------------------------------------
  function sizeInput() {
    if (document.activeElement !== input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  }
  function onIdea() {
    if (input.value.includes("\n")) {
      // Touche Entrée sur un clavier qui ne passe pas par keydown : on lance.
      input.value = input.value.replace(/\s*\n+\s*/g, " ").trim();
      queueMicrotask(() => launch(go));
    }
    const v = input.value;
    local.set("zea:idea", v);
    clearBtn.hidden = !v;
    promptBox.classList.toggle("filled", Boolean(v.trim()));
    for (const c of chips.children) c.classList.toggle("on", c.dataset.idea === v.trim());
    sizeInput();
    updateChrome();
  }
  input.value = local.get("zea:idea", "") || "";
  onIdea();
  input.addEventListener("input", onIdea);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      launch(go);
    }
  });
  promptBox.addEventListener("submit", (e) => {
    e.preventDefault();
    launch(go);
  });
  input.addEventListener("focus", () => {
    dock.classList.add("focus");
    sizeInput();
  });
  input.addEventListener("blur", () =>
    setTimeout(() => {
      if (document.activeElement === input) return;
      dock.classList.remove("focus");
      // Hors saisie, le prompt tient sur une ligne pour laisser la place aux œuvres.
      input.style.height = "";
      input.scrollTop = 0;
    }, 120),
  );
  // Un toucher sur les puces ne doit pas fermer le clavier.
  chips.addEventListener("pointerdown", (e) => {
    if (document.activeElement === input) e.preventDefault();
  });
  clearBtn.addEventListener("pointerdown", (e) => e.preventDefault());
  chips.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-idea]");
    if (!b) return;
    input.value = b.classList.contains("on") ? "" : b.dataset.idea;
    onIdea();
    buzz(8);
  });
  clearBtn.addEventListener("click", () => {
    input.value = "";
    onIdea();
    input.focus();
  });
  document.addEventListener("pointerdown", (e) => {
    if (dock.classList.contains("focus") && !dock.contains(e.target)) {
      input.blur();
      dock.classList.remove("focus");
    }
  });

  // Clavier mobile : la barre suit le haut du clavier (iOS et navigateur intégré d'Instagram).
  const vv = window.visualViewport;
  if (vv) {
    const onVV = () => {
      const off = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      dock.style.transform = off > 1 ? `translateY(${-off}px)` : "";
      document.body.classList.toggle("kb", off > 80);
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
  }

  // --- Lancer -----------------------------------------------------------------------
  let lastLaunch = 0;
  function launch(from, idee = input.value.trim(), point) {
    const now = Date.now();
    if (now - lastLaunch < 400) return;
    lastLaunch = now;
    const j = addJob(idee.slice(0, 600));
    if (!j) return;
    buzz(14);
    if (document.activeElement === input) input.blur();
    dock.classList.remove("focus");
    if (!reduce) {
      go.classList.remove("pop");
      void go.offsetWidth;
      go.classList.add("pop");
    }
    const queued = j.state === "queued";
    goLabel.textContent = queued ? "Ajoutée à la file" : "C'est parti !";
    goLabel.classList.remove("swap");
    void goLabel.offsetWidth;
    goLabel.classList.add("swap");
    clearTimeout(launch.t);
    launch.t = setTimeout(() => {
      goLabel.textContent = "Générer une œuvre";
      goLabel.classList.remove("swap");
      void goLabel.offsetWidth;
      goLabel.classList.add("swap");
    }, 1500);
    const sy = window.scrollY;
    const target = cards.get(j.lid)?.getBoundingClientRect();
    if (sy > 40) window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    spark(from, point, target, sy > 40 ? sy : 0);
  }

  // Une étincelle part du bouton et file vers la nouvelle carte.
  function spark(from, point, b, scrollBy) {
    if (reduce || !from || !b) return;
    const a = from.getBoundingClientRect();
    const x0 = point?.x ?? a.left + a.width / 2;
    const y0 = point?.y ?? a.top + a.height / 2;
    requestAnimationFrame(() => {
      const x1 = b.left + b.width / 2;
      const y1 = b.top + scrollBy + Math.min(b.height / 2, 120);
      const s = document.createElement("i");
      s.className = "spark";
      document.body.append(s);
      const mx = (x0 + x1) / 2 + (x0 < innerWidth / 2 ? 60 : -60);
      const my = Math.min(y0, y1) - 40;
      s.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
          { transform: `translate(${mx}px, ${my}px) scale(1.4)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${x1}px, ${y1}px) scale(.3)`, opacity: 0 },
        ],
        { duration: 760, easing: "cubic-bezier(.5,0,.3,1)" },
      ).onfinish = () => s.remove();
    });
  }

  go.addEventListener("pointerdown", (e) => {
    if (reduce) return;
    const r = go.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2.2;
    const rip = document.createElement("span");
    rip.className = "ripple";
    Object.assign(rip.style, { width: `${d}px`, height: `${d}px`, left: `${e.clientX - r.left - d / 2}px`, top: `${e.clientY - r.top - d / 2}px` });
    go.append(rip);
    setTimeout(() => rip.remove(), 800);
  });
  go.addEventListener("click", (e) => launch(go, undefined, e.detail ? { x: e.clientX, y: e.clientY } : null));

  // --- Grille : ouvrir, réessayer ------------------------------------------------------
  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const j = byLid(card.dataset.lid);
    if (!j) return;
    if (e.target.closest(".retry")) return retry(j);
    if (e.target.closest(".drop")) {
      jobs = jobs.filter((x) => x !== j);
      save();
      return render();
    }
    if (j.state === "done" && card.classList.contains("revealed")) openViewer(j.lid);
  });
  grid.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("card")) {
      e.preventDefault();
      e.target.click();
    }
  });

  // --- Visionneuse --------------------------------------------------------------------
  const viewer = $("#viewer");
  const vImg = $("#vImg");
  const vStage = $("#vStage");
  const vBackdrop = viewer.querySelector(".v-backdrop");
  const vDelete = $("#vDelete");
  const vHint = $("#vHint");
  let vList = [];
  let vIndex = -1;
  let vOpen = false;
  let pushed = false;
  const files = new Map();

  async function fetchBlob(u) {
    // L'original d'abord ; si son serveur refuse le CORS, la copie servie par ce site.
    for (const src of OPT ? [u, optimized(u, 1080, 92)] : [u]) {
      try {
        const r = await fetch(src);
        if (r.ok) return await r.blob();
      } catch {}
    }
    throw new Error("image indisponible");
  }
  const slug = (s) =>
    (s || "oeuvre")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "oeuvre";

  function fileFor(j) {
    if (!files.has(j.lid)) {
      files.set(
        j.lid,
        fetchBlob(j.url)
          .then((b) => {
            const ext = /png/.test(b.type) ? "png" : /webp/.test(b.type) ? "webp" : "jpg";
            return new File([b], `zak-eazy-${slug(j.titre)}.${ext}`, { type: b.type || "image/jpeg" });
          })
          .catch(() => null),
      );
    }
    return files.get(j.lid);
  }

  function ratioOf(j) {
    const img = cards.get(j.lid)?.querySelector(".art");
    return img?.naturalWidth ? img.naturalWidth / img.naturalHeight : 0.8;
  }
  function fit(r) {
    const s = vStage.getBoundingClientRect();
    const W = Math.max(100, s.width - 32);
    const H = Math.max(100, s.height - 12);
    let w = W;
    let h = w / r;
    if (h > H) {
      h = H;
      w = h * r;
    }
    vImg.style.width = `${Math.round(w)}px`;
    vImg.style.height = `${Math.round(h)}px`;
  }

  function toRect(a, b) {
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    return `translate(${dx}px, ${dy}px) scale(${a.width / b.width}, ${a.height / b.height})`;
  }

  function show(i, { from, dir } = {}) {
    const j = vList[i];
    if (!j) return;
    vIndex = i;
    if (j.fresh) {
      j.fresh = false;
      save();
      cards.get(j.lid)?.querySelector(".badge")?.remove();
    }
    $("#vTitle").textContent = j.titre || "Sans titre";
    $("#vPitch").textContent = j.pitch || (j.idee ? `« ${j.idee} »` : "");
    $("#vCount").textContent = vList.length > 1 ? `${i + 1} / ${vList.length}` : "";
    disarm();
    const thumb = cards.get(j.lid)?.querySelector(".art");
    vImg.alt = j.titre || "Œuvre de l'agent Zak Eazy";
    vImg.src = thumb?.currentSrc || j.url;
    fit(ratioOf(j));
    const full = new Image();
    full.onload = () => {
      if (vList[vIndex] === j && vOpen) vImg.src = j.url;
    };
    full.src = j.url;
    fileFor(j);
    if (reduce) return;
    if (from) {
      vImg.animate([{ transform: toRect(from.getBoundingClientRect(), vImg.getBoundingClientRect()), borderRadius: "20px" }, { transform: "none" }], {
        duration: 520,
        easing: easeOut,
      });
    } else if (dir) {
      vImg.animate(
        [
          { transform: `translateX(${dir * 38}%) scale(.94)`, opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 380, easing: easeOut },
      );
    }
  }

  function openViewer(lid) {
    vList = jobs.filter((j) => j.state === "done" && j.url);
    const i = vList.findIndex((j) => j.lid === lid);
    if (i < 0) return;
    viewer.hidden = false;
    document.documentElement.classList.add("lock");
    vOpen = true;
    vHint.hidden = !inApp;
    show(i, { from: cards.get(lid) });
    requestAnimationFrame(() => viewer.classList.add("open"));
    if (!pushed) {
      history.pushState({ zv: 1 }, "");
      pushed = true;
    }
    $("#vClose").focus({ preventScroll: true });
  }

  function closeViewer(fromHistory) {
    if (!vOpen) return;
    vOpen = false;
    if (pushed) {
      pushed = false;
      if (!fromHistory) history.back();
    }
    disarm();
    const j = vList[vIndex];
    const card = j && cards.get(j.lid);
    viewer.classList.remove("open");
    vBackdrop.style.opacity = "";
    const end = () => {
      viewer.hidden = true;
      vImg.getAnimations().forEach((a) => a.cancel());
      vImg.style.transform = "";
      vImg.removeAttribute("src");
      document.documentElement.classList.remove("lock");
      card?.focus({ preventScroll: true });
    };
    const now = getComputedStyle(vImg).transform;
    const cur = now && now !== "none" ? now : "none";
    if (!reduce && card) {
      const r = card.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) {
        vImg.style.transform = "";
        const target = toRect(r, vImg.getBoundingClientRect());
        vImg.animate([{ transform: cur }, { transform: target, borderRadius: "20px" }], { duration: 420, easing: easeOut, fill: "forwards" }).onfinish = end;
        return;
      }
    }
    if (reduce) return end();
    vImg.animate([{ transform: cur, opacity: 1 }, { transform: "scale(.9)", opacity: 0 }], { duration: 240, fill: "forwards" }).onfinish = end;
  }

  function step(d) {
    const n = vIndex + d;
    if (n < 0 || n >= vList.length) {
      if (!reduce) vImg.animate([{ transform: "none" }, { transform: `translateX(${-d * 18}px)` }, { transform: "none" }], { duration: 320, easing: easeOut });
      return;
    }
    if (reduce) return show(n);
    vImg.animate([{ transform: vImg.style.transform || "none", opacity: 1 }, { transform: `translateX(${-d * 38}%) scale(.94)`, opacity: 0 }], {
      duration: 170,
      easing: "ease-in",
    }).onfinish = () => {
      vImg.style.transform = "";
      show(n, { dir: d });
    };
  }

  // Gestes : glisser vers le bas pour fermer, à gauche ou à droite pour passer d'une œuvre à l'autre.
  let drag = null;
  vStage.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), axis: null, dx: 0, dy: 0 };
  });
  vStage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = e.clientY - drag.y;
    if (!drag.axis) {
      if (Math.hypot(drag.dx, drag.dy) < 10) return;
      drag.axis = Math.abs(drag.dy) > Math.abs(drag.dx) ? "y" : "x";
      try {
        vStage.setPointerCapture(e.pointerId);
      } catch {}
    }
    if (drag.axis === "y") {
      const dy = Math.max(0, drag.dy);
      vImg.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy / 1600, 0.18)})`;
      vBackdrop.style.opacity = String(Math.max(0.25, 1 - dy / 480));
    } else {
      vImg.style.transform = `translateX(${drag.dx}px)`;
    }
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.axis) return;
    const v = (d.axis === "y" ? d.dy : d.dx) / Math.max(1, performance.now() - d.t);
    if (e.type !== "pointercancel" && d.axis === "y" && (d.dy > 110 || (d.dy > 40 && v > 0.6))) return closeViewer();
    if (e.type !== "pointercancel" && d.axis === "x" && (Math.abs(d.dx) > 70 || (Math.abs(d.dx) > 30 && Math.abs(v) > 0.5))) return step(d.dx < 0 ? 1 : -1);
    const from = vImg.style.transform;
    vImg.style.transform = "";
    vBackdrop.style.opacity = "";
    if (!reduce && from) vImg.animate([{ transform: from }, { transform: "none" }], { duration: 380, easing: "cubic-bezier(.34,1.56,.64,1)" });
  };
  vStage.addEventListener("pointerup", endDrag);
  vStage.addEventListener("pointercancel", endDrag);
  vImg.addEventListener("dragstart", (e) => e.preventDefault());
  vStage.addEventListener("click", (e) => {
    if (e.target === vStage) closeViewer();
  });
  viewer.querySelector(".v-backdrop").addEventListener("click", () => closeViewer());
  $("#vClose").addEventListener("click", () => closeViewer());
  addEventListener("popstate", () => {
    if (vOpen) {
      pushed = false;
      closeViewer(true);
    }
  });
  addEventListener("keydown", (e) => {
    if (!vOpen) return;
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  });
  addEventListener("resize", () => {
    if (vOpen && vList[vIndex]) fit(ratioOf(vList[vIndex]));
  });

  // Enregistrer : feuille de partage (iOS : « Enregistrer l'image »), sinon téléchargement,
  // sinon (navigateur d'Instagram) l'appui long sur l'image.
  $("#vSave").addEventListener("click", async () => {
    const j = vList[vIndex];
    if (!j) return;
    const pending = files.get(j.lid);
    let file = null;
    // Le partage doit partir du geste : on n'attend le fichier que s'il est presque prêt.
    if (pending) file = await Promise.race([pending, new Promise((r) => setTimeout(() => r(undefined), 600))]);
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: j.titre || "Zak Eazy Agent" });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    if (!inApp) {
      const a = document.createElement("a");
      a.download = file?.name || `zak-eazy-${slug(j.titre)}.jpg`;
      a.href = file ? URL.createObjectURL(file) : j.url;
      if (!file) a.target = "_blank";
      document.body.append(a);
      a.click();
      a.remove();
      if (file) setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("Téléchargement lancé.");
      return;
    }
    vHint.hidden = false;
    vHint.classList.remove("nudge");
    void vHint.offsetWidth;
    vHint.classList.add("nudge");
    toast("Appuie longuement sur l'image, puis « Enregistrer ».", 3600);
  });

  $("#vAgain").addEventListener("click", () => {
    const j = vList[vIndex];
    if (!j) return;
    const idee = j.idee || (j.titre ? `Une variante de « ${j.titre} »${j.pitch ? ` : ${j.pitch}` : ""}` : "");
    closeViewer();
    setTimeout(() => {
      const n = addJob(idee);
      if (n) toast("Variante lancée.");
    }, reduce ? 0 : 260);
  });

  let armed = 0;
  function disarm() {
    clearTimeout(armed);
    armed = 0;
    vDelete.classList.remove("armed");
    vDelete.setAttribute("aria-label", "Supprimer");
  }
  vDelete.addEventListener("click", () => {
    const j = vList[vIndex];
    if (!j) return;
    if (!armed) {
      vDelete.classList.add("armed");
      vDelete.setAttribute("aria-label", "Confirmer la suppression");
      toast("Touche encore pour retirer cette œuvre.");
      armed = setTimeout(disarm, 2800);
      return;
    }
    disarm();
    jobs = jobs.filter((x) => x !== j);
    files.delete(j.lid);
    save();
    vList = vList.filter((x) => x !== j);
    if (!vList.length) {
      closeViewer();
      render();
      return;
    }
    render();
    show(Math.min(vIndex, vList.length - 1), { dir: 1 });
    toast("Œuvre retirée.");
  });

  // --- Vitrine : des œuvres déjà produites, pour donner des idées ----------------------
  const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_2xNa2tWvBTHDtjtkQI1tpLEDhMv/hf_20261105_";
  const SHOWCASE = [
    ["011016_ddd67ea9-facc-4232-a833-0dd304e77577", "Le beffroi de Lille englouti, deux orques"],
    ["011015_01d405bb-a5d4-499e-b862-422d511bd533", "La Tour Eiffel sur une île volante"],
    ["010916_c49b5090-a922-4add-aa92-99cefb4dfd1e", "Un flamant rose géant sur un lac salé, Dubaï au loin"],
    ["010914_3b7fed7d-dc7f-46c5-b278-c2f85e170218", "Une maison de Roubaix soulevée par une montgolfière"],
    ["010915_a600b183-5d55-4993-ab5e-5f5bb83aff2f", "Une méduse géante au-dessus de l'Arc de Triomphe"],
    ["010914_286981a6-fb2d-4579-808f-d903d4eadfc5", "La Grand Place de Lille inondée, une raie manta"],
    ["011026_090304cc-ca4e-41db-85e7-890c0cf7fd60", "Un phare au sommet des nuages roses"],
    ["010914_d3794adf-ed4d-478b-b885-760e6e4c8da1", "Une baleine qui jaillit d'un champ de blé"],
    ["011119_76cecf8b-f3c5-4ac0-8fa3-0b2b5b6133d3", "Une tortue géante dans le ciel du Mont-Saint-Michel"],
    ["010914_7b60a00b-f42d-4bde-913f-194a8ba0078d", "Le Burj Al Arab sur un nuage, des flamants en vol"],
    ["011015_d8a6a089-3c0d-4f3d-a202-5cc28a15f4ff", "Une piscine Art déco devenue récif corallien"],
    ["011119_28dbca0a-a200-4db9-bf5a-bdc99bf15ec2", "Un ours polaire et la Vieille Bourse sur un iceberg"],
    ["011026_a3c175b9-ca02-4cd7-b79e-1b08f6d30826", "Une Fiat 500 posée sur la mer"],
    ["010915_383bdcb6-7e63-4240-b468-365b4968c813", "Une fenêtre ouverte sur l'océan au milieu des dunes"],
  ];
  function buildShowcase() {
    const track = $("#scTrack");
    if (!track) return;
    const frag = document.createDocumentFragment();
    for (const copy of [0, 1]) {
      for (const [id, idea] of SHOWCASE) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sc-tile";
        b.dataset.idea = idea;
        if (copy) {
          b.setAttribute("aria-hidden", "true");
          b.tabIndex = -1;
        } else b.setAttribute("aria-label", `Reprendre l'idée : ${idea}`);
        const img = new Image();
        img.alt = "";
        img.loading = copy ? "lazy" : "eager";
        img.decoding = "async";
        img.onload = () => img.classList.add("ok");
        img.onerror = () => b.remove();
        img.src = `${CDN}${id}_min.webp`;
        const cap = document.createElement("span");
        cap.textContent = idea;
        b.append(img, cap);
        frag.append(b);
      }
    }
    track.append(frag);
    track.addEventListener("click", (e) => {
      const b = e.target.closest(".sc-tile");
      if (!b) return;
      input.value = b.dataset.idea;
      onIdea();
      buzz(8);
      promptBox.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 420, easing: easeOut });
      toast("Idée reprise : appuie sur « Générer une œuvre ».");
    });
  }

  // --- Démarrage ----------------------------------------------------------------------
  buildShowcase();
  render();
  booted = true;
  pump();
  poll(500);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    document.title = "Zak Eazy Agent";
    pump();
    poll(300);
  });
  addEventListener("pageshow", (e) => {
    if (e.persisted) {
      pump();
      poll(300);
    }
  });
  addEventListener("online", () => {
    jobs.filter((j) => j.state === "queued").forEach((j) => (j.notBefore = 0));
    pump();
    poll(300);
  });
})();
