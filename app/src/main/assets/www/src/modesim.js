// ---------- modesim: custom-sim modes (reef defense, predator, remora) ----------
// These run their own update+draw, reusing art (drawFoe), audio, input and camera math.
const SM = window.__bubble, MX = window.ModeCore, AM = window.ArenaModes;
const G3 = SM.G;
const TAU = Math.PI * 2;
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

// shared scratch: particles + floating texts owned by sims (base-game FX arrays need update())
let FX = [], TXT = [];
function fx(x, y, vx, vy, r, c, life) { if (FX.length < 400) FX.push({ x, y, vx, vy, r, c, life, t: 0 }); }
function fxb(x, y, c, n, spd) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = (0.3 + Math.random() * 0.7) * spd; fx(x, y, Math.cos(a) * s, Math.sin(a) * s, 1.5 + Math.random() * 3, c, 0.4 + Math.random() * 0.5); } }
function txt(x, y, str, c, size) { if (TXT.length < 40) TXT.push({ x, y, str, c: c || "#fff", size: size || 14, t: 0 }); }
function fxTick(dt) {
  for (const p of FX) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
  FX = FX.filter((p) => p.t < p.life);
  for (const t of TXT) { t.t += dt; t.y -= 34 * dt; }
  TXT = TXT.filter((t) => t.t < 1.1);
}
function fxDraw(ctx) {
  for (const p of FX) { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  for (const t of TXT) { ctx.globalAlpha = 1 - t.t / 1.1; ctx.fillStyle = t.c; ctx.font = "900 " + t.size + "px system-ui"; ctx.fillText(t.str, t.x, t.y); }
  ctx.globalAlpha = 1;
}

// camera (own; base cam vars aren't exported)
const SC = { x: 0, y: 0 };
function simCam(px, py) {
  const W = SM.W, H = SM.H, WD = SM.WORLD;
  SC.x = clampN(px - W / 2, 0, Math.max(0, WD.w - W));
  SC.y = clampN(py - H / 2, 0, Math.max(0, WD.h - H));
}

// simplified sea backdrop (own camera)
function drawSea(ctx) {
  const W = SM.W, H = SM.H, WD = SM.WORLD;
  const g = ctx.createLinearGradient(0, SC.y, 0, SC.y + H);
  g.addColorStop(0, "#14638c"); g.addColorStop(0.55, "#0c4066"); g.addColorStop(1, "#072440");
  ctx.fillStyle = g;
  ctx.fillRect(SC.x - 10, SC.y - 10, W + 20, H + 20);
  const dg = ctx.createRadialGradient(WD.w / 2, WD.h / 2, 300, WD.w / 2, WD.h / 2, 1300);
  dg.addColorStop(0, "rgba(2,8,20,0)"); dg.addColorStop(1, "rgba(2,8,20,0.42)");
  ctx.fillStyle = dg;
  ctx.fillRect(SC.x - 10, SC.y - 10, W + 20, H + 20);
  // weed + blobs from the last resetGame decor (drawn under our camera)
  ctx.fillStyle = "rgba(125,249,255,0.05)";
  const gs = 140;
  const gx0 = Math.floor(SC.x / gs) * gs, gy0 = Math.floor(SC.y / gs) * gs;
  ctx.strokeStyle = "rgba(125,249,255,0.05)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = gx0; x < SC.x + W; x += gs) { ctx.moveTo(x, SC.y - 10); ctx.lineTo(x, SC.y + H + 10); }
  for (let y = gy0; y < SC.y + H; y += gs) { ctx.moveTo(SC.x - 10, y); ctx.lineTo(SC.x + W + 10, y); }
  ctx.stroke();
  for (const d of G3.decor) {
    if (!d || d.x < SC.x - 60 || d.x > SC.x + W + 60 || d.y < SC.y - 60 || d.y > SC.y + H + 60) continue;
    if (d.weed) SM.drawWeed(d);
    else { ctx.fillStyle = d.c || "rgba(120,180,200,0.25)"; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx || 20, d.ry || 12, d.rot || 0, 0, TAU); ctx.fill(); }
  }
}

// boot a custom sim: fresh world, no pact, play state, music on
function simReset(mode) {
  SM.resetGame();
  G3.mode = mode;
  G3.state = "play";
  if (SM.abil && SM.abil.grantRelic) SM.abil.grantRelic(); // custom sims bind one random relic, no draft
  for (const id of ["startOverlay", "levelOverlay", "pauseOverlay", "overOverlay", "pactOverlay", "relicOverlay", "clamOverlay", "shopOverlay", "depthOverlay", "dailyOverlay", "diffOverlay", "confirmOverlay", "optionsOverlay"]) {
    const o = document.getElementById(id); if (o) o.hidden = true;
  }
  const dm = document.getElementById("dmapOverlay"); if (dm) dm.remove();
  document.getElementById("gameWrap").classList.remove("hidehud");
  FX = []; TXTX(); SM.Music.on = true; SM.Music.step = 0;
  SM.updateHud(true);
}
function TXTX() { TXT = []; }

// DOM HUD helpers (reuse base bars)
function setBars(lvlTxt, hpFrac, xpFrac, statsTxt) {
  document.getElementById("lvlBadge").textContent = lvlTxt;
  document.getElementById("hpFill").style.width = Math.round(clampN(hpFrac, 0, 1) * 100) + "%";
  document.getElementById("xpFill").style.width = Math.round(clampN(xpFrac || 0, 0, 1) * 100) + "%";
  document.getElementById("hudStats").textContent = statsTxt;
}

