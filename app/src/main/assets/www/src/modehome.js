// ---------- modehome: home reef, evolution lab, seasons (menu-layer meta systems) ----------
const HM = window.__bubble, HX = window.ModeCore;
const G4 = HM.G, P4 = HM.P;

// ---------- Home Reef: permanent pearl-bought structures ----------
const REEF_KEY = "bpa_reef2";
function reefData() { try { return Object.assign({ hatch: 0, mill: 0, grotto: 0, garden: 0, anemone: 0, whet: 0 }, JSON.parse(localStorage.getItem(REEF_KEY) || "{}")); } catch (e) { return { hatch: 0, mill: 0, grotto: 0, garden: 0, anemone: 0, whet: 0 }; } }
function saveReef(d) { try { localStorage.setItem(REEF_KEY, JSON.stringify(d)); } catch (e) {} }
const STRUCTS = [
  { id: "hatch", icon: "🪺", name: "Hatchery", desc: "remora joins at +1 lvl each", base: 50, max: 3 },
  { id: "mill", icon: "🌀", name: "Current Mill", desc: "+6% swim speed each", base: 60, max: 3 },
  { id: "grotto", icon: "🦪", name: "Pearl Grotto", desc: "+15 pearls in pocket each dive", base: 70, max: 3 },
  { id: "garden", icon: "🪸", name: "Coral Garden", desc: "+12 max HP each", base: 55, max: 3 },
  { id: "anemone", icon: "🌺", name: "Lucky Anemone", desc: "+8% XP each", base: 65, max: 3 },
  { id: "whet", icon: "🗡", name: "Whetstone", desc: "+5% damage each", base: 80, max: 3 },
];
function structCost(s, lvl) { return Math.round(s.base * (lvl + 1) * 1.6); }
function reefBonus() {
  const d = reefData();
  return { remora: d.hatch, speed: 1 + 0.06 * d.mill, pocket: 15 * d.grotto, hp: 12 * d.garden, xp: 1 + 0.08 * d.anemone, dmg: 1 + 0.05 * d.whet };
}
// apply at every run start (all dive-based modes; harmless for sims which reset P after)
HX.addRunStart(() => {
  const b = reefBonus();
  if (b.hp) { P4.maxHp += b.hp; P4.hp += b.hp; }
  if (b.speed > 1) P4.speed *= b.speed;
  if (b.xp > 1) P4.xpMul *= b.xp;
  if (b.dmg > 1) P4.dmg *= b.dmg;
  if (b.pocket) G4.runPearls += b.pocket;
  G4._reefRem = b.remora;
  if (G4._reefRem) HM.showBanner("🪸 HOME REEF BLESSINGS ACTIVE");
});
// remora level catch-up once it joins
HX.addDiveMod(() => {
  if (G4._reefRem && G4.remora && !G4.remora._reef) {
    G4.remora._reef = true;
    for (let i = 0; i < G4._reefRem; i++) { G4.remora.lvl++; }
  }
});
function renderReefSec(body) {
  const d = reefData();
  let meta = HM.META;
  const row0 = HX.el("div", "row");
  row0.appendChild(HX.el("div", "grow", "Your reef grows with pearls. Every structure blesses every dive, forever. ● " + (meta.pearls || 0) + " pearls"));
  body.appendChild(row0);
  for (const s of STRUCTS) {
    const lvl = d[s.id] || 0, maxed = lvl >= s.max;
    const row = HX.el("div", "row");
    const tx = HX.el("div", "grow");
    const nm = HX.el("b", null, s.icon + " " + s.name + " ");
    const pips = HX.el("span", "pips");
    for (let pi = 0; pi < s.max; pi++) pips.appendChild(HX.el("i", pi < lvl ? "on" : ""));
    nm.appendChild(pips);
    tx.appendChild(nm);
    tx.appendChild(HX.el("small", null, s.desc));
    row.appendChild(tx);
    const b = HX.el("button", "mBtn" + (maxed ? " maxed" : ""), maxed ? "MAX" : "●" + structCost(s, lvl));
    b.disabled = maxed || (meta.pearls || 0) < structCost(s, lvl);
    b.addEventListener("click", () => {
      meta = HM.META;
      const cost = structCost(s, reefData()[s.id] || 0);
      if ((meta.pearls || 0) < cost) return;
      meta.pearls -= cost; HM.saveMeta(meta);
      const dd = reefData(); dd[s.id] = Math.min(s.max, (dd[s.id] || 0) + 1); saveReef(dd);
      HM.tone(660, 0.15, "triangle", 0.1, 990);
      window.renderModes();
    });
    row.appendChild(b);
    body.appendChild(row);
  }
  // living reef strip: what your reef looks like today
  const strip = HX.el("div", "row");
  let icons = "🪨";
  for (const s of STRUCTS) icons += s.icon.repeat(reefData()[s.id] || 0);
  strip.appendChild(HX.el("div", "grow", icons));
  body.appendChild(strip);
}
HX.addSection("🪸 Home reef — permanent blessings", renderReefSec);

