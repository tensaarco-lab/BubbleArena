// ---------- modearena: dive-based modes (shared run helper + rush + swarm) ----------
const B2 = window.__bubble, MC = window.ModeCore;
const G2 = B2.G, P2 = B2.P;
const objLine = () => document.getElementById("objLine");
let __lastObj = "";
function setObjLine(t) { if (t === __lastObj) return; __lastObj = t; const o = objLine(); if (!o) return; if (!t) { o.hidden = true; return; } o.hidden = false; o.textContent = t; }

let node = null; // active scripted dive-run config
function startDiveRun(modeId, cfg) {
  node = cfg;
  __lastObj = "";
  setObjLine(null);
  window.__pendingMode = modeId;
  window.__noPact = true;
  if (cfg.seed) window.__pendingSeed = cfg.seed;
  B2.startGame(false);
  if (cfg.foeMul) G2.foeMul = cfg.foeMul;
  if (cfg.spawnMul) G2.spawnMul = cfg.spawnMul;
  if (cfg.apply) cfg.apply();
  if (cfg.banner) B2.showBanner(cfg.banner);
  window.__modeTick = diveTick;
  B2.updateHud(true);
}

// revive a config after JSON round-trip (armAgain strips functions): re-attach by mode id
function diveTick(dt) {
  if (G2.state !== "play") return; // halt states (levelup breather, pause...) freeze the script too
  if (node && node.freezeT) G2.time = Math.max(0, G2.time - dt); // frozen clock: waves never advance
  B2.update(dt);
  if (G2.state !== "play" || !node) return;
  const cur = node;
  if (cur.script) for (const s of cur.script) if (!s.done && G2.time >= s.t) { s.done = true; B2.showBanner(s.text); B2.tone(520, 0.2, "triangle", 0.1, 780); }
  try { if (cur.tick) cur.tick(dt); } catch (e) { console.error("node tick", e); }
  if (node === cur && cur.clear && cur.clear()) {
    const cb = cur.onClear; node = null;
    if (cb) cb();
    return;
  }
}

// victory without dying: bank the run and show the report card with a conquest chip
function winRun(title, modeId, bestRec) {
  window.__winTitle = title;
  if (bestRec) MC.saveModeBest(modeId, bestRec);
  B2.burst(P2.x, P2.y, "#fde047", 60, 420, 16);
  B2.pushRing(P2.x, P2.y, 220, "#fde047", 5);
  B2.sfxLevel();
  B2.gameOver();
}

// ---------- Boss Rush: Leviathan's Gauntlet ----------
const RUSH_ORDER = ["classic", "weaver", "summoner", "super"];
function rushSetup() {
  const R = { idx: 0, wait: 5, fighting: false };
  startDiveRun("rush", {
    banner: "⚔ LEVIATHAN'S GAUNTLET",
    freezeT: true,
    script: [{ t: 1, text: "4 BOSSES • NO MERCY" }],
    tick(dt) {
      const anyBoss = G2.enemies.some((e) => e.boss && !e.dead);
      if (anyBoss) { R.fighting = true; R.wait = 20; setObjLine("⚔ Gauntlet " + R.idx + "/4 — SLAY!"); return; }
      if (R.fighting) {
        R.fighting = false;
        if (R.idx >= RUSH_ORDER.length) {
          winRun("⚔ GAUNTLET CONQUERED!", "rush", { down: 4, time: Math.floor(G2.time) });
          return;
        }
        P2.hp = Math.min(P2.maxHp, P2.hp + Math.round(P2.maxHp * 0.5));
        G2.pendingLevels++; B2.openLevelUp(true);
        B2.showBanner("BOSS DOWN! NEXT IN 20s");
        B2.tone(660, 0.2, "triangle", 0.12, 990);
      }
      R.wait -= dt;
      if (R.wait > 0) setObjLine("⚔ Gauntlet " + R.idx + "/4 — next boss in " + Math.ceil(R.wait) + "s");
      else {
        const pat = RUSH_ORDER[R.idx++];
        G2.rushIdx = R.idx; // progress mirror for the results chip
        if (pat === "super") B2.spawnSuperBoss(); else B2.spawnBoss(pat);
        R.fighting = true; // mark at spawn so instant kills still count
        R.wait = 20;
      }
    },
    clear: () => false,
  });
}
function rushOver() {
  setObjLine(null);
  if (window.__winTitle && G2.mode === "rush") {
    window.__winTitle = null;
    const chips = document.getElementById("overStats");
    if (chips) { const s = document.createElement("span"); s.className = "chip"; s.textContent = "⚔ GAUNTLET CONQUERED — ALL 4 BOSSES DOWN"; chips.appendChild(s); }
  } else if (G2.mode === "rush") {
    const chips = document.getElementById("overStats");
    if (chips) { const s = document.createElement("span"); s.className = "chip"; s.textContent = "⚔ the gauntlet took you at boss " + Math.min(4, (G2.rushIdx || 1)) + "/4"; chips.appendChild(s); }
  }
  G2.rushIdx = 0;
}
MC.register({ id: "rush", icon: "⚔", name: "Boss Rush", desc: "Classic, Weaver, Broodmother, Leviathan — back to back, breather heal + free pick between.", bestText(b) { return b ? ("🏆 conquered in " + B2.fmtTime(b.time)) : "unconquered"; }, setup: rushSetup, onOver: rushOver });