// ---------- REEF DEFENSE: hold the clam bed ----------
const RF = { wave: 0, phase: "build", phaseT: 0, pearls: 0, clam: null, turrets: [], eb: [], pb: [], spawnQ: [], spawnT: 0, placing: null, player: null, over: false, barEl: null };
const TURRETS = {
  gun: { cost: 30, dmg: 11, rate: 2, range: 390, color: "#22d3ee", name: "Bubble Gun" },
  frost: { cost: 55, dmg: 5, rate: 1.2, range: 350, color: "#a5f3fc", name: "Frost Coral", slow: true },
  cannon: { cost: 95, dmg: 48, rate: 0.5, range: 430, color: "#fb923c", name: "Shell Cannon", splash: 95 },
};
function reefSetup() {
  simReset("reef");
  Object.assign(RF, { wave: 0, phase: "build", phaseT: 25, pearls: 70, turrets: [], eb: [], pb: [], spawnQ: [], spawnT: 0, placing: null, over: false });
  RF.clam = { x: SM.WORLD.w / 2, y: SM.WORLD.h / 2, hp: 600, max: 600, r: 46 };
  RF.player = { x: RF.clam.x + 140, y: RF.clam.y, r: 18, hp: 100, max: 100, cool: 0, respT: 0, face: 0 };
  SM.P.x = RF.clam.x; SM.P.y = RF.clam.y; // eyes of passing foes track the clam
  SM.showBanner("🪸 REEF DEFENSE — PROTECT THE HEART CLAM");
  reefBar();
  window.__modeTick = reefTick;
  window.__modeDraw = reefDraw;
  SM.updateHud(true);
}
function reefBar() {
  if (RF.barEl) RF.barEl.remove();
  const bar = document.createElement("div");
  bar.id = "reefBar";
  const upd = () => {
    bar.innerHTML = "";
    const w = document.createElement("div"); w.className = "rw"; w.textContent = "🪸 wave " + Math.max(1, RF.wave) + "/10 • ● " + RF.pearls + " • clam " + Math.max(0, Math.ceil(RF.clam.hp)) + "/" + RF.clam.max;
    bar.appendChild(w);
    for (const k of Object.keys(TURRETS)) {
      const t = TURRETS[k];
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = (k === "gun" ? "◎" : k === "frost" ? "❄" : "✸") + " " + t.name + " ●" + t.cost + " (" + (k === "gun" ? 1 : k === "frost" ? 2 : 3) + ")";
      b.disabled = RF.pearls < t.cost || RF.turrets.length >= 8;
      b.addEventListener("click", () => { RF.placing = k; SM.showBanner("TAP THE REEF TO PLACE " + t.name.toUpperCase()); });
      bar.appendChild(b);
    }
    const rep = document.createElement("button");
    rep.type = "button"; rep.textContent = "♥ Repair +120 ●25 (4)";
    rep.disabled = RF.pearls < 25 || RF.clam.hp >= RF.clam.max;
    rep.addEventListener("click", () => { if (RF.pearls >= 25) { RF.pearls -= 25; RF.clam.hp = Math.min(RF.clam.max, RF.clam.hp + 120); SM.tone(520, 0.15, "triangle", 0.1, 780); upd(); } });
    bar.appendChild(rep);
  };
  bar._upd = upd; upd();
  document.getElementById("gameWrap").appendChild(bar);
  RF.barEl = bar;
}
function reefEdgePos() {
  const WD = SM.WORLD, side = (Math.random() * 4) | 0, m = 60;
  if (side === 0) return { x: Math.random() * WD.w, y: m };
  if (side === 1) return { x: Math.random() * WD.w, y: WD.h - m };
  if (side === 2) return { x: m, y: Math.random() * WD.h };
  return { x: WD.w - m, y: Math.random() * WD.h };
}
function reefStartWave() {
  RF.wave++;
  G3.wave = RF.wave;
  const comp = ["mini", "chaser", "speedy"];
  if (RF.wave >= 2) comp.push("tank");
  if (RF.wave >= 3) comp.push("splitter", "exploder");
  if (RF.wave >= 4) comp.push("chaser", "speedy");
  const n = 4 + RF.wave * 3;
  RF.spawnQ = [];
  for (let i = 0; i < n; i++) RF.spawnQ.push(comp[(Math.random() * comp.length) | 0]);
  RF.phase = "fight";
  SM.showBanner("🌊 WAVE " + RF.wave + " — " + n + " INCOMING!");
  SM.tone(220, 0.3, "sawtooth", 0.12, 110);
}
function reefTick(dt) {
  if (G3.state !== "play" || RF.over) return;
  G3.time += dt;
  const C = RF.clam, PL = RF.player, WD = SM.WORLD;
  // build phase countdown / wave clear detection
  if (RF.phase === "build") {
    RF.phaseT -= dt;
    if (RF.phaseT <= 0) reefStartWave();
  } else if (!RF.spawnQ.length && !G3.enemies.some((e) => !e.dead)) {
    RF.pearls += 20 + RF.wave * 5;
    txt(C.x, C.y - 70, "+" + (20 + RF.wave * 5) + " ● wave bonus", "#fde047", 16);
    if (RF.wave >= 10) { reefWin(); return; }
    RF.phase = "build"; RF.phaseT = 20;
    SM.showBanner("WAVE CLEAR! BUILD (20s)");
    SM.sfxLevel();
  }
  // spawner trickle
  if (RF.spawnQ.length) {
    RF.spawnT -= dt;
    if (RF.spawnT <= 0) {
      RF.spawnT = Math.max(0.25, 1.1 - RF.wave * 0.07);
      const type = RF.spawnQ.shift();
      const p = reefEdgePos();
      SM.spawnEnemy(type, p.x, p.y);
      if (RF.wave >= 3 && RF.spawnQ.length === 0 && RF.wave % 3 === 0) { const q = reefEdgePos(); SM.spawnElite(); const el = G3.enemies[G3.enemies.length - 1]; if (el) { el.x = q.x; el.y = q.y; } }
    }
  }
  // player move (keyboard + stick)
  if (PL.respT > 0) {
    PL.respT -= dt;
    if (PL.respT <= 0) { PL.x = C.x + 100; PL.y = C.y; PL.hp = PL.max; fxb(PL.x, PL.y, "#22d3ee", 20, 200); }
  } else {
    const mv = SM.moveInput();
    PL.x = clampN(PL.x + mv.x * 300 * dt, 20, WD.w - 20);
    PL.y = clampN(PL.y + mv.y * 300 * dt, 20, WD.h - 20);
    if (mv.x || mv.y) PL.face = Math.atan2(mv.y, mv.x);
    // auto-fire nearest
    PL.cool -= dt;
    let best = null, bd = 520 * 520;
    for (const e of G3.enemies) { if (e.dead) continue; const d2 = (e.x - PL.x) * (e.x - PL.x) + (e.y - PL.y) * (e.y - PL.y); if (d2 < bd) { bd = d2; best = e; } }
    if (best && PL.cool <= 0) {
      PL.cool = 1 / 3;
      const a = Math.atan2(best.y - PL.y, best.x - PL.x);
      RF.pb.push({ x: PL.x, y: PL.y, vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, dmg: 15 + RF.wave, life: 1 });
      SM.tone(700 + Math.random() * 200, 0.05, "square", 0.03);
    }
  }
  // turrets
  for (const t of RF.turrets) {
    t.cd -= dt;
    if (t.cd > 0) continue;
    let best = null, bd = t.range * t.range;
    for (const e of G3.enemies) { if (e.dead) continue; const d2 = (e.x - t.x) * (e.x - t.x) + (e.y - t.y) * (e.y - t.y); if (d2 < bd) { bd = d2; best = e; } }
    if (!best) continue;
    const T = TURRETS[t.kind];
    t.cd = 1 / T.rate; t.aim = Math.atan2(best.y - t.y, best.x - t.x);
    if (t.kind === "cannon") RF.eb.push({ x: t.x, y: t.y, vx: (best.x - t.x), vy: (best.y - t.y), homing: best, dmg: T.dmg, splash: T.splash, slow: false, life: 1.6, kind: "cannon" });
    else RF.pb.push({ x: t.x, y: t.y - 14, vx: Math.cos(t.aim) * 640, vy: Math.sin(t.aim) * 640, dmg: T.dmg, life: 1.2, slow: !!T.slow, color: T.color });
  }
  // player + turret projectiles
  for (const b of RF.pb) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WD.w || b.y > WD.h) { b.gone = true; continue; }
    for (const e of G3.enemies) {
      if (e.dead) continue;
      const rr = e.r + 5;
      if ((e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y) < rr * rr) {
        b.gone = true;
        reefDamage(e, b.dmg);
        if (b.slow) { e.slowT = 2; fxb(e.x, e.y, "#a5f3fc", 4, 120); }
        break;
      }
    }
  }
  RF.pb = RF.pb.filter((b) => !b.gone);
  for (const s of RF.eb) {
    if (s.homing && !s.homing.dead) { const a = Math.atan2(s.homing.y - s.y, s.homing.x - s.x); const sp = 420; s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp; }
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let hit = s.life <= 0;
    if (!hit) for (const e of G3.enemies) { if (e.dead) continue; const rr = e.r + 8; if ((e.x - s.x) * (e.x - s.x) + (e.y - s.y) * (e.y - s.y) < rr * rr) { hit = true; break; } }
    if (hit) {
      s.gone = true;
      fxb(s.x, s.y, "#fb923c", 22, 320);
      SM.tone(180, 0.2, "sawtooth", 0.1, 60);
      for (const e of G3.enemies) { if (e.dead) continue; const rr = s.splash + e.r; if ((e.x - s.x) * (e.x - s.x) + (e.y - s.y) * (e.y - s.y) < rr * rr) reefDamage(e, s.dmg); }
    }
  }
  RF.eb = RF.eb.filter((s) => !s.gone);
  // enemies: seek the clam, chew it, shove-past the player
  for (const e of G3.enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    const sp = e.sp * (G3.mutSpd || 1) * (e.slowT > 0 ? 0.45 : 1);
    const dx = C.x - e.x, dy = C.y - e.y, d = Math.max(1, Math.hypot(dx, dy));
    e.atkT = (e.atkT || 0) - dt;
    if (e.exploder && d < 110) { // fuseblooms waddle in then blow
      e.fuse = (e.fuse < 0 ? 0.7 : e.fuse - dt);
      if (e.fuse <= 0 && !e.dead) {
        e.dead = true; G3.kills++;
        fxb(e.x, e.y, "#fb923c", 30, 380);
        SM.tone(150, 0.3, "sawtooth", 0.14, 50);
        reefBlast(e.x, e.y, 120, 45, true);
      }
      continue;
    }
    if (d > C.r + e.r) { e.x += (dx / d) * sp * dt; e.y += (dy / d) * sp * dt; }
    else if (e.atkT <= 0) {
      e.atkT = 1;
      let dmg = e.dmg;
      if (e.affix === "vampiric") { e.hp = Math.min(e.maxHp, e.hp + 12); txt(e.x, e.y - 20, "+12", "#e879f9", 12); }
      C.hp -= dmg;
      fxb(C.x + (dx / d) * -C.r, C.y + (dy / d) * -C.r, "#f87171", 6, 160);
      if (PL.respT <= 0 && Math.hypot(PL.x - e.x, PL.y - e.y) < 200) { /* feeding frenzy near you: no extra */ }
      if (C.hp <= 0) { reefLose(); return; }
    }
    // body-block: shove enemies away from the player
    if (PL.respT <= 0) {
      const px = e.x - PL.x, py = e.y - PL.y, pd = Math.hypot(px, py), pr = e.r + PL.r + 4;
      if (pd < pr && pd > 0.01) {
        e.x = PL.x + (px / pd) * pr; e.y = PL.y + (py / pd) * pr;
        if (e.touchT === undefined || G3.time - e.touchT > 0.8) { e.touchT = G3.time; reefDamage(e, 8); }
      }
      // touch harm to the player
      if (pd < e.r + PL.r - 4 && PL.ifrT !== undefined) { /* handled below */ }
    }
  }
  // player touch harm + regen
  if (PL.respT <= 0) {
    PL.ifrT = Math.max(0, (PL.ifrT || 0) - dt);
    for (const e of G3.enemies) {
      if (e.dead) continue;
      const rr = e.r + PL.r - 6;
      if ((e.x - PL.x) * (e.x - PL.x) + (e.y - PL.y) * (e.y - PL.y) < rr * rr && PL.ifrT <= 0) {
        PL.ifrT = 0.8;
        PL.hp -= e.dmg * 0.5;
        SM.tone(160, 0.2, "sawtooth", 0.12, 70);
        fxb(PL.x, PL.y, "#f87171", 8, 200);
        if (PL.hp <= 0) { PL.respT = 5; SM.showBanner("BUBBLES IS DOWN — 5s"); }
        break;
      }
    }
    PL.hp = Math.min(PL.max, PL.hp + 4 * dt);
  }
  fxTick(dt);
  simCam(PL.respT > 0 ? C.x : (PL.x * 0.35 + C.x * 0.65), PL.respT > 0 ? C.y : (PL.y * 0.35 + C.y * 0.65));
  const cl = Math.max(0, RF.clam.hp / RF.clam.max);
  const ph = RF.phase === "build" ? (" • next wave " + Math.ceil(RF.phaseT) + "s") : (" • 💀 " + G3.enemies.filter((e) => !e.dead).length);
  setBars("🪸 W" + Math.max(1, RF.wave) + "/10", PL.respT > 0 ? 0 : PL.hp / PL.max, cl, "wave " + Math.max(1, RF.wave) + "/10" + ph + " • ● " + RF.pearls);
  if (RF.barEl && RF.barEl._upd && ((G3.time * 2) | 0) !== (((G3.time - dt) * 2) | 0)) RF.barEl._upd();
}
function reefDamage(e, dmg) {
  if (e.dead) return;
  if (e.shield > 0) { const s = Math.min(e.shield, dmg); e.shield -= s; dmg -= s; fxb(e.x, e.y, "#67e8f9", 3, 100); if (dmg <= 0) return; }
  e.hp -= dmg; e.flash = 0.08;
  if (e.hp <= 0) {
    e.dead = true; G3.kills++;
    fxb(e.x, e.y, e.color, 16, 260);
    SM.sfxPop();
    let gain = 4 + ((RF.wave / 3) | 0);
    if (e.elite) gain += 10;
    RF.pearls += gain;
    txt(e.x, e.y - 14, "+" + gain + " ●", "#fde047", 12);
    if (e.splits) { for (let i = 0; i < 2; i++) { SM.spawnEnemy("mini", e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30); } }
    else if (e.affix === "splitter") { for (let i = 0; i < 2; i++) { const t = ["mini", "chaser", "speedy"][(Math.random() * 3) | 0]; SM.spawnEnemy(t, e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30); } }
  }
}
function reefBlast(x, y, r, dmg, hitsClam) {
  for (const e of G3.enemies) { if (e.dead) continue; const rr = r + e.r; if ((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) < rr * rr) reefDamage(e, dmg); }
  if (hitsClam) {
    const C = RF.clam, d = Math.hypot(C.x - x, C.y - y);
    if (d < r + C.r) {
      C.hp -= dmg;
      SM.tone(120, 0.3, "sawtooth", 0.14, 45);
      if (C.hp <= 0) reefLose();
    }
  }
}
function reefWin() {
  if (RF.over) return; RF.over = true;
  window.__winTitle = "🪸 REEF HELD — ALL 10 WAVES!";
  MX.saveModeBest("reef", { win: 1 });
  if (RF.barEl) RF.barEl.remove();
  SM.gameOver();
}
function reefLose() {
  if (RF.over) return; RF.over = true;
  RF.clam.hp = 0;
  fxb(RF.clam.x, RF.clam.y, "#f87171", 60, 400);
  if (RF.barEl) RF.barEl.remove();
  SM.gameOver();
}
function reefOver() {
  if (G3.mode === "reef") {
    if (RF.barEl) RF.barEl.remove();
    if (window.__winTitle) { const t = window.__winTitle; window.__winTitle = null; const chips = document.getElementById("overStats"); if (chips) { const s = document.createElement("span"); s.className = "chip"; s.textContent = "🏆 " + t; chips.appendChild(s); } }
    else {
      const prev = MX.modeBest("reef");
      if (!prev || RF.wave > (prev.wave || 0)) MX.saveModeBest("reef", { wave: RF.wave });
      const chips = document.getElementById("overStats");
      if (chips) { const s = document.createElement("span"); s.className = "chip"; s.textContent = "🪸 the clam fell on wave " + RF.wave + "/10"; chips.appendChild(s); }
    }
  }
}
MX.register({ id: "reef", icon: "🪸", name: "Reef Defense", desc: "Hold the Heart Clam for 10 waves. Build coral turrets, repair, body-block leaks.", bestText(b) { return b ? (b.win ? "🏆 reef held!" : "best: wave " + b.wave + "/10") : "the clam is undefended"; }, setup: reefSetup, onOver: reefOver });