// ---------- Evolution Lab: DNA samples spliced into the next run ----------
const LAB_KEY = "bpa_evolab";
function labData() { try { return Object.assign({ samples: {}, pending: null }, JSON.parse(localStorage.getItem(LAB_KEY) || "{}")); } catch (e) { return { samples: {}, pending: null }; } }
function saveLab(d) { try { localStorage.setItem(LAB_KEY, JSON.stringify(d)); } catch (e) {} }
const TRAITS = {
  mini: { n: "Scrappy", e: "+3% XP", f(p) { p.xpMul *= 1.03; } },
  chaser: { n: "Bloodhound", e: "+4% damage", f(p) { p.dmg *= 1.04; } },
  speedy: { n: "Finwork", e: "+5% swim speed", f(p) { p.speed *= 1.05; } },
  tank: { n: "Thick Skin", e: "+25 max HP", f(p) { p.maxHp += 25; p.hp += 25; } },
  splitter: { n: "Greedy Gut", e: "+10% pickup range", f(p) { p.magnet *= 1.1; } },
  spitter: { n: "Long Spout", e: "+1 pierce", f(p) { p.pierce = Math.min(5, (p.pierce || 0) + 1); } },
  exploder: { n: "Blast Womb", e: "+10 blast", f(p) { p.blast = (p.blast || 0) + 10; } },
  mine: { n: "Shrapnel", e: "+5% dmg, +5% speed", f(p) { p.dmg *= 1.05; p.speed *= 1.05; } },
  leecher: { n: "Second Heart", e: "+0.4 HP/s regen", f(p) { p.regen += 0.4; } },
  boss: { n: "Apex Genes", e: "+10% dmg, +15 HP", f(p) { p.dmg *= 1.1; p.maxHp += 15; p.hp += 15; } },
};
// DNA sampling: corpses are still in G.enemies when diveMod runs (filtered later in update)
HX.addDiveMod(() => {
  if (G4.mode !== "dive" && G4.mode !== "story" && G4.mode !== "challenge" && G4.mode !== "swarm" && G4.mode !== "descent" && G4.mode !== "rush") return;
  let changed = false;
  const lab = labData();
  for (const e of G4.enemies) {
    if (!e.dead || e._dna) continue;
    e._dna = true;
    let key = null, chance = 0;
    if (e.boss || e.superboss) { key = "boss"; chance = 1; }
    else if (e.elite) { key = FOE_ORDER[(Math.random() * (FOE_ORDER.length - 1)) | 0]; chance = 0.5; } // elites carry random species DNA
    else if (Math.random() < 0.012) { key = e.type; chance = 1; }
    if (key && TRAITS[key] && Math.random() < chance) {
      lab.samples[key] = (lab.samples[key] || 0) + 1;
      changed = true;
      HM.showBanner("🧬 SAMPLE SECURED: " + key.toUpperCase());
      HM.tone(880, 0.12, "sine", 0.08, 1320);
    }
  }
  if (changed) saveLab(lab);
});
// spliced trait applies to the next run, then burns out
HX.addRunStart(() => {
  const lab = labData();
  if (lab.pending && TRAITS[lab.pending]) {
    TRAITS[lab.pending].f(P4);
    HM.showBanner("🧬 SPLICED: " + TRAITS[lab.pending].n.toUpperCase());
    lab.pending = null; saveLab(lab);
  }
});
const FOE_ORDER = ["mini", "chaser", "speedy", "tank", "splitter", "spitter", "exploder", "mine", "leecher", "boss"];
function renderLabSec(body) {
  const lab = labData();
  const r0 = HX.el("div", "row");
  r0.appendChild(HX.el("div", "grow", "Elites drop DNA (50%), bosses always, strays rarely. Splice ONE trait into your next dive (●20)."));
  body.appendChild(r0);
  if (lab.pending) {
    const rp = HX.el("div", "row armed");
    rp.appendChild(HX.el("div", "grow", "🧬 armed for next dive: " + TRAITS[lab.pending].n + " (" + TRAITS[lab.pending].e + ")"));
    body.appendChild(rp);
  }
  for (const k of FOE_ORDER) {
    const t = TRAITS[k], n = lab.samples[k] || 0;
    const row = HX.el("div", "row");
    const tx = HX.el("div", "grow");
    tx.appendChild(HX.el("b", null, "🧬 " + t.n + " ×" + n));
    tx.appendChild(HX.el("small", null, k + " DNA — " + t.e));
    row.appendChild(tx);
    const b = HX.el("button", "mBtn", "SPLICE ●20");
    const meta = HM.META;
    b.disabled = n < 1 || (meta.pearls || 0) < 20 || !!lab.pending;
    b.addEventListener("click", () => {
      const m2 = HM.META, l2 = labData();
      if ((l2.samples[k] || 0) < 1 || (m2.pearls || 0) < 20 || l2.pending) return;
      l2.samples[k]--; m2.pearls -= 20; l2.pending = k;
      HM.saveMeta(m2); saveLab(l2);
      HM.tone(880, 0.15, "sine", 0.09, 1320);
      window.renderModes();
    });
    row.appendChild(b);
    body.appendChild(row);
  }
}
HX.addSection("🧬 Evolution lab — splice foe DNA", renderLabSec);