// ---------- Endless Swarm: unkillable bullet-heaven invert ----------
function swarmSetup() {
  const S = { lastK: 0, lastT: 0, ppm: 0, peak: 0, msgT: 0 };
  startDiveRun("swarm", {
    banner: "🌪 ENDLESS SWARM",
    script: [{ t: 1, text: "YOU CANNOT DIE. POP EVERYTHING." }],
    apply() { P2.maxHp *= 40; P2.hp = P2.maxHp; P2.regen += 20; },
    tick(dt) {
      G2.spawnMul = 2 + G2.time / 25;
      let n = 0;
      for (const e of G2.enemies) if (!e.dead) n++;
      const cap = Math.min(110, 30 + G2.time / 3);
      let guard = 14;
      while (n < cap && guard-- > 0) { B2.spawnEnemy(); n++; }
      S.msgT -= dt;
      if (G2.time - S.lastT >= 5) {
        const rate = (G2.kills - S.lastK) / Math.max(1, G2.time - S.lastT) * 60;
        S.ppm = Math.round(rate); S.peak = Math.max(S.peak, S.ppm);
        S.lastK = G2.kills; S.lastT = G2.time;
        MC.saveModeBest("swarm", { ppm: S.peak, kills: G2.kills });
      }
      if (S.msgT <= 0) { S.msgT = 0.5; setObjLine("🌪 " + S.ppm + " pops/min • peak " + S.peak + " • " + G2.kills + " pops"); }
    },
    clear: () => false,
  });
}
function swarmOver() {
  setObjLine(null);
  if (G2.mode === "swarm") {
    const chips = document.getElementById("overStats");
    if (chips) { const s = document.createElement("span"); s.className = "chip"; s.textContent = "🌪 SWARM PEAK: check Modes tab"; chips.appendChild(s); }
  }
}
MC.register({ id: "swarm", icon: "🌪", name: "Endless Swarm", desc: "40x HP + regen. Density ramps forever. Score is pops-per-minute.", bestText(b) { return b ? ("🏆 peak " + b.ppm + "/min • " + b.kills + " pops") : "no swarm yet"; }, setup: swarmSetup, onOver: swarmOver });

// shared victory chip for onOver handlers
function winChip(modeId) {
  if (!window.__winTitle || G2.mode !== modeId) return;
  const t = window.__winTitle; window.__winTitle = null;
  const chips = document.getElementById("overStats");
  if (chips) { const s = document.createElement("span"); s.className = "chip"; s.textContent = "🏆 " + t; chips.appendChild(s); }
}

// ---------- The Descent: roguelike 3-act campaign ----------
const D = { act: 1, step: 0, buildP: null, buildR: null, kills: 0, pearls: 0, choices: [], nodeK0: 0, bossPat: null, spoils: null };
const ACTS = [null,
  { name: "SUNLIT SHALLOWS", boss: "weaver", bossName: "WEBWEAVER", steps: 3 },
  { name: "TWILIGHT REEF", boss: "summoner", bossName: "BROODMOTHER", steps: 3 },
  { name: "THE ABYSS", boss: "super", bossName: "ABYSSAL LEVIATHAN", steps: 3 },
];
const SPOILS = [
  { n: "+1 bubble stream", d: "multishot +1", f(b) { b.multishot = Math.min(6, (b.multishot || 1) + 1); } },
  { n: "+20% damage", d: "all bubbles hit harder", f(b) { b.dmg *= 1.2; } },
  { n: "+15% fire rate", d: "pop faster", f(b) { b.fireRate *= 1.15; } },
  { n: "+40 max HP + heal", d: "sturdier puffer", f(b) { b.maxHp += 40; b.hp = Math.min(b.maxHp, b.hp + 60); } },
  { n: "+30% pickup range", d: "greedy magnet", f(b) { b.magnet *= 1.3; } },
  { n: "+1 pierce", d: "bubbles pass through", f(b) { b.pierce = Math.min(5, (b.pierce || 0) + 1); } },
  { n: "+8% swim speed", d: "faster fins", f(b) { b.speed *= 1.08; } },
  { n: "Full heal", d: "patch every wound", f(b) { b.hp = b.maxHp; } },
];
function poolFor(act) {
  const p = ["survive", "exterminate", "haven"];
  if (act >= 2) p.push("miniboss");
  return p;
}
function pick2(arr) { const a = arr.slice(); const o = []; while (o.length < 2 && a.length) o.push(a.splice((Math.random() * a.length) | 0, 1)[0]); return o; }