// tap-to-place turrets (own listener; base joystick listener harmlessly co-fires)
SM.canvas.addEventListener("pointerdown", (e) => {
  if (G3.mode !== "reef" || G3.state !== "play" || !RF.placing) return;
  const r = SM.canvas.getBoundingClientRect();
  reefTryPlace(SC.x + (e.clientX - r.left), SC.y + (e.clientY - r.top));
});
window.addEventListener("keydown", (e) => {
  if (G3.mode !== "reef" || G3.state !== "play") return;
  const k = e.key;
  const atPlayer = () => reefTryPlace(RF.player.x + (RF.player.face !== undefined ? Math.cos(RF.player.face) * 60 : 60), RF.player.y + 40);
  if (k === "1") { RF.placing = "gun"; atPlayer(); }
  else if (k === "2") { RF.placing = "frost"; atPlayer(); }
  else if (k === "3") { RF.placing = "cannon"; atPlayer(); }
  else if (k === "4") { if (RF.pearls >= 25 && RF.clam.hp < RF.clam.max) { RF.pearls -= 25; RF.clam.hp = Math.min(RF.clam.max, RF.clam.hp + 120); if (RF.barEl && RF.barEl._upd) RF.barEl._upd(); } }
  else if (k === "Escape") RF.placing = null;
});
function reefTryPlace(x, y) {
  const kind = RF.placing; if (!kind) return;
  const T = TURRETS[kind];
  const C = RF.clam, d = Math.hypot(x - C.x, y - C.y);
  if (RF.pearls < T.cost || RF.turrets.length >= 8 || d < 100 || d > 780) { SM.tone(200, 0.1, "square", 0.06); return; }
  RF.pearls -= T.cost;
  RF.turrets.push({ x, y, kind, cd: 0, aim: -Math.PI / 2 });
  RF.placing = null;
  fxb(x, y, T.color, 18, 200);
  SM.tone(520, 0.12, "triangle", 0.08, 780);
  if (RF.barEl && RF.barEl._upd) RF.barEl._upd();
}