// ---------- Seasons: a monthly themed invasion ----------
const SEASONS = [
  { n: "Blood Tide", c: "rgba(190,18,60,0.16)", mods: [["Bloodwater", "elites drop hearts", () => { G4.mutHeart = true; }], ["Crowded", "+40% spawns", () => { G4.spawnMul = 1.4; }]] },
  { n: "Still Water", c: "rgba(148,163,184,0.13)", mods: [["Leaden", "everything slower, +25% XP", () => { G4.mutSpd = 0.85; G4.mutXp = 1.25; }], ["Golden", "2x pearls", () => { G4.pearlMul = 2; }]] },
  { n: "Neon Bloom", c: "rgba(192,38,211,0.15)", mods: [["Goldrush", "2x pearls", () => { G4.pearlMul = 2; }], ["Famine", "half gems, 2x XP each", () => { G4.gemMul = 0.5; G4.xpMul2 = 2; }]] },
  { n: "Swift Current", c: "rgba(34,211,238,0.12)", mods: [["Swift", "foes +20% speed, +20% XP", () => { G4.mutSpd = 1.2; G4.mutXp = 1.2; }], ["Crowded", "+40% spawns", () => { G4.spawnMul = 1.4; }]] },
  { n: "Glass Sea", c: "rgba(224,242,254,0.14)", mods: [["Glass", "foes −25% HP, +25% damage", () => { G4.mutHp = 0.75; G4.mutDmg = 1.25; }], ["Bloodwater", "elites drop hearts", () => { G4.mutHeart = true; }]] },
  { n: "Gem Rain", c: "rgba(253,224,71,0.12)", mods: [["Downpour", "double gems", () => { G4.mutGem = 2; }], ["Crowded", "+40% spawns", () => { G4.spawnMul = 1.4; }]] },
  { n: "Frozen Trench", c: "rgba(165,243,252,0.16)", mods: [["Leaden", "everything slower, +25% XP", () => { G4.mutSpd = 0.85; G4.mutXp = 1.25; }], ["Swift", "foes +20% speed, +20% XP", () => { G4.mutSpd = 1.2; G4.mutXp = 1.2; }]] },
  { n: "Golden Drift", c: "rgba(245,158,11,0.13)", mods: [["Golden", "2x pearls", () => { G4.pearlMul = 2; }], ["Goldrush+", "2x elites", () => { G4.eliteMul = 2; }]] },
  { n: "Red Night", c: "rgba(127,29,29,0.18)", mods: [["Bloodwater", "elites drop hearts", () => { G4.mutHeart = true; }], ["Glass", "foes −25% HP, +25% damage", () => { G4.mutHp = 0.75; G4.mutDmg = 1.25; }]] },
  { n: "Plankton Bloom", c: "rgba(74,222,128,0.13)", mods: [["Famine", "half gems, 2x XP each", () => { G4.gemMul = 0.5; G4.xpMul2 = 2; }], ["Golden", "2x pearls", () => { G4.pearlMul = 2; }]] },
  { n: "Storm Surge", c: "rgba(59,130,246,0.15)", mods: [["Storm", "+30% spawns, +15% foe speed", () => { G4.spawnMul = 1.3; G4.foeSpdMul = 1.15; }], ["Downpour", "double gems", () => { G4.mutGem = 2; }]] },
  { n: "Abyssal Moon", c: "rgba(76,29,149,0.20)", mods: [["Leaden", "everything slower, +25% XP", () => { G4.mutSpd = 0.85; G4.mutXp = 1.25; }], ["Bloodwater", "elites drop hearts", () => { G4.mutHeart = true; }]] },
];
function seasonNow() {
  const d = new Date();
  const theme = SEASONS[d.getMonth()];
  return { key: d.getFullYear() + "-" + (d.getMonth() + 1), theme };
}
function seasonBest() { try { return JSON.parse(localStorage.getItem("bpa_season_" + seasonNow().key) || "null"); } catch (e) { return null; } }
// tint overlay (one div, recolored monthly)
(function seasonTint() {
  const t = document.createElement("div");
  t.id = "seasonTint";
  t.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:2;display:none;";
  const wrap = document.getElementById("gameWrap");
  if (wrap) wrap.appendChild(t);
})();
// season twists + banner at run start; best-wave tracking live
HX.addRunStart(() => {
  const { theme } = seasonNow();
  for (const [, , fn] of theme.mods) fn();
  HM.showBanner("🌙 " + theme.n.toUpperCase() + " SEASON");
  const t = document.getElementById("seasonTint");
  if (t) { t.style.display = "block"; t.style.background = theme.c; t.style.boxShadow = "inset 0 0 180px rgba(0,0,0,0.55)"; }
});
HX.addDiveMod(() => {
  const k = "bpa_season_" + seasonNow().key;
  try {
    const b = JSON.parse(localStorage.getItem(k) || "null");
    if (!b || G4.wave > b.wave) localStorage.setItem(k, JSON.stringify({ wave: G4.wave }));
  } catch (e) {}
});
function renderSeasonSec(body) {
  const { key, theme } = seasonNow();
  const best = seasonBest();
  const r = HX.el("div", "row live");
  const tx = HX.el("div", "grow");
  tx.appendChild(HX.el("b", null, "🌙 " + theme.n + " — " + key));
  tx.appendChild(HX.el("small", null, theme.mods.map((m) => m[0] + ": " + m[1]).join(" • ")));
  r.appendChild(tx);
  body.appendChild(r);
  const r2 = HX.el("div", "row");
  r2.appendChild(HX.el("div", "grow", "🏆 Season best: wave " + (best ? best.wave : "—") + " (fresh paint every month, glory is temporary)"));
  body.appendChild(r2);
}
HX.addSection("🌙 Seasonal abyss — this month's invasion", renderSeasonSec);