function descentSetup() {
  D.act = 1; D.step = 0; D.buildP = null; D.buildR = null; D.kills = 0; D.pearls = 0; D.spoils = null;
  D.choices = pick2(poolFor(1));
  G2.state = "map";
  document.getElementById("gameWrap").classList.add("hidehud");
  overOverlayFix();
  showMap();
}
function overOverlayFix() { try { document.getElementById("overOverlay").hidden = true; } catch (e) {} }
function mapEl() { let m = document.getElementById("dmapOverlay"); if (!m) { m = document.createElement("div"); m.id = "dmapOverlay"; document.getElementById("gameWrap").appendChild(m); } return m; }
function hideMap() { const m = document.getElementById("dmapOverlay"); if (m) m.remove(); document.getElementById("gameWrap").classList.remove("hidehud"); }
function mapQuit() { hideMap(); G2.state = "play"; B2.quitToMenu(); }

function saveBuildFromRun() {
  D.kills += G2.kills; D.pearls += G2.runPearls; G2.runPearls = 0;
  D.buildP = JSON.stringify(P2);
  if (G2.remora) D.buildR = JSON.stringify({ lvl: G2.remora.lvl, xp: G2.remora.xp });
  const m = B2.META; m.pearls = (m.pearls || 0) + D.pearls; D.pearls = 0; B2.saveMeta(m);
}
function restoreBuildToRun() {
  if (D.buildP) { const b = JSON.parse(D.buildP); for (const k of Object.keys(b)) P2[k] = b[k]; }
  D._rem = D.buildR ? JSON.parse(D.buildR) : null;
}
function nodeBackToMap(spoils) {
  saveBuildFromRun();
  D.spoils = spoils || null;
  G2.state = "map";
  document.getElementById("gameWrap").classList.add("hidehud");
  overOverlayFix();
  showMap();
}

function combatCfg(kind, n) {
  const cfg = { banner: kind === "boss" ? "☠ " + n : (kind === "survive" ? "◈ SURVIVE " + n + " WAVES" : "◈ POP " + n + " FOES") };
  if (kind === "survive") {
    cfg.script = [{ t: 1, text: "HOLD THE REEF" }];
    cfg.clear = () => G2.time >= n * 28;
  } else if (kind === "exterminate") {
    cfg.script = [{ t: 1, text: n + " POPS OR BUST" }];
    cfg.apply = () => { D.nodeK0 = G2.kills; };
    cfg.clear = () => (G2.kills - D.nodeK0) >= n;
  } else if (kind === "miniboss") {
    cfg.freezeT = true;
    const pat = D.act >= 3 ? "summoner" : (D.act === 2 ? "weaver" : "classic");
    cfg.script = [{ t: 0.5, text: "⛧ A HERALD APPROACHES" }];
    const S = { t: 0, spawned: false };
    cfg.tick = (dt) => {
      S.t += dt;
      if (!S.spawned && S.t > 2) { S.spawned = true; B2.spawnBoss(pat); }
    };
    cfg.clear = () => S.spawned && !G2.enemies.some((e) => e.boss && !e.dead);
  } else if (kind === "boss") {
    cfg.freezeT = true;
    const A = ACTS[D.act];
    cfg.script = [{ t: 0.5, text: "⛧ " + A.bossName } ];
    const S = { t: 0, spawned: false };
    cfg.tick = (dt) => {
      S.t += dt;
      if (!S.spawned && S.t > 2) { S.spawned = true; if (A.boss === "super") B2.spawnSuperBoss(); else B2.spawnBoss(A.boss); }
    };
    cfg.clear = () => S.spawned && !G2.enemies.some((e) => e.boss && !e.dead);
  }
  // shared: restore campaign build + remora catch-up
  const prevApply = cfg.apply;
  cfg.apply = () => { restoreBuildToRun(); if (prevApply) prevApply(); };
  const prevTick = cfg.tick;
  cfg.tick = (dt) => {
    if (D._rem && G2.remora && !G2.remora._rs) { G2.remora.lvl = D._rem.lvl; G2.remora.xp = D._rem.xp; G2.remora._rs = true; }
    if (prevTick) prevTick(dt);
  };
  cfg.onClear = () => {
    if (kind === "boss") {
      if (D.act >= 3) { winRun("⛧ ABYSS DESCENDED — ALL 3 ACTS!", "descent", { win: 1 }); return; }
      D.act++; D.step = 0; D.choices = pick2(poolFor(D.act));
      nodeBackToMap(rollSpoils());
    } else {
      D.step++;
      D.choices = pick2(poolFor(D.act));
      nodeBackToMap(rollSpoils());
    }
  };
  return cfg;
}
function rollSpoils() { const a = SPOILS.slice(); const o = []; while (o.length < 3 && a.length) o.push(a.splice((Math.random() * a.length) | 0, 1)[0]); return o.map((s) => SPOILS.indexOf(s)); }
function takeSpoil(i) {
  const s = SPOILS[D.spoils[i]];
  const b = D.buildP ? JSON.parse(D.buildP) : null;
  if (b && s) { s.f(b); D.buildP = JSON.stringify(b); }
  D.spoils = null;
  try { B2.tone(660, 0.15, "triangle", 0.1, 990); } catch (e) {}
  showMap();
}