function reefDraw() {
  const ctx = SM.canvas.getContext("2d");
  const W = SM.W, H = SM.H;
  ctx.save();
  ctx.translate(-Math.round(SC.x), -Math.round(SC.y));
  drawSea(ctx);
  const C = RF.clam, PL = RF.player;
  // heart clam: valves + glowing pearl, cracks as it weakens
  const pulse = 1 + 0.08 * Math.sin(G3.time * 3);
  ctx.fillStyle = "#6d28d9";
  ctx.beginPath(); ctx.ellipse(C.x, C.y + 10, C.r, C.r * 0.62, 0.15, 0, TAU); ctx.fill();
  ctx.fillStyle = "#8b5cf6";
  ctx.beginPath(); ctx.ellipse(C.x, C.y - 6, C.r * 0.92, C.r * 0.55, -0.12, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(221,214,254,0.7)"; ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(C.x + i * 14, C.y - 26); ctx.lineTo(C.x + i * 17, C.y + 24); ctx.stroke(); }
  const glow = ctx.createRadialGradient(C.x, C.y - 6, 2, C.x, C.y - 6, 40 * pulse);
  glow.addColorStop(0, "#fff"); glow.addColorStop(0.35, "#f9a8d4"); glow.addColorStop(1, "rgba(249,168,212,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(C.x, C.y - 6, 40 * pulse, 0, TAU); ctx.fill();
  const hurtFrac = 1 - C.hp / C.max;
  if (hurtFrac > 0.25) { ctx.strokeStyle = "rgba(248,113,113,0.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(C.x - 20, C.y - 24); ctx.lineTo(C.x - 6, C.y - 8); ctx.lineTo(C.x - 18, C.y + 4); ctx.stroke(); }
  // turrets
  for (const t of RF.turrets) {
    const T = TURRETS[t.kind];
    ctx.fillStyle = "#57534e";
    ctx.beginPath(); ctx.ellipse(t.x, t.y, 16, 11, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(t.x, t.y - 8); ctx.rotate(t.aim || -Math.PI / 2);
    ctx.fillStyle = T.color;
    ctx.fillRect(0, -4, t.kind === "cannon" ? 26 : 20, 8);
    ctx.beginPath(); ctx.arc(t.kind === "cannon" ? 26 : 20, 0, t.kind === "cannon" ? 7 : 5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // placing ghost + range
  if (RF.placing) {
    const T = TURRETS[RF.placing];
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = T.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(PL.x + 60, PL.y + 40, T.range, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // enemies via base art (eyes track the clam since P sits on it)
  for (const e of G3.enemies) { if (!e.dead) SM.drawFoe(e); }
  // projectiles
  for (const b of RF.pb) { ctx.fillStyle = b.color || "#67e8f9"; ctx.beginPath(); ctx.arc(b.x, b.y, b.slow ? 5 : 4, 0, TAU); ctx.fill(); }
  for (const s of RF.eb) { ctx.fillStyle = "#fb923c"; ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, TAU); ctx.fill(); ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, TAU); ctx.fill(); }
  // player puffer
  if (PL.respT <= 0) {
    ctx.fillStyle = "rgba(34,211,238,0.25)";
    ctx.beginPath(); ctx.arc(PL.x, PL.y, PL.r + 6, 0, TAU); ctx.fill();
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath(); ctx.arc(PL.x, PL.y, PL.r, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0e7490";
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + G3.time; ctx.beginPath(); ctx.arc(PL.x + Math.cos(a) * (PL.r + 2), PL.y + Math.sin(a) * (PL.r + 2), 3, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(PL.x + Math.cos(PL.face) * 7, PL.y + Math.sin(PL.face) * 7 - 4, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0b1020";
    ctx.beginPath(); ctx.arc(PL.x + Math.cos(PL.face) * 8.5, PL.y + Math.sin(PL.face) * 7 - 4, 2.5, 0, TAU); ctx.fill();
  } else {
    ctx.fillStyle = "#fff"; ctx.font = "900 15px system-ui"; ctx.textAlign = "center";
    ctx.fillText("RESPAWN " + Math.ceil(PL.respT) + "s", C.x, C.y - 60);
  }
  fxDraw(ctx);
  ctx.restore();
}
window.SimModes = { simReset, reefTick, reefDraw, RF, TURRETS, reefTryPlace };

// ---------- PREDATOR: you are the Maw ----------
const PD = { me: null, schools: [], evade: 0, evT: 0, rival: null, rivalT: 150, over: false };
function predSetup() {
  simReset("predator");
  PD.me = { x: SM.WORLD.w / 2, y: SM.WORLD.h / 2, r: 20, face: -Math.PI / 2, stam: 100, dashT: 0, bio: 0, combo: 0, comboT: 0, bestC: 0, hp: 3, ifr: 0 };
  PD.schools = [];
  for (let s = 0; s < 4; s++) {
    const cx = 300 + Math.random() * (SM.WORLD.w - 600), cy = 300 + Math.random() * (SM.WORLD.h - 600);
    const col = ["#f9a8d4", "#fde047", "#a5f3fc", "#bbf7d0"][s];
    for (let i = 0; i < 10; i++) PD.schools.push({ x: cx + (Math.random() - 0.5) * 160, y: cy + (Math.random() - 0.5) * 160, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, sz: 5 + Math.random() * 3, col, school: s });
  }
  PD.evade = 0; PD.evT = 45; PD.rival = null; PD.rivalT = 150; PD.over = false;
  PD.homes = [];
  for (let s = 0; s < 4; s++) PD.homes.push({ ph: s * 1.7, x: SM.WORLD.w / 2, y: SM.WORLD.h / 2 });
  SM.showBanner("🦈 YOU ARE THE MAW — HUNT");
  window.__modeTick = predTick;
  window.__modeDraw = predDraw;
  SM.updateHud(true);
}
function predTick(dt) {
  if (G3.state !== "play" || PD.over) return;
  G3.time += dt;
  const M = PD.me, WD = SM.WORLD;
  // dash mirrors the base dash button/double-tap (consumes P's dash timer)
  if (SM.P.dashT > 0) { SM.P.dashT = 0; if (M.stam >= 25 && M.dashT <= 0) { M.dashT = 0.35; M.stam -= 25; SM.tone(300, 0.15, "sawtooth", 0.08, 600); } }
  M.stam = Math.min(100, M.stam + 14 * dt);
  M.dashT = Math.max(0, M.dashT - dt);
  M.ifr = Math.max(0, M.ifr - dt);
  if (M.comboT > 0) { M.comboT -= dt; if (M.comboT <= 0) M.combo = 0; }
  const mv = SM.moveInput();
  const spd = 340 * (M.dashT > 0 ? 2.2 : 1);
  M.x = clampN(M.x + mv.x * spd * dt, M.r, WD.w - M.r);
  M.y = clampN(M.y + mv.y * spd * dt, M.r, WD.h - M.r);
  if (mv.x || mv.y) M.face = Math.atan2(mv.y, mv.x);
  // schools: flock + flee the Maw
  const fleeR = 300, fleeR2 = fleeR * fleeR;
  for (const f of PD.schools) {
    let ax = 0, ay = 0, nx = 0, ny = 0, cx = 0, cy = 0, nn = 0;
    for (const o of PD.schools) {
      if (o === f || o.school !== f.school) continue;
      const dx = o.x - f.x, dy = o.y - f.y, d2 = dx * dx + dy * dy;
      if (d2 < 90 * 90) { nx += o.vx; ny += o.vy; cx += o.x; cy += o.y; nn++; if (d2 < 24 * 24 && d2 > 0.01) { const d = Math.sqrt(d2); ax -= (dx / d) * 900; ay -= (dy / d) * 900; } }
    }
    if (nn) { ax += ((nx / nn) - f.vx) * 2 + ((cx / nn) - f.x) * 1.2; ay += ((ny / nn) - f.vy) * 2 + ((cy / nn) - f.y) * 1.2; }
    const pdx = f.x - M.x, pdy = f.y - M.y, pd2 = pdx * pdx + pdy * pdy;
    if (pd2 < fleeR2) { const pd = Math.max(1, Math.sqrt(pd2)); const k = (1 - pd / fleeR) * 2600; ax += (pdx / pd) * k; ay += (pdy / pd) * k; }
    ax += Math.sin(G3.time * 1.7 + f.sz * 9) * 120;
    ay += Math.cos(G3.time * 1.3 + f.sz * 7) * 120;
    // roam: each school circles a drifting home, so prey stays spread over the reef
    const Hm = PD.homes[f.school];
    if (Hm) {
      Hm.x = SM.WORLD.w / 2 + Math.sin(G3.time * 0.05 + Hm.ph) * 650;
      Hm.y = SM.WORLD.h / 2 + Math.cos(G3.time * 0.04 + Hm.ph * 1.3) * 650;
      const hx = Hm.x - f.x, hy = Hm.y - f.y, hd = Math.hypot(hx, hy);
      if (hd > 220) { ax += (hx / hd) * Math.min(1400, (hd - 220) * 4); ay += (hy / hd) * Math.min(1400, (hd - 220) * 4); }
    }
    // soft bounds
    const m = 80;
    if (f.x < m) ax += 600; if (f.x > WD.w - m) ax -= 600;
    if (f.y < m) ay += 600; if (f.y > WD.h - m) ay -= 600;
    f.vx += ax * dt; f.vy += ay * dt;
    const max = 130 + PD.evade * 12;
    const s = Math.hypot(f.vx, f.vy) || 1;
    if (s > max) { f.vx = f.vx / s * max; f.vy = f.vy / s * max; }
    f.x += f.vx * dt; f.y += f.vy * dt;
  }
  // chomp!
  for (const f of PD.schools) {
    const rr = M.r + f.sz;
    if ((f.x - M.x) * (f.x - M.x) + (f.y - M.y) * (f.y - M.y) < rr * rr) {
      M.bio += Math.round(f.sz);
      M.combo++; M.comboT = 2.5; M.bestC = Math.max(M.bestC, M.combo);
      fxb(f.x, f.y, f.col, 8, 200);
      fxb(f.x, f.y, "#f87171", 5, 140);
      SM.tone(300 + Math.min(600, M.combo * 30), 0.09, "square", 0.07);
      txt(f.x, f.y - 12, "+" + Math.round(f.sz), "#fff", 13);
      // respawn elsewhere to keep the hunting endless
      const side = (Math.random() * 4) | 0;
      f.x = side === 0 ? 60 : side === 1 ? WD.w - 60 : Math.random() * WD.w;
      f.y = side === 2 ? 60 : side === 3 ? WD.h - 60 : Math.random() * WD.h;
      f.vx = (Math.random() - 0.5) * 100; f.vy = (Math.random() - 0.5) * 100;
    }
  }
  // the schools learn
  PD.evT -= dt;
  if (PD.evT <= 0) { PD.evT = 45; PD.evade++; SM.showBanner("THE SCHOOLS LEARN — EVASION " + PD.evade); SM.tone(500, 0.25, "triangle", 0.1, 250); }
  // a bigger Maw arrives
  if (!PD.rival) {
    PD.rivalT -= dt;
    if (PD.rivalT <= 0) { PD.rival = { x: 100, y: 100, r: 34, hp: 3 }; SM.showBanner("⛧ AN APEX MAW SMELLS BLOOD — RUN"); SM.sfxBoss(); }
  } else {
    const R = PD.rival;
    const dx = M.x - R.x, dy = M.y - R.y, d = Math.max(1, Math.hypot(dx, dy));
    const rs = 305;
    R.x += (dx / d) * rs * dt; R.y += (dy / d) * rs * dt;
    if (d < R.r + M.r && M.ifr <= 0) {
      M.hp--; M.ifr = 2; M.combo = 0;
      fxb(M.x, M.y, "#f87171", 24, 320);
      SM.tone(140, 0.4, "sawtooth", 0.16, 50);
      G3.shake = 10;
      if (M.hp <= 0) { predLose(); return; }
      else SM.showBanner("BITTEN! " + M.hp + " HULL LEFT");
    }
  }
  fxTick(dt);
  simCam(M.x, M.y);
  MX.saveModeBest("predator", { bio: M.bio, combo: M.bestC });
  setBars("🦈 APEX", M.hp / 3, M.stam / 100, Math.round(G3.time) + "s • " + M.bio + " biomass • x" + M.combo + " combo" + (PD.rival ? " • ⛧ APEX NEAR" : ""));
}
function predLose() {
  if (PD.over) return; PD.over = true;
  fxb(PD.me.x, PD.me.y, "#f43f5e", 60, 400);
  SM.gameOver();
}
function predOver() {
  if (G3.mode !== "predator") return;
  winChipX("predator", PD.me ? ("🦈 ate " + PD.me.bio + " biomass • best combo x" + PD.me.bestC) : null);
}
function winChipX(modeId, line) {
  if (window.__winTitle && G3.mode === modeId) {
    const t = window.__winTitle; window.__winTitle = null;
    const chips = document.getElementById("overStats");
    if (chips) { const s = document.createElement("span"); s.className = "chip"; s.textContent = "🏆 " + t; chips.appendChild(s); }
  } else if (line && G3.mode === modeId) {
    const chips = document.getElementById("overStats");
    if (chips) { const s = document.createElement("span"); s.className = "chip"; s.textContent = line; chips.appendChild(s); }
  }
}
function predDraw() {
  const ctx = SM.canvas.getContext("2d");
  ctx.save();
  ctx.translate(-Math.round(SC.x), -Math.round(SC.y));
  drawSea(ctx);
  const M = PD.me;
  // minnow schools
  for (const f of PD.schools) {
    const a = Math.atan2(f.vy, f.vx);
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(a);
    ctx.fillStyle = f.col;
    ctx.beginPath(); ctx.ellipse(0, 0, f.sz + 2, f.sz * 0.55, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-f.sz - 1, 0); ctx.lineTo(-f.sz - 5, -3); ctx.lineTo(-f.sz - 5, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0b1020";
    ctx.beginPath(); ctx.arc(f.sz * 0.4, -1.5, 1.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // the Maw (you): bulky hunter with jaw + scar
  if (!PD.over) {
    ctx.save(); ctx.translate(M.x, M.y); ctx.rotate(M.face);
    if (M.ifr > 0 && ((G3.time * 10) | 0) % 2 === 0) ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#881337";
    ctx.beginPath(); ctx.moveTo(-M.r * 0.7, 0); ctx.lineTo(-M.r * 1.7, -M.r * 0.55); ctx.lineTo(-M.r * 1.7, M.r * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f43f5e";
    ctx.beginPath(); ctx.ellipse(0, 0, M.r * 1.15, M.r * 0.72, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#7f1d1d";
    for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; ctx.beginPath(); ctx.arc(Math.cos(a) * M.r * 0.9, Math.sin(a) * M.r * 0.55, 3, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#450a0a";
    ctx.beginPath(); ctx.ellipse(M.r * 0.55, 0, M.r * 0.42, M.r * 0.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff";
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(M.r * 0.3 + i * 5, -4); ctx.lineTo(M.r * 0.3 + i * 5 + 3, 0); ctx.lineTo(M.r * 0.3 + i * 5, 4); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-M.r * 0.1, -M.r * 0.42, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0b1020";
    ctx.beginPath(); ctx.arc(-M.r * 0.1 + 1.5, -M.r * 0.42, 2.8, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    if (M.dashT > 0) { ctx.strokeStyle = "rgba(248,113,113,0.7)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(M.x, M.y, M.r + 8, 0, TAU); ctx.stroke(); }
  }
  // apex rival
  if (PD.rival) {
    const R = PD.rival;
    ctx.save(); ctx.translate(R.x, R.y); ctx.rotate(Math.atan2(M.y - R.y, M.x - R.x));
    ctx.fillStyle = "#1c0505";
    ctx.beginPath(); ctx.moveTo(-R.r * 0.7, 0); ctx.lineTo(-R.r * 1.8, -R.r * 0.6); ctx.lineTo(-R.r * 1.8, R.r * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#450a0a";
    ctx.beginPath(); ctx.ellipse(0, 0, R.r * 1.15, R.r * 0.75, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#7f1d1d";
    ctx.beginPath(); ctx.ellipse(R.r * 0.5, 0, R.r * 0.45, R.r * 0.32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fecaca";
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(R.r * 0.25 + i * 7, -6); ctx.lineTo(R.r * 0.25 + i * 7 + 4, 0); ctx.lineTo(R.r * 0.25 + i * 7, 6); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = "#ef4444";
    ctx.beginPath(); ctx.arc(-R.r * 0.15, -R.r * 0.42, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
  fxDraw(ctx);
  ctx.restore();
}
MX.register({ id: "predator", icon: "🦈", name: "Predator", desc: "YOU are the Maw. Schools flee and learn; an apex hunter arrives at 2:30.", bestText(b) { return b ? ("🏆 " + b.bio + " biomass • combo x" + b.combo) : "the reef fears nothing yet"; }, setup: predSetup, onOver: predOver });
window.SimModes.reef = { RF, TURRETS, reefTryPlace };
window.SimModes.pred = { PD };

// ---------- REMORA RISING: hitch, steer, slip through ----------
const RR = { me: null, hosts: [], pars: [], walls: [], lvl: 1, over: false, won: false };
function remSetup() {
  simReset("remora");
  RR.me = { x: 120, y: 1000, r: 7, hp: 3, ifr: 0, face: 0, host: null, ox: 0, oy: 0, dashT: 0, dashCD: 0, bvx: 0, bvy: 0 };
  RR.hosts = [];
  const lanes = [350, 700, 1050, 1400, 1700];
  lanes.forEach((y, i) => {
    RR.hosts.push({ x: Math.random() * SM.WORLD.w, y, dir: i % 2 ? 1 : -1, sp: 120 + i * 12, r: 26 + (i % 3) * 4, id: 100 + i, flash: 0, type: "tank", color: "#60a5fa" });
  });
  RR.pars = [];
  RR.walls = remWalls(1);
  RR.lvl = 1; RR.over = false; RR.won = false;
  SM.showBanner("◌ REMORA RISING — HITCH A RIDE EAST");
  window.__modeTick = remTick;
  window.__modeDraw = remDraw;
  SM.updateHud(true);
}
function remWalls(lvl) {
  const gaps = lvl === 1 ? [[420, 620]] : lvl === 2 ? [[200, 380], [1100, 1280]] : [[150, 300], [850, 1000], [1550, 1700]];
  const xs = lvl === 1 ? [900] : lvl === 2 ? [700, 1300] : [550, 1000, 1450];
  return xs.map((x) => ({ x, gaps }));
}
function remSpawnPar(n) {
  for (let i = 0; i < n; i++) RR.pars.push({ x: 300 + Math.random() * 1500, y: 150 + Math.random() * 1700, r: 6, sp: 95 + RR.lvl * 22 });
}
function remTick(dt) {
  if (G3.state !== "play" || RR.over) return;
  G3.time += dt;
  const M = RR.me, WD = SM.WORLD;
  if (SM.P.dashT > 0) { SM.P.dashT = 0; remDash(); }
  M.dashCD = Math.max(0, M.dashCD - dt);
  M.dashT = Math.max(0, M.dashT - dt);
  M.ifr = Math.max(0, M.ifr - dt);
  const mv = SM.moveInput();
  if (mv.x || mv.y) M.face = Math.atan2(mv.y, mv.x);
  // hosts cruise their lanes
  for (const h of RR.hosts) {
    h.flash = Math.max(0, h.flash - dt);
    if (M.host === h) {
      h.x += (mv.x * 175 + h.dir * 40) * dt;
      h.y = clampN(h.y + mv.y * 175 * dt, 60, WD.h - 60);
    } else {
      h.x += h.dir * h.sp * dt;
    }
    if (h.x < -80) { h.x = WD.w + 80; } if (h.x > WD.w + 80) { h.x = -80; }
  }
  if (M.host) {
    const h = M.host;
    M.x = h.x + M.ox; M.y = h.y + M.oy;
    // kelp walls block hosts: forced detach
    for (const w of RR.walls) {
      if (Math.abs(h.x - w.x) < h.r + 14 && !inGap(h.y, w.gaps)) {
        M.host = null;
        h.dir *= -1;
        M.bvx = (h.x < w.x ? -1 : 1) * 420; M.bvy = 0; M.dashT = 0.3;
        SM.showBanner("TOO BIG — THE HOST CAN'T FOLLOW");
        break;
      }
    }
    // ram kills
    for (const p of RR.pars) {
      if (p.dead) continue;
      const rr = h.r + p.r;
      if ((p.x - h.x) * (p.x - h.x) + (p.y - h.y) * (p.y - h.y) < rr * rr) {
        p.dead = true; M.score = (M.score || 0) + 10;
        fxb(p.x, p.y, "#c084fc", 10, 200);
        txt(p.x, p.y - 10, "+10", "#e9d5ff", 12);
        SM.tone(600 + Math.random() * 200, 0.07, "square", 0.05);
      }
    }
  } else {
    const sp = 300 * (M.dashT > 0 ? 2.4 : 1);
    M.x = clampN(M.x + (mv.x * sp + M.bvx) * dt, M.r, WD.w - M.r);
    M.y = clampN(M.y + (mv.y * sp + M.bvy) * dt, M.r, WD.h - M.r);
    M.bvx *= 0.9; M.bvy *= 0.9;
    // walls block the remora only outside gaps
    for (const w of RR.walls) {
      if (Math.abs(M.x - w.x) < M.r + 10 && !inGap(M.y, w.gaps)) M.x = w.x + (M.x < w.x ? -1 : 1) * (M.r + 10);
    }
    // hitch check
    for (const h of RR.hosts) {
      const rr = h.r + M.r + 8;
      if ((M.x - h.x) * (M.x - h.x) + (M.y - h.y) * (M.y - h.y) < rr * rr) {
        M.host = h; M.ox = M.x - h.x; M.oy = M.y - h.y;
        SM.showBanner("◌ HITCHED! STEER WITH MOVE — DASH TO LET GO");
        SM.tone(520, 0.12, "triangle", 0.08, 780);
        fxb(M.x, M.y, "#7dd3fc", 12, 160);
        break;
      }
    }
  }
  // parasites
  if (!RR.pars.length && G3.time > 2) remSpawnPar(7 + RR.lvl * 3);
  for (const p of RR.pars) {
    if (p.dead) continue;
    // fear hosts
    let fx = 0, fy = 0;
    for (const h of RR.hosts) {
      const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy);
      if (d < 230 && d > 1) { fx += (dx / d) * 1400 * (1 - d / 230); fy += (dy / d) * 1400 * (1 - d / 230); }
    }
    if (M.host) { p.x += fx * dt * 0.4; p.y += fy * dt * 0.4; }
    else {
      const dx = M.x - p.x, dy = M.y - p.y, d = Math.max(1, Math.hypot(dx, dy));
      p.x += ((dx / d) * p.sp + fx) * dt; p.y += ((dy / d) * p.sp + fy) * dt;
      const rr = p.r + M.r;
      if (d < rr && M.ifr <= 0) {
        M.ifr = 1.5; M.hp--;
        fxb(M.x, M.y, "#f87171", 14, 220);
        SM.tone(150, 0.25, "sawtooth", 0.12, 60);
        G3.shake = 6;
        p.x -= (dx / d) * 60; p.y -= (dy / d) * 60;
        if (M.hp <= 0) { remLose(); return; }
        else SM.showBanner("NIPPED! " + M.hp + " HP LEFT");
      }
    }
  }
  RR.pars = RR.pars.filter((p) => !p.dead);
  // reach the east edge: next current
  if (M.x > WD.w - 60) {
    if (RR.lvl >= 3) { remWin(); return; }
    RR.lvl++;
    M.x = 120; M.y = WD.h / 2; M.host = null; M.hp = Math.min(3, M.hp + 1);
    RR.pars = []; remSpawnPar(7 + RR.lvl * 3);
    RR.walls = remWalls(RR.lvl);
    for (const h of RR.hosts) { h.sp += 25; h.x = Math.random() * WD.w; }
    SM.showBanner("◌ CURRENT " + RR.lvl + "/3 — FASTER WATER");
    SM.sfxLevel();
  }
  fxTick(dt);
  simCam(M.host ? M.host.x : M.x, M.host ? M.host.y : M.y);
  MX.saveModeBest("remora", { lvl: RR.lvl, score: M.score || 0 });
  setBars("◌ REMORA " + RR.lvl + "/3", M.hp / 3, M.dashCD > 0 ? 0 : 1, (M.host ? "HITCHED — steer! dash to drop" : "find a host →") + " • ⬅ reach the east edge • ★ " + (M.score || 0));
}
function inGap(y, gaps) { for (const [a, b] of gaps) if (y >= a && y <= b) return true; return false; }
function remDash() {
  const M = RR.me;
  if (M.dashCD > 0) return;
  M.dashCD = 1.2;
  if (M.host) { M.host = null; M.bvx = Math.cos(M.face) * 520; M.bvy = Math.sin(M.face) * 520; M.dashT = 0.3; SM.tone(400, 0.1, "square", 0.06, 800); }
  else { M.bvx = Math.cos(M.face) * 420; M.bvy = Math.sin(M.face) * 420; M.dashT = 0.25; }
}
function remLose() {
  if (RR.over) return; RR.over = true;
  fxb(RR.me.x, RR.me.y, "#7dd3fc", 40, 300);
  SM.gameOver();
}
function remWin() {
  if (RR.over) return; RR.over = true; RR.won = true;
  window.__winTitle = "◌ REMORA RISING — ALL 3 CURRENTS RIDDEN!";
  MX.saveModeBest("remora", { win: 1, score: RR.me.score || 0 });
  SM.gameOver();
}
function remOver() {
  if (G3.mode !== "remora") return;
  winChipX("remora", RR.won ? null : ("◌ current " + RR.lvl + "/3 • ★ " + (RR.me.score || 0)));
}
function remDraw() {
  const ctx = SM.canvas.getContext("2d");
  ctx.save();
  ctx.translate(-Math.round(SC.x), -Math.round(SC.y));
  drawSea(ctx);
  const M = RR.me, WD = SM.WORLD;
  // kelp walls with gaps + glowing east exit
  for (const w of RR.walls) {
    let y0 = 0;
    const segs = w.gaps.slice().sort((a, b) => a[0] - b[0]);
    for (const [a, b] of segs.concat([[WD.h, WD.h]])) {
      if (a > y0) {
        ctx.fillStyle = "rgba(21,128,61,0.55)";
        ctx.fillRect(w.x - 16, y0, 32, a - y0);
        ctx.fillStyle = "rgba(74,222,128,0.5)";
        for (let y = y0 + 8; y < a; y += 26) {
          ctx.beginPath(); ctx.ellipse(w.x - 16 + Math.sin(y * 0.2 + G3.time * 2) * 6, y, 5, 9, 0.2, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(w.x + 16 + Math.cos(y * 0.17 + G3.time * 2) * 6, y + 10, 5, 9, -0.2, 0, TAU); ctx.fill();
        }
      }
      y0 = Math.max(y0, b);
    }
  }
  const eg = ctx.createLinearGradient(WD.w - 160, 0, WD.w, 0);
  eg.addColorStop(0, "rgba(253,224,71,0)"); eg.addColorStop(1, "rgba(253,224,71,0.35)");
  ctx.fillStyle = eg; ctx.fillRect(WD.w - 160, 0, 160, WD.h);
  // hosts via base tank art
  for (const h of RR.hosts) SM.drawFoe({ id: h.id, type: "tank", x: h.x, y: h.y, r: h.r, flash: h.flash, color: M.host === h ? "#5eead4" : h.color });
  // parasites
  for (const p of RR.pars) {
    if (p.dead) continue;
    ctx.fillStyle = "#c084fc";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#7e22ce"; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + G3.time * 3; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r); ctx.lineTo(p.x + Math.cos(a) * (p.r + 4), p.y + Math.sin(a) * (p.r + 4)); ctx.stroke(); }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x - 1.5, p.y - 1, 1.6, 0, TAU); ctx.fill();
  }
  // the remora
  if (!RR.over) {
    ctx.save(); ctx.translate(M.x, M.y); ctx.rotate(M.face);
    if (M.ifr > 0 && ((G3.time * 10) | 0) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-13, -3.5); ctx.lineTo(-13, 3.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0b1020"; ctx.beginPath(); ctx.arc(4, -1, 1.5, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    if (M.host) { ctx.strokeStyle = "rgba(94,234,212,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M.x, M.y); ctx.lineTo(M.host.x, M.host.y); ctx.stroke(); }
  }
  fxDraw(ctx);
  ctx.restore();
}
MX.register({ id: "remora", icon: "◌", name: "Remora Rising", desc: "Tiny, fragile, clever. Hitch hosts, ram parasites, thread kelp gates — ride 3 currents.", bestText(b) { return b ? (b.win ? "🏆 all 3 currents ridden!" : "best: current " + b.lvl + "/3") : "no currents ridden"; }, setup: remSetup, onOver: remOver });
window.SimModes.rem = { RR, remDash };

MX.addCSS(`
#reefBar { position: absolute; left: 8px; right: 8px; bottom: 108px; z-index: 6; display: flex; gap: 6px; align-items: center; background: rgba(5,10,24,.72); border: 1px solid rgba(103,232,249,.35); border-radius: 12px; padding: 6px 8px; font-size: 12px; font-weight: 800; overflow-x: auto; }
#reefBar .rw { white-space: nowrap; color: #fde047; }
#reefBar button { white-space: nowrap; background: linear-gradient(180deg, #22d3ee, #0284c7); color: #03252e; font-weight: 900; border: none; border-radius: 8px; padding: 6px 9px; font-size: 11px; }
#reefBar button:disabled { opacity: .35; }
.hidehud #reefBar { display: none; }
`);