function buildSummary() {
  if (!D.buildP) return "fresh puffer • LV 1";
  try {
    const b = JSON.parse(D.buildP);
    return "LV " + b.lvl + " • dmg " + Math.round(b.dmg) + " • x" + b.multishot + " • " + Math.round(b.hp) + "/" + Math.round(b.maxHp) + "hp";
  } catch (e) { return "seasoned puffer"; }
}
function nodeLabel(k) {
  if (k === "survive") return ["◈ SURVIVE", (D.act >= 3 ? 4 : 3) + " waves — hold out"];
  if (k === "exterminate") return ["✹ EXTERMINATE", (D.act === 1 ? 50 : D.act === 2 ? 80 : 120) + " pops — hunt"];
  if (k === "haven") return ["♥ HAVEN", "heal + pick a blessing"];
  if (k === "miniboss") return ["⛧ HERALD", "a lesser boss bars the way"];
  return [k, ""];
}
function startNode(kind) {
  if (kind === "haven") {
    const b = D.buildP ? JSON.parse(D.buildP) : { maxHp: 100, hp: 100, dmg: 12, fireRate: 2.2, multishot: 1, magnet: 135, pierce: 0, speed: 265 };
    b.hp = b.maxHp;
    const opts = pick2(SPOILS.map((_, i) => i));
    const bb = b; D._havenB = bb; D._havenO = opts;
    D.buildP = JSON.stringify(bb);
    D.step++;
    D.choices = pick2(poolFor(D.act));
    D.spoils = opts;
    try { B2.tone(520, 0.2, "triangle", 0.1, 780); } catch (e) {}
    showMap();
    return;
  }
  let cfg;
  if (kind === "survive") cfg = combatCfg("survive", D.act >= 3 ? 4 : 3);
  else if (kind === "exterminate") cfg = combatCfg("exterminate", D.act === 1 ? 50 : D.act === 2 ? 80 : 120);
  else if (kind === "miniboss") cfg = combatCfg("miniboss");
  else cfg = combatCfg("boss");
  hideMap();
  startDiveRun("descent", cfg);
}
function showMap() {
  const m = mapEl();
  const A = ACTS[D.act];
  m.innerHTML = "";
  const box = MC.el("div", "dmapBox");
  box.appendChild(MC.el("div", "dmapKicker", "⛧ THE DESCENT — ACT " + D.act + "/3"));
  box.appendChild(MC.el("h2", null, A.name));
  box.appendChild(MC.el("div", "dmapSub", buildSummary() + " • " + D.kills + " total pops"));
  const pips = MC.el("div", "dmapPips");
  for (let i = 0; i < A.steps; i++) pips.appendChild(MC.el("span", "pip" + (i < D.step ? " done" : ""), i < D.step ? "●" : "○"));
  pips.appendChild(MC.el("span", "pipBoss", "☠"));
  box.appendChild(pips);
  if (D.spoils && D.spoils.length) {
    box.appendChild(MC.el("div", "dmapKicker", "✦ SPOILS — PICK ONE"));
    const row = MC.el("div", "spoilRow");
    for (const si of D.spoils) {
      const s = SPOILS[si];
      const c = MC.el("button", "spoilCard");
      c.appendChild(MC.el("b", null, s.n));
      c.appendChild(MC.el("small", null, s.d));
      c.addEventListener("click", () => takeSpoil(D.spoils.indexOf(si)));
      row.appendChild(c);
    }
    box.appendChild(row);
  } else if (D.step >= A.steps) {
    const bb = MC.el("button", "bossBtn", "☠ FACE THE " + A.bossName + " (B)");
    bb.addEventListener("click", () => startNode("boss"));
    box.appendChild(bb);
  } else {
    box.appendChild(MC.el("div", "dmapKicker", "CHOOSE YOUR NEXT TRIAL"));
    for (const k of D.choices) {
      const [t, d] = nodeLabel(k);
      const b2 = MC.el("button", "nodeBtn");
      b2.appendChild(MC.el("b", null, t));
      b2.appendChild(MC.el("small", null, d));
      b2.addEventListener("click", () => startNode(k));
      box.appendChild(b2);
    }
  }
  const ab = MC.el("button", "mBtn ghost", "ABANDON (bank & menu)");
  ab.addEventListener("click", mapQuit);
  box.appendChild(ab);
  m.appendChild(box);
}
function descentOver() {
  setObjLine(null);
  winChip("descent");
  if (G2.mode === "descent" && !window.__winTitle) {
    const prev = MC.modeBest("descent");
    const score = D.act * 10 + D.step;
    if (!prev || score > prev.score) MC.saveModeBest("descent", { act: D.act, step: D.step, score });
    const chips = document.getElementById("overStats");
    if (chips) { const s = document.createElement("span"); s.className = "chip"; s.textContent = "⛧ fell in act " + D.act + " — trial " + (D.step + 1); chips.appendChild(s); }
  }
}
MC.register({ id: "descent", icon: "⛧", name: "The Descent", desc: "3-act roguelike campaign. Draft trials, keep your build, slay 3 act bosses.", bestText(b) { return b ? (b.win ? "🏆 abyss descended!" : "best: act " + b.act + " trial " + (b.step + 1)) : "the abyss waits"; }, setup: descentSetup, onOver: descentOver });

MC.addCSS(`
#dmapOverlay { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgba(3,6,16,.82); backdrop-filter: blur(4px); padding: 14px; }
.dmapBox { width: 100%; max-width: 420px; max-height: 92%; overflow-y: auto; background: linear-gradient(180deg, rgba(30,20,60,.96), rgba(8,10,28,.96)); border: 1px solid rgba(167,139,250,.5); border-radius: 18px; padding: 16px; text-align: center; box-shadow: 0 0 40px rgba(124,58,237,.35); }
.dmapBox h2 { margin: 2px 0 6px; font-size: 22px; letter-spacing: .1em; color: #ddd6fe; text-shadow: 0 0 16px rgba(167,139,250,.8); }
.dmapKicker { font-size: 11px; font-weight: 900; letter-spacing: .22em; color: #a78bfa; margin-top: 8px; }
.dmapSub { font-size: 12px; opacity: .85; margin-bottom: 6px; }
.dmapPips { display: flex; gap: 8px; justify-content: center; font-size: 16px; margin: 6px 0 4px; color: #a78bfa; }
.dmapPips .done { color: #4ade80; }
.nodeBtn, .bossBtn, .spoilCard { display: block; width: 100%; margin: 7px 0; padding: 10px; border-radius: 12px; border: 1px solid rgba(167,139,250,.45); background: rgba(76,29,149,.35); color: #f5f3ff; text-align: left; }
.nodeBtn b, .bossBtn { font-size: 15px; }
.nodeBtn small, .spoilCard small { display: block; font-size: 11px; opacity: .75; }
.bossBtn { text-align: center; font-size: 16px; font-weight: 900; background: linear-gradient(180deg, rgba(190,18,60,.5), rgba(76,5,25,.6)); border-color: rgba(251,113,133,.6); }
.spoilRow { display: flex; flex-direction: column; gap: 2px; }
.spoilCard b { font-size: 14px; color: #fde047; }
.dmapBox .mBtn { margin-top: 8px; }
`);

window.ArenaModes = { startDiveRun, diveTick, winRun, setObjLine, winChip };
window.Descent = { D, startNode, showMap, combatCfg, nodeBackToMap };

// ---------- Expedition log: 12 hand-designed story dives + lore codex ----------
const STORY_KEY = "bpa_story2";
function storyProg() { try { return Object.assign({ done: 0 }, JSON.parse(localStorage.getItem(STORY_KEY) || "{}")); } catch (e) { return { done: 0 }; } }
function saveStoryProg(p) { try { localStorage.setItem(STORY_KEY, JSON.stringify(p)); } catch (e) {} }
const STORY = [
  { t: "First Breath", sub: "survive 3 waves", goal: { w: 3 }, lore: "Bubbles hatched in the sunlit shallows, where the water tastes like light and everything smaller runs away." },
  { t: "Speedies!", sub: "survive 4 waves", goal: { w: 4 }, foe: { speedy: 3 }, script: [{ t: 2, text: "THEY ARE VERY FAST" }], lore: "The yellow speedies struck first. Bubbles learned that hunger is faster than fear." },
  { t: "Tank Line", sub: "pop 40 foes", goal: { k: 40 }, foe: { tank: 3 }, lore: "The blue tanks came in a wall. Bubbles popped the wall one brick at a time." },
  { t: "The Splitting", sub: "survive 5 waves", goal: { w: 5 }, foe: { splitter: 3 }, lore: "Green splitters divide when struck. Bubbles learned: some problems multiply. Pop them anyway." },
  { t: "Spit Take", sub: "survive 5 waves", goal: { w: 5 }, foe: { spitter: 3 }, lore: "The spitters shoot back. Bubbles respects that, and pops them from the side." },
  { t: "Orange Death", sub: "pop 60 foes", goal: { k: 60 }, foe: { exploder: 3 }, lore: "Orange means boom. The reef taught Bubbles to keep a polite distance from orange." },
  { t: "Leechfield", sub: "survive 6 waves", goal: { w: 6 }, foe: { leecher: 3 }, buff(b) { b.regen += 1; }, lore: "Leeches drink and drink. Bubbles out-regenerated them out of spite." },
  { t: "Maw Awakens", sub: "slay the ABYSSAL MAW", goal: { boss: "classic" }, buff(b) { b.dmg *= 1.3; }, lore: "The Maw rose with a mouth like a cave. Bubbles swam in anyway. Somebody had to." },
  { t: "Weaver's Web", sub: "slay the WEBWEAVER", goal: { boss: "weaver" }, buff(b) { b.speed *= 1.15; }, lore: "The Weaver's webs slow everything but Bubbles' temper." },
  { t: "Brood War", sub: "slay the BROODMOTHER", goal: { boss: "summoner" }, buff(b) { b.multishot += 1; }, lore: "A mother of a thousand teeth met a puffer with a thousand bubbles. The bubbles won." },
  { t: "Thin Blood", sub: "survive 8 waves, fragile", goal: { w: 8 }, buff(b) { b.maxHp = Math.round(b.maxHp * 0.6); b.hp = b.maxHp; b.dmg *= 1.5; }, lore: "Glass-finned and furious: the dive where Bubbles learned that dying is just popping with extra steps." },
  { t: "Leviathan", sub: "slay the ABYSSAL LEVIATHAN", goal: { boss: "super" }, buff(b) { b.dmg *= 1.4; b.maxHp += 60; b.hp = b.maxHp; }, lore: "In the lightless deep, something the size of weather opened one eye. Bubbles popped it." },
];
function storyCfg(i) {
  const d = STORY[i];
  const cfg = { banner: "📜 DIVE " + (i + 1) + ": " + d.t.toUpperCase(), script: [{ t: 1, text: d.sub.toUpperCase() }].concat(d.script || []) };
  if (d.foe) cfg.foeMul = d.foe;
  if (d.buff) cfg.apply = () => { d.buff(P2); };
  if (d.goal.w) cfg.clear = () => G2.time >= d.goal.w * 28;
  else if (d.goal.k) { cfg.apply = ((prev) => () => { D.nodeK0 = G2.kills; if (d.buff) d.buff(P2); })(cfg.apply); cfg.clear = () => (G2.kills - D.nodeK0) >= d.goal.k; }
  else if (d.goal.boss) {
    cfg.freezeT = true;
    const S = { t: 0, spawned: false };
    const prevA = cfg.apply;
    cfg.apply = () => { if (prevA) prevA(); };
    cfg.tick = (dt) => { S.t += dt; if (!S.spawned && S.t > 2) { S.spawned = true; if (d.goal.boss === "super") B2.spawnSuperBoss(); else B2.spawnBoss(d.goal.boss); } };
    cfg.clear = () => S.spawned && !G2.enemies.some((e) => e.boss && !e.dead);
  }
  cfg.onClear = () => {
    const p = storyProg(); p.done = Math.max(p.done, i + 1); saveStoryProg(p);
    renderModesSafe();
    winRun("📜 DIVE " + (i + 1) + " LOGGED: " + d.t.toUpperCase(), "story", { dive: i + 1, done: p.done });
  };
  return cfg;
}
function renderModesSafe() { try { if (window.renderModes && !document.getElementById("modeTab").hidden) window.renderModes(); } catch (e) {} }
function storySetup() {
  const p = storyProg();
  const i = Math.min(p.done, STORY.length - 1);
  hideMapSafe();
  startDiveRun("story", storyCfg(i));
}
function hideMapSafe() { const m = document.getElementById("dmapOverlay"); if (m) m.remove(); }
function storyOver() {
  setObjLine(null);
  winChip("story");
  if (G2.mode === "story" && window.__winTitle) window.__winTitle = null;
}
MC.register({ id: "story", icon: "📜", name: "Expedition Log", desc: "12 hand-designed dives with lore. Play in order, log them all.", bestText() { const p = storyProg(); return p.done >= 12 ? "🏆 all 12 dives logged!" : ("logged " + p.done + "/12"); }, setup: storySetup, onOver: storyOver });

function renderStorySec(body) {
  const p = storyProg();
  STORY.forEach((d, i) => {
    const unlocked = i <= p.done, done = i < p.done;
    const row = MC.el("div", "row erow " + (done ? "done" : unlocked ? "next" : "locked"));
    const txt = MC.el("div", "grow");
    txt.appendChild(MC.el("b", null, (done ? "✓ " : unlocked ? "▶ " : "🔒 ") + (i + 1) + ". " + d.t));
    const sm = MC.el("small", null, d.sub + (done ? " — " + d.lore : ""));
    txt.appendChild(sm);
    row.appendChild(txt);
    if (unlocked && !done) {
      const go = MC.el("button", "mBtn goDive", "DIVE");
      go.addEventListener("click", () => { hideMapSafe(); startDiveRun("story", storyCfg(i)); MC.armAgain("story", () => { hideMapSafe(); startDiveRun("story", storyCfg(i)); }); });
      row.appendChild(go);
    } else if (done) {
      const go = MC.el("button", "mBtn ghost", "REPLAY");
      go.addEventListener("click", () => { hideMapSafe(); startDiveRun("story", storyCfg(i)); MC.armAgain("story", () => { hideMapSafe(); startDiveRun("story", storyCfg(i)); }); });
      row.appendChild(go);
    }
    body.appendChild(row);
  });
}
MC.addSection("📜 Expedition log — dives & lore", renderStorySec);

// ---------- Player-created challenges: share codes, custom mod loadouts ----------
const CHMODS = [
  { id: "crowded", name: "Crowded", desc: "+60% spawns", apply() { G2.spawnMul = 1.6; } },
  { id: "famine", name: "Famine", desc: "half gems, 2x XP each", apply() { G2.gemMul = 0.5; G2.xpMul2 = 2; } },
  { id: "glass", name: "Glassfin", desc: "−30% HP, +30% dmg", apply() { P2.maxHp = Math.round(P2.maxHp * 0.7); P2.hp = P2.maxHp; P2.dmg *= 1.3; } },
  { id: "swift", name: "Swift Water", desc: "foes +25% spd, you +12%", apply() { G2.foeSpdMul = 1.25; P2.speed *= 1.12; } },
  { id: "leaden", name: "Leaden Tide", desc: "everything slower, +30% XP", apply() { G2.mutSpd = 0.85; G2.mutXp = 1.3; } },
  { id: "blood", name: "Bloodwater", desc: "elites drop hearts", apply() { G2.mutHeart = true; } },
  { id: "gold", name: "Goldrush", desc: "2x pearls", apply() { G2.pearlMul = 2; } },
  { id: "storm", name: "Storm Surge", desc: "+30% spawns, +15% foe speed", apply() { G2.spawnMul = 1.3; G2.foeSpdMul = 1.15; } },
];
function chalEncode(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
function chalDecode(s) { return JSON.parse(decodeURIComponent(escape(atob(s.trim())))); }
function runChallenge(co) {
  const mods = (co.mods || []).map((id) => CHMODS.find((m) => m.id === id)).filter(Boolean);
  const gl = co.goal || { t: "w", n: 8 };
  const cfg = {
    banner: "✉ CHALLENGE: " + (co.seed || "mystery").toUpperCase(),
    seed: String(co.seed || "challenge"),
    script: [{ t: 1, text: ("GOAL: " + (gl.t === "w" ? "SURVIVE " + gl.n + " WAVES" : "POP " + gl.n + " FOES")).toUpperCase() }],
    apply() {
      D.nodeK0 = G2.kills;
      for (const m of mods) m.apply();
    },
    clear: gl.t === "w" ? () => G2.time >= gl.n * 28 : () => (G2.kills - D.nodeK0) >= gl.n,
    onClear() {
      MC.saveModeBest("challenge", { seed: String(co.seed || "?").slice(0, 18), time: Math.floor(G2.time) });
      winRun("✉ CHALLENGE COMPLETE!", "challenge");
    },
  };
  startDiveRun("challenge", cfg);
}
function chalOver() { setObjLine(null); winChip("challenge"); }
MC.register({ id: "challenge", icon: "✉", name: "Challenge Dock", desc: "Seeded custom runs: pick mods + goal, share the code. Tap for a random throwdown.", bestText(b) { return b ? ("🏆 " + b.seed + " in " + B2.fmtTime(b.time)) : "no challenges run"; },
  setup() {
    const ids = CHMODS.map((m) => m.id).sort(() => Math.random() - 0.5).slice(0, 2);
    runChallenge({ seed: "wild-" + ((Math.random() * 900 + 100) | 0), mods: ids, goal: { t: "w", n: 6 + ((Math.random() * 5) | 0) } });
  }, onOver: chalOver });

function renderChalSec(body) {
  const info = MC.el("div", "row");
  info.appendChild(MC.el("div", "grow", "Build a custom dive: name a seed, tick mods, set a goal — share the code, race ghosts."));
  body.appendChild(info);
  const seedIn = document.createElement("input");
  seedIn.placeholder = "seed name (e.g. kelp-chaos)";
  seedIn.style.cssText = "width:100%;background:rgba(0,0,0,.4);color:#a5f3fc;border:1px solid rgba(103,232,249,.4);border-radius:8px;padding:7px;margin-bottom:6px;";
  body.appendChild(seedIn);
  const picks = {};
  const grid = MC.el("div", "modeGrid");
  for (const m of CHMODS) {
    const b = MC.el("button", "mBtn ghost", "🌀 " + m.name);
    b.title = m.desc;
    b.addEventListener("click", () => { picks[m.id] = !picks[m.id]; b.style.borderColor = picks[m.id] ? "#fde047" : ""; b.style.color = picks[m.id] ? "#fde047" : ""; });
    grid.appendChild(b);
  }
  body.appendChild(grid);
  const goalSel = document.createElement("select");
  goalSel.style.cssText = "width:100%;margin:6px 0;background:rgba(0,0,0,.4);color:#eaf2ff;border-radius:8px;padding:7px;";
  [["w:5", "Survive 5 waves"], ["w:8", "Survive 8 waves"], ["w:12", "Survive 12 waves"], ["k:100", "Pop 100 foes"], ["k:250", "Pop 250 foes"]].forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; goalSel.appendChild(o); });
  body.appendChild(goalSel);
  const codeOut = MC.el("div", "codeBox", "your code appears here");
  body.appendChild(codeOut);
  const row = MC.el("div", "row");
  const mk = MC.el("button", "mBtn", "CREATE CODE");
  mk.addEventListener("click", () => {
    const [gt, gn] = goalSel.value.split(":");
    const co = { v: 1, seed: seedIn.value.trim() || ("reef-" + ((Math.random() * 900 + 100) | 0)), mods: Object.keys(picks).filter((k) => picks[k]), goal: { t: gt, n: Number(gn) } };
    codeOut.textContent = chalEncode(co);
    try { B2.tone(700, 0.08, "triangle", 0.09, 1000); } catch (e) {}
  });
  const go = MC.el("button", "mBtn", "START THIS CODE");
  go.addEventListener("click", () => {
    try { const co = chalDecode(codeOut.textContent); MC.armAgain("challenge", () => runChallenge(co)); runChallenge(co); }
    catch (e) { codeOut.textContent = "⚠ that code didn't decode — create or paste a valid one"; }
  });
  row.appendChild(mk); row.appendChild(go);
  body.appendChild(row);
  const inbox = document.createElement("input");
  inbox.placeholder = "paste a friend's code…";
  inbox.style.cssText = seedIn.style.cssText;
  body.appendChild(inbox);
  const go2 = MC.el("button", "mBtn", "SWIM A FRIEND'S CODE");
  go2.addEventListener("click", () => {
    try { const co = chalDecode(inbox.value); MC.armAgain("challenge", () => runChallenge(co)); runChallenge(co); }
    catch (e) { inbox.value = ""; inbox.placeholder = "⚠ bad code — try again"; }
  });
  body.appendChild(go2);
  const pre = MC.el("div", "row");
  pre.appendChild(MC.el("div", "grow", "House specials:"));
  body.appendChild(pre);
  const presets = [
    { n: "Bloodreef (hard)", co: { v: 1, seed: "bloodreef", mods: ["blood", "crowded", "swift"], goal: { t: "w", n: 8 } } },
    { n: "Famine run", co: { v: 1, seed: "lean-times", mods: ["famine", "leaden"], goal: { t: "k", n: 150 } } },
    { n: "Glass cannon", co: { v: 1, seed: "glassjaw", mods: ["glass", "gold", "storm"], goal: { t: "w", n: 10 } } },
  ];
  for (const p of presets) {
    const b = MC.el("button", "mBtn ghost", p.n);
    b.addEventListener("click", () => { MC.armAgain("challenge", () => runChallenge(p.co)); runChallenge(p.co); });
    body.appendChild(b);
  }
}
MC.addSection("✉ Challenge dock — build & share custom dives", renderChalSec);
