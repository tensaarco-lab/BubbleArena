// Bubble Pop Arena — top-down auto-shooter with waves, XP and level-up upgrades.
// No dependencies. Mobile-first: floating drag joystick + auto-fire.

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const wrap = document.getElementById("gameWrap");
const xpFill = document.getElementById("xpFill");
const hpFill = document.getElementById("hpFill");
const lvlBadge = document.getElementById("lvlBadge");
const hudStats = document.getElementById("hudStats");
const waveBanner = document.getElementById("waveBanner");
const joyBase = document.getElementById("joyBase");
const joyKnob = document.getElementById("joyKnob");
const startOverlay = document.getElementById("startOverlay");
const levelOverlay = document.getElementById("levelOverlay");
const pauseOverlay = document.getElementById("pauseOverlay");
const overOverlay = document.getElementById("overOverlay");
const cardCtn = document.getElementById("cardCtn");
const overStats = document.getElementById("overStats");
const pauseStats = document.getElementById("pauseStats");
const newBest = document.getElementById("newBest");
const miniMap = document.getElementById("miniMap");
const mctx = miniMap.getContext("2d");
const MS = 132;
const levelBanner = document.getElementById("levelBanner");

const TAU = Math.PI * 2;
let RNG = Math.random;
const rand = (a, b) => a + RNG() * (b - a);
function hashSeed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

const BULLET_COLORS = ["#7df9ff", "#e0f7ff", "#a5f3fc", "#93c5fd", "#cffafe", "#67e8f9"];

// ---------- audio ----------
let audioCtx = null;
let muted = false;
try { muted = localStorage.getItem("bubblePopArenaMute") === "1"; } catch (e) { /* ignore */ }
function setMuted(m) {
  muted = m;
  try { localStorage.setItem("bubblePopArenaMute", m ? "1" : "0"); } catch (e) { /* ignore */ }
  const mb = document.getElementById("muteBtn");
  if (mb) { mb.textContent = m ? "✕" : "♪"; mb.style.opacity = m ? "0.5" : "1"; }
  refreshOpts();
}
let lastShootSfx = 0;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function tone(freq, dur, type, vol, slideTo) {
  if (muted || !audioCtx) return;
  const sv = (OPT.sfxVol === undefined ? 100 : OPT.sfxVol) / 100;
  if (sv <= 0) return;
  try {
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime((vol || 0.12) * sv, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* ignore */ }
}
const sfxShoot = () => { const n = performance.now(); if (n - lastShootSfx < 70) return; lastShootSfx = n; tone(rand(650, 950), 0.07, "square", 0.03); };
const sfxPop = () => tone(rand(300, 420), 0.12, "sine", 0.10, 90);
const sfxGem = () => tone(rand(1100, 1500), 0.06, "sine", 0.05);
const sfxHurt = () => tone(160, 0.25, "sawtooth", 0.14, 60);
const sfxLevel = () => { tone(523, 0.12, "triangle", 0.12); setTimeout(() => tone(659, 0.12, "triangle", 0.12), 110); setTimeout(() => tone(784, 0.2, "triangle", 0.12), 220); };
const sfxBoss = () => tone(110, 0.5, "sawtooth", 0.14, 55);

// ---------- generative music (chill loop, intensifies with wave) ----------
const Music = { on: false, step: 0, nextT: 0 };
const PENTA = [440, 523.25, 587.33, 659.25, 783.99, 880];
const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [146.83, 174.61, 220]];
function musicNote(freq, t, dur, type, vol) {
  const mv = ((OPT.musVol === undefined ? 100 : OPT.musVol) / 100) || 0;
  if (mv <= 0) return;
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * mv, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  } catch (e) { /* ignore */ }
}
function musicTick() {
  if (!Music.on || !audioCtx || muted || !OPT.music || (OPT.musVol || 0) <= 0) return;
  const dread = G.superAlive;
  const stepDur = dread ? 0.32 : 0.24;
  if (Music.nextT < audioCtx.currentTime - 1) Music.nextT = audioCtx.currentTime + 0.05;
  while (Music.nextT < audioCtx.currentTime + 0.35) {
    const s = Music.step, t = Music.nextT;
    if (dread) {
      // abyssal dread theme: deep drone, mournful swell, dissonant wail
      if (s % 2 === 0) musicNote(55, t, 0.5, "sine", 0.06);
      if (s % 8 === 4) musicNote(82.5, t, 1.2, "triangle", 0.05);
      if (s % 8 === 0) musicNote(466.16, t, 0.9, "sawtooth", 0.018);
      if (s % 16 === 12) musicNote(311.13, t, 1.4, "triangle", 0.03);
      if (s % 4 === 2) musicNote(38, t, 0.4, "sine", 0.07);
    } else {
    const tier = G.wave >= 5 ? 3 : G.wave >= 3 ? 2 : 1;
    // kill-jam: hot combos push the band as hard as deep water does
    const ct = G.combo >= 20 ? 4 : G.combo >= 10 ? 3 : 0;
    const effTier = Math.max(tier, ct);
    if (s % 8 === 0) {
      const ch = CHORDS[((s / 8) | 0) % CHORDS.length];
      for (const f of ch) musicNote(f, t, 1.6, "triangle", 0.035);
      musicNote(ch[0] / 2, t, 1.6, "sine", 0.05);
    }
    if (effTier >= 1 && s % 2 === 0) musicNote(PENTA[(s * 7 + 3) % PENTA.length] / 2, t, 0.3, "sine", 0.03);
    if (effTier >= 2 && s % 4 === 2) musicNote(6000, t, 0.05, "square", 0.012);
    if (effTier >= 3) musicNote(PENTA[(s * 5 + 1) % PENTA.length], t, 0.22, "triangle", 0.028);
    if (effTier >= 4 && s % 4 === 0) musicNote(PENTA[(s * 3 + 2) % PENTA.length] * 2, t, 0.12, "square", 0.014);
    }
    Music.step++;
    Music.nextT += stepDur;
  }
}

// ---------- persistent best ----------
const BEST_KEY = "bubblePopArenaBest";
function loadBest(diff) {
  try { return JSON.parse(localStorage.getItem(bestKey(diff)) || "null"); } catch (e) { return null; }
}
function saveBest(b, diff) { try { localStorage.setItem(bestKey(diff), JSON.stringify(b)); } catch (e) { /* ignore */ } }

// ---------- difficulty modes: pick before a dive, harder pays more ----------
const DIFF_KEY = "bubblePopArenaDiff";
const DIFFS = {
  easy: { id: "easy", name: "EASY", icon: "🟢", blurb: "Chill currents", hp: 0.7, dmg: 0.7, spd: 0.9, xp: 1.0, pearl: 1.0, score: 1.0, color: "#4ade80", tip: "Foes are weaker and slower. Standard rewards." },
  normal: { id: "normal", name: "NORMAL", icon: "🔵", blurb: "The true reef", hp: 1.0, dmg: 1.0, spd: 1.0, xp: 1.15, pearl: 1.25, score: 1.25, color: "#67e8f9", tip: "The intended dive. +15% XP, +25% pearls & score." },
  hard: { id: "hard", name: "HARD", icon: "🔴", blurb: "Hungry waters", hp: 1.4, dmg: 1.35, spd: 1.1, xp: 1.35, pearl: 1.6, score: 1.6, color: "#f87171", tip: "Foes hit much harder. +35% XP, +60% pearls & score." },
};
function bestKey(diff) { return BEST_KEY + "_" + (diff || "normal"); }
function loadDiff() {
  try {
    const d = localStorage.getItem(DIFF_KEY) || "normal";
    return DIFFS[d] ? d : "normal";
  } catch (e) { return "normal"; }
}
function saveDiff(d) { try { localStorage.setItem(DIFF_KEY, d); } catch (e) { /* ignore */ } }
function diffDef(id) { return DIFFS[id] || DIFFS.normal; }

const META_KEY = "bubblePopArenaMeta";
// ---------- options (persisted) ----------
const OPT_KEY = "bubblePopArenaOpts";
function loadOpts() { try { return Object.assign({ music: true, shake: true, particles: true, sfxVol: 100, musVol: 100, dmgNums: true, hitStop: true, slowmo: true, calm: false, vib: true }, JSON.parse(localStorage.getItem(OPT_KEY) || "{}")); } catch (e) { return { music: true, shake: true, particles: true, sfxVol: 100, musVol: 100, dmgNums: true, hitStop: true, slowmo: true, calm: false, vib: true }; } }
let OPT = loadOpts();
function saveOpts() { try { localStorage.setItem(OPT_KEY, JSON.stringify(OPT)); } catch (e) { /* ignore */ } }const META_ITEMS = [
  { id: "power", name: "Power", desc: "+8% bubble damage", base: 10 },
  { id: "magnet", name: "Magnetism", desc: "+12% pickup range", base: 10 },
  { id: "vitality", name: "Vitality", desc: "+15 max HP", base: 15 },
  { id: "second", name: "Second Wind", desc: "revive once per run", base: 60 },
];
function loadMeta() { try { return Object.assign({ pearls: 0, power: 0, magnet: 0, vitality: 0, second: 0, cosT: {}, cosH: {}, cos: { trail: "cyan", hat: "none" }, seen: {}, slain: {} }, JSON.parse(localStorage.getItem(META_KEY) || "{}")); } catch (e) { return { pearls: 0, power: 0, magnet: 0, vitality: 0, second: 0, cosT: {}, cosH: {}, cos: { trail: "cyan", hat: "none" }, seen: {}, slain: {} }; } }
function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } }
let META = loadMeta();
function metaCost(it) { const lvl = META[it.id] || 0; if (it.id === "second" && lvl >= 1) return null; return Math.round(it.base * Math.pow(2.2, lvl)); }
// cosmetic shop: trails + hats, pure vanity for banked pearls
const COS_TRAILS = [
  { id: "cyan", name: "Cyan Mist", color: "#9be9ff", cost: 0 },
  { id: "gold", name: "Gilded", color: "#fde047", cost: 150 },
  { id: "rose", name: "Rosetide", color: "#fda4af", cost: 250 },
  { id: "mint", name: "Mint Current", color: "#6ee7b7", cost: 400 },
];
const COS_HATS = [
  { id: "none", name: "Bare Head", cost: 0 },
  { id: "party", name: "Party Cone", cost: 200 },
  { id: "sailor", name: "Sailor Cap", cost: 350 },
  { id: "halo", name: "Angelfin Halo", cost: 500 },
];
function trailColor() { const t = COS_TRAILS.find((x) => x.id === ((META.cos || {}).trail || "cyan")); return (t && t.color) || "#9be9ff"; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function dailyKey() { return "bubblePopArenaDaily" + todayStr(); }

// ---------- game state ----------
const WAVE_LEN = 28; // seconds per wave
let W = 0, H = 0, DPR = 1;
const WORLD = { w: 2000, h: 2000 };
let camX = 0, camY = 0;
let vigGrad = null, hurtGrad = null;

const G = {
  state: "menu", // menu | play | levelup | pause | over (+ pact | clam | shop | depth choice states)
  time: 0,
  wave: 1,
  kills: 0,
  enemies: [],
  bullets: [],
  ebullets: [],
  gems: [],
  hearts: [],
  parts: [],
  texts: [],
  ambient: [],
  decor: [],
  spawnTimer: 1,
  bossAlive: false,
  bossSpawnedWave: 0,
  epicAlive: false,
  gate: null, gateHold: false, // rift gate: swim in after an epic to start the next leg
  superAlive: false,
  superSpawnedWave: 0,
  pendingLevels: 0,
  nextId: 1,
  shake: 0,
  rings: [],
  hurtFlash: 0,
  beam: null,
  combo: 0, comboT: 0, bestCombo: 0,
  hitstop: 0, slowmo: 0, dnums: [], achT: 0,
  streak: 0, streakT: 0,
  announce: null, announceT: 0, announceTier: -1,
  // living-reef rig: darkness/light level, explosion flare radius, kill-cam zoom,
  // spawn portals + soul wisps (capped pools, updated in updateFx, drawn in render)
  portals: [], wisps: [], dark: 0, flashR: 0, zoom: 1,
  // feel pack: hurt edge-flash + offscreen damage wedge, combo gem-tick throttle,
  // auto-quality fps guard (drops snow/shadow/particles when the reef chugs)
  hurtEdge: 0, wedgeT: 0, wedgeX: 0, wedgeY: 0, tickCd: 0,
  lowQ: false, fpsEMA: 60, qLowT: 0, qHighT: 0,
  focusT: 0, focusX: 0, focusY: 0, focusHold: 0, // intro pan: camera visits the boss, then glides home
  pearls: [],
  runPearls: 0,
  // elemental power-ups (fire/ice drops): active kind + seconds left, floating pickups
  pups: [], powerKind: null, powerT: 0,
  // run pacts (drafted oath), wave mutators, objectives, hazards, remora, webs, ascension, timeline
  pactId: null, pactPearl: 1, comboWin: 2.5, comboXPMul: 1, pactHeal: 1,
  mut: null, mutName: "", mutSpd: 1, mutHp: 1, mutXp: 1, mutDmg: 1, mutGem: 1, mutHeart: false,
  obj: null, objT: 25, objN: 0,
  barrels: [], barrelT: 10, lanes: [],
  // abyssal relics: one run-warping draft per dive + trench implosion urchins
  relic: null, offeredRelics: [], relicXp: 1, relicFoeHp: 1, relicEliteHp: 1, relicPearl: 1, relicThorns: false,
  relicRage: false, relicVacuum: false, relicFreeze: 0, relicFrostCD: 1, relicClam: 0, relicBane: false,
  relicChest: 1, relicXpHalf: false, debtRevives: 0,
  urchins: [], urchinT: 10,
  hadalAlive: false, hadalSpawnedWave: 0,
  webs: [],
  remora: null,
  depth: 0, depthOffered: -1, depthHp: 1, depthDmg: 1, pearlDepth: 1,
  tl: [], tlT: 0, lastHitBy: "the reef",
  daily: false,
  weekly: false,
  diff: "normal",
  eliteT: 20,
  clamWave: 0,
  currents: [], whirls: [], clams: [],
  minnows: [],
  jellies: [], schools: [], schoolT: 12, blobs: [],
  reviveUsed: false,
  weedT: 0,
  shots: 0, chests: [], nextChest: 25, magPulseCD: 0, heartT: 0, previewDone: false,
  // active abilities + finisher cooldowns
  cdNova: 0, cdFreeze: 0, cdDecoy: 0, cdFin: 0,
  freezeT: 0, decoy: null,
  // transient combat light flashes (explosions, novas, evolutions)
  lights: [],
  // ghost replay (recorded path; best ghost loaded for racing)
  ghost: [], ghostT: 0, ghostPlay: null,
  // wandering merchant + procedural stages (name/palette/foe-mix/hazards/twist per 3 waves)
  merchant: null, merchT: 60, stageN: 0, stage: null, stageBag: [],
  dailyMods: [],
  hideHud: false,
};

const P = {}; // player, filled by resetPlayer()

function resetPlayer() {
  P.x = WORLD.w / 2; P.y = WORLD.h / 2;
  P.r = 18;
  P.hp = 100; P.maxHp = 100;
  P.speed = 265;
  P.dmg = 12;
  P.fireRate = 2.2;
  P.cool = 0;
  P.multishot = 1;
  P.bulletR = 7;
  P.bulletSpeed = 540;
  P.pierce = 0;
  P.bounce = 0;
  P.blast = 0;
  P.magnet = 135;
  P.crit = 0.05;
  P.critMult = 2; // STARFALL evolution raises crits to 3x
  P.regen = 0;
  P.xpMul = 1;
  P.lvl = 1;
  P.xp = 0;
  P.xpNeed = xpNeedFor(1);
  P.iframes = 0;
  P.muzzle = 0;
  P.heat = 0;
  P.mouth = 0;
  P.blink = 0;
  P.blinkT = 2;
  P.finPhase = 0;
  P.squash = 0;
  P.trailT = 0;
  P.dashT = 0; P.dashCD = 0; P.dashDx = 1; P.dashDy = 0; P.lastTap = 0;
  P.noDash = false;
  P.mvx = 0; P.mvy = 0;
  P.face = -Math.PI / 2;
  P.stacks = {};
  P.morph = "a0t0f0"; // hybrid morph key (puffer = no traits unlocked)
  P.morphGot = {};
  P.abil = { nova: 0, freeze: 0, decoy: 0 }; // active ability ranks (cut cooldowns)
  P.curse = { glass: 0, blood: 0, adren: 0 }; // cursed pick stacks
  P.synGot = {}; // announced synergies
  P.dmg *= 1 + 0.08 * (META.power || 0);
  P.magnet *= 1 + 0.12 * (META.magnet || 0);
  P.maxHp += 15 * (META.vitality || 0);
  P.hp = P.maxHp;
  P.revive = (META.second || 0) > 0 ? 1 : 0;
}

function xpNeedFor(lvl) {
  return Math.round(10 + (lvl - 1) * 8 + Math.pow(lvl - 1, 2.1) * 3);
}

function resetGame() {
  G.time = 0; G.wave = 1; G.kills = 0;
  G.enemies.length = 0; G.bullets.length = 0; G.ebullets.length = 0;
  G.gems.length = 0; G.hearts.length = 0; G.parts.length = 0; G.texts.length = 0;
  G.pearls.length = 0; G.minnows.length = 0; G.jellies.length = 0; G.schools.length = 0; G.schoolT = 8; G.blobs.length = 0;
  G.pups.length = 0; G.powerKind = null; G.powerT = 0;
  G.pactId = null; G.pactPearl = 1; G.comboWin = 2.5; G.comboXPMul = 1; G.pactHeal = 1;
  G.relic = null; G.offeredRelics = []; G.relicXp = 1; G.relicFoeHp = 1; G.relicEliteHp = 1; G.relicPearl = 1;
  G.relicThorns = false; G.relicRage = false; G.relicVacuum = false; G.relicFreeze = 0; G.relicFrostCD = 1;
  G.relicClam = 0; G.relicBane = false; G.relicChest = 1; G.relicXpHalf = false; G.debtRevives = 0;
  G.urchins.length = 0; G.urchinT = 10; G.hadalAlive = false; G.hadalSpawnedWave = 0;
  G.gate = null; G.gateHold = false;
  G.mut = null; G.mutName = ""; G.mutSpd = 1; G.mutHp = 1; G.mutXp = 1; G.mutDmg = 1; G.mutGem = 1; G.mutHeart = false;
  G.obj = null; G.objT = 25; G.objN = 0;
  G.greed = null; G.greedT = 40; G.greedXp = 1;
  G.barrels.length = 0; G.barrelT = 10; G.webs.length = 0; genLanes();
  G.remora = null;
  G.depth = 0; G.depthOffered = -1; G.depthHp = 1; G.depthDmg = 1; G.pearlDepth = 1;
  G.tl.length = 0; G.tlT = 0; G.lastHitBy = "the reef";
  G.combo = 0; G.comboT = 0; G.bestCombo = 0; G.streak = 0; G.streakT = 0; G.announce = null; G.announceT = 0; G.announceTier = -1;
  G.runPearls = 0; G.eliteT = 20; G.clamWave = 0; G.reviveUsed = false;
  G.shots = 0; G.chests.length = 0; G.nextChest = 25; G.magPulseCD = 0; G.heartT = 0; G.previewDone = false;
  G.spawnTimer = 0.8;
  G.bossAlive = false; G.bossSpawnedWave = 0; G.epicAlive = false; G.superAlive = false; G.superSpawnedWave = 0;
  G.pendingLevels = 0; G.shake = 0; G.beam = null; G.rings.length = 0; G.weedT = 0;
  G.hitstop = 0; G.slowmo = 0; G.dnums.length = 0; G.achT = 0;
  G.portals.length = 0; G.wisps.length = 0; G.dark = 0; G.flashR = 0; G.zoom = 1;
  G.hurtEdge = 0; G.wedgeT = 0; G.tickCd = 0;
  G.focusT = 0; G.focusHold = 0;
  G.lowQ = false; G.fpsEMA = 60; G.qLowT = 0; G.qHighT = 0;
  resetPlayer();
  genDecor();
  G.cdNova = 0; G.cdFreeze = 0; G.cdDecoy = 0; G.cdFin = 0;
  G.freezeT = 0; G.decoy = null; G.lights.length = 0;
  G.ghost.length = 0; G.ghostT = 0; G.ghostPlay = loadGhost();
  G.merchant = null; G.merchT = 50; G.currentMul = 1; G.foeMul = {};
  G.stageN = 0; G.stage = null; G.stageBag = [];
  G.spawnMul = 1; G.pearlMul = 1; G.eliteMul = 1; G.foeSpdMul = 1; G.gemMul = 1; G.xpMul2 = 1;
  // difficulty: daily/weekly dives are always fair (normal), normal dives use the menu pick
  G.diff = (G.daily || G.weekly) ? "normal" : loadDiff();
  G.dailyMods = G.daily ? rollDailyMods() : G.weekly ? rollWeeklyMods() : [];
  for (const m of G.dailyMods) if (m.apply) m.apply();
  snapCamera();
  enterStage(false); // roll the opening stage (quiet: WAVE 1 banner + floating stage card)
  showBanner("WAVE 1");
  updateHud(true);
}

// ---------- upgrades: three skill branches + five evolutions ----------
const BRANCHES = {
  art: { name: "Bubble Artillery", short: "ARTILLERY", icon: "✦" },
  tide: { name: "Tide Shaping", short: "TIDE", icon: "◈" },
  flow: { name: "Survivor's Current", short: "CURRENT", icon: "❀" },
};
const UPS = [
  { id: "dmg", name: "Heavy Bubbles", desc: "+15% bubble damage", detail: "Steady pressure. 5 stacks plus 4 Rapid Pump unlocks the STARFALL evolution.", w: 10, branch: "art", icon: "✦", max: Infinity, apply() { P.dmg *= 1.15; } },
  { id: "rate", name: "Rapid Pump", desc: "+10% fire rate", detail: "Snout pumps a little faster. 4 stacks plus 5 Heavy Bubbles unlocks STARFALL.", w: 10, branch: "art", icon: "≋", max: Infinity, apply() { P.fireRate *= 1.1; } },
  { id: "size", name: "Big Bubbles", desc: "+18% bubble size, +6% damage", detail: "Fat bubbles fly wider and hit easier. 2 stacks help unlock the Depth Charge evolution.", w: 7, branch: "art", icon: "●", max: Infinity, evo: "depth", apply() { P.bulletR *= 1.18; P.dmg *= 1.06; } },
  { id: "crit", name: "Lucky Pop", desc: "+8% crit chance (crits hit 2x)", detail: "Golden crits deal double damage with a flash. Caps at 50% — a slow-burn artillery luxury.", w: 7, branch: "art", icon: "★", max: 5, can() { return P.crit < 0.5; }, apply() { P.crit += 0.08; } },
  { id: "multi", name: "Split Shot", desc: "+1 bubble per shot", detail: "Fires an extra bubble in a wider fan. 4 stacks plus 4 Piercing Pop unlocks TRIDENT — or 5 stacks plus 3 Bouncy Bubbles unlocks MAELSTROM.", w: 3, branch: "tide", icon: "⋔", max: 5, evo: "trident", can() { return P.multishot < 5; }, apply() { P.multishot += 1; } },
  { id: "pierce", name: "Piercing Pop", desc: "Bubbles pierce +1 enemy", detail: "Bubbles fly through one extra foe per stack. 4 stacks plus 4 Split Shot unlocks TRIDENT.", w: 6, branch: "tide", icon: "➶", max: 4, evo: "trident", can() { return P.pierce < 4; }, apply() { P.pierce += 1; } },
  { id: "bounce", name: "Bouncy Bubbles", desc: "Bubbles bounce off walls +1", detail: "Bank shots around rocks and crowds. 2 stacks plus 2 Big Bubbles unlocks DEPTH CHARGE — or 3 stacks plus 5 Split Shot unlocks MAELSTROM.", w: 5, branch: "tide", icon: "⬢", max: 3, evo: "depth", can() { return P.bounce < 3; }, apply() { P.bounce += 1; } },
  { id: "speed", name: "Swift Fins", desc: "+8% move speed", detail: "Swim a little faster to dodge spitters, chase elites and ride currents. No cap.", w: 8, branch: "flow", icon: "➤", max: Infinity, apply() { P.speed *= 1.08; } },
  { id: "hp", name: "Bubble Heart", desc: "+20 max HP and heal 20", detail: "Grows your life bar and patches you up a little. 4 stacks plus 3 Regeneration unlocks LEVIATHAN HEART.", w: 8, branch: "flow", icon: "♥", max: Infinity, apply() { P.maxHp += 20; P.hp = Math.min(P.maxHp, P.hp + 20); } },
  { id: "magnet", name: "Magnet Core", desc: "+25% pickup range", detail: "Vacuums gems, hearts and pearls from further away. Feeds XP gain so you level faster.", w: 7, branch: "flow", icon: "◎", max: Infinity, apply() { P.magnet *= 1.25; } },
  { id: "regen", name: "Regeneration", desc: "Regenerate +0.5 HP per second", detail: "Slow but endless healing between fights. 3 stacks plus 4 Bubble Heart unlocks LEVIATHAN HEART.", w: 6, branch: "flow", icon: "✚", max: Infinity, apply() { P.regen += 0.5; } },
  { id: "xp", name: "Fast Learner", desc: "+10% XP from gems", detail: "Every crystal worth a little more. Compounds with combos — the engine of late-game builds.", w: 6, branch: "flow", icon: "◆", max: Infinity, apply() { P.xpMul *= 1.1; } },
  { id: "heal", name: "Snack Break", desc: "Heal 40 HP right now", detail: "Emergency kelp snack. Only offered while hurt — no stacks, just instant relief.", w: 4, branch: "flow", icon: "❤", max: Infinity, can() { return P.hp < P.maxHp * 0.92; }, apply() { P.hp = Math.min(P.maxHp, P.hp + 40); } },
  { id: "echo", name: "Tidal Echo", desc: "+2 bounce, +1 pierce (breaks the caps)", detail: "HIGH TIDE skill (level 12+). Your volley refuses to die — bank shots chain across the whole reef.", w: 5, branch: "tide", icon: "◍", max: 2, eyebrow: "👑 LV 12+", can() { return P.lvl >= 12 && P.bounce < 6; }, apply() { P.bounce += 2; P.pierce += 1; } },
  { id: "patience", name: "Predator's Patience", desc: "+0.8s combo window, +30% combo XP", detail: "HIGH TIDE skill (level 10+). Longer chains, richer gems — the patient hunter eats.", w: 5, branch: "art", icon: "⏳", max: 3, eyebrow: "👑 LV 10+", can() { return P.lvl >= 10; }, apply() { G.comboWin += 0.8; G.comboXPMul = (G.comboXPMul || 1) * 1.3; } },
  { id: "vow", name: "Undying Vow", desc: "+1 revive (cheat death once more)", detail: "HIGH TIDE skill (level 14+). The abyss gives back what it takes — once more.", w: 5, branch: "flow", icon: "❣", max: 1, eyebrow: "👑 LV 14+", can() { return P.lvl >= 14 && (P.revive || 0) < 2; }, apply() { P.revive = (P.revive || 0) + 1; } },
];

const TRIDENT = { id: "trident", name: "Trident", desc: "+2 bubbles in a wide spread, +1 pierce", detail: "LEGENDARY evolution of Tide Shaping. Requires Split Shot 4 + Piercing Pop 4. Widens your fan into a reef-sweeping trident volley.", w: 100, branch: "tide", evo: true, icon: "Ψ", apply() { P.multishot += 2; P.pierce += 1; } };
const DEPTHCHARGE = { id: "depth", name: "Depth Charge", desc: "Bubbles explode on hit (area damage)", detail: "LEGENDARY evolution of pressure and size. Requires Bouncy Bubbles 2 + Big Bubbles 2. Every pop detonates, splashing whole packs.", w: 100, branch: "tide", evo: true, icon: "✸", apply() { P.blast = (P.blast || 0) + 45; } };
const STARFALL = { id: "star", name: "Starfall", desc: "Crits strike for 3x damage, +10% crit chance", detail: "LEGENDARY evolution of Bubble Artillery. Requires Heavy Bubbles 5 + Rapid Pump 4. Every golden hit falls like a star.", w: 100, branch: "art", evo: true, icon: "☄", needText: (E) => `Needs Heavy ${E.dmg}/5 • Rapid ${E.rate}/4`, ownedText: "Evolved — golden hits fall like stars", apply() { P.critMult = Math.max(P.critMult || 2, 3); P.crit = Math.min(0.5, P.crit + 0.1); } };
const LEVIHEART = { id: "lheart", name: "Leviathan Heart", desc: "+100 max HP, full heal, +1 revive", detail: "LEGENDARY evolution of Survivor's Current. Requires Bubble Heart 4 + Regeneration 3. A second heart that refuses to stop.", w: 100, branch: "flow", evo: true, icon: "❥", needText: (E) => `Needs Heart ${E.hp}/4 • Regen ${E.regen}/3`, ownedText: "Evolved — the abyss keeps you", apply() { P.maxHp += 100; P.hp = P.maxHp; P.regen += 1; P.revive = (P.revive || 0) + 1; } };
const MAELSTROM = { id: "mael", name: "Maelstrom", desc: "+2 bounce, +2 pierce, +1 bubble", detail: "LEGENDARY evolution of Tide Shaping. Requires Split Shot 5 + Bouncy Bubbles 3. The reef becomes a blender.", w: 100, branch: "tide", evo: true, icon: "🌀", needText: (E) => `Needs Split ${E.multi}/5 • Bouncy ${E.bounce}/3`, ownedText: "Evolved — the reef is a blender", apply() { P.bounce += 2; P.pierce += 2; P.multishot += 1; } };
// requirement text for the original two (codex rows share the same renderer)
TRIDENT.needText = (E) => `Needs Split ${E.multi}/4 • Pierce ${E.pierce}/4`;
TRIDENT.ownedText = "Evolved — wide trident volley";
DEPTHCHARGE.needText = (E) => `Needs Bouncy ${E.bounce}/2 • Big ${E.size}/2`;
DEPTHCHARGE.ownedText = "Evolved — bubbles explode";
// ---------- active abilities: pickable cards, Q/E/R + HUD buttons, cooldowns cut per rank ----------
const ABILS = [
  { id: "abilNova", abil: "nova", name: "Shockwave Pulse", desc: "Q: nova blast + heavy knockback", detail: "Slams the water: hurts and hurls everything nearby. 12s cooldown (8s at rank 2).", w: 5, icon: "◎", max: 2, eyebrow: "◈ ACTIVE ABILITY", apply() { P.abil.nova += 1; } },
  { id: "abilFreeze", abil: "freeze", name: "Abyss Freeze", desc: "E: freeze foes + bullets 3s", detail: "Stops everything cold — even leviathan barrages. 25s cooldown (17s at rank 2).", w: 5, icon: "❄", max: 2, eyebrow: "◈ ACTIVE ABILITY", apply() { P.abil.freeze += 1; } },
  { id: "abilDecoy", abil: "decoy", name: "Decoy Bubble", desc: "R: taunting double for 6s", detail: "A shimmering twin that pulls chasers off you while you reposition. 20s cooldown (14s at rank 2).", w: 5, icon: "◌", max: 2, eyebrow: "◈ ACTIVE ABILITY", apply() { P.abil.decoy += 1; } },
];
// ---------- cursed picks: glass-cannon trades for spicy builds ----------
const CURSED = [
  { id: "curGlass", curse: "glass", name: "Glass Cannon", desc: "+40% damage, −25 max HP", detail: "Hits like a trench. Cracks like an egg. Cannot drop you below 20 max HP.", w: 4, icon: "◭", max: 2, eyebrow: "⚠ CURSED", apply() { P.dmg *= 1.4; P.maxHp = Math.max(20, P.maxHp - 25); P.hp = Math.min(P.hp, P.maxHp); } },
  { id: "curBlood", curse: "blood", name: "Blood Pact", desc: "+30% fire rate, HP drains 0.3/s", detail: "Your snout hungers. The drain never kills outright (stops at 1 HP) — but a stiff breeze might.", w: 4, icon: "♥", max: 2, eyebrow: "⚠ CURSED", apply() { P.fireRate *= 1.3; P.drain = (P.drain || 0) + 0.3; } },
  { id: "curAdren", curse: "adren", name: "Adrenal Glands", desc: "+22% speed, −30% pickup range", detail: "Untouchable and half-blind. Gems stay where they fall — go get them.", w: 4, icon: "➤", max: 2, eyebrow: "⚠ CURSED", apply() { P.speed *= 1.22; P.magnet *= 0.7; } },
];
// ---------- cross-branch synergies: hybrids get mechanical payoffs, not just looks ----------
function synList() {
  const s = morphStages();
  const out = [];
  if (s.a >= 1 && s.t >= 1) out.push({ id: "strafe", icon: "⚡", name: "Strafing Run", desc: "Dashing fires a 5-bubble fan" });
  if (s.a >= 1 && s.f >= 1) out.push({ id: "critburst", icon: "✸", name: "Shatter Crits", desc: "Crit kills explode for 40 splash" });
  if (s.t >= 1 && s.f >= 1) out.push({ id: "drift", icon: "≋", name: "Drift Harvest", desc: "+35% pickup range, gems worth +25%" });
  if (s.tri || s.dep || s.star || s.lhe || s.mae) out.push({ id: "evotail", icon: "Ψ", name: "Evo Slipstream", desc: "Evolutions: +8% speed, dash recharges 25% faster" });
  if (s.a >= 1 && s.t >= 1 && s.f >= 1) out.push({ id: "harmony", icon: "◆", name: "Reef Harmony", desc: "+12% fire rate and swim speed" });
  return out;
}
function hasSyn(id) {
  const s = morphStages();
  if (id === "strafe") return s.a >= 1 && s.t >= 1;
  if (id === "critburst") return s.a >= 1 && s.f >= 1;
  if (id === "drift") return s.t >= 1 && s.f >= 1;
  if (id === "evotail") return !!(s.tri || s.dep || s.star || s.lhe || s.mae);
  if (id === "harmony") return s.a >= 1 && s.t >= 1 && s.f >= 1;
  return false;
}
// effective pickup range (synergies + curses apply live so hybrids can shift mid-run)
function magR(mul) {
  let r = P.magnet * (mul || 1);
  if (hasSyn("drift")) r *= 1.35;
  return r;
}
// ---------- biome zones: depth changes palette, foe mix and hazards ----------
const BIOMES = [
  { id: "shallows", name: "Sunlit Shallows", min: 1, max: 2, tint: "rgba(140,220,255,0.05)", dim: 0, currentMul: 1, foeMul: {}, tip: "Warm and bright. Learn the ropes." },
  { id: "kelp", name: "Kelp Maze", min: 3, max: 4, tint: "rgba(74,222,128,0.06)", dim: 0, currentMul: 1.7, foeMul: { chaser: 1.6, splitter: 1.5 }, tip: "Currents run strong here." },
  { id: "bossdepths", name: "The Boss Depths", min: 5, max: 5, tint: "rgba(251,113,133,0.05)", dim: 0.08, currentMul: 1, foeMul: { tank: 1.6 }, tip: "Something big stirs below." },
  { id: "twilight", name: "Twilight Drift", min: 6, max: 7, tint: "rgba(76,29,149,0.10)", dim: 0.22, currentMul: 1.3, foeMul: { spitter: 1.8, leecher: 1.8, speedy: 1.4 }, tip: "Light fades. The patient hunters wake." },
  { id: "vents", name: "Ember Vents", min: 8, max: 9, tint: "rgba(251,146,60,0.08)", dim: 0.12, currentMul: 1, foeMul: { exploder: 2.2, tank: 1.4 }, mines: true, tip: "Watch for mines. They blink before they bite." },
  { id: "abyss", name: "The Abyss", min: 10, max: 11, tint: "rgba(20,8,40,0.12)", dim: 0.3, currentMul: 1.2, foeMul: { spitter: 1.5, exploder: 1.5, leecher: 1.5 }, tip: "The reef ends. The dark does not." },
  { id: "trench", name: "The Trench", min: 12, max: 9999, tint: "rgba(8,10,28,0.18)", dim: 0.36, currentMul: 1.2, foeMul: { lunker: 2.2, snare: 2.0, spitter: 1.2 }, urchins: true, tip: "Crushing dark. Something enormous is down here." },
];
function biomeFor(w) {
  for (const b of BIOMES) if (w >= b.min && w <= b.max) return b;
  return BIOMES[0];
}
// ---------- procedural stages: every run rolls fresh 3-wave stages (name, palette, foe mix, hazards, twist) ----------
// (BIOMES/biomeFor above are legacy — stages now drive the reef; kept for __bubble compat)
const STAGE_LEN = 3; // waves per stage
const STAGE_ADJ = ["Sunken", "Whispering", "Ember", "Hollow", "Velvet", "Crimson", "Drowned", "Shimmering", "Howling", "Ivory", "Obsidian", "Pale", "Tangled", "Gilded", "Murmuring", "Savage", "Luminous", "Forsaken", "Sleeping", "Cracked", "Verdant", "Hushed"];
const STAGE_NOUN = ["Grove", "Reaches", "Gardens", "Expanse", "Maw", "Fields", "Terraces", "Warrens", "Cathedral", "Hollow", "Flats", "Canyons", "Thicket", "Vaults", "Steppes", "Labyrinth", "Shoals", "Galleries", "Basin", "Verge", "Kingdom", "Tomb"];
const STAGE_PALS = [
  { tint: "rgba(140,220,255,0.05)", dim: 0, ember: false },
  { tint: "rgba(74,222,128,0.07)", dim: 0.04, ember: false },
  { tint: "rgba(139,92,246,0.09)", dim: 0.12, ember: false },
  { tint: "rgba(251,146,60,0.08)", dim: 0.10, ember: true },
  { tint: "rgba(99,102,241,0.10)", dim: 0.14, ember: false },
  { tint: "rgba(251,113,133,0.07)", dim: 0.10, ember: false },
  { tint: "rgba(13,80,110,0.10)", dim: 0.12, ember: false },
  { tint: "rgba(56,89,199,0.10)", dim: 0.15, ember: false },
  { tint: "rgba(253,224,71,0.05)", dim: 0, ember: false },
]; // readability cap: nothing dims past 0.15 — moody, never near-black
const STAGE_TWISTS = [
  { icon: "🐟", name: "Teeming Waters", desc: "+30% spawns", apply(s) { s.spawn = 1.3; } },
  { icon: "◆", name: "Rich Plankton", desc: "+30% XP", apply(s) { s.xp = 1.3; } },
  { icon: "★", name: "Gilded Tide", desc: "elites twice as often", apply(s) { s.elite = 2; } },
  { icon: "💥", name: "Powder Caches", desc: "kegs drift in constantly", apply(s) { s.barrels = 2.5; } },
  { icon: "💨", name: "Swift Streams", desc: "stronger currents", apply(s) { s.currentMul += 0.7; } },
  { icon: "🌙", name: "Still Water", desc: "weak currents, +15% spawns", apply(s) { s.currentMul = 0.5; s.spawn = 1.15; } },
];
function rollStage() {
  const wv = G.wave;
  // name: shuffle-bag of adj+noun, no repeats until the 484-combo deck runs out
  if (!G.stageBag || !G.stageBag.length) {
    G.stageBag = [];
    for (const a of STAGE_ADJ) for (const n of STAGE_NOUN) G.stageBag.push(a + " " + n);
    for (let i = G.stageBag.length - 1; i > 0; i--) { const j = (RNG() * (i + 1)) | 0; const t = G.stageBag[i]; G.stageBag[i] = G.stageBag[j]; G.stageBag[j] = t; }
  }
  const name = "The " + G.stageBag.pop();
  const pal = STAGE_PALS[(RNG() * STAGE_PALS.length) | 0];
  // foe focus: two currently-possible types get boosted weights (minWave still gates spawns)
  const avail = Object.keys(FOE).filter((k) => FOE[k].minWave <= wv + 2 && FOE[k].w > 0);
  const a = avail[(RNG() * avail.length) | 0] || "chaser";
  let b = avail[(RNG() * avail.length) | 0] || "mini";
  if (avail.length > 1) { let guard = 0; while (b === a && guard++ < 8) b = avail[(RNG() * avail.length) | 0]; }
  const foeMul = {}; foeMul[a] = 2.2; foeMul[b] = 1.6;
  const tw = STAGE_TWISTS[(RNG() * STAGE_TWISTS.length) | 0];
  G.stage = {
    n: G.stageN, name, tint: pal.tint, dim: pal.dim, ember: pal.ember || RNG() < 0.2,
    foeMul, currentMul: 0.8 + RNG() * 1.2,
    mines: wv >= 8 && RNG() < 0.4, urchins: wv >= 12 && RNG() < 0.4, brood: wv >= 10 && RNG() < 0.35,
    spawn: 1, elite: 1, xp: 1, barrels: 1, twist: tw,
  };
  tw.apply(G.stage);
  G.foeMul = G.stage.foeMul;
  G.currentMul = G.stage.currentMul;
}
function enterStage(loud) {
  G.stageN = Math.floor((G.wave - 1) / STAGE_LEN) + 1;
  rollStage();
  ACH.stat.stages = Math.max(ACH.stat.stages || 0, G.stageN);
  if (loud) {
    showBanner("◈ STAGE " + G.stageN + " — " + G.stage.name.toUpperCase() + " ◈");
    addText(P.x, P.y - 44, G.stage.twist.icon + " " + G.stage.twist.name + ": " + G.stage.twist.desc, "#fef3c7", 14);
    tone(392, 0.3, "triangle", 0.1, 523);
  } else {
    addText(P.x, P.y - 44, "◈ " + G.stage.name + " • " + G.stage.twist.icon + " " + G.stage.twist.name, "#fef3c7", 14);
  }
  checkAch();
  updateHud(true);
}
// ---------- daily modifiers: two seeded twists every day ----------
const DAILY_MODS = [
  { id: "crowded", name: "Crowded Waters", icon: "🐟", desc: "+40% spawns", apply() { G.spawnMul = 1.4; } },
  { id: "glassreef", name: "Glass Reef", icon: "🔍", desc: "−25% HP, +30% damage", apply() { P.maxHp = Math.round(P.maxHp * 0.75); P.hp = P.maxHp; P.dmg *= 1.3; } },
  { id: "goldtide", name: "Golden Tide", icon: "🪙", desc: "2× pearls, 2× elites", apply() { G.pearlMul = 2; G.eliteMul = 2; } },
  { id: "swiftcur", name: "Swift Current", icon: "💨", desc: "foes +20% speed, you +15%", apply() { G.foeSpdMul = 1.2; P.speed *= 1.15; } },
  { id: "famine", name: "Famine", icon: "🍽", desc: "half gems, double XP each", apply() { G.gemMul = 0.5; G.xpMul2 = 2; } },
  { id: "secondwind", name: "Second Wind", icon: "💚", desc: "start with +50 max HP", apply() { P.maxHp += 50; P.hp = P.maxHp; } },
];
function rollDailyMods() {
  const seed = hashSeed("mods-" + todayStr());
  const rng = mulberry32(seed);
  const pool = DAILY_MODS.slice();
  const out = [];
  for (let i = 0; i < 2 && pool.length; i++) out.push(pool.splice((rng() * pool.length) | 0, 1)[0]);
  return out;
}

// ---------- weekly dive: a second shared board that rolls every ISO week with 3 twists ----------
function weekStr() {
  const n = new Date();
  const onejan = new Date(n.getFullYear(), 0, 1);
  const w = Math.ceil((((n - onejan) / 864e5) + onejan.getDay() + 1) / 7);
  return n.getFullYear() + "-W" + w;
}
function weeklyKey() { return "bubblePopArenaWeekly" + weekStr(); }
function rollWeeklyMods() {
  const seed = hashSeed("wmods-" + weekStr());
  const rng = mulberry32(seed);
  const pool = DAILY_MODS.slice();
  const out = [];
  for (let i = 0; i < 3 && pool.length; i++) out.push(pool.splice((rng() * pool.length) | 0, 1)[0]);
  return out;
}

function pickUpgrades() {
  const avail = UPS.filter((u) => !u.can || u.can());
  const picks = [];
  const pool = avail.slice();
  while (picks.length < 3 && pool.length) {
    let total = 0;
    for (const u of pool) total += u.w;
    let r = RNG() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
    picks.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  const evos = [];
  if ((P.stacks.multi || 0) >= 4 && (P.stacks.pierce || 0) >= 4 && !P.stacks.trident) evos.push(TRIDENT);
  if ((P.stacks.bounce || 0) >= 2 && (P.stacks.size || 0) >= 2 && !P.stacks.depth) evos.push(DEPTHCHARGE);
  if ((P.stacks.dmg || 0) >= 5 && (P.stacks.rate || 0) >= 4 && !P.stacks.star) evos.push(STARFALL);
  if ((P.stacks.hp || 0) >= 4 && (P.stacks.regen || 0) >= 3 && !P.stacks.lheart) evos.push(LEVIHEART);
  if ((P.stacks.multi || 0) >= 5 && (P.stacks.bounce || 0) >= 3 && !P.stacks.mael) evos.push(MAELSTROM);
  for (const evo of evos) {
    if (picks.length < 3) picks.push(evo);
    else picks[(RNG() * picks.length) | 0] = evo;
  }
  // active abilities: offered until maxed (each rank cuts the cooldown)
  const abilsLeft = ABILS.filter((a) => (P.abil[a.abil] || 0) < a.max);
  if (abilsLeft.length && RNG() < 0.35) {
    const a = abilsLeft[(RNG() * abilsLeft.length) | 0];
    picks[(RNG() * picks.length) | 0] = a;
  }
  // cursed picks: glass-cannon trades for spicy builds
  const curseLeft = CURSED.filter((c) => (P.curse[c.curse] || 0) < c.max);
  if (curseLeft.length && RNG() < 0.22) {
    const c = curseLeft[(RNG() * curseLeft.length) | 0];
    picks[(RNG() * picks.length) | 0] = c;
  }
  return picks;
}

function branchCount(b) {
  let n = 0;
  for (const u of UPS) if (u.branch === b) n += (P.stacks[u.id] || 0);
  if (b === "tide") n += (P.stacks.trident || 0) + (P.stacks.depth || 0) + (P.stacks.mael || 0);
  if (b === "art") n += (P.stacks.star || 0);
  if (b === "flow") n += (P.stacks.lheart || 0);
  return n;
}

function evoProgress() {
  return {
    tri: { need: (P.stacks.multi || 0) >= 4 && (P.stacks.pierce || 0) >= 4, multi: P.stacks.multi || 0, pierce: P.stacks.pierce || 0, owned: !!(P.stacks.trident) },
    dep: { need: (P.stacks.bounce || 0) >= 2 && (P.stacks.size || 0) >= 2, bounce: P.stacks.bounce || 0, size: P.stacks.size || 0, owned: !!(P.stacks.depth) },
    sta: { need: (P.stacks.dmg || 0) >= 5 && (P.stacks.rate || 0) >= 4, dmg: P.stacks.dmg || 0, rate: P.stacks.rate || 0, owned: !!(P.stacks.star) },
    lhe: { need: (P.stacks.hp || 0) >= 4 && (P.stacks.regen || 0) >= 3, hp: P.stacks.hp || 0, regen: P.stacks.regen || 0, owned: !!(P.stacks.lheart) },
    mae: { need: (P.stacks.multi || 0) >= 5 && (P.stacks.bounce || 0) >= 3, multi: P.stacks.multi || 0, bounce: P.stacks.bounce || 0, owned: !!(P.stacks.mael) },
  };
}

function evoHintFor(u) {
  const ep = evoProgress();
  if (u.id === "dmg" || u.id === "rate") {
    if (ep.sta.owned) return null;
    const d = Math.min(ep.sta.dmg + (u.id === "dmg" ? 1 : 0), 5), r = Math.min(ep.sta.rate + (u.id === "rate" ? 1 : 0), 4);
    if (ep.sta.need) return { text: "STARFALL evolution is ready — watch for the gold card!", ready: true };
    return { text: `Toward STARFALL evolution: Heavy ${d}/5 • Rapid ${r}/4`, ready: false };
  }
  if (u.id === "hp" || u.id === "regen") {
    if (ep.lhe.owned) return null;
    const h = Math.min(ep.lhe.hp + (u.id === "hp" ? 1 : 0), 4), g = Math.min(ep.lhe.regen + (u.id === "regen" ? 1 : 0), 3);
    if (ep.lhe.need) return { text: "LEVIATHAN HEART evolution is ready — watch for the gold card!", ready: true };
    return { text: `Toward LEVIATHAN HEART evolution: Heart ${h}/4 • Regen ${g}/3`, ready: false };
  }
  if (u.id === "multi" || u.id === "pierce") {
    if (!ep.tri.owned) {
      const m = Math.min(ep.tri.multi + (u.id === "multi" ? 1 : 0), 4), p = Math.min(ep.tri.pierce + (u.id === "pierce" ? 1 : 0), 4);
      if (ep.tri.need) return { text: "TRIDENT evolution is ready — watch for the gold card!", ready: true };
      return { text: `Toward TRIDENT evolution: Split ${m}/4 • Pierce ${p}/4`, ready: false };
    }
    if (u.id === "multi" && !ep.mae.owned) {
      const m = Math.min(ep.mae.multi + 1, 5), b = Math.min(ep.mae.bounce, 3);
      if (ep.mae.need) return { text: "MAELSTROM evolution is ready — watch for the gold card!", ready: true };
      return { text: `Toward MAELSTROM evolution: Split ${m}/5 • Bouncy ${b}/3`, ready: false };
    }
    return null;
  }
  if (u.id === "bounce" || u.id === "size") {
    if (!ep.dep.owned) {
      const b = Math.min(ep.dep.bounce + (u.id === "bounce" ? 1 : 0), 2), s = Math.min(ep.dep.size + (u.id === "size" ? 1 : 0), 2);
      if (ep.dep.need) return { text: "DEPTH CHARGE evolution is ready — watch for the gold card!", ready: true };
      return { text: `Toward DEPTH CHARGE evolution: Bounce ${b}/2 • Big ${s}/2`, ready: false };
    }
    if (u.id === "bounce" && !ep.mae.owned) {
      const m = Math.min(ep.mae.multi, 5), b = Math.min(ep.mae.bounce + 1, 3);
      if (ep.mae.need) return { text: "MAELSTROM evolution is ready — watch for the gold card!", ready: true };
      return { text: `Toward MAELSTROM evolution: Split ${m}/5 • Bouncy ${b}/3`, ready: false };
    }
    return null;
  }
  return null;
}

function buildSkillCard(u) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "card " + (u.evo ? "b-evo" : u.abil ? "b-abil" : u.curse ? "b-curse" : ("b-" + (u.branch || "art")));
  const lvl = u.abil ? (P.abil[u.abil] || 0) : u.curse ? (P.curse[u.curse] || 0) : (P.stacks[u.id] || 0);
  const isEvo = u.evo === true;
  const inner = document.createElement("span");
  inner.className = "inner";
  inner.style.display = "block";
  const top = document.createElement("span");
  top.className = "topRow";
  top.style.display = "flex";
  const disc = document.createElement("span");
  disc.className = "iconDisc";
  disc.textContent = u.icon || "◆";
  const eye = document.createElement("span");
  eye.className = "eyebrow";
  eye.textContent = u.eyebrow || (isEvo ? "◆ LEGENDARY EVOLUTION" : (BRANCHES[u.branch] ? BRANCHES[u.branch].icon + " " + BRANCHES[u.branch].short : "SKILL"));
  const badges = document.createElement("span");
  badges.className = "badges";
  if (isEvo) {
    const e = document.createElement("span");
    e.className = "pill evo";
    e.textContent = "EVOLVE";
    badges.appendChild(e);
  } else if (lvl === 0) {
    const n = document.createElement("span");
    n.className = "pill new";
    n.textContent = "NEW";
    badges.appendChild(n);
  }
  if (!isEvo && u.max !== Infinity && lvl >= u.max) {
    const m = document.createElement("span");
    m.className = "pill maxed";
    m.textContent = "MAX";
    badges.appendChild(m);
  }
  top.appendChild(disc);
  top.appendChild(eye);
  top.appendChild(badges);
  const name = document.createElement("b");
  name.className = "cardName";
  name.textContent = u.name;
  const desc = document.createElement("span");
  desc.className = "cardDesc";
  desc.textContent = u.desc;
  const det = document.createElement("p");
  det.className = "cardDetail";
  det.textContent = u.detail || "";
  inner.appendChild(top);
  inner.appendChild(name);
  inner.appendChild(desc);
  if (u.detail) inner.appendChild(det);
  if (!isEvo) {
    const pips = document.createElement("span");
    pips.className = "pips";
    pips.style.display = "flex";
    const total = (u.max === Infinity) ? 5 : u.max;
    for (let i = 0; i < total; i++) {
      const p = document.createElement("span");
      p.className = "pip" + (i < lvl ? " on" : (i === lvl ? " next" : ""));
      pips.appendChild(p);
    }
    const ll = document.createElement("span");
    ll.className = "lvlLine";
    ll.textContent = (u.max === Infinity) ? `Lv ${lvl} → ${lvl + 1}` : `Lv ${lvl}/${u.max}`;
    pips.appendChild(ll);
    inner.appendChild(pips);
  }
  const hint = isEvo ? null : evoHintFor(u);
  if (hint) {
    const s = document.createElement("span");
    s.className = "syn" + (hint.ready ? " ready" : "");
    s.style.display = "block";
    s.textContent = (hint.ready ? "★ " : "◈ ") + hint.text;
    inner.appendChild(s);
  }
  b.appendChild(inner);
  const rail = document.createElement("span");
  rail.className = "rail";
  rail.setAttribute("aria-hidden", "true");
  b.appendChild(rail);
  return b;
}

function buildCodex() {
  const codex = document.getElementById("codexCtn");
  if (!codex) return;
  codex.innerHTML = "";
  const ep = evoProgress();
  const groups = [
    { key: "art", ids: ["dmg", "rate", "size", "crit", "patience"] },
    { key: "tide", ids: ["multi", "pierce", "bounce", "echo"] },
    { key: "flow", ids: ["speed", "hp", "magnet", "regen", "xp", "heal", "vow"] },
  ];
  const byId = {};
  for (const u of UPS) byId[u.id] = u;
  byId.trident = TRIDENT;
  byId.depth = DEPTHCHARGE;
  let totalLearnt = 0;
  for (const g of groups) {
    const box = document.createElement("div");
    box.className = "codexBranch cb-" + g.key;
    let learnt = 0;
    for (const id of g.ids) if ((P.stacks[id] || 0) > 0) learnt++;
    totalLearnt += learnt;
    const head = document.createElement("div");
    head.className = "cbHead";
    const hi = document.createElement("span");
    hi.textContent = BRANCHES[g.key].icon;
    head.appendChild(hi);
    const hn = document.createElement("span");
    hn.textContent = BRANCHES[g.key].name.toUpperCase();
    head.appendChild(hn);
    const hc = document.createElement("span");
    hc.className = "cbCount";
    hc.textContent = learnt + "/" + g.ids.length;
    head.appendChild(hc);
    box.appendChild(head);
    for (const id of g.ids) {
      const u = byId[id];
      const lvl = P.stacks[id] || 0;
      const owned = lvl > 0;
      const row = document.createElement("div");
      row.className = "codexRow" + (owned ? " owned" : " locked");
      const ci = document.createElement("span");
      ci.className = "ci";
      ci.textContent = u.icon || "◆";
      const cn = document.createElement("span");
      cn.className = "cn";
      cn.textContent = u.name;
      if (owned) {
        const sm = document.createElement("small");
        sm.textContent = u.desc;
        cn.appendChild(sm);
      }
      if (owned && u.max !== Infinity && u.max <= 6) {
        const mp = document.createElement("span");
        mp.className = "miniPips";
        for (let i = 0; i < u.max; i++) {
          const pi = document.createElement("i");
          if (i < lvl) pi.className = "on";
          mp.appendChild(pi);
        }
        cn.appendChild(mp);
      }
      const cl = document.createElement("span");
      const maxed = owned && u.max !== Infinity && lvl >= u.max;
      cl.className = "cl" + (maxed ? " max" : "");
      cl.textContent = !owned ? "🔒" : (maxed ? "MAX" : `Lv ${lvl}`);
      row.appendChild(ci);
      row.appendChild(cn);
      row.appendChild(cl);
      box.appendChild(row);
    }
    const EVO_ROWS = {
      art: [["star", STARFALL, "sta"]],
      tide: [["trident", TRIDENT, "tri"], ["depth", DEPTHCHARGE, "dep"], ["mael", MAELSTROM, "mae"]],
      flow: [["lheart", LEVIHEART, "lhe"]],
    };
    for (const [eid, def, epk] of (EVO_ROWS[g.key] || [])) {
      const E = ep[epk];
      const row = document.createElement("div");
      row.className = "codexRow evoRow" + (E.owned ? " owned" : " locked");
      const ci = document.createElement("span");
      ci.className = "ci";
      ci.textContent = def.icon;
      const cn = document.createElement("span");
      cn.className = "cn";
      cn.textContent = def.name;
      const sm = document.createElement("small");
      sm.textContent = E.owned ? def.ownedText : def.needText(E);
      cn.appendChild(sm);
      const cl = document.createElement("span");
      cl.className = "cl" + (E.owned ? " max" : "");
      cl.textContent = E.owned ? "OWNED" : "LOCKED";
      row.appendChild(ci);
      row.appendChild(cn);
      row.appendChild(cl);
      box.appendChild(row);
    }
    codex.appendChild(box);
  }
  const cc = document.getElementById("codexCount");
  if (cc) cc.textContent = totalLearnt > 0 ? "· " + totalLearnt : "";
}

function buildBranchBar() {
  const bar = document.getElementById("branchBar");
  if (!bar) return;
  bar.innerHTML = "";
  const order = ["art", "tide", "flow"];
  for (const k of order) {
    const d = document.createElement("div");
    d.className = "branchChip b-" + k;
    const bi = document.createElement("div");
    bi.className = "bi";
    bi.textContent = BRANCHES[k].icon;
    const bn = document.createElement("span");
    bn.className = "bn";
    bn.textContent = BRANCHES[k].short;
    const bc = document.createElement("span");
    bc.className = "bc";
    bc.textContent = branchCount(k) + " learnt";
    d.appendChild(bi);
    d.appendChild(bn);
    d.appendChild(bc);
    bar.appendChild(d);
  }
}

function buildEvoWatch() {
  const w = document.getElementById("evoWatch");
  if (!w) return;
  w.innerHTML = "";
  const ep = evoProgress();
  const mk = (title, owned, cur, need, sub) => {
    const d = document.createElement("div");
    d.className = "evoCard" + (owned ? " owned" : (cur >= need ? " ready" : ""));
    const b = document.createElement("b");
    b.textContent = (owned ? "✓ " : "◈ ") + title;
    const s = document.createElement("div");
    s.textContent = sub;
    const bar = document.createElement("div");
    bar.className = "evoBar";
    const fill = document.createElement("i");
    fill.style.width = Math.min(100, Math.round((cur / need) * 100)) + "%";
    bar.appendChild(fill);
    d.appendChild(b);
    d.appendChild(s);
    d.appendChild(bar);
    w.appendChild(d);
  };
  mk("TRIDENT — legendary Tide evolution", ep.tri.owned, Math.min(ep.tri.multi, 4) + Math.min(ep.tri.pierce, 4), 8,
    ep.tri.owned ? "Evolved. Your fan is a reef-sweeping trident." : `Split Shot ${ep.tri.multi}/4 • Piercing Pop ${ep.tri.pierce}/4 — max both to summon the gold card.`);
  mk("DEPTH CHARGE — legendary blast evolution", ep.dep.owned, Math.min(ep.dep.bounce, 2) + Math.min(ep.dep.size, 2), 4,
    ep.dep.owned ? "Evolved. Every bubble detonates on impact." : `Bouncy ${ep.dep.bounce}/2 • Big Bubbles ${ep.dep.size}/2 — max both to summon the gold card.`);
  mk("STARFALL — legendary Artillery evolution", ep.sta.owned, Math.min(ep.sta.dmg, 5) + Math.min(ep.sta.rate, 4), 9,
    ep.sta.owned ? "Evolved. Golden hits fall like stars — crits strike for 3x." : `Heavy ${ep.sta.dmg}/5 • Rapid ${ep.sta.rate}/4 — max both to summon the gold card.`);
  mk("LEVIATHAN HEART — legendary Current evolution", ep.lhe.owned, Math.min(ep.lhe.hp, 4) + Math.min(ep.lhe.regen, 3), 7,
    ep.lhe.owned ? "Evolved. A second heart that refuses to stop (+100 HP, full heal, +1 revive)." : `Heart ${ep.lhe.hp}/4 • Regen ${ep.lhe.regen}/3 — max both to summon the gold card.`);
  mk("MAELSTROM — legendary Tide storm", ep.mae.owned, Math.min(ep.mae.multi, 5) + Math.min(ep.mae.bounce, 3), 8,
    ep.mae.owned ? "Evolved. The reef is a blender (+2 bounce, +2 pierce, +1 bubble)." : `Split ${ep.mae.multi}/5 • Bouncy ${ep.mae.bounce}/3 — max both to summon the gold card.`);
}

function showLvlTab(which, silent) {
  const up = which !== "codex";
  document.getElementById("lvlUpPane").hidden = !up;
  document.getElementById("lvlCodexPane").hidden = up;
  document.getElementById("lvlTabUp").classList.toggle("active", up);
  document.getElementById("lvlTabCodex").classList.toggle("active", !up);
  const t = document.getElementById("lvlTitle");
  if (t) t.textContent = up ? (G._lvlTitle || "Choose an upgrade") : "Skills learnt";
  if (!silent) tone(up ? 600 : 800, 0.06, "triangle", 0.07, 900);
}
function openLevelUp(free) {
  G.state = "levelup";
  G.beam = { x: P.x, y: P.y, t: 0, life: 1.5 };
  burst(P.x, P.y, "#fde047", 30, 300, 12);
  pushRing(P.x, P.y, 130, "#fde047");
  pushRing(P.x, P.y, 80, "#fff", 2);
  showLevelBanner();
  const picks = pickUpgrades();
  const kt = document.getElementById("lvlKickerText");
  if (kt) kt.textContent = free ? "ELITE REWARD" : ("LEVEL " + P.lvl + " — LEVEL UP");
  const title = document.getElementById("lvlTitle");
  if (title) title.textContent = free ? "Elite popped — take a trophy" : "Choose an upgrade";
  const sub = document.getElementById("lvlSub");
  if (sub) sub.textContent = free ? "Free pick — no level spent" : (G.pendingLevels > 1 ? `Pick 1 of 3 — ${G.pendingLevels - 1} more waiting` : "Pick 1 of 3");
  const qb = document.getElementById("lvlQueueBadge");
  if (qb) {
    if (!free && G.pendingLevels > 1) { qb.hidden = false; qb.textContent = `+${G.pendingLevels - 1} QUEUED`; }
    else if (free) { qb.hidden = false; qb.textContent = "FREE"; }
    else qb.hidden = true;
  }
  G._lvlTitle = title ? title.textContent : "Choose an upgrade";
  showLvlTab("up", true);
  buildBranchBar();
  cardCtn.innerHTML = "";  for (const u of picks) {
    const b = buildSkillCard(u);
    b.addEventListener("click", () => {
      u.apply();
      P.stacks[u.id] = (P.stacks[u.id] || 0) + 1;
      checkMorph();
      tone(700, 0.1, "triangle", 0.1, 1000);
      if (!free) G.pendingLevels -= 1;
      if (G.pendingLevels > 0) openLevelUp(false);
      else { levelOverlay.hidden = true; G.state = "play"; }
      updateHud(true);
    });
    cardCtn.appendChild(b);
  }
  buildCodex();
  buildEvoWatch();
  levelOverlay.hidden = false;
  sfxLevel();
  buzz([25, 40, 45]);
}

function gainXp(v) {
  P.xp += v * P.xpMul * diffDef(G.diff).xp * (G.relicXp || 1) * (G.relicXpHalf ? 0.5 : 1) * ((G.stage && G.stage.xp) || 1);
  if (G.remora) { // your little remora skims a share and grows with you
    const R = G.remora;
    R.xp += v * 0.08;
    let need = R.lvl * 25;
    while (R.xp >= need) { R.xp -= need; R.lvl += 1; need = R.lvl * 25; addText(P.x, P.y - 44, "REMORA LV " + R.lvl + "!", "#7dd3fc", 15); tone(660, 0.12, "triangle", 0.09, 990); }
  }
  let leveled = false;
  while (P.xp >= P.xpNeed) {
    P.xp -= P.xpNeed;
    P.lvl += 1;
    P.xpNeed = xpNeedFor(P.lvl);
    G.pendingLevels += 1;
    leveled = true;
  }
  if (leveled) { if (OPT.slowmo !== false) G.slowmo = 0.5; checkAch(); } // level-up slow-mo: the world drops to ~20% for half a second as the beam hits
  if (G.pendingLevels > 0 && G.state === "play") openLevelUp();
  updateHud();
}

// ---------- achievements (142) ----------
const ACH_KEY = "bubblePopArenaAch";
function loadAch() { try { const o = JSON.parse(localStorage.getItem(ACH_KEY) || "{}"); o.unlocked = o.unlocked || {}; o.stat = o.stat || {}; o.stat.k = o.stat.k || {}; return o; } catch (e) { return { unlocked: {}, stat: { k: {} } }; } }
let ACH = loadAch();
function saveAch() { try { localStorage.setItem(ACH_KEY, JSON.stringify(ACH)); } catch (e) {} }

const ACHDEFS = [];
// band = difficulty/rarity tier: 0 COMMON (easy, top) → 4 LEGENDARY (rare, bottom).
// B() spreads a track's tiers across bands so tier I lands easy and the last tier lands hard.
const B = (i, n) => n <= 1 ? 0 : Math.round((i / (n - 1)) * 4);
const BANDS = [
  { name: "FIRST STROKES", icon: "🌱", rar: "COMMON" },
  { name: "FINDING YOUR FINS", icon: "🌊", rar: "UNCOMMON" },
  { name: "SEASONED SLAYER", icon: "⚔️", rar: "RARE" },
  { name: "ABYSSAL CHALLENGES", icon: "👑", rar: "EPIC" },
  { name: "LEGENDS OF THE REEF", icon: "🏆", rar: "LEGENDARY" },
];
function ach(id, icon, name, desc, need, get, band) { ACHDEFS.push({ id, icon, name, desc, need, get, band: band == null ? 2 : band }); }
const aKills = (t) => (ACH.stat.k[t] || 0);
const aTotalKills = () => { let n = 0; for (const k in ACH.stat.k) n += ACH.stat.k[k]; return n; };
const aInRun = () => (G.state === "play" || G.state === "levelup" || G.state === "pause");
const aWave = () => Math.max(ACH.stat.maxWave || 0, aInRun() ? G.wave : 0);
const aStage = () => Math.max(ACH.stat.maxStage || 0, aInRun() ? G.stageN : 0);
const aLvl = () => Math.max(ACH.stat.maxLvl || 0, P.lvl || 0);
const aCombo = () => Math.max(ACH.stat.maxCombo || 0, G.bestCombo || 0);
const aPearls = () => (META.pearls || 0) + (G.runPearls || 0);
const aSecs = () => (ACH.stat.secs || 0) + (aInRun() ? Math.floor(G.time) : 0);
const aDives = () => { try { return loadLife().dives || 0; } catch (e) { return 0; } };
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
// 32: one Hunter track per foe type
const FOE_ACH = [["mini", "Mite", "✽"], ["chaser", "Reaver", "➤"], ["speedy", "Dart", "»"], ["tank", "Bulwark", "■"], ["splitter", "Mitosquid", "❖"], ["spitter", "Hexspit", "✦"], ["exploder", "Fusebloom", "✸"], ["leecher", "Sipheon", "◎"], ["snare", "Snarejelly", "🕸"], ["lunker", "Lunker", "⬢"], ["dasher", "Ripfin", "🗡"], ["mender", "Mender", "✚"]];
for (const ft of FOE_ACH) {
  const t = ft[0], nm = ft[1], ic = ft[2];
  const steps = (t === "snare" || t === "lunker") ? [10, 40, 120, 300] : [25, 100, 300, 750];
  steps.forEach((n, i) => ach("k_" + t + "_" + i, ic, nm + " Hunter " + ROMAN[i], "Pop " + n + " " + nm + "s (lifetime).", n, (() => { const tt = t; return () => aKills(tt); })(), B(i, steps.length)));
}
// 6: total pops
[100, 500, 1500, 3000, 6000, 12000].forEach((n, i, a) => ach("pop_" + i, "✹", "Bubble Butcher " + ROMAN[i], "Pop " + n + " foes in total (lifetime).", n, aTotalKills, B(i, a.length)));
// 9: wave depth
[3, 5, 8, 10, 12, 15, 18, 22, 28].forEach((n, i, a) => ach("wave_" + i, "🌊", "Abyssal Reach " + ROMAN[i], "Reach wave " + n + " in one dive.", n, aWave, B(i, a.length)));
// 8: player level
[3, 5, 8, 10, 12, 15, 20, 25].forEach((n, i, a) => ach("lvl_" + i, "⭐", "Prodigy " + ROMAN[i], "Reach level " + n + " in one dive.", n, aLvl, B(i, a.length)));
// 6: combo
[5, 8, 12, 16, 20, 30].forEach((n, i, a) => ach("combo_" + i, "🔥", "Combo Cook " + ROMAN[i], "Chain a x" + n + " pop combo.", n, aCombo, B(i, a.length)));
// 6: pearls banked
[25, 100, 300, 750, 1500, 3000].forEach((n, i, a) => ach("pearl_" + i, "●", "Pearl Hoarder " + ROMAN[i], "Bank " + n + " pearls (lifetime).", n, aPearls, B(i, a.length)));
// 6: bosses
[1, 3, 6, 10, 16, 25].forEach((n, i, a) => ach("boss_" + i, "☠", "Boss Breaker " + ROMAN[i], "Slay " + n + " bosses (lifetime).", n, () => (ACH.stat.boss || 0), B(i, a.length)));
// 4: leviathans (starts at UNCOMMON — one Leviathan is no first dive)
[1, 2, 4, 6].forEach((n, i) => ach("super_" + i, "⛧", "Leviathan Bane " + ROMAN[i], "Slay the Abyssal Leviathan " + n + " time" + (n > 1 ? "s" : "") + ".", n, () => (ACH.stat.super || 0), 1 + i));
// 4: elites
[1, 5, 15, 30].forEach((n, i, a) => ach("elite_" + i, "★", "Giltwisp Chaser " + ROMAN[i], "Pop " + n + " elite golden bubbles.", n, () => (ACH.stat.elite || 0), B(i, a.length)));
// 3: clams
[1, 5, 15].forEach((n, i, a) => ach("clam_" + i, "◍", "Clam Jam " + ROMAN[i], "Crack " + n + " giant clams.", n, () => (ACH.stat.clam || 0), B(i, a.length)));
// 4: chests
[1, 5, 15, 30].forEach((n, i, a) => ach("chest_" + i, "▣", "Cache Hunter " + ROMAN[i], "Open " + n + " milestone caches.", n, () => (ACH.stat.chest || 0), B(i, a.length)));
// 3: evolutions (forging one is EPIC; forging several in one dive is LEGENDARY)
ach("evo_trident", "Ψ", "Trident Forged", "Evolve Split Shot + Piercing Pop into the TRIDENT.", 1, () => (P.stacks.trident ? 1 : 0), 3);
ach("evo_depth", "✸", "Depth Charged", "Evolve Bouncy Bubbles + Big Bubbles into DEPTH CHARGE.", 1, () => (P.stacks.depth ? 1 : 0), 3);
ach("evo_both", "◆", "True Tidecaller", "Forge both original legendary evolutions.", 2, () => ((P.stacks.trident ? 1 : 0) + (P.stacks.depth ? 1 : 0)), 4);
ach("evo_star", "☄", "Starfall Forged", "Evolve Heavy Bubbles + Rapid Pump into STARFALL.", 1, () => (P.stacks.star ? 1 : 0), 3);
ach("evo_lheart", "❥", "Heart of the Deep", "Evolve Bubble Heart + Regeneration into LEVIATHAN HEART.", 1, () => (P.stacks.lheart ? 1 : 0), 3);
ach("evo_mael", "🌀", "Eye of the Storm", "Evolve Split Shot + Bouncy Bubbles into the MAELSTROM.", 1, () => (P.stacks.mael ? 1 : 0), 3);
ach("evo_all", "👑", "Pantheon of the Reef", "Forge all five legendary evolutions.", 5, () => ((P.stacks.trident ? 1 : 0) + (P.stacks.depth ? 1 : 0) + (P.stacks.star ? 1 : 0) + (P.stacks.lheart ? 1 : 0) + (P.stacks.mael ? 1 : 0)), 4);
// 5: dives
const DIVE_ACH = [[1, "First Splash"], [10, "Regular Diver"], [25, "Reef Veteran"], [50, "Old Salt"], [100, "Centurion of the Deep"]];
DIVE_ACH.forEach((d, i) => ach("dive_" + i, "≋", d[1], "Begin " + d[0] + " dive" + (d[0] > 1 ? "s" : "") + " (lifetime).", d[0], aDives, B(i, DIVE_ACH.length)));
// 4: time underwater
[15, 60, 180, 360].forEach((n, i, a) => ach("time_" + i, "◷", "Drifter " + ROMAN[i], "Spend " + n + " minutes underwater (lifetime).", n, () => aSecs() / 60, B(i, a.length)));
// 4: accuracy
[40, 55, 70, 85].forEach((n, i, a) => ach("acc_" + i, "◎", "Sharpshooter " + ROMAN[i], "Finish a dive with " + n + "%+ accuracy.", n, () => (ACH.stat.bestAcc || 0), B(i, a.length)));
// 3: dailies
[1, 3, 7].forEach((n, i, a) => ach("daily_" + i, "☀", "Daily Pledge " + ROMAN[i], "Complete " + n + " Daily Dive" + (n > 1 ? "s" : "") + ".", n, () => (ACH.stat.daily || 0), B(i, a.length)));
// 3: single-hit damage
[100, 250, 500].forEach((n, i, a) => ach("hit_" + i, "✦", "Overkill " + ROMAN[i], "Land a single hit of " + n + "+ damage.", n, () => (ACH.stat.maxHit || 0), B(i, a.length)));
// 3: misc feats
ach("revive", "✚", "Cheated the Deep", "Burn your Second Wind and keep swimming.", 1, () => (ACH.stat.revive || 0), 2);
ach("hp200", "♥", "Deep Lungs", "Reach 200 max HP in one dive.", 200, () => (P.maxHp || 0), 2);
ach("mag400", "◎", "Reef Vacuum", "Reach 400 pickup range in one dive.", 400, () => Math.round(P.magnet || 0), 3);
// 3: elemental power-ups
[1, 10, 50].forEach((n, i, a) => ach("pow_" + i, "🔥", "Elemental " + ROMAN[i], "Grab " + n + " elemental power-up" + (n > 1 ? "s" : "") + " (lifetime).", n, () => (ACH.stat.pow || 0), B(i, a.length)));
// 4: abyssal relics + the trench
ach("relic_0", "🐚", "Relic Bound", "Bind an abyssal relic.", 1, () => (ACH.stat.relics || 0), 1);
ach("relic_1", "🐚", "Relic Hoarder", "Bind 10 relics (lifetime).", 10, () => (ACH.stat.relics || 0), 3);
ach("trench_0", "🌑", "Into the Trench", "Reach wave 12 in one dive.", 12, aWave, 2);
ach("hadal_0", "◉", "Hadal Bane", "Slay the Hadal Mother.", 1, () => (ACH.stat.hadal || 0), 3);
// 2: procedural stages
[3, 6].forEach((n, i, a) => ach("stage_" + i, "◈", "Wayfarer " + ROMAN[i], "Reach stage " + n + " in one dive.", n, aStage, B(i, a.length)));

let achToastQ = [], achToastBusy = false;
function checkAch() {
  let fresh = false;
  for (const a of ACHDEFS) {
    if (ACH.unlocked[a.id]) continue;
    let v = 0;
    try { v = a.get(); } catch (e) { v = 0; }
    if (v >= a.need) { ACH.unlocked[a.id] = 1; achToastQ.push(a); fresh = true; }
  }
  if (fresh) {
    saveAch();
    pumpAchToast();
    const tab = document.getElementById("achTab");
    if (tab && !tab.hidden) renderAch();
  }
}
function pumpAchToast() {
  if (achToastBusy || !achToastQ.length) return;
  achToastBusy = true;
  const a = achToastQ.shift();
  const t = document.getElementById("achToast");
  t.innerHTML = "<b>🏆 ACHIEVEMENT UNLOCKED</b><span>" + a.icon + " " + a.name + "</span>";
  t.hidden = false;
  t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  buzz([20, 30, 20]);
  tone(660, 0.12, "triangle", 0.1); setTimeout(() => tone(990, 0.18, "triangle", 0.1), 140);
  setTimeout(() => { t.hidden = true; achToastBusy = false; pumpAchToast(); }, 2600);
}
function achColKey() { return "bubblePopArenaAchCol"; }
function achCollapsed() { try { return JSON.parse(localStorage.getItem(achColKey()) || "[]"); } catch (e) { return []; } }
function renderAch() {
  const c = document.getElementById("achList");
  if (!c) return;
  const ids = Object.keys(ACH.unlocked);
  document.getElementById("achCount").textContent = "🏆 " + ids.length + " / " + ACHDEFS.length + " unlocked";
  c.innerHTML = "";
  const collapsed = achCollapsed();
  BANDS.forEach((g, gi) => {
    const defs = ACHDEFS.filter((a) => a.band === gi);
    if (!defs.length) return;
    const got = defs.filter((a) => ACH.unlocked[a.id]).length;
    const sec = document.createElement("div");
    sec.className = "achGroup r" + gi + (collapsed.includes(gi) ? " closed" : "");
    const head = document.createElement("div");
    head.className = "achGroupHead";
    head.setAttribute("role", "button");
    head.tabIndex = 0;
    head.title = "tap to collapse / expand";
    const pctAll = Math.round((got / defs.length) * 100);
    head.innerHTML = '<span class="ghIcon">' + g.icon + '</span><span class="ghName">' + g.name + '</span>' +
      '<span class="ghRar">' + g.rar + '</span><span class="ghCount">' + got + "/" + defs.length + '</span>' +
      '<span class="ghChev">▾</span><span class="ghBar"><i style="width:' + pctAll + '%"></i></span>';
    const toggle = () => {
      sec.classList.toggle("closed");
      let col = achCollapsed();
      if (sec.classList.contains("closed")) { if (!col.includes(gi)) col.push(gi); }
      else col = col.filter((x) => x !== gi);
      try { localStorage.setItem(achColKey(), JSON.stringify(col)); } catch (e) {}
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    sec.appendChild(head);
    const grid = document.createElement("div");
    grid.className = "achGrid";
    for (const a of defs) {
      const has = ACH.unlocked[a.id];
      let v = 0;
      try { v = a.get(); } catch (e) { v = 0; }
      if (typeof v !== "number" || isNaN(v)) v = 0;
      const pct = has ? 100 : Math.min(100, Math.round(v / a.need * 100));
      const row = document.createElement("div");
      row.className = "achRow r" + gi + (has ? " has" : "");
      row.title = a.name + ": " + Math.floor(v) + " / " + a.need;
      row.innerHTML = '<div class="ai">' + a.icon + '</div><div class="an"><b>' + a.name + '</b><small>' + a.desc +
        '</small><div class="abar"><i style="width:' + pct + '%"></i></div></div><div class="av">' + (has ? "✔" : pct + "%") + "</div>";
      grid.appendChild(row);
    }
    sec.appendChild(grid);
    c.appendChild(sec);
  });
}

// ---------- spawning ----------
function spawnOffscreen() {
  const viewR = Math.hypot(W, H) / 2;
  let fx = P.x, fy = P.y;
  for (let t = 0; t < 8; t++) {
    const a = Math.random() * TAU;
    const d = viewR + rand(40, 220);
    fx = clamp(P.x + Math.cos(a) * d, 30, WORLD.w - 30);
    fy = clamp(P.y + Math.sin(a) * d, 30, WORLD.h - 30);
    if (Math.hypot(fx - P.x, fy - P.y) > 360) break;
  }
  return { x: fx, y: fy };
}

function currentPush(o, dt, f) {
  const cm = G.currentMul || 1;
  for (const c of G.currents) {
    if (o.x > c.x && o.x < c.x + c.w && o.y > c.y && o.y < c.y + c.h) {
      o.x += c.dx * c.sp * cm * f * dt; o.y += c.dy * c.sp * cm * f * dt;
    }
  }
}

// rideable current highways: two full-width surf lanes per dive
function genLanes() {
  G.lanes.length = 0;
  for (let i = 0; i < 2; i++) {
    G.lanes.push({ y: rand(200, WORLD.h - 330), h: 130, dir: Math.random() < 0.5 ? 1 : -1, sp: rand(110, 150), ph: rand(0, 9) });
  }
}

// powder kegs: drift, eat shots, explode (chains!) — bait foes close
function spawnBarrel() {
  const pos = spawnOffscreen();
  G.barrels.push({ x: pos.x, y: pos.y, vx: rand(-30, 30), vy: rand(-30, 30), t: rand(0, 9), fuse: -1, gone: false });
}
function explodeBarrel(b) {
  if (b.gone) return;
  b.gone = true;
  burst(b.x, b.y, "#fdba74", 30, 340, 12);
  burst(b.x, b.y, "#fde047", 16, 260);
  pushRing(b.x, b.y, 170, "#fdba74", 5);
  G.lights.push({ x: b.x, y: b.y, t: 0.4, max: 0.4, color: "253,180,100", r: 220 });
  tone(120, 0.4, "sawtooth", 0.16, 40);
  G.shake = Math.min(10, G.shake + 5);
  for (const o of G.enemies) {
    if (o.dead) continue;
    const rr = 175 + o.r;
    if (dist2(b.x, b.y, o.x, o.y) < rr * rr) damageFoe(o, 120 * dmgMul(), false, b.x, b.y);
  }
  for (const o of G.barrels) { // chain detonation
    if (o.gone || o === b || o.fuse >= 0) continue;
    if (dist2(b.x, b.y, o.x, o.y) < 190 * 190) o.fuse = 0.25;
  }
  const pr = 150 + P.r;
  if (dist2(b.x, b.y, P.x, P.y) < pr * pr) hurtPlayer(30, "a powder keg", b.x, b.y);
}

// implosion urchins: trench traps that inhale instead of exploding — bait foes close, then crush
function spawnUrchin() {
  const pos = spawnOffscreen();
  G.urchins.push({ x: pos.x, y: pos.y, t: rand(0, 9), fuse: -1, gone: false });
}
function implodeUrchin(u) {
  if (u.gone) return;
  u.gone = true;
  pushRing(u.x, u.y, 230, "#2dd4bf", 5);
  pushRing(u.x, u.y, 120, "#f0abfc", 3);
  burst(u.x, u.y, "#2dd4bf", 26, 300, 10);
  G.lights.push({ x: u.x, y: u.y, t: 0.4, max: 0.4, color: "45,212,191", r: 220 });
  tone(200, 0.4, "sine", 0.14, 60);
  G.shake = Math.min(8, G.shake + 3);
  for (const o of G.enemies) {
    if (o.dead) continue;
    const d = Math.max(1, Math.hypot(o.x - u.x, o.y - u.y));
    if (d < 240 + o.r) {
      o.kx += ((u.x - o.x) / d) * 620; o.ky += ((u.y - o.y) / d) * 620;
      if (d < 200 + o.r) damageFoe(o, 90 * dmgMul(), false, u.x, u.y);
    }
  }
  for (const v of G.urchins) { // chain implosions
    if (v.gone || v === u || v.fuse >= 0) continue;
    if (dist2(u.x, u.y, v.x, v.y) < 200 * 200) v.fuse = 0.25;
  }
  addText(u.x, u.y - 24, "IMPLODED!", "#2dd4bf", 14);
}

function depthAt(x, y) {
  const dx = (x - WORLD.w / 2) / (WORLD.w / 2), dy = (y - WORLD.h / 2) / (WORLD.h / 2);
  return clamp(Math.hypot(dx, dy) / Math.SQRT2, 0, 1);
}

function snapCamera() {
  camX = WORLD.w > W ? clamp(P.x - W / 2, 0, WORLD.w - W) : (WORLD.w - W) / 2;
  camY = WORLD.h > H ? clamp(P.y - H / 2, 0, WORLD.h - H) : (WORLD.h - H) / 2;
}

// smooth follow used per-frame: filters high-frequency motion (e.g. whirlpool
// orbits that used to whip the whole screen around in tight circles) while
// still tracking normal swimming with a short lag. Resets/teleports keep snap.
// intro pan: while focusT runs, the target is a point that starts on the boss
// and drifts back to you, so the camera visits him, holds, then glides home.
// fire() is gated on focusT, so your fish holds its shots until your eyes (and
// the camera) are back on it.
function smoothCamera(dt) {
  let fx = P.x, fy = P.y;
  if (G.focusT > 0) {
    G.focusT = Math.max(0, G.focusT - dt);
    if (G.focusHold > 0) {
      // hold phase: stay pinned on the boss so the entrance reads
      G.focusHold = Math.max(0, G.focusHold - dt);
    } else {
      // glide-home phase: drift the focus point back toward your fish
      const d = Math.min(1, dt * 1.2);
      G.focusX += (P.x - G.focusX) * d;
      G.focusY += (P.y - G.focusY) * d;
    }
    if (G.focusT > 0) { fx = G.focusX; fy = G.focusY; }
  }
  const tx = WORLD.w > W ? clamp(fx - W / 2, 0, WORLD.w - W) : (WORLD.w - W) / 2;
  const ty = WORLD.h > H ? clamp(fy - H / 2, 0, WORLD.h - H) : (WORLD.h - H) / 2;
  const k = 1 - Math.exp(-5 * dt);
  camX += (tx - camX) * k;
  camY += (ty - camY) * k;
}
// boss intro: point the camera at him for the name card, with a grace period
// while your eyes are off your fish. Shooting is held for the whole pan (see
// fire()), so the boss takes no damage until the camera is back on you.
function cineFocus(x, y, dur, hold) {
  G.focusX = x; G.focusY = y;
  G.focusT = dur || 3.8;
  G.focusHold = hold == null ? 1.8 : hold;
  P.iframes = Math.max(P.iframes, 3.0);
}

function onScreen(x, y, m) {
  const mg = m || 0;
  return x > camX - mg && x < camX + W + mg && y > camY - mg && y < camY + H + mg;
}

function genDecor() {
  G.decor.length = 0;
  for (let i = 0; i < 70; i++) {
    const x = rand(60, WORLD.w - 60), y = rand(60, WORLD.h - 60);
    if (Math.hypot(x - WORLD.w / 2, y - WORLD.h / 2) < 220) continue;
    const k = RNG();
    G.decor.push({ x, y, r: rand(10, 30), kind: k < 0.4 ? "rock" : k < 0.75 ? "coral" : "weed", seed: RNG() * TAU });
  }
  for (let i = 0; i < 12; i++) {
    const specks = [];
    for (let k = 0; k < 9; k++) specks.push({ dx: rand(-0.8, 0.8), dy: rand(-0.55, 0.55), r: rand(1.5, 3.5) });
    G.decor.push({ x: rand(100, WORLD.w - 100), y: rand(100, WORLD.h - 100), r: rand(50, 110), kind: "sand", seed: Math.random() * TAU, specks });
  }
  // seabed mottling: big soft light-pools + tint variation (drawn under everything)
  const BLOBC = ["#155e75", "#0e7490", "#1e5a7a", "#2a6a5e", "#134e6a"];
  for (let i = 0; i < 18; i++) {
    G.blobs.push({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), rx: rand(120, 300), ry: rand(90, 220), rot: rand(0, TAU), c: BLOBC[i % BLOBC.length], a: rand(0.12, 0.22) });
  }
  for (let i = 0; i < 14; i++) {
    const sx = rand(60, WORLD.w - 60), sy = rand(60, WORLD.h - 60);
    if (Math.hypot(sx - WORLD.w / 2, sy - WORLD.h / 2) < 200) continue;
    G.decor.push({ x: sx, y: sy, r: rand(7, 12), kind: "shell", seed: RNG() * TAU });
  }
  // current lanes: drifting bands that push swimmers + pickups
  G.currents.length = 0;
  for (let i = 0; i < 3; i++) {
    const horiz = i < 2;
    const w = horiz ? rand(500, 800) : rand(140, 220);
    const h = horiz ? rand(140, 220) : rand(500, 800);
    G.currents.push({
      x: rand(200, WORLD.w - 200 - w), y: rand(200, WORLD.h - 200 - h), w, h,
      dx: horiz ? (RNG() < 0.5 ? 1 : -1) : 0, dy: horiz ? 0 : (RNG() < 0.5 ? 1 : -1),
      sp: rand(50, 90),
    });
  }
  // whirlpools: pull + swirl
  G.whirls.length = 0;
  for (let i = 0; i < 2; i++) {
    G.whirls.push({ x: rand(400, WORLD.w - 400), y: rand(400, WORLD.h - 400), r: rand(90, 130), spin: RNG() < 0.5 ? 1 : -1 });
  }
  // treasure clams: crack open for gems + pearls, restock each wave
  G.clams.length = 0;
  for (let i = 0; i < 3; i++) spawnTreasureClam();
  // ambient minnows
  G.minnows.length = 0;
  for (let i = 0; i < 12; i++) {
    G.minnows.push({ x: rand(200, WORLD.w - 200), y: rand(200, WORLD.h - 200), a: rand(0, TAU), sp: rand(60, 110), seed: RNG() * TAU, scare: 0 });
  }
  // drifting jellyfish: slow, harmless, hypnotic
  G.jellies.length = 0;
  const JELLY = ["#f0abfc", "#67e8f9", "#f9a8d4"];
  for (let i = 0; i < 3; i++) {
    G.jellies.push({ x: rand(300, WORLD.w - 300), y: rand(300, WORLD.h - 300), vx: rand(-14, 14), vy: rand(-10, 10), r: rand(16, 24), seed: RNG() * TAU, c: JELLY[i % JELLY.length] });
  }
  G.ambient.length = 0;
  for (let i = 0; i < 56; i++) {
    const bubble = RNG() < 0.5;
    const tw = !bubble && RNG() < 0.45;
    G.ambient.push({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), r: rand(3, 14), s: rand(14, 34), a: rand(0.25, 0.6), bubble, tw, seed: RNG() * TAU, tint: tw ? ["#67e8f9", "#f0abfc", "#fde047"][(RNG() * 3) | 0] : null });
  }
}

function spawnTreasureClam() {
  G.clams.push({ x: rand(200, WORLD.w - 200), y: rand(200, WORLD.h - 200), r: 22, open: false, t: 0 });
}

function driftAmbient(dt) {
  for (const a of G.ambient) {
    a.y -= a.s * dt;
    if (a.y < -10) { a.y = WORLD.h + 10; a.x = rand(0, WORLD.w); }
  }
}

function hpMul() { const w = G.wave - 1; return (1 + w * 0.32 + Math.pow(w, 1.8) * 0.08) * diffDef(G.diff).hp; }
function dmgMul() { return (1 + (G.wave - 1) * 0.11) * diffDef(G.diff).dmg; }
function spdMul() { return Math.min(1.7, 1 + (G.wave - 1) * 0.03) * diffDef(G.diff).spd; }

const FOE = {
  mini: { r: 10, hp: 10, sp: 95, dmg: 8, xp: 1, color: "#f472b6", w: 10, minWave: 1 },
  chaser: { r: 14, hp: 24, sp: 72, dmg: 12, xp: 2, color: "#fb7185", w: 10, minWave: 1 },
  speedy: { r: 10, hp: 15, sp: 150, dmg: 8, xp: 2, color: "#facc15", w: 6, minWave: 2 },
  tank: { r: 23, hp: 80, sp: 42, dmg: 20, xp: 6, color: "#60a5fa", w: 5, minWave: 3 },
  splitter: { r: 16, hp: 34, sp: 62, dmg: 12, xp: 3, color: "#4ade80", w: 5, minWave: 3, splits: true },
  spitter: { r: 14, hp: 30, sp: 80, dmg: 10, xp: 4, color: "#c084fc", w: 4, minWave: 4, ranged: true },
  exploder: { r: 12, hp: 18, sp: 105, dmg: 22, xp: 3, color: "#fb923c", w: 5, minWave: 3, exploder: true },
  mine: { r: 12, hp: 30, sp: 0, dmg: 26, xp: 2, color: "#57534e", w: 0, minWave: 8, exploder: true, mine: true },
  leecher: { r: 11, hp: 20, sp: 120, dmg: 6, xp: 2, color: "#e879f9", w: 4, minWave: 5, leecher: true },
  snare: { r: 12, hp: 26, sp: 78, dmg: 8, xp: 3, color: "#a5f3fc", w: 4, minWave: 10, snare: true },
  lunker: { r: 26, hp: 150, sp: 36, dmg: 24, xp: 9, color: "#f59e0b", w: 4, minWave: 12 },
  dasher: { r: 12, hp: 26, sp: 96, dmg: 14, xp: 3, color: "#ef4444", w: 5, minWave: 5 },
  mender: { r: 12, hp: 22, sp: 62, dmg: 6, xp: 4, color: "#fbbf24", w: 4, minWave: 6 },
};

function pickType() {
  const keys = Object.keys(FOE).filter((k) => G.wave >= FOE[k].minWave);
  const fm = G.foeMul || {};
  let total = 0;
  for (const k of keys) total += FOE[k].w * (fm[k] || 1);
  let r = RNG() * total;
  for (const k of keys) { r -= FOE[k].w * (fm[k] || 1); if (r <= 0) return k; }
  return "chaser";
}

// ---------- bestiary: every species you've met and popped, tallied in the 📚 tab ----------
const BEASTS = [
  { id: "mini", name: "Reef Mite", color: "#f472b6", icon: "🐟", blurb: "barely a bite" },
  { id: "chaser", name: "Reef Reaver", color: "#fb7185", icon: "🦈", blurb: "crimson spikefish" },
  { id: "speedy", name: "Dart", color: "#facc15", icon: "⚡", blurb: "blink and miss it" },
  { id: "tank", name: "Siege Crab", color: "#60a5fa", icon: "🦀", blurb: "walking fortress" },
  { id: "splitter", name: "Brood-Squid", color: "#4ade80", icon: "🐙", blurb: "popping births twins" },
  { id: "spitter", name: "Hexspit", color: "#c084fc", icon: "🎯", blurb: "sniper at range" },
  { id: "exploder", name: "Fusebloom", color: "#fb923c", icon: "🐡", blurb: "doom-ring bloom" },
  { id: "mine", name: "Ember Mine", color: "#a8a29e", icon: "⚓", blurb: "do not touch" },
  { id: "leecher", name: "Sipheon", color: "#e879f9", icon: "🦟", blurb: "drinks your XP" },
  { id: "snare", name: "Snarejelly", color: "#a5f3fc", icon: "🪼", blurb: "sticky webs" },
  { id: "lunker", name: "Lunker", color: "#f59e0b", icon: "💡", blurb: "lured into the deep" },
  { id: "dasher", name: "Ripfin", color: "#ef4444", icon: "🗡️", blurb: "telegraphs its rip" },
  { id: "mender", name: "Reef Mender", color: "#fbbf24", icon: "✚", blurb: "knits its allies whole" },
  { id: "clam", name: "Maw Clam", color: "#f9a8d4", icon: "🦪", blurb: "pearls inside" },
  { id: "elite", name: "Giltwisp Elite", color: "#fde047", icon: "👑", blurb: "golden, flees fast" },
  { id: "boss", name: "Reef Tyrant", color: "#f43f5e", icon: "☠", blurb: "king of the reef", apex: true },
  { id: "superboss", name: "Abyssal Leviathan", color: "#7c3aed", icon: "🌑", blurb: "darkness falls", apex: true },
  { id: "hadal", name: "Hadal Mother", color: "#2dd4bf", icon: "◉", blurb: "she hungers", apex: true },
];
function beastKey(e) { return e.elite ? "elite" : e.type; }
function noteSeen(e) { META.seen = META.seen || {}; META.slain = META.slain || {}; META.seen[beastKey(e)] = (META.seen[beastKey(e)] || 0) + 1; }
function noteSlain(e) { META.seen = META.seen || {}; META.slain = META.slain || {}; META.slain[beastKey(e)] = (META.slain[beastKey(e)] || 0) + 1; }

function spawnPortal(x, y, r, color) {
  if (G.portals.length > 26) G.portals.shift();
  G.portals.push({ x, y, r, t: 0, life: 0.45, color: color || "#67e8f9", spin: Math.random() < 0.5 ? 1 : -1 });
}
function spawnEnemy(forceType, atX, atY) {
  const type = forceType || pickType();
  const base = FOE[type];
  const pos = (atX !== undefined) ? { x: atX, y: atY } : spawnOffscreen();
  const hp = base.hp * hpMul() * (1 + depthAt(pos.x, pos.y) * 0.35) * (G.mutHp || 1) * (G.depthHp || 1) * (G.relicFoeHp || 1) * rand(0.9, 1.1);
  G.enemies.push({
    id: G.nextId++,
    type, x: pos.x, y: pos.y,
    r: base.r, hp, maxHp: hp,
    sp: base.sp * spdMul() * (G.foeSpdMul || 1) * (G.mutSpd || 1) * rand(0.9, 1.1),
    dmg: Math.round(base.dmg * dmgMul() * (G.depthDmg || 1)),
    xp: base.xp, color: base.color,
    splits: !!base.splits, ranged: !!base.ranged,
    exploder: !!base.exploder, leecher: !!base.leecher, mine: !!base.mine, snare: !!base.snare,
    fuse: -1, stolen: 0, fleeing: false,
    shootT: rand(1, 2.5), strafe: RNG() < 0.5 ? 1 : -1,
    flash: 0, kx: 0, ky: 0,
  });
  // tear-in portal: foes rip into the reef through ink, not thin air
  spawnPortal(pos.x, pos.y, base.r * 1.8, "#67e8f9");
  noteSeen(G.enemies[G.enemies.length - 1]); // bestiary: met another one
}

function spawnBoss(pattern) {
  pattern = pattern || "classic";
  const epic = G.mode === "dive" && G.wave % 10 !== 0; // classic 5-wave bosses are EPIC duels; modes + 10-wave supers keep their own rituals
  let hp = 460 * (1 + (G.wave / 5 - 1) * 0.9 + G.wave * 0.06) * (G.depthHp || 1);
  if (epic) hp *= 1.8;
  const styles = {
    classic: { color: "#f43f5e", icon: "☠", name: "ABYSSAL MAW" },
    weaver: { color: "#a78bfa", icon: "🕸", name: "WEBWEAVER" },
    summoner: { color: "#fb923c", icon: "👑", name: "BROODMOTHER" },
  };
  const st = styles[pattern] || styles.classic;
  G.enemies.push({
    id: G.nextId++, type: "boss", x: clamp(P.x, 120, WORLD.w - 120), y: clamp(P.y - 520, 90, WORLD.h - 90),
    r: epic ? 48 : 42, hp, maxHp: hp, sp: epic ? 42 : 38, dmg: Math.round(25 * dmgMul() * (G.depthDmg || 1) * (epic ? 1.25 : 1)),
    xp: epic ? 60 : 30, color: st.color, boss: true, epic, enraged: false, pattern, patName: st.name, shootT: 2, webT: 2, sumT: 4, flash: 0, kx: 0, ky: 0, strafe: 1,
  });
  spawnPortal(clamp(P.x, 120, WORLD.w - 120), clamp(P.y - 520, 90, WORLD.h - 90), epic ? 110 : 90, epic ? "#fde047" : "#f43f5e");
  noteSeen(G.enemies[G.enemies.length - 1]);
  G.bossAlive = true;
  G.bossSpawnedWave = G.wave;
  if (epic) {
    G.epicAlive = true;
    clearArenaForEpic();
    if (OPT.slowmo !== false) G.slowmo = Math.max(G.slowmo, 1.0); // the entrance lands in dreamy slow motion
    G.hurtFlash = OPT.calm ? 0.25 : 1; // red warning pulse as the epic enters the arena
    G.shake = Math.min(12, G.shake + 6);
    playCine("⚠ EPIC " + st.name, "WAVE " + G.wave + " — AN EPIC DUEL");
    cineFocus(clamp(P.x, 120, WORLD.w - 120), clamp(P.y - 520, 90, WORLD.h - 90));
    showBanner("⚠ EPIC " + st.name + " — WAVE " + G.wave, { urgent: true });
    setAnnounce("THE ARENA FALLS SILENT");
  } else {
    showBanner(st.icon + " " + st.name + " — WAVE " + G.wave, { urgent: true });
  }
  sfxBoss();
}

// epic arrival: the duel demands your whole attention, so the reef empties itself —
// foes burst into gems, bullets fizzle, webs burn away (a clam leaves pearls behind)
function clearArenaForEpic() {
  for (const o of G.enemies) {
    if (o.dead || o.boss) continue;
    o.dead = true;
    spawnGems(o.x, o.y, o.xp || 1);
    if (o.type === "clam") spawnPearls(o.x, o.y, 4);
    burst(o.x, o.y, o.color || "#7dd3fc", 10, 220);
  }
  for (const b of G.ebullets) burst(b.x, b.y, "#fecdd3", 3, 120);
  G.ebullets.length = 0;
  G.webs.length = 0;
  pushRing(P.x, P.y, 320, "#fde047", 5);
  G.shake = Math.min(12, G.shake + 6);
  tone(70, 0.8, "sawtooth", 0.16, 35);
  setTimeout(() => tone(140, 0.7, "sawtooth", 0.14, 70), 350);
}

function spawnSuperBoss() {
  // ABYSSAL LEVIATHAN — dread super boss on waves 10, 20, 30...
  const wv = G.wave;
  const hp = 2300 * (1 + (wv / 10 - 1) * 0.9 + wv * 0.04) * (G.depthHp || 1);
  G.enemies.push({
    id: G.nextId++, type: "superboss", x: clamp(P.x, 160, WORLD.w - 160), y: clamp(P.y - 520, 120, WORLD.h - 120),
    r: 56, hp, maxHp: hp, sp: 34, dmg: Math.round(34 * dmgMul() * (G.depthDmg || 1)),
    xp: 120, color: "#7c3aed", boss: true, superboss: true,
    shootT: 2, spirT: 3, spir: 0, sumT: 5, chargeT: 7, chargeWarned: false,
    flash: 0, kx: 0, ky: 0, strafe: 1,
  });
  G.bossAlive = true;
  G.superAlive = true;
  G.superSpawnedWave = wv;
  G.bossSpawnedWave = wv;
  spawnPortal(clamp(P.x, 160, WORLD.w - 160), clamp(P.y - 520, 120, WORLD.h - 120), 120, "#a78bfa");
  noteSeen(G.enemies[G.enemies.length - 1]);
  playCine("☠ ABYSSAL LEVIATHAN ☠", "WAVE " + wv + " — DARKNESS FALLS");
  cineFocus(clamp(P.x, 160, WORLD.w - 160), clamp(P.y - 520, 120, WORLD.h - 120));
  showBanner("☠ ABYSSAL LEVIATHAN ☠", { urgent: true });
  setAnnounce("DARKNESS FALLS");
  tone(55, 1.2, "sawtooth", 0.16, 30);
  setTimeout(() => tone(82, 0.9, "sawtooth", 0.14, 40), 300);
  G.shake = 10;
}

function spawnHadal() {
  // HADAL MOTHER — trench matriarch, answers every 20th wave while the Leviathan takes 10/30/50...
  const wv = G.wave;
  const hp = 2600 * (1 + (wv / 20 - 1) * 0.9 + wv * 0.04) * (G.depthHp || 1);
  G.enemies.push({
    id: G.nextId++, type: "hadal", x: clamp(P.x, 160, WORLD.w - 160), y: clamp(P.y - 520, 120, WORLD.h - 120),
    r: 52, hp, maxHp: hp, sp: 30, dmg: Math.round(30 * dmgMul() * (G.depthDmg || 1)),
    xp: 150, color: "#2dd4bf", boss: true, hadal: true,
    shootT: 2, spirT: 3, spir: 0, sumT: 5, slamT: 6, slamWarned: false,
    flash: 0, kx: 0, ky: 0, strafe: 1,
  });
  G.bossAlive = true;
  G.superAlive = true; // the dread vignette + music serve her too
  G.hadalAlive = true;
  G.superSpawnedWave = wv;
  G.hadalSpawnedWave = wv;
  G.bossSpawnedWave = wv;
  spawnPortal(clamp(P.x, 160, WORLD.w - 160), clamp(P.y - 520, 120, WORLD.h - 120), 120, "#2dd4bf");
  noteSeen(G.enemies[G.enemies.length - 1]);
  playCine("◉ HADAL MOTHER ◉", "WAVE " + wv + " — SHE HUNGERS");
  cineFocus(clamp(P.x, 160, WORLD.w - 160), clamp(P.y - 520, 120, WORLD.h - 120));
  showBanner("◉ HADAL MOTHER ◉", { urgent: true });
  setAnnounce("SHE HUNGERS");
  tone(48, 1.2, "sawtooth", 0.16, 28);
  setTimeout(() => tone(65, 0.9, "sawtooth", 0.14, 32), 300);
  G.shake = 10;
}

function spawnPearls(x, y, n) {
  let count = Math.max(1, Math.round(n * (G.pearlMul || 1) * (G.pactPearl || 1) * (G.pearlDepth || 1) * (G.relicPearl || 1) * diffDef(G.diff).pearl));
  if (G.pactId === "pacifist" && G.wave <= 3) count = Math.max(1, Math.round(count / 2));
  for (let i = 0; i < count; i++) {
    const a = RNG() * TAU, s = rand(60, 200);
    G.pearls.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rand(0, 9) });
  }
}

function spawnChest(x, y) {
  G.chests.push({ x: clamp(x, 60, WORLD.w - 60), y: clamp(y, 60, WORLD.h - 60), t: rand(0, 9), life: 40, got: false });
  pushRing(x, y, 90, "#fde047", 3);
}

function spawnClam() {
  const pos = spawnOffscreen();
  const hp = 400 * hpMul();
  G.enemies.push({
    id: G.nextId++, type: "clam", x: clamp(pos.x, 120, WORLD.w - 120), y: clamp(pos.y, 120, WORLD.h - 120),
    r: 34, hp, maxHp: hp, sp: 0, dmg: 18, xp: 12, color: "#f9a8d4",
    clam: true, shootT: 3, openT: 0, flash: 0, kx: 0, ky: 0, strafe: 1,
  });
  spawnPortal(pos.x, pos.y, 60, "#f9a8d4");
  noteSeen(G.enemies[G.enemies.length - 1]);
  showBanner("GIANT CLAM", { urgent: true });
  tone(90, 0.5, "sawtooth", 0.14, 50);
}

function spawnElite() {
  const pos = spawnOffscreen();
  const hp = 60 * hpMul() * (G.relicEliteHp || 1);
  // elite affixes: shielded / splitter / hasted / vampiric
  const affixes = ["shielded", "splitter", "hasted", "vampiric"];
  const affix = affixes[(RNG() * affixes.length) | 0];
  const e = {
    id: G.nextId++, type: "elite", x: pos.x, y: pos.y,
    r: 15, hp, maxHp: hp, sp: 235 * (affix === "hasted" ? 1.6 : 1), dmg: 10, xp: 8, color: "#fde047",
    elite: true, affix, flash: 0, kx: 0, ky: 0, strafe: 1, shootT: 99,
  };
  if (affix === "shielded") { e.shield = Math.round(hp * 0.6); e.shieldMax = e.shield; }
  if (affix === "vampiric") e.color = "#f87171";
  if (affix === "hasted") e.color = "#fef08a";
  G.enemies.push(e);
  noteSeen(e); // bestiary: met another giltwisp
  spawnPortal(pos.x, pos.y, 30, "#fde047"); // elites arrive gilded
  const ANAME = { shielded: "SHIELDED", splitter: "SPLITTER", hasted: "HASTED", vampiric: "VAMPIRIC" };
  addText(pos.x, pos.y, "ELITE: " + ANAME[affix] + "!", e.color, 17);
  tone(1200, 0.2, "sine", 0.08, 1800);
}

function spawnGems(x, y, total) {
  let left = total;
  while (left > 0) {
    const chunk = left >= 5 ? 5 : left;
    left -= chunk;
    const v = Math.max(1, Math.round(chunk * (G.gemMul || 1) * (G.mutGem || 1)));
    G.gems.push({ x: x + rand(-12, 12), y: y + rand(-12, 12), vx: rand(-60, 60), vy: rand(-60, 60), val: v, t: rand(0, 9) });
  }
}

// ---------- elemental power-ups: 🔥 fire / ❄️ ice drops, 10s of boosted shots ----------
const POWERS = {
  fire: { icon: "🔥", name: "FIRE FRENZY", color: "#fb923c", dur: 10, desc: "+50% dmg, foes ignite" },
  ice: { icon: "❄️", name: "GLACIER ROUNDS", color: "#7dd3fc", dur: 10, desc: "+15% dmg, foes chilled 55%" },
};
function spawnPowerup(x, y, forceKind) {
  const kind = forceKind || (Math.random() < 0.5 ? "fire" : "ice");
  G.pups.push({ x, y, vx: rand(-70, 70), vy: rand(-70, 70), kind, t: rand(0, 9), life: 14 });
}
function grabPowerup(kind) {
  const D = POWERS[kind];
  G.powerKind = kind;
  G.powerT = D.dur; // re-grab refreshes the 10s timer
  ACH.stat.pow = (ACH.stat.pow || 0) + 1;
  showBanner(D.icon + " " + D.name + "!", { urgent: true });
  addText(P.x, P.y - 34, D.desc + " — 10s", D.color, 14);
  pushRing(P.x, P.y, 100, D.color, 3);
  burst(P.x, P.y, D.color, 16, 240);
  sfxLevel();
  checkAch();
  updateHud(true);
}

// ---------- map objectives: extermination, elite hunts, survival surges ----------
const OBJS = [
  { id: "exterm", name: "EXTERMINATION", icon: "☠", dur: 30, need: 25,
    reward() { spawnChest(P.x + rand(-80, 80), P.y + rand(-80, 80)); return "bonus cache!"; } },
  { id: "hunt", name: "ELITE HUNT", icon: "★", dur: 35, need: 1,
    setup() { const n = G.enemies.length; spawnElite(); const e = G.enemies[G.enemies.length - 1]; if (G.enemies.length > n && e && e.elite && G.obj) G.obj.eliteId = e.id; },
    reward() { spawnPearls(P.x, P.y, 8); return "+8 pearls!"; } },
  { id: "surge", name: "SURVIVE THE SURGE", icon: "🌊", dur: 22, need: 0,
    reward() { G.hearts.push({ x: P.x, y: P.y, vx: 0, vy: 0, t: 0 }); spawnPowerup(P.x, P.y); return "heart + power-up!"; } },
];
const FOE_NAMES = { mini: "a Mite", chaser: "a Reaver", speedy: "a Dart", tank: "a Bulwark", splitter: "a Mitosquid", spitter: "a Hexspit", exploder: "a Fusebloom", leecher: "a Sipheon", mine: "a mine", clam: "a clam", boss: "the boss", superboss: "the LEVIATHAN", hadal: "the HADAL MOTHER", snare: "a Snarejelly", lunker: "a Lunker", dasher: "a Ripfin", mender: "a Reef Mender" };

// ---------- run pacts: draft 1 of 3 boon/bane oaths at dive start ----------
const PACTS = [
  { id: "glassjaw", name: "Glass Jaw", icon: "🩸", boon: "+40% XP", bane: "−30% max HP", apply() { P.maxHp = Math.round(P.maxHp * 0.7); P.hp = P.maxHp; P.xpMul *= 1.4; } },
  { id: "greed", name: "Greedfin", icon: "🪙", boon: "+100% pearls", bane: "−25% damage", apply() { G.pactPearl = 2; P.dmg *= 0.75; } },
  { id: "pacifist", name: "Pacifist Start", icon: "🕊", boon: "no touch harm waves 1–3", bane: "half pearls waves 1–3", apply() { G.pactId = "pacifist"; } },
  { id: "adrenaline", name: "Adrenaline", icon: "⚡", boon: "+18% swim speed", bane: "−25% pickup range", apply() { P.speed *= 1.18; P.magnet *= 0.75; } },
  { id: "bulwark", name: "Bulwark Oath", icon: "🛡", boon: "+60 max HP", bane: "−12% fire rate", apply() { P.maxHp += 60; P.hp = P.maxHp; P.fireRate *= 0.88; } },
  { id: "hothead", name: "Hothead", icon: "🤬", boon: "+60% combo XP", bane: "combo window 1.5s", apply() { G.comboXPMul = 1.6; G.comboWin = 1.5; } },
  { id: "glutton", name: "Glutton", icon: "🍖", boon: "hearts heal +60%", bane: "−15% XP", apply() { G.pactHeal = 1.6; P.xpMul *= 0.85; } },
];
let offeredPacts = [];
function openPactDraft() {
  offeredPacts = [];
  const pool = PACTS.slice();
  while (offeredPacts.length < 3 && pool.length) offeredPacts.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  const ctn = document.getElementById("pactCards");
  ctn.innerHTML = "";
  offeredPacts.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pactCard";
    const ic = document.createElement("div"); ic.className = "pactIco"; ic.textContent = p.icon;
    const nm = document.createElement("div"); nm.className = "pactName"; nm.textContent = (i + 1) + ". " + p.name;
    const bn = document.createElement("div"); bn.className = "pactBoon"; bn.textContent = "▲ " + p.boon;
    const be = document.createElement("div"); be.className = "pactBane"; be.textContent = "▼ " + p.bane;
    b.append(ic, nm, bn, be);
    b.addEventListener("click", () => pickPact(i));
    ctn.appendChild(b);
  });
  document.getElementById("pactOverlay").hidden = false;
  G.state = "pact";
}
function pickPact(i) {
  if (G.state !== "pact") return;
  if (i >= 0 && offeredPacts[i]) {
    offeredPacts[i].apply();
    setAnnounce("PACT SWORN: " + offeredPacts[i].name.toUpperCase());
    tone(330, 0.2, "triangle", 0.1, 660);
  }
  document.getElementById("pactOverlay").hidden = true;
  openRelicDraft(); // every dive then binds one run-warping relic
  updateHud(true);
}

// ---------- abyssal relics: draft 1 of 3 run-warping keepsakes after the pact ----------
const RELICS = [
  { id: "bloodmoon", name: "Blood Moon", icon: "🩸", boon: "+100% XP", bane: "foes +50% HP", apply() { G.relicXp = 2; G.relicFoeHp = 1.5; } },
  { id: "siren", name: "Siren's Debt", icon: "🕯", boon: "revive once", bane: "then −50% XP", apply() { P.revive = (P.revive || 0) + 1; G.debtRevives = (G.debtRevives || 0) + 1; } },
  { id: "tidalock", name: "Tidal Lock", icon: "🔒", boon: "+100% damage", bane: "no dash", apply() { P.dmg *= 2; P.noDash = true; } },
  { id: "greedfin", name: "Greedfin Hoard", icon: "🪙", boon: "+100% pearls", bane: "elites +50% HP", apply() { G.relicPearl = 2; G.relicEliteHp = 1.5; } },
  { id: "magnetar", name: "Magnetar Core", icon: "🧲", boon: "+80% pickup", bane: "−20% damage", apply() { P.magnet *= 1.8; P.dmg *= 0.8; } },
  { id: "heartkelp", name: "Heartkelp", icon: "💚", boon: "+60 max HP", bane: "−15% swim speed", apply() { P.maxHp += 60; P.hp = P.maxHp; P.speed *= 0.85; } },
  { id: "longfuse", name: "Long Fuse", icon: "⏳", boon: "+1.5s combo window", bane: "−15% combo XP", apply() { G.comboWin += 1.5; G.comboXPMul = (G.comboXPMul || 1) * 0.85; } },
  { id: "urchinmail", name: "Urchinmail", icon: "🌵", boon: "reflect 30% touch", bane: "−10 max HP", apply() { G.relicThorns = true; P.maxHp = Math.max(1, P.maxHp - 10); P.hp = Math.min(P.hp, P.maxHp); } },
  { id: "swiftkill", name: "Swift Slaughter", icon: "💨", boon: "+15% speed & fire rate", bane: "−20 max HP", apply() { P.speed *= 1.15; P.fireRate *= 1.15; P.maxHp = Math.max(1, P.maxHp - 20); P.hp = Math.min(P.hp, P.maxHp); } },
  { id: "bottomfeed", name: "Bottom Feeder", icon: "🌀", boon: "gems drift to you", bane: "−10% damage", apply() { G.relicVacuum = true; P.dmg *= 0.9; } },
  { id: "bossbane", name: "Boss Bane", icon: "⚔", boon: "+40% vs bosses/elites", bane: "−15% vs the small fry", apply() { G.relicBane = true; } },
  { id: "chestrite", name: "Chest Rite", icon: "💎", boon: "caches pay double", bane: "+8% foe spawns", apply() { G.relicChest = 2; G.spawnMul = (G.spawnMul || 1) * 1.08; } },
  { id: "deepfreeze", name: "Deep Freeze", icon: "❄", boon: "freeze lasts +2s", bane: "abilities recharge +25%", apply() { G.relicFreeze = 2; G.relicFrostCD = 1.25; } },
  { id: "bloodlust", name: "Bloodlust", icon: "🔥", boon: "damage grows with combo", bane: "−10% pickup", apply() { G.relicRage = true; P.magnet *= 0.9; } },
  { id: "pearldiver", name: "Pearl Diver", icon: "🦪", boon: "clams drop +3 pearls", bane: "−10% XP", apply() { G.relicClam = 3; G.relicXp = (G.relicXp || 1) * 0.9; } },
];
function openRelicDraft() {
  G.offeredRelics = [];
  const pool = RELICS.slice();
  while (G.offeredRelics.length < 3 && pool.length) G.offeredRelics.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  const ctn = document.getElementById("relicCards");
  ctn.innerHTML = "";
  G.offeredRelics.forEach((r, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pactCard";
    const ic = document.createElement("div"); ic.className = "pactIco"; ic.textContent = r.icon;
    const nm = document.createElement("div"); nm.className = "pactName"; nm.textContent = (i + 1) + ". " + r.name;
    const bn = document.createElement("div"); bn.className = "pactBoon"; bn.textContent = "▲ " + r.boon;
    const be = document.createElement("div"); be.className = "pactBane"; be.textContent = "▼ " + r.bane;
    b.append(ic, nm, bn, be);
    b.addEventListener("click", () => pickRelic(i));
    ctn.appendChild(b);
  });
  document.getElementById("relicOverlay").hidden = false;
  G.state = "relic";
}
function pickRelic(i) {
  if (G.state !== "relic") return;
  if (i >= 0 && G.offeredRelics[i]) {
    const r = G.offeredRelics[i];
    r.apply();
    G.relic = r;
    ACH.stat.relics = (ACH.stat.relics || 0) + 1;
    checkAch();
    // pact x relic fusions: sworn oaths resonate with bound relics
    if (r.id === "bloodmoon" && G.pactId === "hothead") { G.relicXp += 0.15; showBanner("🩸 CRIMSON FRENZY!"); addText(P.x, P.y - 44, "+15% XP — the blood sings", "#f87171", 14); }
    else if (r.id === "tidalock" && G.pactId === "bulwark") { P.maxHp += 30; P.hp += 30; showBanner("🔒 STONEWALL!"); addText(P.x, P.y - 44, "+30 max HP — rooted like reef", "#a5f3fc", 14); }
    else if (r.id === "greedfin" && G.pactId === "greed") { G.relicPearl += 0.5; showBanner("🪙 GILDED TIDE!"); addText(P.x, P.y - 44, "pearls flow like water", "#fde047", 14); }
    else { showBanner("🐚 RELIC BOUND: " + r.name.toUpperCase()); tone(520, 0.25, "triangle", 0.1, 780); }
    updateHud(true);
  }
  document.getElementById("relicOverlay").hidden = true;
  G.state = "play";
  updateHud(true);
}

// custom-sim modes skip drafts, so they bind one random relic silently instead
function grantRelic() {
  const r = RELICS[(Math.random() * RELICS.length) | 0];
  r.apply();
  G.relic = r;
  ACH.stat.relics = (ACH.stat.relics || 0) + 1;
  showBanner("🐚 RELIC BOUND: " + r.name.toUpperCase());
  return r;
}

// ---------- per-wave mutators: one-wave twists announced each wave ----------
const MUTATORS = [
  { id: "heavy", name: "Heavy Water", icon: "🌀", desc: "everything drifts slower, +25% XP", apply() { G.mutSpd = 0.85; G.mutXp = 1.25; } },
  { id: "blood", name: "Blood in the Water", icon: "🩸", desc: "elites drop hearts", apply() { G.mutHeart = true; } },
  { id: "swift", name: "Swift Tide", icon: "💨", desc: "foes +20% speed, +20% XP", apply() { G.mutSpd = 1.2; G.mutXp = 1.2; } },
  { id: "glass", name: "Glass Tide", icon: "🔍", desc: "foes −25% HP, +25% damage", apply() { G.mutHp = 0.75; G.mutDmg = 1.25; } },
  { id: "gemrain", name: "Gem Rain", icon: "💎", desc: "double gems this wave", apply() { G.mutGem = 2; } },
];
function rollMutator() {
  G.mut = null; G.mutName = ""; G.mutSpd = 1; G.mutHp = 1; G.mutXp = 1; G.mutDmg = 1; G.mutGem = 1; G.mutHeart = false;
  if (G.wave < 2 || Math.random() > 0.4) return;
  const m = MUTATORS[(Math.random() * MUTATORS.length) | 0];
  m.apply(); G.mut = m.id; G.mutName = m.icon + " " + m.name;
  showBanner("🌀 " + m.name.toUpperCase());
  addText(P.x, P.y - 44, m.desc, "#fef3c7", 14);
  tone(392, 0.25, "triangle", 0.1, 587);
}

function addText(x, y, str, color, size) {
  if (G.texts.length > 30) G.texts.shift();
  G.texts.push({ x, y, str, color: color || "#fff", size: size || 13, life: 0.9 });
}

function burst(x, y, color, n, spd, dust) {
  if (G.lowQ) { n = Math.max(2, Math.ceil((n || 10) / 2)); if (dust !== undefined) dust = Math.max(1, Math.ceil(dust / 2)); }
  if (!OPT.particles) { n = Math.max(2, Math.ceil((n || 10) / 3)); if (dust !== undefined) dust = Math.max(1, Math.ceil(dust / 2)); }  for (let i = 0; i < (n || 10); i++) {
    if (G.parts.length > 260) G.parts.shift();
    const a = Math.random() * TAU;
    const s = rand(40, spd || 220);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(2, 5), color, life: rand(0.3, 0.7), t: 0, kind: "spark", grow: 0 });
  }
  const dn = dust === undefined ? Math.ceil((n || 10) / 2) : dust;
  for (let i = 0; i < dn; i++) {
    if (G.parts.length > 260) G.parts.shift();
    const a = Math.random() * TAU;
    const s = rand(10, 70);
    G.parts.push({ x: x + rand(-6, 6), y: y + rand(-6, 6), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, r: rand(5, 10), color: "#cfe8ff", life: rand(0.5, 1.1), t: 0, kind: "dust", grow: rand(10, 22) });
  }
}

function pushRing(x, y, maxR, color, width) {
  if (G.rings.length > 24) G.rings.shift();
  G.rings.push({ x, y, r: 6, maxR: maxR || 60, color: color || "#fff", width: width || 3, t: 0, life: 0.45 });
}

function updateFx(dt) {
  for (const p of G.parts) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === "dust") { p.vx *= 0.96; p.vy = p.vy * 0.96 - 20 * dt; p.r += p.grow * dt; }
    else if (p.kind === "bubble") { p.vx *= 0.99; p.vy *= 0.995; p.x += Math.sin(G.time * 4 + (p.seed || 0)) * 30 * dt; }
    else { p.vx *= 0.98; p.vy *= 0.98; }
  }
  if (G.parts.some((p) => p.t >= p.life)) G.parts = G.parts.filter((p) => p.t < p.life);
  for (const r of G.rings) { r.t += dt; r.r += (r.maxR - r.r) * Math.min(1, dt * 8); }
  if (G.rings.some((r) => r.t >= r.life)) G.rings = G.rings.filter((r) => r.t < r.life);
  for (const l of G.lights) l.t -= dt;
  if (G.lights.some((l) => l.t <= 0)) G.lights = G.lights.filter((l) => l.t > 0);
  // living-reef pools: portals bloom open, wisps home to you, zoom + flare ease off
  for (const q of G.portals) q.t += dt;
  if (G.portals.some((q) => q.t >= q.life)) G.portals = G.portals.filter((q) => q.t < q.life);
  for (const w of G.wisps) {
    w.t += dt;
    const dx = P.x - w.x, dy = P.y - w.y, d = Math.max(1, Math.hypot(dx, dy));
    w.vx += (dx / d) * 1400 * dt; w.vy += (dy / d) * 1400 * dt;
    const sp = Math.hypot(w.vx, w.vy), cap = 560;
    if (sp > cap) { w.vx *= cap / sp; w.vy *= cap / sp; }
    w.x += w.vx * dt; w.y += w.vy * dt;
    if (d < 26) { w.t = w.life; burst(w.x, w.y, "#a5f3fc", 3, 90); }
  }
  if (G.wisps.some((w) => w.t >= w.life)) G.wisps = G.wisps.filter((w) => w.t < w.life);
  if (G.flashR > 0) G.flashR = Math.max(0, G.flashR - dt * 320);
  if (G.zoom > 1) G.zoom += (1 - G.zoom) * Math.min(1, dt * 2.6);
  for (const t of G.texts) { t.life -= dt; t.y -= 34 * dt; }
  if (G.texts.some((t) => t.life <= 0)) G.texts = G.texts.filter((t) => t.life > 0);
  for (const n of G.dnums) { n.life -= dt; n.y -= 46 * dt; }
  if (G.dnums.some((n) => n.life <= 0)) G.dnums = G.dnums.filter((n) => n.life > 0);
  if (G.beam) {
    G.beam.t += dt;
    G.beam.x = P.x; G.beam.y = P.y;
    if (G.beam.t < G.beam.life * 0.7 && G.parts.length < 240) {
      for (let i = 0; i < 2; i++) {
        G.parts.push({ x: G.beam.x + rand(-30, 30), y: G.beam.y + rand(-10, 20), vx: rand(-20, 20), vy: rand(-160, -60), r: rand(2, 4), color: Math.random() < 0.5 ? "#fde047" : "#fff", life: rand(0.5, 0.9), t: 0, kind: "spark", grow: 0 });
      }
    }
    if (G.beam.t >= G.beam.life) G.beam = null;
  }
  // seaweed exhales: bubbles rise off nearby fronds
  G.weedT = (G.weedT || 0) + dt;
  if (G.weedT > 0.4) {
    G.weedT = 0;
    for (let tries = 0; tries < 6; tries++) {
      const d = G.decor[(Math.random() * G.decor.length) | 0];
      if (d && d.kind === "weed" && onScreen(d.x, d.y, 60) && G.parts.length < 240) {
        G.parts.push({ x: d.x + rand(-8, 8), y: d.y - d.r, vx: rand(-10, 10), vy: rand(-140, -80), r: rand(2, 4), color: "#9be9ff", life: rand(0.8, 1.4), t: 0, kind: "bubble", grow: 0, seed: Math.random() * TAU });
        break;
      }
    }
  }
  // brushing through seaweed: fronds part, swish, and shed bubbles
  {
    const pvx = P.mvx || 0, pvy = P.mvy || 0;
    const pspd = Math.hypot(pvx, pvy);
    for (const d of G.decor) {
      if (d.kind !== "weed") continue;
      if (d.swish > 0) d.swish = Math.max(0, d.swish - dt * 1.6);
      if (pspd < 60) continue;
      const wdx = d.x - P.x, wdy = d.y - P.y;
      if (wdx * wdx + wdy * wdy > 90 * 90) continue;
      d.swish = Math.min(1.2, (d.swish || 0) + dt * 6);
      if (G.parts.length < 240 && Math.random() < dt * 14) {
        G.parts.push({ x: P.x + rand(-14, 14), y: P.y + rand(-14, 14), vx: rand(-30, 30), vy: rand(-90, -40), r: rand(1.5, 3), color: "#c8f6ff", life: rand(0.5, 1), t: 0, kind: "bubble", grow: 0, seed: Math.random() * TAU });
      }
    }
  }
  if (G.announceT > 0) { G.announceT -= dt; if (G.announceT <= 0) G.announce = null; }
  // ambient minnows: wander, flee the player
  for (const m of G.minnows) {
    m.seed += dt;
    m.a += Math.sin(m.seed * 1.7) * 1.8 * dt;
    const dx = m.x - P.x, dy = m.y - P.y;
    const d = Math.hypot(dx, dy);
    if (d < 150 && d > 1) {
      m.a = Math.atan2(dy, dx) + Math.sin(m.seed * 3) * 0.4;
      m.x += Math.cos(m.a) * m.sp * 2.2 * dt;
      m.y += Math.sin(m.a) * m.sp * 2.2 * dt;
    } else {
      m.x += Math.cos(m.a) * m.sp * dt;
      m.y += Math.sin(m.a) * m.sp * dt;
    }
    if (m.scare > 0) { m.scare -= dt; m.x += Math.cos(m.a) * m.sp * 2 * dt; m.y += Math.sin(m.a) * m.sp * 2 * dt; }
    if (m.x < 30) { m.x = 30; m.a = Math.PI - m.a; }
    if (m.x > WORLD.w - 30) { m.x = WORLD.w - 30; m.a = Math.PI - m.a; }
    if (m.y < 30) { m.y = 30; m.a = -m.a; }
    if (m.y > WORLD.h - 30) { m.y = WORLD.h - 30; m.a = -m.a; }
  }
  // jellyfish: slow hypnotic drift with a sine wobble, wrap around the reef
  for (const j of G.jellies) {
    j.x += (j.vx + Math.sin(G.time * 0.5 + j.seed) * 8) * dt;
    j.y += (j.vy + Math.cos(G.time * 0.4 + j.seed * 2) * 8) * dt;
    if (j.x < -60) j.x = WORLD.w + 60; else if (j.x > WORLD.w + 60) j.x = -60;
    if (j.y < -60) j.y = WORLD.h + 60; else if (j.y > WORLD.h + 60) j.y = -60;
  }
  // passing fish schools: enter from an edge, cruise across, leave
  G.schoolT -= dt;
  if (G.schoolT <= 0 && G.schools.length < 2) {
    G.schoolT = rand(14, 24);
    const side = (RNG() * 4) | 0;
    const sx = side === 0 ? -80 : side === 1 ? WORLD.w + 80 : rand(0, WORLD.w);
    const sy = side === 2 ? -80 : side === 3 ? WORLD.h + 80 : rand(0, WORLD.h);
    const ta = Math.atan2(WORLD.h / 2 - sy + rand(-300, 300), WORLD.w / 2 - sx + rand(-300, 300));
    G.schools.push({ x: sx, y: sy, dx: Math.cos(ta), dy: Math.sin(ta), sp: rand(70, 110), n: 8 + ((RNG() * 6) | 0), seed: RNG() * TAU, t: 0 });
  }
  for (const s of G.schools) {
    s.t += dt;
    s.x += s.dx * s.sp * dt;
    s.y += s.dy * s.sp * dt;
    if (s.x < -200 || s.x > WORLD.w + 200 || s.y < -200 || s.y > WORLD.h + 200) s.gone = true;
  }
  if (G.schools.some((s) => s.gone)) G.schools = G.schools.filter((s) => !s.gone);
  if (G.hurtFlash > 0) G.hurtFlash = Math.max(0, G.hurtFlash - dt);
  if (G.hurtEdge > 0) G.hurtEdge = Math.max(0, G.hurtEdge - dt * 1.6);
  if (G.wedgeT > 0) G.wedgeT = Math.max(0, G.wedgeT - dt);
  if (G.tickCd > 0) G.tickCd = Math.max(0, G.tickCd - dt);
  if (P.muzzle > 0) P.muzzle = Math.max(0, P.muzzle - dt);
  if (P.heat > 0) P.heat = Math.max(0, P.heat - dt * 0.35);
}

// ---------- input ----------
const joy = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
const keys = {};

window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === "Enter" && G.state === "menu") {
    if (!document.getElementById("dailyOverlay").hidden) { document.getElementById("dailyOverlay").hidden = true; startGame(!dailyInfoWeekly, dailyInfoWeekly); }
    else if (!document.getElementById("diffOverlay").hidden && document.getElementById("diveModesPane").hidden) { document.getElementById("diffOverlay").hidden = true; startGame(false); }
    else openDiffPick();
  }
  if (G.state === "pact") {
    if (e.key >= "1" && e.key <= "3") pickPact(Number(e.key) - 1);
    else if (e.key === "Escape" || e.key === "0") pickPact(-1);
    return;
  }
  if (G.state === "relic") {
    if (e.key >= "1" && e.key <= "3") pickRelic(Number(e.key) - 1);
    else if (e.key === "Escape" || e.key === "0") pickRelic(-1);
    return;
  }
  if (G.state === "depth") {
    if (e.key === "1") diveDeeper();
    else if (e.key === "2") endDive();
    return;
  }
  if (G.state === "play" && G.focusT > 0 && (e.key === "Escape" || e.key === " ")) { skipCine(); e.preventDefault(); return; }
  if ((e.key === "p" || e.key === "Escape") && (G.state === "play" || G.state === "pause")) togglePause();
  if ((e.key === "Shift" || e.key === " ") && G.state === "play") { tryDash(); e.preventDefault(); }
  if (G.state === "play") {
    const k = e.key.toLowerCase();
    if (k === "q") shockwavePulse();
    else if (k === "e") timeFreeze();
    else if (k === "r") decoyBubble();
    else if (k === "f") comboFinisher();
    else if (k === "v") magnetPulse();
    else if (k === "c") screenshotMode();
  }
  if (e.key === "Escape" && (G.state === "clam" || G.state === "shop")) closeChoice();
  if (e.key === "Escape" && G.state === "menu" && !document.getElementById("diffOverlay").hidden) document.getElementById("diffOverlay").hidden = true;
  if (e.key === "Escape" && G.state === "menu" && !document.getElementById("dailyOverlay").hidden) document.getElementById("dailyOverlay").hidden = true;
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener("pointerdown", (e) => {
  if (G.state !== "play") return;
  if (G.focusT > 0) skipCine(); // this same touch keeps falling through into the joystick below
  const now = performance.now();
  if (now - (P.lastTap || 0) < 320) tryDash();
  P.lastTap = now;
  if (joy.active) return;
  const p = canvasPos(e);
  joy.active = true; joy.id = e.pointerId;
  joy.ox = p.x; joy.oy = p.y; joy.dx = 0; joy.dy = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  showJoy(p.x, p.y, 0, 0);
});
canvas.addEventListener("pointermove", (e) => {
  if (!joy.active || e.pointerId !== joy.id) return;
  const p = canvasPos(e);
  let dx = p.x - joy.ox, dy = p.y - joy.oy;
  const d = Math.hypot(dx, dy);
  const max = 60;
  if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
  joy.dx = dx / max; joy.dy = dy / max;
  showJoy(joy.ox, joy.oy, dx, dy);
});
function endJoy(e) {
  if (!joy.active || (e && e.pointerId !== joy.id)) return;
  joy.active = false; joy.dx = 0; joy.dy = 0;
  joyBase.hidden = true;
}
canvas.addEventListener("pointerup", endJoy);
canvas.addEventListener("pointercancel", endJoy);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function showJoy(ox, oy, dx, dy) {
  joyBase.hidden = false;
  joyBase.style.left = ox + "px";
  joyBase.style.top = oy + "px";
  joyKnob.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
}

// gamepad: left stick / D-pad swims, face + bumpers mirror the touch buttons, Start pauses.
// polled once per frame (see loop); axes are cached for moveInput, buttons edge-fire.
let padMove = { x: 0, y: 0 };
const padPrev = [];
function pollPad() {
  padMove = { x: 0, y: 0 };
  let gp = null;
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (pads) for (const p of pads) { if (p && p.connected) { gp = p; break; } }
  } catch (err) { gp = null; }
  if (!gp) return;
  const dz = (v) => (Math.abs(v) < 0.22 ? 0 : v);
  let x = dz(gp.axes[0] || 0), y = dz(gp.axes[1] || 0);
  const held = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  if (held(14)) x -= 1; if (held(15)) x += 1; if (held(12)) y -= 1; if (held(13)) y += 1;
  const m = Math.hypot(x, y);
  padMove = m > 1 ? { x: x / m, y: y / m } : { x, y };
  const press = (i) => held(i) && !padPrev[i];
  if (G.state === "play") {
    if (press(0) || press(6) || press(7)) tryDash();
    if (press(3)) shockwavePulse();
    if (press(2)) timeFreeze();
    if (press(1)) decoyBubble();
    if (press(5)) comboFinisher();
    if (press(4)) magnetPulse();
    if (press(9)) togglePause();
  } else if (G.state === "pause" && press(9)) togglePause();
  for (let i = 0; i < gp.buttons.length; i++) padPrev[i] = held(i);
}
function moveInput() {
  let mx = 0, my = 0;
  if (keys["w"] || keys["arrowup"]) my -= 1;
  if (keys["s"] || keys["arrowdown"]) my += 1;
  if (keys["a"] || keys["arrowleft"]) mx -= 1;
  if (keys["d"] || keys["arrowright"]) mx += 1;
  if (mx || my) {
    const d = Math.hypot(mx, my);
    return { x: mx / d, y: my / d };
  }
  if (padMove.x || padMove.y) return { x: padMove.x, y: padMove.y };
  if (joy.active && (joy.dx || joy.dy)) {
    const d = Math.hypot(joy.dx, joy.dy);
    if (d > 0.12) return { x: joy.dx, y: joy.dy };
  }
  return { x: 0, y: 0 };
}

function scareMinnows() {
  for (const m of G.minnows) {
    if (dist2(m.x, m.y, P.x, P.y) < 300 * 300) { m.scare = 1.2; m.a = Math.atan2(m.y - P.y, m.x - P.x); }
  }
}

function tryDash() {
  if (G.state !== "play" || P.dashCD > 0) return false;
  if (P.noDash) { buzz(20); return false; } // Tidal Lock: rooted, but twice as deadly
  const mv = moveInput();
  let dx = mv.x, dy = mv.y;
  if (!dx && !dy) { dx = Math.cos(P.face); dy = Math.sin(P.face); }
  const d = Math.hypot(dx, dy) || 1;
  P.dashDx = dx / d; P.dashDy = dy / d;
  P.dashT = 0.18; P.dashCD = hasSyn("evotail") ? 1.2 : 1.6; // evo slipstream recharges faster
  P.dashHit = []; // dash-strike: one hit per foe per dash
  P.iframes = Math.max(P.iframes, 0.3);
  P.face = Math.atan2(P.dashDy, P.dashDx);
  P.squash = Math.min(1.2, P.squash + 0.8);
  pushRing(P.x, P.y, 60, "#a5f3fc");
  tone(300, 0.18, "sine", 0.1, 900);
  scareMinnows();
  // strafing run (artillery + tide hybrid): the dash itself fires a fan
  if (hasSyn("strafe")) {
    for (let i = 0; i < 5; i++) {
      const a = P.face + (i - 2) * 0.18;
      G.bullets.push({
        x: P.x + Math.cos(a) * (P.r + 6), y: P.y + Math.sin(a) * (P.r + 6),
        vx: Math.cos(a) * P.bulletSpeed, vy: Math.sin(a) * P.bulletSpeed,
        r: P.bulletR, dmg: P.dmg * 0.8 * rand(0.92, 1.08), crit: false,
        pierce: P.pierce, bounce: P.bounce, color: "#f0fdff", life: 1.2, hit: [],
      });
    }
    G.shots += 5;
    sfxShoot();
  }
  return true;
}

// ---------- firing ----------
function nearestFoe() {
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    const d = dist2(P.x, P.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function fire(dt) {
  P.cool -= dt;
  if (G.focusT > 0) return; // hold your shots during the boss intro pan
  if (P.cool > 0) return;
  const target = nearestFoe();
  if (!target) return;
  P.cool = 1 / (P.fireRate * (hasSyn("harmony") ? 1.12 : 1));
  P.muzzle = 0.07;
  P.heat = Math.min(1, (P.heat || 0) + 0.25); // sustained fire warms the snout
  P.mouth = 0.12;
  P.squash = Math.min(1.2, P.squash + 0.5);
  const base = Math.atan2(target.y - P.y, target.x - P.x);
  P.face = base;
  const n = P.multishot;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * (P.stacks.trident ? 0.22 : 0.13) + rand(-0.02, 0.02);
    const a = base + off;
    const crit = Math.random() < P.crit;
    const pw = G.powerKind; // active elemental boost (null | "fire" | "ice")
    G.bullets.push({
      x: P.x + Math.cos(a) * (P.r + 6),
      y: P.y + Math.sin(a) * (P.r + 6),
      vx: Math.cos(a) * P.bulletSpeed,
      vy: Math.sin(a) * P.bulletSpeed,
      r: P.bulletR,
      dmg: P.dmg * (crit ? (P.critMult || 2) : 1) * (pw === "fire" ? 1.5 : pw === "ice" ? 1.15 : 1) * rand(0.92, 1.08),
      crit,
      pierce: P.pierce,
      bounce: P.bounce,
      color: pw === "fire" ? "#fb923c" : pw === "ice" ? "#7dd3fc" : BULLET_COLORS[(Math.random() * BULLET_COLORS.length) | 0],
      pow: pw || null, // elemental shot: applies burn (fire) or chill (ice) on hit
      dot: pw === "fire" ? P.dmg * 0.5 : 0, // burn dps snapshot while igniting
      life: 1.6,
      hit: [],
    });
  }
  G.shots += n;
  G.shake = Math.min(3, G.shake + 0.4);
  sfxShoot();
}

// haptics: guarded vibration bursts — free game feel on mobile
let lastBuzz = 0;
function buzz(pat) { if (OPT.vib === false) return; try { if (navigator.vibrate) navigator.vibrate(pat); } catch (e) {} }
function buzzSoft() { const n = performance.now(); if (n - lastBuzz > 90) { lastBuzz = n; buzz(12); } }

// ---------- combat ----------
function damageFoe(e, dmg, crit, hx, hy) {
  // the intro pan is a staredown, not a head start: the boss takes no damage
  // until the camera is back on you (covers in-flight bullets, remora, novas)
  if (G.focusT > 0 && e.boss) return;
  // Boss Bane relic: +40% vs bosses/elites, −15% vs the small fry; Bloodlust: damage grows with combo
  if (G.relicBane) dmg *= (e.boss || e.elite) ? 1.4 : 0.85;
  if (G.relicRage) dmg *= 1 + Math.min(0.5, (G.combo || 0) * 0.001);
  // shielded elites: ward soaks damage first, sparks cyan when it holds
  if (e.shield > 0 && !e.dead) {
    const soak = Math.min(e.shield, dmg);
    e.shield -= soak;
    dmg -= soak;
    burst(e.x, e.y, "#67e8f9", 3, 120);
    if (e.shield <= 0) { pushRing(e.x, e.y, e.r * 3, "#67e8f9", 2); addText(e.x, e.y - e.r - 8, "WARD DOWN!", "#67e8f9", 13); }
    if (dmg <= 0) { e.flash = 0.08; return; }
  }
  e.hp -= dmg;
  e.flash = 0.08;
  if (crit) e.lastCrit = true;
  if (dmg > (ACH.stat.maxHit || 0)) ACH.stat.maxHit = Math.round(dmg);
  if (hx !== undefined) {
    const d = Math.max(1, Math.hypot(e.x - hx, e.y - hy));
    e.kx += ((e.x - hx) / d) * 60;
    e.ky += ((e.y - hy) / d) * 60;
  }
  // damage numbers: small white ticks on every hit, big gold crits
  if (G.dnums.length > 26) G.dnums.shift();
  if (OPT.dmgNums !== false) G.dnums.push({ x: e.x + rand(-6, 6), y: e.y - e.r - 4, str: String(Math.round(dmg)), col: crit ? "#fde047" : "#ffffff", size: crit ? 17 : 12, life: crit ? 0.7 : 0.5, max: crit ? 0.7 : 0.5 });
  buzzSoft();
  if (e.hp <= 0) killFoe(e);
}

function killFoe(e) {
  e.dead = true;
  G.kills += 1;
  noteSlain(e); // bestiary: popped another one
  // achievement ledger
  ACH.stat.k[e.type] = (ACH.stat.k[e.type] || 0) + 1;
  if (e.elite) ACH.stat.elite = (ACH.stat.elite || 0) + 1;
  if (e.type === "clam") ACH.stat.clam = (ACH.stat.clam || 0) + 1;
  if (e.hadal) ACH.stat.hadal = (ACH.stat.hadal || 0) + 1;
  if (e.boss && !e.superboss) ACH.stat.boss = (ACH.stat.boss || 0) + 1;
  if (e.superboss) ACH.stat.super = (ACH.stat.super || 0) + 1;
  // hit-stop: big deaths freeze a beat so they thud instead of fizzing past
  if (OPT.hitStop !== false) {
    if (e.superboss || e.hadal) G.hitstop = 0.09;
    else if (e.boss) G.hitstop = 0.08;
    else if (e.elite || e.exploder) G.hitstop = 0.06;
  }
  if (e.superboss || e.hadal) buzz([70, 50, 100]);
  else if (e.boss) buzz([70, 50, 90]);
  else if (e.elite || e.exploder) buzzSoft();
  // bubble combo: chained kills multiply XP gem value
  G.combo += 1;
  G.comboT = G.comboWin || 2.5;
  if (G.combo > G.bestCombo) G.bestCombo = G.combo;
  // kill streak announcements
  G.streak = (G.streakT > 0) ? G.streak + 1 : 1;
  G.streakT = 2.5;
  const STEPS = [3, 5, 8, 12, 20, 30];
  const NAMES = ["TRIPLE POP!", "RAMPAGE!", "FRENZY!", "UNSTOPPABLE!", "WHIRLPOOL!", "OCEAN'S WRATH!"];
  const si = STEPS.indexOf(G.streak);
  if (si >= 0) setAnnounce(NAMES[si], si);
  // milestone chests every 25 pops
  if (G.kills >= G.nextChest) {
    spawnChest(e.x, e.y);
    addText(e.x, e.y - 30, "MILESTONE " + G.kills + " POPS!", "#fde047", 20);
    tone(523, 0.12, "triangle", 0.12); setTimeout(() => tone(784, 0.2, "triangle", 0.12), 130);
    G.nextChest += 25;
  }
  const deep = 1 + depthAt(e.x, e.y) * 0.8;
  // kill pops scale with your chain: hot combos detonate bigger
  const popK = 1 + Math.min(G.combo, 30) * 0.02;
  burst(e.x, e.y, e.color, Math.round((e.boss ? 46 : 12) * popK), e.boss ? 340 : 230);
  pushRing(e.x, e.y, (e.boss ? 160 : e.r * 4 + 20) * popK, e.boss ? "#fda4af" : "#e0f2fe");
  // explosions leave a flash of light on the water
  if (e.boss || e.elite || e.exploder || e.type === "mine") G.lights.push({ x: e.x, y: e.y, t: 0.35, max: 0.35, color: e.boss ? "253,164,175" : "150,225,255", r: e.boss ? 340 : 150 });
  // death dissolve: ink blooms, bubbles rise, and soul wisps swim home to you
  burst(e.x, e.y, "#0c2f45", e.boss ? 10 : 5, e.boss ? 200 : 130);
  if (G.parts.length < 236) {
    const nb = e.boss ? 10 : e.elite ? 6 : 3;
    for (let i = 0; i < nb; i++) G.parts.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), vx: rand(-40, 40), vy: rand(-120, -40), r: rand(2, 4.5), color: "#bfe9ff", life: rand(0.5, 1.1), t: 0, kind: "bubble", grow: 0, seed: Math.random() * TAU });
  }
  const nw = e.boss ? 3 : e.elite ? 2 : 1;
  for (let i = 0; i < nw && G.wisps.length < 12; i++) G.wisps.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), vx: rand(-70, 70), vy: rand(-70, 70), t: 0, life: 1.4 });
  // kill-cam: elites thump the lens, bosses punch it in
  const calmK = OPT.calm ? 0.25 : 1; // reduce-flashes: caustic flares stay whispers
  if (e.superboss || e.hadal) { G.zoom = 1.22; G.flashR = Math.min(260, G.flashR + 200 * calmK); partWeeds(e.x, e.y, 300); }
  else if (e.boss) { G.zoom = Math.max(G.zoom, 1.16); G.flashR = Math.min(260, G.flashR + 160 * calmK); partWeeds(e.x, e.y, 240); }
  else if (e.elite) { G.zoom = Math.max(G.zoom, 1.08); G.flashR = Math.min(260, G.flashR + 80 * calmK); }
  if (e.boss || e.type === "tank" || e.type === "clam") tone(90, 0.25, "sine", 0.16, 40);
  sfxPop();
  spawnGems(e.x, e.y, Math.max(1, Math.round(e.xp * deep)));
  // elemental power-ups: bosses always drop, elites often, normals rarely
  if (e.superboss) { spawnPowerup(e.x - 20, e.y, "fire"); spawnPowerup(e.x + 20, e.y, "ice"); }
  else if (e.boss) spawnPowerup(e.x, e.y);
  else if (Math.random() < (e.elite ? 0.12 : 0.025)) spawnPowerup(e.x, e.y);
  if (e.stolen > 0) spawnGems(e.x, e.y, e.stolen);
  if (e.splits) {
    for (let i = 0; i < 2; i++) {
      spawnEnemy("mini", e.x + rand(-8, 8), e.y + rand(-8, 8));
    }
  }
  // splitter affix: elites break apart instead of dying quietly
  if (e.affix === "splitter") {
    for (let i = 0; i < 2; i++) spawnEnemy("mini", e.x + rand(-10, 10), e.y + rand(-10, 10));
    addText(e.x, e.y - 26, "SPLIT!", "#4ade80", 14);
  }
  // shatter crits (artillery + current hybrid): crit kills detonate a small splash
  if (e.lastCrit && hasSyn("critburst") && !e.boss) {
    pushRing(e.x, e.y, 110, "#fdba74", 3);
    burst(e.x, e.y, "#fdba74", 10, 260);
    for (const o of G.enemies) {
      if (o.dead || o === e) continue;
      const orr = 100 + o.r;
      if (dist2(e.x, e.y, o.x, o.y) < orr * orr) damageFoe(o, 40 * dmgMul(), false, e.x, e.y);
    }
  }
  if (e.boss) {
    G.bossAlive = false;
    G.epicAlive = false;
    G.hearts.push({ x: e.x, y: e.y, vx: 0, vy: 0, t: 0 });
    spawnPearls(e.x, e.y, 5);
    if (e.epic) {
      // epic felled: the reef pays tribute — a cache, extra pearls and gems, a healing surge
      spawnChest(e.x, e.y);
      spawnPearls(e.x, e.y, 7);
      spawnGems(e.x, e.y, 15);
      P.hp = Math.min(P.maxHp, P.hp + Math.round(P.maxHp * 0.25));
      addText(e.x, e.y, "EPIC SLAIN!", "#fde047", 26);
      // the way forward: a rift opens where the epic fell — swim in to start the next leg
      const gx = clamp(e.x, 120, WORLD.w - 120), gy = clamp(e.y, 120, WORLD.h - 120);
      G.gate = { x: gx, y: gy, r: 46, t: 0 };
      G.gateHold = true;
      // the portal tears open: violet bloom + shockwave
      burst(gx, gy, "#a855f7", 46, 380, 16);
      burst(gx, gy, "#f0abfc", 26, 240, 10);
      pushRing(gx, gy, 170, "#c084fc", 5);
      pushRing(gx, gy, 90, "#f5d0fe", 3);
      // the duel's dregs dissolve: no ambush while you travel
      for (const o of G.enemies) { if (o.dead || o.boss) continue; o.dead = true; spawnGems(o.x, o.y, o.xp || 1); burst(o.x, o.y, o.color || "#7dd3fc", 8, 200); }
      for (const b of G.ebullets) burst(b.x, b.y, "#fecdd3", 3, 120);
      G.ebullets.length = 0;
      showBanner("➤ SWIM INTO THE RIFT — WAVE " + (G.wave + 1) + " AWAITS", { urgent: true });
      setAnnounce("EPIC FELLED — THE WAY FORWARD OPENS");
      if (OPT.slowmo !== false) G.slowmo = Math.max(G.slowmo, 1.2);
      tone(220, 0.5, "triangle", 0.14, 440);
      setTimeout(() => tone(330, 0.5, "triangle", 0.14, 660), 200);
      setTimeout(() => tone(440, 0.6, "triangle", 0.14, 880), 400);
      G.shake = 10;
    } else {
      addText(e.x, e.y, "BOSS POPPED!", "#fde047", 22);
    }
    G.shake = 8;
    // kill cam: the world drops to slow-mo while the shockwave parts the seaweed
    if (OPT.slowmo !== false) G.slowmo = Math.max(G.slowmo, 0.8);
    partWeeds(e.x, e.y, 420);
    if (e.superboss || e.hadal) {
      // the dark lifts: abyssal hoard + the all-clear (teal for her trench sister)
      G.superAlive = false;
      G.hadalAlive = false;
      if (OPT.slowmo !== false) G.slowmo = Math.max(G.slowmo, 1.4);
      partWeeds(e.x, e.y, 620);
      if (e.hadal) {
        // the trench releases you: teal hoard + the all-clear
        G.lights.push({ x: e.x, y: e.y, t: 0.8, max: 0.8, color: "45,212,191", r: 520 });
        spawnPearls(e.x, e.y, 20);
        spawnGems(e.x, e.y, 30);
        spawnChest(e.x - 60, e.y);
        G.hearts.push({ x: e.x + 50, y: e.y, vx: 0, vy: 0, t: 0 });
        addText(e.x, e.y - 50, "HADAL MOTHER SLAIN!", "#2dd4bf", 26);
        setAnnounce("THE TRENCH RELEASES YOU");
        burst(e.x, e.y, "#2dd4bf", 60, 380, 16);
        pushRing(e.x, e.y, 260, "#5eead4", 5);
        tone(180, 0.5, "triangle", 0.14, 360);
        setTimeout(() => tone(270, 0.6, "triangle", 0.14, 540), 250);
        spawnPowerup(e.x, e.y);
      } else {
      G.lights.push({ x: e.x, y: e.y, t: 0.8, max: 0.8, color: "196,181,253", r: 520 });
      spawnPearls(e.x, e.y, 25);
      spawnGems(e.x, e.y, 40);
      spawnChest(e.x + 60, e.y);
      G.hearts.push({ x: e.x - 50, y: e.y, vx: 0, vy: 0, t: 0 });
      addText(e.x, e.y - 50, "LEVIATHAN SLAIN!", "#fde047", 26);
      setAnnounce("LIGHT RETURNS TO THE REEF");
      burst(e.x, e.y, "#a78bfa", 60, 380, 16);
      pushRing(e.x, e.y, 260, "#c4b5fd", 5);
      tone(220, 0.5, "triangle", 0.14, 440);
      setTimeout(() => tone(330, 0.6, "triangle", 0.14, 660), 250);
      G.shake = 12;
      }
    }
  }
  if (e.type === "clam") {
    spawnPearls(e.x, e.y, 12 + (G.relicClam || 0));
    spawnGems(e.x, e.y, 10);
    G.hearts.push({ x: e.x, y: e.y, vx: 0, vy: 0, t: 0 });
    addText(e.x, e.y, "CLAM CRACKED!", "#fde047", 20);
    G.shake = 6;
  }
  if (e.elite) {
    spawnPearls(e.x, e.y, 3);
    if (G.mutHeart) G.hearts.push({ x: e.x, y: e.y, vx: rand(-40, 40), vy: rand(-40, 40), t: 0 });
    addText(e.x, e.y, "ELITE POPPED!", "#fde047", 18);
    openLevelUp(true);
  }
  if (Math.random() < 0.012 && P.hp < P.maxHp) {
    G.hearts.push({ x: e.x, y: e.y, vx: rand(-40, 40), vy: rand(-40, 40), t: 0 });
  }
  checkAch();
}

function detonate(e) {
  if (e.dead) return;
  burst(e.x, e.y, "#fdba74", 24, 320, 10);
  burst(e.x, e.y, e.color, 14, 260);
  pushRing(e.x, e.y, 140, "#fdba74", 5);
  tone(120, 0.4, "sawtooth", 0.16, 40);
  G.shake = Math.min(8, G.shake + 3);
  G.flashR = Math.min(260, G.flashR + 130 * (OPT.calm ? 0.25 : 1)); // keg blasts flare the caustics
  for (const o of G.enemies) {
    if (o.dead || o === e) continue;
    const rr = (e.mine ? 210 : 135) + o.r;
    if (dist2(e.x, e.y, o.x, o.y) < rr * rr) {
      if (o.exploder && o.fuse < 0) o.fuse = 0.15;
      else damageFoe(o, 70 * dmgMul(), false, e.x, e.y);
    }
  }
  const pr = (e.mine ? 190 : 120) + P.r;
  if (dist2(e.x, e.y, P.x, P.y) < pr * pr) hurtPlayer(Math.round(e.dmg * dmgMul()), "explosion", e.x, e.y);
  killFoe(e);
}

function hurtPlayer(dmg, src, sx, sy) {
  if (P.iframes > 0 || G.state !== "play") return;
  G.lastHitBy = src || "the reef"; // death recap
  P.hp -= Math.round(dmg * (G.mutDmg || 1));
  P.iframes = 0.7;
  G.hurtFlash = OPT.calm ? 0.2 : 0.6;
  G.hurtEdge = 0.7; // white-hot edge ring so the hit reads mid-action
  // offscreen-damage wedge points back at the blow (falls back to nearest foe)
  let wx = sx, wy = sy;
  if (wx === undefined) {
    let bd = Infinity;
    for (const o of G.enemies) { if (o.dead) continue; const d = dist2(o.x, o.y, P.x, P.y); if (d < bd) { bd = d; wx = o.x; wy = o.y; } }
  }
  if (wx !== undefined) {
    G.wedgeT = 1.1; G.wedgeX = wx; G.wedgeY = wy;
    // shove: knocked ~26px from the blow, clamped to the reef
    const ka = Math.atan2(P.y - wy, P.x - wx);
    P.x = clamp(P.x + Math.cos(ka) * 26, 30, WORLD.w - 30);
    P.y = clamp(P.y + Math.sin(ka) * 26, 60, WORLD.h - 30);
  }
  buzz(45);
  P.squash = 1.4;
  P.mouth = 0.4;
  G.shake = Math.min(8, G.shake + 4);
  burst(P.x, P.y, "#f87171", 12, 260);
  sfxHurt();
  updateHud(true);
  if (P.hp <= 0) {
    if (P.revive > 0) { // stacked revives (Second Wind + Vow/Siren/Heart) each cheat death once
      P.revive -= 1;
      G.reviveUsed = true;
      ACH.stat.revive = 1;
      checkAch();
      if (G.debtRevives > 0) { // Siren's Debt comes due: the second life costs half your future
        G.debtRevives -= 1;
        G.relicXpHalf = true;
        showBanner("THE SIREN COLLECTS: −50% XP", { urgent: true });
        tone(196, 0.5, "sine", 0.12, 98);
      }
      P.hp = Math.round(P.maxHp * 0.5);
      P.iframes = 2;
      pushRing(P.x, P.y, 200, "#4ade80", 5);
      burst(P.x, P.y, "#4ade80", 30, 300, 12);
      showBanner("REVIVED!", { urgent: true });
      tone(440, 0.3, "triangle", 0.12, 880);
      updateHud(true);
    } else {
      P.hp = 0;
      gameOver();
    }
  }
}

// ---------- update ----------
function update(dt) {
  if (window.__diveMod) window.__diveMod(dt); // passive mode layers (story scripts, challenge goals, season twists, reef + lab bonuses)
  G.time += dt;
  const newWave = Math.floor(G.time / WAVE_LEN) + 1;
  if (newWave !== G.wave && !G.gateHold) { // waves wait at the rift gate: swim in to move on
    G.wave = newWave;
    showBanner("WAVE " + G.wave);
    G.previewDone = false;
    for (const c of G.clams) c.open = false;
   // procedural stages: fresh name, palette, foe mix, hazards and twist every 3 waves
   const sn = Math.floor((G.wave - 1) / STAGE_LEN) + 1;
   if (sn !== G.stageN) enterStage(G.wave > 1);
    checkAch();
    updateHud(true);
    rollMutator(); // one-wave twist (clears last wave's first)
    if (G.wave >= 29 && G.depthOffered !== G.depth) { G.depthOffered = G.depth; openDepth(); } // ascension gate
  }
  // wave preview: warn about next wave's debuts a few seconds early
  if (!G.previewDone && G.time > G.wave * WAVE_LEN - 6) {
    G.previewDone = true;
    const NW = { speedy: "SPEEDIES", tank: "TANKS", splitter: "SPLITTERS", spitter: "SPITTERS", exploder: "EXPLODERS", leecher: "LEECHERS", snare: "SNAREJELLIES", lunker: "LUNKERS", dasher: "RIPFINS", mender: "MENDERS" };
    const notes = Object.keys(NW).filter((k) => FOE[k] && FOE[k].minWave === G.wave + 1).map((k) => NW[k]);
    if ((G.wave + 1) % 4 === 0) notes.push("GIANT CLAM");
    if ((G.wave + 1) % 20 === 0) notes.push("◉ HADAL MOTHER");
    else if ((G.wave + 1) % 10 === 0) notes.push("⛧ ABYSSAL LEVIATHAN");
    if ((G.wave + 1) % 10 === 0) {
      showBanner("DARKNESS GATHERS IN THE DEEP...", { urgent: true });
      tone(70, 0.8, "sawtooth", 0.12, 40);
    } else if ((G.wave + 1) % 5 === 0) {
      showBanner("⚠ AN EPIC APPROACHES...", { urgent: true });
      tone(180, 0.5, "triangle", 0.12, 90);
    } else if (notes.length && (G.wave + 1) % 5 !== 0) {
      showBanner("NEXT: " + notes.join(" + ") + " INCOMING!");
      tone(440, 0.2, "triangle", 0.12, 660);
    }
  }
  // danger heartbeat below 25% HP
  if (P.maxHp && P.hp > 0 && P.hp / P.maxHp <= 0.25) {
    G.heartT -= dt;
    if (G.heartT <= 0) { tone(68, 0.28, "sine", 0.22, 42); G.heartT = 0.55 + (P.hp / P.maxHp) * 1.1; }
  }

  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  if (G.streakT > 0) { G.streakT -= dt; if (G.streakT <= 0) G.streak = 0; }
  // persist ledgers every few seconds mid-run (bestiary counts ride along with achievements)
  G.achT += dt;
  if (G.achT > 5) { G.achT = 0; saveAch(); try { saveMeta(META); } catch (err) { /* ignore */ } }

  // player move (dash overrides steering)
  const mv = moveInput();
  if (G.chests.some((c) => c.got || c.life <= 0)) G.chests = G.chests.filter((c) => !c.got && c.life > 0);

  if (P.dashCD > 0) P.dashCD -= dt;
  if (G.magPulseCD > 0) G.magPulseCD -= dt;
  if (G.cdNova > 0) G.cdNova -= dt;
  if (G.cdFreeze > 0) G.cdFreeze -= dt;
  if (G.cdDecoy > 0) G.cdDecoy -= dt;
  if (G.cdFin > 0) G.cdFin -= dt;
  if (G.freezeT > 0) G.freezeT -= dt;
  // blood pact drain: bleeds you slowly but never lands the killing blow
  if (P.drain > 0 && P.hp > 1) {
    P.hp = Math.max(1, P.hp - P.drain * dt);
    if (((G.time * 2) | 0) !== ((G.time - dt) * 2 | 0)) updateHud(true);
  }
  // decoy lifetime
  if (G.decoy) {
    G.decoy.t -= dt;
    if (G.decoy.t <= 0) { burst(G.decoy.x, G.decoy.y, "#f0abfc", 10, 200); G.decoy = null; }
  }
  // ghost recording: breadcrumb every quarter-second
  G.ghostT += dt;
  if (G.ghostT >= 0.25 && G.ghost.length < 4800) {
    G.ghostT = 0;
    G.ghost.push({ t: Math.round(G.time * 4) / 4, x: Math.round(P.x), y: Math.round(P.y) });
  }
  // run timeline: breadcrumb for the game-over story graph
  G.tlT += dt;
  if (G.tlT >= 5 && G.tl.length < 240) { G.tlT = 0; G.tl.push({ t: Math.round(G.time), w: G.wave, l: P.lvl }); }
  // wandering merchant drifts by from wave 3 on
  if (!G.merchant && G.wave >= 3) {
    G.merchT -= dt;
    if (G.merchT <= 0) {
      G.merchT = rand(70, 110);
      const pos = spawnOffscreen();
      G.merchant = { x: pos.x, y: pos.y, t: 0, stock: null };
      showBanner("🧭 WANDERING MERCHANT");
      tone(520, 0.2, "triangle", 0.1, 780);
    }
  }
  if (G.merchant) {
    G.merchant.t += dt;
    if (G.merchant.t > 45) G.merchant = null; // swims off if ignored
  }
  // biome check on wave change is handled in the newWave block below
  if (P.dashT > 0) {
    P.dashT -= dt;
    P.x = clamp(P.x + P.dashDx * 900 * dt, P.r, WORLD.w - P.r);
    P.y = clamp(P.y + P.dashDy * 900 * dt, P.r, WORLD.h - P.r);
    if (G.parts.length < 240) G.parts.push({ x: P.x, y: P.y, vx: rand(-40, 40), vy: rand(-40, 40), r: rand(2, 4), color: "#a5f3fc", life: 0.4, t: 0, kind: "spark", grow: 0 });
  } else {
    // reef harmony + evo slipstream speed bonuses apply live (webs drag you down)
    let webK = 1;
    for (const wb of G.webs) { const rr = wb.r + P.r; if (dist2(P.x, P.y, wb.x, wb.y) < rr * rr) { webK = 0.55; break; } }
    const spdMul = ((hasSyn("harmony") ? 1.12 : 1) * (hasSyn("evotail") ? 1.08 : 1)) * webK;
    P.x = clamp(P.x + mv.x * P.speed * spdMul * dt, P.r, WORLD.w - P.r);
    P.y = clamp(P.y + mv.y * P.speed * spdMul * dt, P.r, WORLD.h - P.r);
  }
  smoothCamera(dt);
  P.mvx = mv.x * P.speed; P.mvy = mv.y * P.speed;
  // currents push the player (kelp maze runs stronger)
  const cmul = G.currentMul || 1;
  for (const c of G.currents) {
    if (P.x > c.x && P.x < c.x + c.w && P.y > c.y && P.y < c.y + c.h) {
      P.x = clamp(P.x + c.dx * c.sp * cmul * dt, P.r, WORLD.w - P.r);
      P.y = clamp(P.y + c.dy * c.sp * cmul * dt, P.r, WORLD.h - P.r);
    }
  }
  // whirlpools pull + swirl
  for (const w of G.whirls) {
    const dx = w.x - P.x, dy = w.y - P.y;
    const d = Math.hypot(dx, dy);
    if (d < w.r && d > 1) {
      // calm eye: pull fades out near the middle so you orbit instead of
      // getting glued to the center and mauled — swim/dash out any time
      const eye = clamp((d - 14) / 24, 0, 1);
      const pull = (1 - d / w.r) * 180 * eye;
      const tx = -dy / d * w.spin, ty = dx / d * w.spin;
      P.x = clamp(P.x + (dx / d * pull + tx * 95) * dt, P.r, WORLD.w - P.r);
      P.y = clamp(P.y + (dy / d * pull + ty * 95) * dt, P.r, WORLD.h - P.r);
    }
  }
  // rideable current highways: surf a lane to fly along it
  for (const L of G.lanes) {
    if (P.x > 0 && P.x < WORLD.w && P.y > L.y && P.y < L.y + L.h) {
      P.x = clamp(P.x + L.dir * L.sp * dt, P.r, WORLD.w - P.r);
      if (Math.random() < 0.35 && G.parts.length < 240) G.parts.push({ x: P.x - L.dir * P.r, y: P.y + rand(-10, 10), vx: -L.dir * rand(60, 140), vy: rand(-20, 20), r: rand(1.5, 3), color: "#a5f3fc", life: 0.4, t: 0, kind: "spark", grow: 0 });
      // riding the current kicks up a streaming wake
      if (G.parts.length < 240 && Math.random() < dt * 22) G.parts.push({ x: P.x - L.dir * rand(20, 70), y: P.y + rand(-16, 16), vx: L.dir * rand(180, 320), vy: rand(-15, 15), r: rand(1.5, 2.5), color: "#bae6fd", life: rand(0.3, 0.6), t: 0, kind: "spark", grow: 0 });
    }
  }
  // living dark: stage gloom + deep water + dread set the light level
  const pDeep = depthAt(P.x, P.y);
  const stDim = (G.stage && G.stage.dim) || 0;
  G.dark = clamp(0.1 + stDim * 0.8 + pDeep * 0.32 + (G.superAlive ? 0.25 : 0), 0, 0.72);
  // your fish is a lantern: in dark water it carries its own glow
  if (G.dark > 0.35 && G.lights.length < 40) {
    P.lanT = (P.lanT || 0) - dt;
    if (P.lanT <= 0) { P.lanT = 0.12; G.lights.push({ x: P.x, y: P.y, t: 0.12, max: 0.12, color: "150,225,255", r: 280 }); }
  }
  // marine snow thickens in the deep (skipped in ECO mode)
  if (!G.lowQ && pDeep > 0.4 && G.parts.length < 236 && Math.random() < dt * (4 + pDeep * 14)) {
    G.parts.push({ x: camX + rand(0, W), y: camY - 8, vx: rand(-12, 12), vy: rand(24, 60), r: rand(1, 2.4), color: "#cfe9ff", life: rand(2.5, 4.5), t: 0, kind: "snow", grow: 0 });
  }
  P.finPhase += dt * (5 + (Math.abs(mv.x) + Math.abs(mv.y)) * 9);
  if (P.blink > 0) P.blink -= dt;
  P.blinkT -= dt;
  if (P.blinkT <= 0) { P.blink = 0.12; P.blinkT = rand(2, 5); }
  if (P.mouth > 0) P.mouth -= dt;
  if (P.squash > 0) P.squash = Math.max(0, P.squash - dt * 5);
  // swim trail: little bubbles slip off the tail (bioluminescent wake at speed)
  P.trailT -= dt;
  if ((mv.x || mv.y) && P.trailT <= 0 && G.parts.length < 240) {
    P.trailT = 0.09;
    const fast = P.dashT > 0 || Math.hypot(mv.x * P.speed, mv.y * P.speed) > P.speed * 0.85;
    G.parts.push({ x: P.x - Math.cos(P.face) * (P.r + 8) + rand(-3, 3), y: P.y - Math.sin(P.face) * (P.r + 8) + rand(-3, 3), vx: rand(-20, 20), vy: rand(-60, -20), r: fast ? rand(2.5, 4.5) : rand(1.5, 3), color: fast ? "#e0f7ff" : trailColor(), life: rand(0.4, 0.8), t: 0, kind: "bubble", grow: 0, seed: Math.random() * TAU });
    // plankton ignites where you swim: glowing motes bloom in your wake (ECO keeps the trail, skips the bloom)
    if (!G.lowQ && G.parts.length < 238 && Math.random() < (fast ? 0.5 : 0.22)) {
      G.parts.push({ x: P.x + rand(-26, 26), y: P.y + rand(-26, 26), vx: rand(-14, 14), vy: rand(-24, -6), r: rand(1.5, 3), color: Math.random() < 0.6 ? "#a7f3d0" : "#67e8f9", life: rand(1.0, 1.8), t: 0, kind: "mote", grow: 0, seed: Math.random() * TAU });
    }
  }
  if (mv.x || mv.y) P.face = Math.atan2(mv.y, mv.x);
  if (P.iframes > 0) P.iframes -= dt;
  if (P.regen > 0 && P.hp < P.maxHp) {
    P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);
  }

  fire(dt);

  // remora companion: follows, nips nearby foes, vacuums scraps
  if (!G.remora) G.remora = { x: P.x - 40, y: P.y, lvl: 1, xp: 0, cd: 0 };
  const RM = G.remora;
  if (RM) {
    const tx = P.x - Math.cos(P.face) * 46, ty = P.y - Math.sin(P.face) * 46;
    RM.x += (tx - RM.x) * Math.min(1, dt * 4);
    RM.y += (ty - RM.y) * Math.min(1, dt * 4);
    const vr = 70 + 15 * RM.lvl;
    for (const g of G.gems) {
      const dx = RM.x - g.x, dy = RM.y - g.y, d = Math.max(1, Math.hypot(dx, dy));
      if (d < vr) { g.x += (dx / d) * 500 * dt; g.y += (dy / d) * 500 * dt; }
    }
    RM.cd -= dt;
    if (RM.cd <= 0) {
      let nib = null, bd = 460 * 460;
      for (const e of G.enemies) { if (e.dead) continue; const d2 = dist2(RM.x, RM.y, e.x, e.y); if (d2 < bd) { bd = d2; nib = e; } }
      if (nib) {
        RM.cd = Math.max(0.5, 1.2 - RM.lvl * 0.06);
        damageFoe(nib, 4 + 3 * RM.lvl, false, RM.x, RM.y);
        if (G.parts.length < 240) G.parts.push({ x: RM.x, y: RM.y, vx: (nib.x - RM.x) * 2, vy: (nib.y - RM.y) * 2, r: 2, color: "#7dd3fc", life: 0.25, t: 0, kind: "spark", grow: 0 });
      } else RM.cd = 0.2;
    }
  }

  // spawning
  const isBossWave = G.wave % 5 === 0;
  const isSuperWave = G.wave % 10 === 0;
  if (isSuperWave && !G.superAlive && G.superSpawnedWave !== G.wave) {
    if (G.wave % 20 === 0) spawnHadal(); else spawnSuperBoss();
  } else if (isBossWave && !isSuperWave && !G.bossAlive && G.bossSpawnedWave !== G.wave) {
    // boss rotation: classic Maw, web-snaring Weaver, minion-summoning Broodmother
    const cyc = Math.floor(G.wave / 5) % 3;
    spawnBoss(G.wave === 5 ? "classic" : (cyc === 0 ? "weaver" : cyc === 2 ? "summoner" : "classic"));
  }
  if (G.wave >= 4 && G.wave % 4 === 0 && G.clamWave !== G.wave) {
    G.clamWave = G.wave;
    spawnClam();
  }
  // elite golden bubble: fast, flees, drops a free upgrade pick (holds off during epic duels + rift intermissions)
  G.eliteT -= dt;
  if (G.eliteT <= 0 && G.wave >= 2 && !G.epicAlive && !G.gateHold) {
    G.eliteT = rand(35, 55) / (G.eliteMul || 1) / ((G.stage && G.stage.elite) || 1);
    spawnElite();
  }
  G.spawnTimer -= dt;
  const maxAlive = Math.min(42, 6 + G.wave * 2.2);
  const interval = Math.max(0.28, 1.15 - G.wave * 0.075) * (G.bossAlive ? 1.8 : 1) / (G.spawnMul || 1) / ((G.stage && G.stage.spawn) || 1);
  if (G.spawnTimer <= 0 && G.enemies.length < maxAlive && !G.epicAlive && !G.gateHold) { // the reef holds its breath during epic duels + rift intermissions
    const burstN = 1 + Math.floor(G.wave / 4);
    for (let i = 0; i < burstN && G.enemies.length < maxAlive; i++) spawnEnemy();
    // the stage breeds its signature hazards
    if (G.stage && G.stage.mines && G.enemies.length < maxAlive && RNG() < 0.35) spawnEnemy("mine");
    if (G.stage && G.stage.brood && G.enemies.length < maxAlive && RNG() < 0.35) spawnEnemy(RNG() < 0.5 ? "lunker" : "snare");
    G.spawnTimer = interval * rand(0.7, 1.3);
  }

  // rift gate: swim into the light to start the next leg
  if (G.gate) {
    G.gate.t += dt;
    if (dist2(P.x, P.y, G.gate.x, G.gate.y) < G.gate.r * G.gate.r) enterGate();
  }

  // enemies
  const frozen = G.freezeT > 0;
  for (const e of G.enemies) {
    if (e.flash > 0) e.flash -= dt;
    if (e.snareCd > 0) e.snareCd -= dt;
    // boss + elite eyes burn in the dark: they carry their own light
    if ((e.boss || e.elite) && !e.dead && G.lights.length < 44) {
      e.eyeT = (e.eyeT || 0) - dt;
      if (e.eyeT <= 0) {
        e.eyeT = 0.18;
        G.lights.push({ x: e.x, y: e.y, t: 0.18, max: 0.18, color: e.hadal ? "45,212,191" : e.superboss ? "167,139,250" : e.elite ? "253,224,71" : "244,63,94", r: e.r * 3.4 });
      }
    }
    // vampiric elites weep red while they hunt
    if (e.affix === "vampiric" && !e.dead && G.parts.length < 238) {
      e.dripT = (e.dripT || 0) - dt;
      if (e.dripT <= 0) { e.dripT = 0.4; G.parts.push({ x: e.x + rand(-e.r, e.r) * 0.6, y: e.y - e.r * 0.5, vx: rand(-8, 8), vy: rand(50, 110), r: rand(1.5, 2.5), color: "#f87171", life: rand(0.4, 0.7), t: 0, kind: "spark", grow: 0 }); }
    }
    // elemental status: 🔥 burn ticks damage, ❄️ chill handled at movement below
    if (e.burnT > 0 && !e.dead) {
      e.burnT -= dt;
      e.burnTick = (e.burnTick || 0) - dt;
      if (Math.random() < 0.6 && G.parts.length < 240) G.parts.push({ x: e.x + rand(-6, 6), y: e.y - e.r, vx: rand(-20, 20), vy: rand(-90, -40), r: rand(1.5, 3), color: Math.random() < 0.5 ? "#fb923c" : "#fde047", life: 0.4, t: 0, kind: "spark", grow: 0 });
      if (e.burnTick <= 0) { e.burnTick = 0.5; damageFoe(e, (e.burnDps || 5) * 0.5, false); }
    }
    if (e.dead) continue; // burn may have finished it — skip the corpse
    // decoy bubble taunts non-boss foes off you
    const tgtX = (G.decoy && !e.boss) ? G.decoy.x : P.x;
    const tgtY = (G.decoy && !e.boss) ? G.decoy.y : P.y;
    const dx = tgtX - e.x, dy = tgtY - e.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / d, ny = dy / d;
    let vx = nx * e.sp, vy = ny * e.sp;
    if (e.ranged && !e.boss && !frozen) {
      if (d < 190) { vx = -nx * e.sp; vy = -ny * e.sp; }
      else if (d < 300) { vx = -ny * e.sp * e.strafe * 0.7; vy = nx * e.sp * e.strafe * 0.7; }
      e.shootT -= dt;
      if (e.shootT <= 0 && d < 520) {
        e.shootT = rand(2, 2.8);
        const bs = 190 + G.wave * 6;
        G.ebullets.push({ x: e.x, y: e.y, vx: nx * bs, vy: ny * bs, r: 6, dmg: Math.round(e.dmg * 0.8), life: 4 });
        tone(220, 0.12, "square", 0.05, 140);
      }
    }
    if (e.boss && !frozen) {
      e.shootT -= dt;
      if (e.shootT <= 0) {
        if (e.pattern === "summoner") { // Broodmother: lighter radial, summons on its own clock
          e.shootT = 3.2;
          const n = 10, bs = 140 + G.wave * 4;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + rand(0, 0.3);
            G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, r: 7, dmg: Math.round(12 * dmgMul() * (G.depthDmg || 1)), life: 5 });
          }
          tone(140, 0.3, "sawtooth", 0.1, 70);
        } else if (e.pattern === "weaver") { // Webweaver: slow spiral + snares at your feet (phase 2 spins up)
          e.shootT = e.phase2 ? 1.7 : 2.6;
          e.spir = (e.spir || 0) + 0.8;
          const n = 6, bs = 150 + G.wave * 4;
          for (let i = 0; i < n; i++) {
            const a = e.spir + (i / n) * TAU;
            G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, r: 7, dmg: Math.round(12 * dmgMul() * (G.depthDmg || 1)), life: 5 });
          }
          tone(160, 0.25, "sine", 0.09, 90);
        } else { // classic Maw: full radial (phase 2 packs a denser, faster ring)
          e.shootT = Math.max(1.2, 2.4 - G.wave * 0.05);
          const n = 8 + Math.min(10, G.wave) + (e.phase2 ? 6 : 0);
          const bs = 150 + G.wave * 4 + (e.phase2 ? 30 : 0);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + rand(0, 0.3);
            G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, r: 7, dmg: Math.round(14 * dmgMul() * (G.depthDmg || 1)), life: 5 });
          }
          tone(140, 0.3, "sawtooth", 0.1, 70);
        }
      }
      if (e.pattern === "weaver" && !e.dead) { // drops a sticky web where you swim
        e.webT -= dt;
        if (e.webT <= 0) {
          e.webT = 4;
          G.webs.push({ x: P.x, y: P.y, r: 95, t: 7 });
          addText(P.x, P.y - 40, "🕸 SNARED!", "#e9d5ff", 15);
          tone(300, 0.3, "sine", 0.09, 150);
        }
      }
      if (e.pattern === "summoner" && !e.dead) { // calls the brood
        e.sumT -= dt;
        if (e.sumT <= 0 && G.enemies.length < 40) {
          e.sumT = 7;
          for (let k = 0; k < (e.phase2 ? 5 : 3); k++) spawnEnemy(undefined, e.x + rand(-60, 60), e.y + rand(-60, 60));
          addText(e.x, e.y - 70, "THE BROOD COMES!", "#fdba74", 16);
          tone(120, 0.4, "sawtooth", 0.12, 60);
        }
      }
      if (e.epic && !e.enraged && !e.dead && e.hp < e.maxHp * 0.3) { // epic enrage: wounded beasts fight dirtier
        e.enraged = true;
        e.sp *= 1.4;
        e.dmg = Math.round(e.dmg * 1.3);
        e.shootT = Math.min(e.shootT, 1);
        setAnnounce("THE EPIC ENRAGES!");
        pushRing(e.x, e.y, 220, "#f87171", 5);
        burst(e.x, e.y, "#f87171", 26, 320);
        tone(90, 0.5, "sawtooth", 0.14, 45);
      }
      if (!e.phase2 && !e.dead && e.hp < e.maxHp * 0.5) { // SECOND PHASE: the duel changes shape
        e.phase2 = true;
        const phNames = { classic: "THE MAW FRENZIES!", weaver: "THE WEAVER'S WEB TIGHTENS!", summoner: "THE BROODMOTHER SCREAMS!" };
        setAnnounce(phNames[e.pattern] || "THE BOSS RAGES!");
        showBanner("⚠ SECOND PHASE — " + (e.patName || "BOSS"), { urgent: true });
        e.shootT = Math.min(e.shootT, 0.8);
        e.sp *= 1.15;
        if (e.pattern === "summoner") e.sumT = Math.min(e.sumT, 2);
        if (e.pattern === "weaver") e.webT = Math.min(e.webT, 1.5);
        pushRing(e.x, e.y, 260, "#f0abfc", 6);
        burst(e.x, e.y, "#f0abfc", 30, 340);
        G.shake = Math.min(12, G.shake + 5);
        tone(80, 0.6, "sawtooth", 0.15, 40);
      }
    }
    if (e.superboss && !e.dead && !frozen) {
      // ABYSSAL LEVIATHAN attack cycle: spiral barrage, minion summons, telegraphed charge
      e.spirT -= dt;
      if (e.spirT <= 0) {
        e.spirT = e.phase2 ? 1.1 : 1.7;
        e.spir = (e.spir || 0) + 0.55;
        const n = 10, bs = 165 + G.wave * 4;
        for (let i = 0; i < n; i++) {
          const a = e.spir + (i / n) * TAU;
          G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, r: 7, dmg: Math.round(14 * dmgMul() * (G.depthDmg || 1)), life: 5 });
        }
        tone(110, 0.25, "sawtooth", 0.09, 60);
      }
      e.sumT -= dt;
      if (e.sumT <= 0 && G.enemies.length < 40) {
        e.sumT = 7;
        for (let k = 0; k < (e.phase2 ? 3 : 2); k++) spawnEnemy(undefined, e.x + rand(-60, 60), e.y + rand(-60, 60));
        addText(e.x, e.y - 80, "THE DEEP SENDS MINIONS!", "#c4b5fd", 16);
        tone(140, 0.3, "sawtooth", 0.1, 70);
      }
      e.chargeT -= dt;
      if (e.chargeT <= 0.9 && e.chargeT > 0 && !e.chargeWarned) {
        e.chargeWarned = true;
        addText(e.x, e.y - 100, "⚠ LEVIATHAN CHARGE! ⚠", "#fca5a5", 18);
        tone(90, 0.5, "sawtooth", 0.12, 45);
      }
      if (e.chargeT <= 0) {
        e.chargeT = e.phase2 ? 6 : 9;
        e.chargeWarned = false;
        const cdx = P.x - e.x, cdy = P.y - e.y, cd = Math.max(1, Math.hypot(cdx, cdy));
        e.kx += (cdx / cd) * 1100; e.ky += (cdy / cd) * 1100;
        G.shake = Math.min(10, G.shake + 4);
        tone(70, 0.4, "sawtooth", 0.14, 35);
      }
    }
    if (e.superboss && !e.phase2 && !e.dead && e.hp < e.maxHp * 0.5) { // SECOND PHASE: the abyss deepens
      e.phase2 = true;
      setAnnounce("THE ABYSS DEEPENS!");
      showBanner("⚠ LEVIATHAN — SECOND PHASE", { urgent: true });
      e.spirT = Math.min(e.spirT, 0.5);
      e.chargeT = Math.min(e.chargeT, 3);
      pushRing(e.x, e.y, 320, "#a78bfa", 6);
      burst(e.x, e.y, "#a78bfa", 40, 380);
      G.shake = Math.min(12, G.shake + 6);
      tone(60, 0.7, "sawtooth", 0.15, 30);
    }
    if (e.hadal && !e.phase2 && !e.dead && e.hp < e.maxHp * 0.5) { // SECOND PHASE: the mother rages
      e.phase2 = true;
      setAnnounce("THE MOTHER RAGES!");
      showBanner("◉ HADAL — SECOND PHASE", { urgent: true });
      e.spirT = Math.min(e.spirT, 0.7);
      e.slamT = Math.min(e.slamT || 6, 2);
      pushRing(e.x, e.y, 320, "#5eead4", 6);
      burst(e.x, e.y, "#5eead4", 40, 380);
      G.shake = Math.min(12, G.shake + 6);
      tone(65, 0.7, "sawtooth", 0.15, 32);
    }
    if (e.hadal && !e.dead && !frozen) {
      // HADAL MOTHER attack cycle: slow spiral, calls her snare-brood, slam bursts
      e.spirT -= dt;
      if (e.spirT <= 0) {
        e.spirT = e.phase2 ? 1.5 : 2.2;
        e.spir = (e.spir || 0) + 0.5;
        const n = 12, bs = 150 + G.wave * 4;
        for (let i = 0; i < n; i++) {
          const a = e.spir + (i / n) * TAU;
          G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, r: 7, dmg: Math.round(14 * dmgMul() * (G.depthDmg || 1)), life: 5 });
        }
        tone(95, 0.25, "sawtooth", 0.09, 55);
      }
      e.sumT -= dt;
      if (e.sumT <= 0 && G.enemies.length < 40) {
        e.sumT = 8;
        for (let k = 0; k < (e.phase2 ? 3 : 2); k++) spawnEnemy("snare", e.x + rand(-60, 60), e.y + rand(-60, 60));
        addText(e.x, e.y - 80, "THE MOTHER CALLS!", "#5eead4", 16);
        tone(120, 0.4, "sawtooth", 0.12, 55);
      }
      e.slamT -= dt;
      if (e.slamT <= 0) {
        e.slamT = e.phase2 ? 4 : 6;
        const n = 14, bs = 170 + G.wave * 4;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rand(0, 0.3);
          G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, r: 7, dmg: Math.round(14 * dmgMul() * (G.depthDmg || 1)), life: 5 });
        }
        G.shake = Math.min(10, G.shake + 5);
        pushRing(e.x, e.y, 200, "#2dd4bf", 5);
        tone(70, 0.4, "sawtooth", 0.14, 38);
      }
    }
    if (e.exploder && !e.dead && !frozen) {
      if (e.fuse < 0 && d < (e.mine ? 150 : 110)) { e.fuse = 0.8; tone(500, 0.3, "square", 0.06, 900); }
      if (e.fuse >= 0) {
        e.fuse -= dt;
        e.flash = 0.05;
        vx *= 0.3; vy *= 0.3;
        if (e.fuse <= 0) detonate(e);
      }
    }
    if (e.clam && !e.dead && !frozen) {
      e.openT += dt;
      e.shootT -= dt;
      vx = 0; vy = 0;
      if (e.shootT <= 0) {
        e.shootT = rand(5, 7);
        spawnPearls(e.x, e.y, 4);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + rand(0, 0.4);
          const bs = 140 + G.wave * 4;
          G.ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, r: 7, dmg: Math.round(14 * dmgMul() * (G.depthDmg || 1)), life: 5 });
        }
        tone(140, 0.3, "sawtooth", 0.1, 70);
      }
    }
    if (e.elite && !e.dead && !frozen) {
      if (d < 320) { vx = -nx * e.sp; vy = -ny * e.sp; }
      else { vx = nx * e.sp * 0.4; vy = ny * e.sp * 0.4; }
    }
    if (e.type === "dasher" && !e.dead && !frozen) {
      // Ripfin: stalks at mid-range, locks a red lane onto you, then rips through it
      e.lungeCd = (e.lungeCd === undefined ? rand(0.8, 1.5) : e.lungeCd) - dt;
      if (e.windup > 0) {
        // telegraphed windup: braking hard while the aim tracks you (dodge NOW)
        e.windup -= dt;
        vx *= 0.25; vy *= 0.25;
        const la = Math.atan2(tgtY - e.y, tgtX - e.x);
        e.lungeDx = Math.cos(la); e.lungeDy = Math.sin(la);
        if (e.windup <= 0) {
          e.lungeT = 0.32;
          tone(700, 0.15, "sawtooth", 0.08, 200);
          burst(e.x, e.y, "#fca5a5", 6, 200);
        }
      } else if (e.lungeT > 0) {
        // the rip itself: committed and blinding — already decided, just don't be there
        e.lungeT -= dt;
        vx = e.lungeDx * 560; vy = e.lungeDy * 560;
        if (G.parts.length < 240 && Math.random() < 0.6) G.parts.push({ x: e.x, y: e.y, vx: -e.lungeDx * rand(60, 140), vy: -e.lungeDy * rand(60, 140), r: rand(1.5, 3), color: "#fca5a5", life: 0.35, t: 0, kind: "spark", grow: 0 });
      } else {
        if (d < 380 && d > 200 && e.lungeCd <= 0) {
          e.windup = 0.6;
          e.lungeCd = rand(2.6, 3.6);
          tone(440, 0.3, "square", 0.06, 660);
        }
        if (d < 260) { vx = -nx * e.sp; vy = -ny * e.sp; } // keeps its distance, circling for an opening
        else if (d < 430) { vx = -ny * e.sp * e.strafe * 0.8; vy = nx * e.sp * e.strafe * 0.8; }
        else { vx = nx * e.sp; vy = ny * e.sp; } // closing in from afar
      }
    }
    if (e.type === "mender" && !e.dead && !frozen) {
      // Reef Mender: hangs back and knits wounded allies whole — pop it first, or bleed out slowly
      if (d < 230) { vx = -nx * e.sp; vy = -ny * e.sp; }
      else if (d < 380) { vx = nx * e.sp * 0.3; vy = ny * e.sp * 0.3; }
      else { vx = nx * e.sp * 0.6; vy = ny * e.sp * 0.6; }
      e.healT = (e.healT === undefined ? rand(0.5, 1.5) : e.healT) - dt;
      if (e.healT <= 0) {
        e.healT = 2.2;
        let healed = false;
        for (const o of G.enemies) {
          if (o.dead || o === e || o.boss || o.elite || o.type === "clam" || !(o.maxHp > 0)) continue;
          if (o.hp >= o.maxHp) continue;
          if (dist2(e.x, e.y, o.x, o.y) > 240 * 240) continue;
          o.hp = Math.min(o.maxHp, o.hp + 14);
          healed = true;
          if (G.parts.length < 240) {
            G.parts.push({ x: o.x, y: o.y - o.r, vx: rand(-20, 20), vy: rand(-70, -30), r: rand(2, 3.5), color: "#6ee7b7", life: 0.6, t: 0, kind: "spark", grow: 0 });
            G.parts.push({ x: o.x + rand(-8, 8), y: o.y + rand(-8, 8), vx: rand(-15, 15), vy: rand(-50, -20), r: rand(1.5, 2.5), color: "#a7f3d0", life: 0.5, t: 0, kind: "spark", grow: 0 });
          }
        }
        if (healed) {
          e.healFx = 0.6;
          pushRing(e.x, e.y, 240, "#6ee7b7", 3);
          tone(660, 0.2, "sine", 0.06, 990);
        }
      }
      if (e.healFx > 0) e.healFx -= dt;
    }
    if (e.slowT > 0) {
      e.slowT -= dt;
      vx *= 0.45; vy *= 0.45; // ❄️ chilled: barely drifting
      if (Math.random() < 0.3 && G.parts.length < 240) G.parts.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), vx: rand(-15, 15), vy: rand(-40, -10), r: rand(1.5, 2.5), color: "#bae6fd", life: 0.4, t: 0, kind: "spark", grow: 0 });
    }
    if (!frozen) {
      e.x += (vx + e.kx) * dt;
      e.y += (vy + e.ky) * dt;
    }
    e.kx *= (1 - Math.min(1, dt * 6));
    e.ky *= (1 - Math.min(1, dt * 6));
    e.x = clamp(e.x, 24, WORLD.w - 24);
    e.y = clamp(e.y, 24, WORLD.h - 24);

    // touch player (frozen foes can't bite)
    const rr = e.r + P.r;
    if (!frozen && dist2(e.x, e.y, P.x, P.y) < rr * rr) {
      if (e.leecher && !e.fleeing) {
        // steal XP then flee to the map edge
        const steal = Math.min(6, Math.floor(P.xp));
        if (steal > 0) {
          P.xp = Math.max(0, P.xp - steal);
          e.stolen += steal;
          addText(P.x, P.y - 28, "-" + steal + " XP", "#e879f9", 14);
          tone(400, 0.2, "sine", 0.1, 150);
          updateHud(true);
        }
        e.fleeing = true;
        e.color = "#f0abfc";
        e.kx += (e.x - P.x) * 3; e.ky += (e.y - P.y) * 3;
      } else if (e.snare) {
        // Snarejelly: gums you up in drifting snare, then nips (snares on a cooldown)
        if ((e.snareCd || 0) <= 0) {
          G.webs.push({ x: P.x, y: P.y, r: 75, t: 4 });
          addText(P.x, P.y - 40, "🕸 SNARED!", "#bae6fd", 15);
          tone(300, 0.3, "sine", 0.09, 150);
          e.snareCd = 2.5;
        }
        hurtPlayer(e.dmg, e.type, e.x, e.y);
      } else {
        // dash-strike: you ARE the weapon while dashing — rip through, don't dodge around
        if (P.dashT > 0 && !(P.dashHit || []).includes(e.id)) {
          P.dashHit.push(e.id);
          damageFoe(e, Math.max(5, Math.round(P.dmg * 1.2)), false, P.x - P.dashDx * 10, P.y - P.dashDy * 10);
          e.kx += P.dashDx * (e.boss ? 60 : 420); e.ky += P.dashDy * (e.boss ? 60 : 420);
          pushRing(e.x, e.y, 40, "#fefce8", 3);
        }
        // vampiric elites drink a sip when they touch you
        if (e.affix === "vampiric" && !e.dead && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + 15);
          addText(e.x, e.y - e.r - 8, "+15 DRAINED", "#f87171", 12);
        }
        // pacifist pact: waves 1–3 touch no harm, the reef spares you
        if (G.pactId === "pacifist" && G.wave <= 3) {
          if (P.iframes <= 0) { P.iframes = 0.7; burst(P.x, P.y, "#a5f3fc", 8, 160); addText(P.x, P.y - 28, "SPARED!", "#a5f3fc", 13); }
        } else hurtPlayer(e.dmg, e.type, e.x, e.y);
      // Urchinmail relic: touch back — the spines remember
      if (G.relicThorns && !e.dead) damageFoe(e, Math.max(1, Math.round(e.dmg * 0.3)), false, P.x, P.y);
      }
    }
    if (e.leecher && e.fleeing && !e.dead && !frozen) {
      // flee toward the nearest map edge
      const dl = e.x, dr = WORLD.w - e.x, dTop = e.y, db = WORLD.h - e.y;
      const best = Math.min(dl, dr, dTop, db);
      let fx = 0, fy = 0;
      if (best === dl) fx = -1; else if (best === dr) fx = 1; else if (best === dTop) fy = -1; else fy = 1;
      e.x += fx * e.sp * 1.2 * dt; e.y += fy * e.sp * 1.2 * dt;
      if (best < 40) e.dead = true; // escaped with the loot
    }
  }
  // enemy separation
  const foes = G.enemies;
  for (let i = 0; i < foes.length; i++) {
    for (let j = i + 1; j < foes.length; j++) {
      const a = foes[i], b = foes[j];
      const rr = a.r + b.r;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 > 0.01 && d2 < rr * rr) {
        const d = Math.sqrt(d2);
        const push = ((rr - d) / d) * 0.5;
        const px = (a.x - b.x) * push, py = (a.y - b.y) * push;
        a.x += px * 0.5; a.y += py * 0.5;
        b.x -= px * 0.5; b.y -= py * 0.5;
      }
    }
  }
  if (G.enemies.some((e) => e.dead)) G.enemies = G.enemies.filter((e) => !e.dead);

  // player bullets
  for (const b of G.bullets) {
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let bounced = false;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); bounced = true; }
    if (b.x > WORLD.w - b.r) { b.x = WORLD.w - b.r; b.vx = -Math.abs(b.vx); bounced = true; }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); bounced = true; }
    if (b.y > WORLD.h - b.r) { b.y = WORLD.h - b.r; b.vy = -Math.abs(b.vy); bounced = true; }
    if (bounced) {
      if (b.bounce > 0) b.bounce -= 1;
      else b.life = 0;
    }
    if (b.life <= 0) continue;
    for (const e of G.enemies) {
      if (e.dead || b.hit.includes(e.id)) continue;
      const rr = e.r + b.r;
      if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
        b.hit.push(e.id);
        damageFoe(e, b.dmg, b.crit, b.x - b.vx * 0.01, b.y - b.vy * 0.01);
        burst(b.x, b.y, b.color, 4, 140);
        // impact ring: every connect lands with a little shockwave (not just a spark puff)
        if (G.rings.length < 18) pushRing(b.x, b.y, Math.min(40, 15 + (b.dmg || 5) * 0.5), b.crit ? "#fde047" : "#e0f2fe", 2);
        // elemental hits: fire ignites (3s burn), ice chills (2s 55% slow)
        if (!e.dead && b.pow === "fire") { e.burnT = 3; e.burnDps = Math.max(e.burnDps || 0, b.dot); e.burnTick = Math.min(e.burnTick || 0, 0.01); burst(b.x, b.y, "#fdba74", 5, 160); }
        else if (!e.dead && b.pow === "ice") { e.slowT = 2; burst(b.x, b.y, "#bae6fd", 5, 140); }        if (P.blast > 0) {
          pushRing(b.x, b.y, P.blast, b.color, 2);
          for (const o of G.enemies) {
            if (o.dead || o === e || b.hit.includes(o.id)) continue;
            const orr = P.blast + o.r;
            if (dist2(b.x, b.y, o.x, o.y) < orr * orr) {
              b.hit.push(o.id);
              damageFoe(o, b.dmg * 0.6, false, b.x, b.y);
            }
          }
        }
        // powder kegs eat shots and blow sky-high (chains!)
        for (const k of G.barrels) {
          if (k.gone || k.fuse >= 0) continue;
          const br = 14 + b.r;
          if (dist2(b.x, b.y, k.x, k.y) < br * br) { k.fuse = 0.05; b.life = 0; break; }
        }
        // urchins drink shots too — and start inhaling
        for (const u of G.urchins) {
          if (u.gone || u.fuse >= 0) continue;
          const ur = 14 + b.r;
          if (dist2(b.x, b.y, u.x, u.y) < ur * ur) { u.fuse = 0.05; b.life = 0; break; }
        }
        if (b.life <= 0) break;
        if (b.pierce > 0) { b.pierce -= 1; }
        else { b.life = 0; break; }
      }
    }
  }
  if (G.bullets.some((b) => b.life <= 0)) G.bullets = G.bullets.filter((b) => b.life > 0);
  if (G.enemies.some((e) => e.dead)) G.enemies = G.enemies.filter((e) => !e.dead);

  // enemy bullets (freeze holds them mid-water)
  for (const b of G.ebullets) {
    if (frozen) continue;
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0 || b.x < -40 || b.x > WORLD.w + 40 || b.y < -40 || b.y > WORLD.h + 40) continue;
    const rr = b.r + P.r;
    if (dist2(b.x, b.y, P.x, P.y) < rr * rr) {
      b.life = 0;
      hurtPlayer(b.dmg, "enemy fire", b.x, b.y);
    }
  }
  if (G.ebullets.some((b) => b.life <= 0)) G.ebullets = G.ebullets.filter((b) => b.life > 0);

  // gems
  for (const g of G.gems) {
    g.t += dt;
    g.x += g.vx * dt; g.y += g.vy * dt;
    g.vx *= (1 - Math.min(1, dt * 3));
    g.vy *= (1 - Math.min(1, dt * 3));
    currentPush(g, dt, 0.8);
    const d = Math.max(1, Math.hypot(P.x - g.x, P.y - g.y));
    if (d < magR()) {
      const pull = 700 * (1 - d / (P.magnet + 40));
      g.x += ((P.x - g.x) / d) * pull * dt;
      g.y += ((P.y - g.y) / d) * pull * dt;
      // stream trail: grabbed gems streak toward you instead of drifting passively
      if (G.parts.length < 230 && Math.random() < 0.4) G.parts.push({ x: g.x + rand(-3, 3), y: g.y + rand(-3, 3), vx: rand(-20, 20), vy: rand(-20, 20), r: 2, color: "#67e8f9", life: 0.3, t: 0, kind: "spark", grow: 0 });
    } else if (G.relicVacuum && d < 420) {
      // Bottom Feeder: loose gems feel a faint tide toward you from far away
      g.x += ((P.x - g.x) / d) * 220 * dt;
      g.y += ((P.y - g.y) / d) * 220 * dt;
    }
    if (d < P.r + 12) {
      g.got = true;
      gainXp(g.val * (1 + Math.min(G.combo, 30) * 0.02) * (G.xpMul2 || 1) * (G.mutXp || 1) * (G.comboXPMul || 1) * (G.greedXp || 1) * (hasSyn("drift") ? 1.25 : 1));
      sfxGem();
      // magnet tick: pitch climbs with your combo so long chains feel musical
      if (G.tickCd <= 0) { G.tickCd = 0.06; tone(620 + Math.min(G.combo, 40) * 22, 0.05, "sine", 0.028); }
      burst(g.x, g.y, "#22d3ee", 3, 120);
    }
  }
  if (G.gems.some((g) => g.got)) G.gems = G.gems.filter((g) => !g.got);

  // milestone chests: swim over to crack open
  for (const c of G.chests) {
    c.t += dt; c.life -= dt;
    if (!c.got && Math.hypot(P.x - c.x, P.y - c.y) < P.r + 20) {
      c.got = true;
      ACH.stat.chest = (ACH.stat.chest || 0) + 1;
      checkAch();
      G.hearts.push({ x: c.x, y: c.y, vx: 0, vy: 0, t: 0 });
      spawnPearls(c.x, c.y, 2 * (G.relicChest || 1));
      burst(c.x, c.y, "#fde047", 22, 260);
      pushRing(c.x, c.y, 110, "#fde047", 3);
      addText(c.x, c.y - 24, "BONUS CACHE!", "#fde047", 18);
      sfxLevel();
    }
  }

  // hearts
  for (const h of G.hearts) {
    h.t += dt;
    h.x += h.vx * dt; h.y += h.vy * dt;
    h.vx *= (1 - Math.min(1, dt * 3));
    h.vy *= (1 - Math.min(1, dt * 3));
    currentPush(h, dt, 0.8);
    const d = Math.max(1, Math.hypot(P.x - h.x, P.y - h.y));
    if (d < magR(0.8)) {
      h.x += ((P.x - h.x) / d) * 400 * dt;
      h.y += ((P.y - h.y) / d) * 400 * dt;
    }
    if (d < P.r + 12) {
      h.got = true;
      P.hp = Math.min(P.maxHp, P.hp + 25 * (G.pactHeal || 1));
      addText(P.x, P.y - 28, "+25", "#4ade80", 16);
      tone(880, 0.15, "sine", 0.1, 1320);
      updateHud(true);
    }
  }
  if (G.hearts.some((h) => h.got)) G.hearts = G.hearts.filter((h) => !h.got);

  // pearls (bankable currency)
  for (const q of G.pearls) {
    q.t += dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= (1 - Math.min(1, dt * 3));
    q.vy *= (1 - Math.min(1, dt * 3));
    currentPush(q, dt, 0.8);
    const d = Math.max(1, Math.hypot(P.x - q.x, P.y - q.y));
    if (d < magR()) {
      const pull = 700 * (1 - d / (P.magnet + 40));
      q.x += ((P.x - q.x) / d) * pull * dt;
      q.y += ((P.y - q.y) / d) * pull * dt;
    }
    if (d < P.r + 12) {
      q.got = true;
      G.runPearls += 1;
      addText(q.x, q.y, "+1 pearl", "#fde68a", 13);
      if ((G.greedXp || 1) > 1.05) { // juiced on greed: the reef pays double
        G.runPearls += 1;
        addText(q.x, q.y - 14, "+1 GREED", "#fde047", 11);
      }
      tone(1500, 0.08, "sine", 0.06, 2000);
      updateHud(true);
    }
  }
  if (G.pearls.some((q) => q.got)) G.pearls = G.pearls.filter((q) => !q.got);

  // elemental power-ups: 10s timer + floating pickups (magnetized, expire after 14s)
  if (G.powerT > 0) {
    G.powerT -= dt;
    if (G.powerT <= 0) {
      G.powerKind = null;
      addText(P.x, P.y - 28, "POWER FADED", "#94a3b8", 13);
      updateHud(true);
    }
  }
  for (const u of G.pups) {
    u.t += dt; u.life -= dt;
    u.x += u.vx * dt; u.y += u.vy * dt;
    u.vx *= (1 - Math.min(1, dt * 3));
    u.vy *= (1 - Math.min(1, dt * 3));
    currentPush(u, dt, 0.8);
    const d = Math.max(1, Math.hypot(P.x - u.x, P.y - u.y));
    if (d < magR()) {
      const pull = 700 * (1 - d / (P.magnet + 40));
      u.x += ((P.x - u.x) / d) * pull * dt;
      u.y += ((P.y - u.y) / d) * pull * dt;
    }
    if (d < P.r + 14) { u.got = true; grabPowerup(u.kind); }
  }
  if (G.pups.some((u) => u.got || u.life <= 0)) G.pups = G.pups.filter((u) => !u.got && u.life > 0);

  // weaver webs: sticky snares that drag you down, fade after a few seconds
  for (const wb of G.webs) wb.t -= dt;
  if (G.webs.some((wb) => wb.t <= 0)) G.webs = G.webs.filter((wb) => wb.t > 0);

  // powder kegs: drift, bump to light the fuse, shots detonate them
  G.barrelT -= dt;
  if (G.barrelT <= 0 && G.wave >= 3 && G.barrels.length < 4) { G.barrelT = rand(12, 20) / ((G.stage && G.stage.barrels) || 1); spawnBarrel(); }
  for (const k of G.barrels) {
    k.t += dt;
    k.x += k.vx * dt; k.y += k.vy * dt;
    k.vx *= (1 - Math.min(1, dt * 2)); k.vy *= (1 - Math.min(1, dt * 2));
    currentPush(k, dt, 0.8);
    if (k.fuse < 0 && dist2(k.x, k.y, P.x, P.y) < (14 + P.r) * (14 + P.r)) k.fuse = 0.4; // bumped it!
    if (k.fuse >= 0) {
      k.fuse -= dt;
      if (k.fuse < 0.2 && Math.random() < 0.5 && G.parts.length < 240) G.parts.push({ x: k.x + rand(-4, 4), y: k.y - 14, vx: rand(-20, 20), vy: rand(-60, -20), r: rand(1, 2.5), color: "#fde047", life: 0.3, t: 0, kind: "spark", grow: 0 });
      if (k.fuse <= 0) explodeBarrel(k);
    }
  }
  if (G.barrels.some((k) => k.gone)) G.barrels = G.barrels.filter((k) => !k.gone);

  // implosion urchins seed the crushing stages: bump or shoot to arm, then they inhale
  G.urchinT -= dt;
  if (G.urchinT <= 0 && G.wave >= 12 && G.stage && G.stage.urchins && G.urchins.length < 3) { G.urchinT = rand(14, 22); spawnUrchin(); }
  for (const u of G.urchins) {
    u.t += dt;
    if (u.fuse < 0 && dist2(u.x, u.y, P.x, P.y) < 130 * 130) { u.fuse = 0.6; tone(500, 0.3, "square", 0.06, 900); }
    if (u.fuse >= 0) {
      u.fuse -= dt;
      if (u.fuse <= 0) implodeUrchin(u);
    }
  }
  if (G.urchins.some((u) => u.gone)) G.urchins = G.urchins.filter((u) => !u.gone);

  // map objectives: timed hunts with rewards
  if (!G.obj && G.wave >= 2) {
    G.objT -= dt;
    if (G.objT <= 0) {
      G.objT = rand(45, 70);
      const def = OBJS[(Math.random() * OBJS.length) | 0];
      G.obj = { id: def.id, have: def.id === "exterm" ? G.kills : (ACH.stat.elite || 0), eliteId: -1, t: def.dur, dur: def.dur };
      if (def.setup) def.setup();
      showBanner(def.icon + " " + def.name, { urgent: true });
      setAnnounce(def.id === "exterm" ? "POP " + def.need + " IN " + def.dur + "S!" : def.id === "hunt" ? "POP THE GILTWISP!" : "HOLD ON " + def.dur + "S!");
      tone(523, 0.15, "triangle", 0.1, 784);
    }
  } else if (G.obj) {
    const def = OBJS.find((o) => o.id === G.obj.id);
    G.obj.t -= dt;
    let win = false, fail = false;
    if (G.obj.id === "exterm" && G.kills - G.obj.have >= def.need) win = true;
    if (G.obj.id === "hunt") {
      const tgt = G.enemies.find((e) => e.id === G.obj.eliteId);
      if ((G.obj.eliteId >= 0 && (!tgt || tgt.dead)) || (ACH.stat.elite || 0) - G.obj.have >= 1) win = true;
    }
    if (G.obj.id === "surge" && G.obj.t <= 0) win = true;
    if (!win && G.obj.t <= 0) fail = true;
    if (win || fail) {
      if (win) { const prize = def.reward(); addText(P.x, P.y - 44, "OBJECTIVE COMPLETE: " + prize, "#fde047", 16); sfxLevel(); }
      else { addText(P.x, P.y - 44, "OBJECTIVE FAILED", "#94a3b8", 14); tone(220, 0.3, "sawtooth", 0.08, 110); }
      G.obj = null;
    }
  }

  // greed rings: a golden gamble — stand inside for stacking riches, but it calls the hungry
  if (G.mode === "dive" && G.wave >= 4 && !G.gateHold && G.state === "play") {
    if (!G.greed) {
      G.greedT -= dt;
      if (G.greedT <= 0) {
        G.greedT = rand(50, 75);
        const gx = clamp(P.x + rand(-1, 1) * 420, 140, WORLD.w - 140);
        const gy = clamp(P.y + rand(-1, 1) * 320, 140, WORLD.h - 140);
        G.greed = { x: gx, y: gy, r: 110, t: 20, stacks: 0, trickle: 0 };
        showBanner("◉ A GREED RING SHIMMERS...");
        setAnnounce("GREED CALLS — STAND IN THE GOLD");
        tone(880, 0.3, "sine", 0.09, 1320);
        spawnPortal(gx, gy, 130, "#fde047");
      }
    } else {
      const gr = G.greed;
      gr.t -= dt;
      const inside = Math.hypot(P.x - gr.x, P.y - gr.y) < gr.r;
      if (inside) {
        gr.stacks = Math.min(60, gr.stacks + dt * 2.5);
        gr.trickle -= dt;
        if (gr.trickle <= 0 && G.enemies.length < 42) {
          gr.trickle = 2.2;
          const a = rand(0, TAU);
          spawnEnemy(undefined, clamp(gr.x + Math.cos(a) * (gr.r + 130), 40, WORLD.w - 40), clamp(gr.y + Math.sin(a) * (gr.r + 130), 40, WORLD.h - 40));
        }
        if (Math.random() < dt * 8 && G.parts.length < 240) G.parts.push({ x: gr.x + rand(-gr.r, gr.r) * 0.8, y: gr.y + rand(-20, 20), vx: rand(-20, 20), vy: rand(-90, -40), r: rand(1.5, 3), color: "#fde047", life: 0.6, t: 0, kind: "spark", grow: 0 });
      } else {
        gr.stacks = Math.max(0, gr.stacks - dt * 6);
      }
      if (gr.t <= 0) {
        // cash out: unspent greed crystallizes into pearls at your feet
        const pay = Math.min(12, Math.floor(gr.stacks / 6));
        if (pay > 0) {
          spawnPearls(P.x, P.y, pay);
          addText(P.x, P.y - 46, "GREED CASHED: +" + pay + " PEARLS!", "#fde047", 17);
          tone(660, 0.2, "triangle", 0.12, 990);
        } else addText(P.x, P.y - 46, "THE RING FADES...", "#94a3b8", 14);
        G.greed = null;
      }
    }
  }
  if (!G.greed) G.greedXp = 1;
  else G.greedXp = 1 + Math.min(G.greed.stacks, 40) * 0.04;

  // treasure clams: touch to choose — crack it open or release its spirit for a blessing
  for (const c of G.clams) {
    c.t += dt;
    if (!c.open && dist2(c.x, c.y, P.x, P.y) < (c.r + P.r) * (c.r + P.r)) {
      c.open = true; // decided this wave (restocks next wave)
      openClamChoice(c);
    }
  }
  // wandering merchant: touch to browse pearl wares
  if (G.merchant) {
    const m = G.merchant;
    if (dist2(m.x, m.y, P.x, P.y) < (30 + P.r) * (30 + P.r)) openShop();
  }

  updateFx(dt);
  driftAmbient(dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 14);

  hudTick(dt);
}

// ---------- render ----------
function circle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
// ---------- HD texture kit: procedural detail, cached tiles, cheap ops ----------
const TEX = { caustic: null, causticPat: null };
// Deterministic 0..1 hash from an int seed (stable grain per entity).
function srand(s) {
  let x = (((s | 0) * 2654435761) >>> 0) || 1;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
  return x / 4294967296;
}
// Universal HD wash for round sprites. Call with ctx translated to the sprite
// center, BEFORE ctx.restore(). Layers a top-light + bottom shade + fine grain
// + faint scale arcs + rim light. All paint stays in-radius, no clip needed.
function hdWash(r, seed, o) {
  o = o || {};
  const hi = o.hi == null ? 0.26 : o.hi, sh = o.sh == null ? 0.30 : o.sh;
  if (!(r > 0)) return;
  let g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, -r * 0.35, -r * 0.4, r * 1.25);
  g.addColorStop(0, "rgba(255,255,255," + hi + ")");
  g.addColorStop(0.55, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  g = ctx.createRadialGradient(r * 0.45, r * 0.5, r * 0.1, r * 0.45, r * 0.5, r * 1.3);
  g.addColorStop(0, "rgba(2,10,26," + sh + ")");
  g.addColorStop(0.6, "rgba(2,10,26,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  // film grain: deterministic speckles inside the body
  const n = Math.max(5, Math.min(18, Math.round(r * 0.85)));
  for (let i = 0; i < n; i++) {
    const a = srand(seed * 97 + i * 13) * TAU;
    const d = Math.sqrt(srand(seed * 131 + i * 29)) * r * 0.86;
    ctx.globalAlpha = 0.10;
    circle(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.7, r * 0.035), srand(seed * 17 + i * 7) > 0.5 ? "#ffffff" : "#04121f");
  }
  ctx.globalAlpha = 1;
  // faint fish-scale arcs across the upper body
  if (o.scales !== false) {
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = Math.max(1, r * 0.045);
    const rows = Math.max(2, Math.min(4, Math.round(r / 9)));
    for (let row = 0; row < rows; row++) {
      const yy = -r * 0.45 + row * (r * 0.9 / Math.max(1, rows - 1));
      const w = Math.sqrt(Math.max(0, r * r - yy * yy));
      const m = Math.max(2, Math.round(w / (r * 0.42)));
      for (let k = 0; k < m; k++) {
        const xx = -w + (k + 0.5) * (2 * w / m);
        ctx.beginPath();
        ctx.arc(xx, yy - r * 0.12, r * 0.2, 0.35, Math.PI - 0.35);
        ctx.stroke();
      }
    }
  }
  // rim light: bright crest top-left, dark edge bottom-right
  ctx.lineWidth = Math.max(1.2, r * 0.07);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth * 0.5, -2.5, -0.7); ctx.stroke();
  ctx.strokeStyle = "rgba(2,10,26,0.35)";
  ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth * 0.5, 0.7, 2.4); ctx.stroke();
}
// Tiny deterministic speckle cluster for decor (world coords).
function speckle(x, y, r, seed, n, c1, c2) {
  for (let i = 0; i < n; i++) {
    const a = srand(seed + i * 31) * TAU;
    const d = Math.sqrt(srand(seed * 3 + i * 57)) * r * 0.7;
    ctx.globalAlpha = 0.25;
    circle(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.8, r * 0.07), srand(seed + i * 11) > 0.5 ? c1 : c2);
  }
  ctx.globalAlpha = 1;
}
// Caustic shimmer tile for the water column (built once, tiled cheaply).
function causticTile() {
  const s = 256, c = document.createElement("canvas");
  c.width = c.height = s;
  const x2 = c.getContext("2d");
  x2.strokeStyle = "#bff3ff";
  x2.lineCap = "round";
  for (let i = 0; i < 46; i++) {
    const x = srand(i * 7 + 1) * s, y = srand(i * 13 + 2) * s;
    const len = 14 + srand(i * 29 + 3) * 42, a = srand(i * 43 + 4) * TAU;
    x2.globalAlpha = 0.05 + srand(i * 59 + 5) * 0.10;
    x2.lineWidth = 1 + srand(i * 71 + 6) * 2.2;
    x2.beginPath();
    x2.moveTo(x, y);
    x2.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + 6, x + Math.cos(a) * len, y + Math.sin(a) * len);
    x2.stroke();
  }
  return c;
}

function drawFoe(e) {
  const flash = e.flash > 0;
  const ph = (e.id || 0) * 1.37;
  const t = G.time;
  const R = e.r;
  const ang = Math.atan2(P.y - e.y, P.x - e.x);
  const base = flash ? "#ffffff" : e.color;
  ctx.save();
  ctx.translate(e.x, e.y);

  // pulsing threat aura for the heavyweights
  const aura = (rad, color, speed, alpha, width) => {
    const w = 0.5 + 0.5 * Math.sin(t * speed + ph);
    ctx.globalAlpha = alpha * (0.35 + 0.65 * w);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 3;
    ctx.beginPath();
    ctx.arc(0, 0, rad + Math.sin(t * speed + ph) * 2.5, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  // paired eyes that track the player; angry = heavy brow slashes.
  // headOff slides the whole cluster toward the snout (for long fish bodies).
  const lookEyes = (spread, er, angry, glowColor, headOff) => {
    const hx = Math.cos(ang) * (headOff || 0), hy = Math.sin(ang) * (headOff || 0);
    const ex = Math.cos(ang) * R * 0.22 + hx, ey = Math.sin(ang) * R * 0.22 + hy;
    const px = -Math.sin(ang) * spread, py = Math.cos(ang) * spread;
    if (glowColor) {
      circle(ex, ey, er * 2.1, glowColor);
    }
    circle(-px + ex, -py + ey, er, "#fff");
    circle(px + ex, py + ey, er, "#fff");
    circle(-px + ex * 1.7, -py + ey * 1.7, er * 0.52, "#0b1020");
    circle(px + ex * 1.7, py + ey * 1.7, er * 0.52, "#0b1020");
    circle(-px + ex * 1.4 - er * 0.18, -py + ey * 1.4 - er * 0.18, er * 0.17, "#fff");
    circle(px + ex * 1.4 - er * 0.18, py + ey * 1.4 - er * 0.18, er * 0.17, "#fff");
    if (angry) {
      const bx = -Math.cos(ang), by = -Math.sin(ang); // "back" = away from player
      const ox = -Math.sin(ang), oy = Math.cos(ang);  // sideways
      ctx.strokeStyle = "rgba(12,4,8,0.9)";
      ctx.lineWidth = Math.max(2, R * 0.1);
      ctx.lineCap = "round";
      for (const s of [-1, 1]) {
        const cxp = s * px + ex, cyp = s * py + ey;
        ctx.beginPath();
        ctx.moveTo(cxp + ox * s * er * 1.5 + bx * er * 1.1, cyp + oy * s * er * 1.5 + by * er * 1.1);
        ctx.lineTo(cxp - ox * s * er * 0.7 - bx * er * 0.1, cyp - oy * s * er * 0.7 - by * er * 0.1);
        ctx.stroke();
      }
    }
  };
  const spikes = (n, rOut, rIn, rot, c1, c2) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const a2 = rot + ((i + 0.5) / n) * TAU;
      const a3 = rot + ((i + 1) / n) * TAU;
      ctx.fillStyle = i % 2 ? c1 : c2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a2) * rIn, Math.sin(a2) * rIn);
      ctx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
      ctx.lineTo(Math.cos(a3) * rOut, Math.sin(a3) * rOut);
      ctx.closePath();
      ctx.fill();
    }
  };

  const kind = e.type;
  if (kind === "chaser") {
    // Reef Reaver — crimson spikefish, always nose-at-you
    ctx.save();
    ctx.rotate(ang);
    const wag = Math.sin(t * 10 + ph) * R * 0.12;
    // forked tail
    ctx.fillStyle = "#9f1239";
    ctx.beginPath();
    ctx.moveTo(-R * 0.8, 0);
    ctx.lineTo(-R * 1.7, -R * 0.55 + wag);
    ctx.lineTo(-R * 1.32, wag * 0.4);
    ctx.lineTo(-R * 1.7, R * 0.55 + wag);
    ctx.closePath(); ctx.fill();
    // dorsal spines
    for (let i = 0; i < 5; i++) {
      const sx = -R * 0.55 + i * R * 0.3;
      const sh = R * (0.55 - Math.abs(i - 2) * 0.12);
      ctx.beginPath();
      ctx.moveTo(sx - R * 0.11, -R * 0.45);
      ctx.lineTo(sx, -R * 0.45 - sh);
      ctx.lineTo(sx + R * 0.11, -R * 0.45);
      ctx.closePath(); ctx.fill();
    }
    // torpedo body
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.15, R * 0.68, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#4c0519";
    ctx.stroke();
    // gill slashes
    ctx.strokeStyle = "rgba(76,5,25,0.65)";
    ctx.lineWidth = R * 0.1;
    for (let i = 0; i < 3; i++) {
      const gx = -R * 0.05 - i * R * 0.28;
      ctx.beginPath();
      ctx.moveTo(gx, -R * 0.52);
      ctx.lineTo(gx - R * 0.14, R * 0.52);
      ctx.stroke();
    }
    // pectoral fin
    ctx.fillStyle = "rgba(159,18,57,0.9)";
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, R * 0.45);
    ctx.lineTo(-R * 0.7, R * 0.95 + wag);
    ctx.lineTo(-R * 0.5, R * 0.3);
    ctx.closePath(); ctx.fill();
    // fangs at the snout
    ctx.fillStyle = "#fff1f2";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(R * 0.92, s * R * 0.16);
      ctx.lineTo(R * 1.12, s * R * 0.08);
      ctx.lineTo(R * 0.96, s * R * 0.28);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    lookEyes(R * 0.28, Math.max(2.6, R * 0.2), true, null, R * 0.45);
  } else if (kind === "speedy") {
    // Dart — amber razor-fish, always nose-at-you
    ctx.save();
    ctx.rotate(ang);
    // speed streaks
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const yy = -R * 0.5 + i * R * 0.5;
      const len = R * (1.6 + 0.5 * Math.sin(t * 22 + ph + i * 2));
      ctx.beginPath();
      ctx.moveTo(-R * 0.9, yy);
      ctx.lineTo(-R * 0.9 - len, yy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // tail fin
    ctx.fillStyle = "#b45309";
    ctx.beginPath();
    ctx.moveTo(-R * 0.9, 0);
    ctx.lineTo(-R * 1.7, -R * 0.62);
    ctx.lineTo(-R * 1.35, 0);
    ctx.lineTo(-R * 1.7, R * 0.62);
    ctx.closePath(); ctx.fill();
    // torpedo body
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.2, R * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#78350f";
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.2, R * 0.72, 0, 0, TAU);
    ctx.stroke();
    // racing stripes
    ctx.strokeStyle = "rgba(120,53,15,0.55)";
    ctx.lineWidth = R * 0.16;
    ctx.beginPath();
    ctx.moveTo(-R * 0.7, -R * 0.32); ctx.lineTo(R * 0.5, -R * 0.32);
    ctx.moveTo(-R * 0.7, R * 0.32); ctx.lineTo(R * 0.5, R * 0.32);
    ctx.stroke();
    // visor eye
    ctx.fillStyle = "#451a03";
    ctx.beginPath();
    ctx.ellipse(R * 0.55, 0, R * 0.34, R * 0.4, 0, 0, TAU);
    ctx.fill();
    circle(R * 0.62, -R * 0.08, R * 0.13, "#fef3c7");
    ctx.restore();
  } else if (kind === "tank") {
    // Bulwark — plated siege-crab, claws first
    aura(R + 12, "rgba(96,165,250,0.8)", 3, 0.5, 4);
    const br = 1 + 0.03 * Math.sin(t * 3 + ph);
    ctx.save();
    ctx.rotate(ang);
    ctx.scale(br, br);
    ctx.lineCap = "round";
    // walking legs
    ctx.strokeStyle = "#1e3a8a";
    ctx.lineWidth = Math.max(2, R * 0.12);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const lx = -R * 0.5 + i * R * 0.45;
        const wig = Math.sin(t * 6 + ph + i * 2 + s * 2) * R * 0.08;
        ctx.beginPath();
        ctx.moveTo(lx, s * R * 0.5);
        ctx.lineTo(lx + R * 0.12 + wig, s * R * 1.0);
        ctx.stroke();
      }
    }
    // heavy claws raised at you
    for (const s of [-1, 1]) {
      const cwx = R * 0.78, cwy = s * R * 0.52;
      ctx.strokeStyle = "#1e3a8a";
      ctx.lineWidth = Math.max(2.5, R * 0.14);
      ctx.beginPath();
      ctx.moveTo(R * 0.3, s * R * 0.38);
      ctx.lineTo(cwx, cwy);
      ctx.stroke();
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.arc(cwx + R * 0.2, cwy, R * 0.32, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#172554";
      ctx.stroke();
      ctx.fillStyle = "#172554";
      ctx.beginPath();
      ctx.moveTo(cwx + R * 0.44, cwy - R * 0.14 + s * R * 0.04);
      ctx.lineTo(cwx + R * 0.74, cwy + s * R * 0.06);
      ctx.lineTo(cwx + R * 0.44, cwy + R * 0.18);
      ctx.closePath(); ctx.fill();
    }
    // wide carapace
    ctx.fillStyle = "#1e3a8a";
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.95, R * 0.78, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.68, R * 0.55, 0, 0, TAU);
    ctx.fill();
    // shell rivets
    ctx.fillStyle = "#dbeafe";
    for (let i = 0; i < 6; i++) {
      const a = ph * 0.2 + (i / 6) * TAU;
      circle(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.42, Math.max(1.6, R * 0.07), "#dbeafe");
    }
    ctx.restore();
    lookEyes(R * 0.26, Math.max(2.6, R * 0.17), true, null, R * 0.3);
  } else if (kind === "splitter") {
    // Mitosquid — brood-squid, mantle first, babies glowing inside
    const w = 1 + 0.05 * Math.sin(t * 5 + ph);
    ctx.save();
    ctx.rotate(ang);
    ctx.scale(w, 1 / w);
    // trailing tentacles
    ctx.strokeStyle = base;
    ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      const sway = Math.sin(t * 4 + ph + i * 1.4) * R * 0.2;
      ctx.lineWidth = Math.max(1.5, R * 0.11);
      ctx.beginPath();
      ctx.moveTo(-R * 0.9, i * R * 0.2);
      ctx.quadraticCurveTo(-R * 1.4, i * R * 0.3 + sway * 0.5, -R * 1.8, i * R * 0.28 + sway);
      ctx.stroke();
      circle(-R * 1.8, i * R * 0.28 + sway, R * 0.07, "#bbf7d0");
    }
    // side fins
    ctx.fillStyle = "#15803d";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.1, s * R * 0.5);
      ctx.lineTo(-R * 0.8, s * R * 1.0);
      ctx.lineTo(-R * 0.62, s * R * 0.28);
      ctx.closePath(); ctx.fill();
    }
    // mantle with the brood glowing through
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.15, R * 0.66, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#14532d";
    ctx.stroke();
    // nuclei drifting within
    for (let i = 0; i < 3; i++) {
      const a = t * 1.6 + ph + (i / 3) * TAU;
      const nx = Math.cos(a) * R * 0.45, ny = Math.sin(a) * R * 0.28;
      circle(nx, ny, R * 0.24, "#bbf7d0");
      circle(nx, ny, R * 0.24, "rgba(20,83,45,0.25)");
      circle(nx - R * 0.05, ny - R * 0.06, R * 0.08, "rgba(255,255,255,0.8)");
    }
    circle(R * 0.5, -R * 0.22, R * 0.18, "rgba(255,255,255,0.4)");
    ctx.restore();
    lookEyes(R * 0.36, Math.max(2.4, R * 0.16), false, null, R * 0.5);
  } else if (kind === "spitter") {
    // Hexspit — violet squid-sniper with a charging barrel
    const charging = e.shootT < 0.7;
    ctx.save();
    ctx.rotate(ang);
    // trailing tentacles
    ctx.strokeStyle = base;
    ctx.lineCap = "round";
    for (let i = -1; i <= 1; i++) {
      const sway = Math.sin(t * 5 + ph + i * 2) * R * 0.16;
      ctx.lineWidth = Math.max(1.5, R * 0.1);
      ctx.beginPath();
      ctx.moveTo(-R * 0.8, i * R * 0.3);
      ctx.quadraticCurveTo(-R * 1.3, i * R * 0.4 + sway * 0.5, -R * 1.6, i * R * 0.38 + sway);
      ctx.stroke();
    }
    // side fins
    ctx.fillStyle = "#7e22ce";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.2, s * R * 0.45);
      ctx.lineTo(-R * 0.9, s * R * 0.95);
      ctx.lineTo(-R * 0.72, s * R * 0.22);
      ctx.closePath(); ctx.fill();
    }
    // long mantle
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.1, R * 0.66, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#3b0764";
    ctx.stroke();
    // suction-cup dots
    ctx.fillStyle = "rgba(59,7,100,0.5)";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4;
      circle(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, R * 0.1, "rgba(59,7,100,0.5)");
    }
    // barrel snout
    const bl = R * (charging ? 1.25 : 1.0);
    ctx.fillStyle = charging ? "#f0abfc" : "#a855f7";
    ctx.fillRect(R * 0.5, -R * 0.26, bl, R * 0.52);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#3b0764";
    ctx.strokeRect(R * 0.5, -R * 0.26, bl, R * 0.52);
    if (charging) {
      const g = 0.5 + 0.5 * Math.sin(t * 30);
      ctx.globalAlpha = 0.5 + 0.5 * g;
      circle(R * 0.5 + bl, 0, R * (0.3 + 0.15 * g), "#fdf4ff");
      ctx.globalAlpha = 1;
    } else {
      circle(R * 0.5 + bl, 0, R * 0.16, "#4a044e");
    }
    // aim telegraph: a shimmering cone down the firing lane while charging
    if (charging) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 18);
      ctx.fillStyle = "rgba(240,171,252," + (0.07 + pulse * 0.07).toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(R * 1.1, 0);
      ctx.lineTo(R * 1.1 + 280, -62);
      ctx.lineTo(R * 1.1 + 280, 62);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(240,171,252," + (0.25 + pulse * 0.2).toFixed(3) + ")";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(R * 1.1, 0); ctx.lineTo(R * 1.1 + 280, -62);
      ctx.moveTo(R * 1.1, 0); ctx.lineTo(R * 1.1 + 280, 62);
      ctx.stroke();
    }
    ctx.restore();
    lookEyes(R * 0.3, Math.max(2.4, R * 0.18), false, charging ? "rgba(240,171,252,0.35)" : null, R * 0.5);
  } else if (kind === "exploder") {
    // Fusebloom — swollen volatile PUFFERFISH, one spark from judgment day
    const primed = e.fuse >= 0;
    const k = primed ? clamp(1 - e.fuse / 0.8, 0, 1) : 0;
    if (primed) {
      // expanding doom ring: flashes white-hot as judgment nears
      const hot = Math.sin(t * 40) > 0;
      ctx.globalAlpha = 0.3 + 0.6 * (1 - k);
      ctx.strokeStyle = hot ? "#fff7ed" : (k > 0.6 ? "#ef4444" : "#fdba74");
      ctx.lineWidth = 3 + k * 3;
      ctx.beginPath();
      ctx.arc(0, 0, R + 8 + k * 30, 0, TAU);
      ctx.stroke();
      if (k > 0.45) {
        // second inner ring closes in — half a heartbeat left
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = hot ? "#ef4444" : "#fff7ed";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2, R + 8 + k * 30 - (k - 0.45) * 120), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      aura(R + 6, "rgba(251,146,60,0.7)", 5, 0.35, 2);
    }
    const bx = Math.cos(ang + Math.PI), by = Math.sin(ang + Math.PI);
    const wag = Math.sin(t * 9 + ph) * R * 0.12;
    // tail fin at the rear
    ctx.fillStyle = "#9a3412";
    ctx.beginPath();
    ctx.moveTo(bx * R * 0.75, by * R * 0.75);
    ctx.lineTo(bx * R * 1.6 - by * R * 0.5 + by * wag, by * R * 1.6 + bx * R * 0.5 + bx * wag);
    ctx.lineTo(bx * R * 1.25 + bx * wag * 0.3, by * R * 1.25 + by * wag * 0.3);
    ctx.lineTo(bx * R * 1.6 + by * R * 0.5 + by * wag, by * R * 1.6 - bx * R * 0.5 + bx * wag);
    ctx.closePath(); ctx.fill();
    // side fins rowing toward you
    const px = -by, py = bx; // sideways
    for (const s of [-1, 1]) {
      const fw = Math.sin(t * 9 + ph + s * 2) * R * 0.08;
      ctx.fillStyle = "rgba(154,52,18,0.9)";
      ctx.beginPath();
      ctx.moveTo(px * s * R * 0.55, py * s * R * 0.55);
      ctx.lineTo(px * s * (R * 1.05) + bx * R * 0.3, py * s * (R * 1.05) + by * R * 0.3 + fw);
      ctx.lineTo(px * s * R * 0.5 - bx * R * 0.35, py * s * R * 0.5 - by * R * 0.35);
      ctx.closePath(); ctx.fill();
    }
    // puffed spines all over
    spikes(10, R + 4, R * 0.72, ph * 0.6, "#9a3412", "#c2410c");
    circle(0, 0, R * (1 + (primed ? 0.08 * Math.sin(t * 40) : 0.05 * Math.sin(t * 6 + ph))), primed && Math.sin(t * 40) > 0 ? "#fecaca" : base);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#7c2d12";
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    // crack lines
    ctx.strokeStyle = "rgba(124,45,18,0.8)";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const a = ph + (i / 3) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.25, Math.sin(a) * R * 0.25);
      ctx.lineTo(Math.cos(a + 0.5) * R * 0.6, Math.sin(a + 0.5) * R * 0.6);
      ctx.lineTo(Math.cos(a + 0.3) * R * 0.85, Math.sin(a + 0.3) * R * 0.85);
      ctx.stroke();
    }
    // molten core
    const core = R * (0.34 + (primed ? 0.16 * k + 0.05 * Math.sin(t * 40) : 0.06 * Math.sin(t * 6 + ph)));
    circle(0, 0, core, primed ? "#ef4444" : "#fdba74");
    circle(0, 0, core * 0.55, "#fff7ed");
    // fuse stem + spark
    ctx.strokeStyle = "#451a03";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.8);
    ctx.quadraticCurveTo(R * 0.2, -R * 1.25, R * 0.05, -R * 1.45);
    ctx.stroke();
    const sa = Math.sin(t * (primed ? 55 : 12) + ph);
    circle(R * 0.05, -R * 1.45, 2.5 + (primed ? 2.5 + sa : 1 + sa * 0.8), primed ? "#ef4444" : "#fde047");
    circle(R * 0.05, -R * 1.45, 1.4, "#fff");
    lookEyes(R * 0.42, Math.max(2.2, R * 0.15), primed, primed ? "rgba(239,68,68,0.4)" : null);
  } else if (kind === "mine") {
    // Ember Mine — chained iron orb, blinks faster as you close in
    const near = Math.hypot(P.x - e.x, P.y - e.y);
    const urg = near < 200 ? (Math.sin(t * 18) > 0 ? 1 : 0.25) : (0.45 + 0.4 * Math.sin(t * 4 + ph));
    spikes(8, R + 5, R * 0.7, ph, "#44403c", "#1c1917");
    circle(0, 0, R, "#292524");
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#78716c";
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    circle(-R * 0.28, -R * 0.32, R * 0.26, "rgba(255,255,255,0.25)");
    ctx.globalAlpha = urg;
    circle(0, 0, R * 0.4, near < 200 ? "#ef4444" : "#fbbf24");
    ctx.globalAlpha = 1;
    circle(0, 0, R * 0.18, "#fff");
    // sunken dressing: barnacle bumps + a snapped chain link on top
    for (let i = 0; i < 5; i++) {
      const a = srand((e.id || 1) * 31 + i * 17) * TAU;
      circle(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88, Math.max(1.4, R * 0.1), "#d6c9b8");
    }
    ctx.strokeStyle = "#57534e";
    ctx.lineWidth = Math.max(2, R * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, -R * 0.95);
    ctx.lineTo(R * 0.05, -R * 1.35);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(R * 0.05, -R * 1.48, Math.max(2, R * 0.14), 0, TAU); ctx.stroke();
    if (near < 200) aura(R + 8, "rgba(239,68,68,0.8)", 9, 0.5, 2);
  } else if (kind === "leecher") {
    // Sipheon — needle-nosed XP thief
    ctx.save();
    ctx.rotate(ang);
    // needle
    const nl = R * (e.stolen > 0 ? 1.6 : 2.3);
    ctx.fillStyle = "#fae8ff";
    ctx.beginPath();
    ctx.moveTo(R * 0.7, -R * 0.12);
    ctx.lineTo(R * 0.7 + nl, 0);
    ctx.lineTo(R * 0.7, R * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#701a75";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // slim body
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.15, R * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#701a75";
    ctx.lineWidth = 2;
    ctx.stroke();
    // back-swept wings
    ctx.fillStyle = "rgba(240,171,252,0.75)";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.3, s * R * 0.4);
      ctx.lineTo(-R * 1.2, s * R * 1.0);
      ctx.lineTo(-R * 0.9, s * R * 0.25);
      ctx.closePath(); ctx.fill();
    }
    // stuffed loot-sac after a successful steal
    if (e.stolen > 0) {
      circle(-R * 0.2, R * 0.42, R * (0.4 + 0.08 * Math.sin(t * 8)), "#fdf4ff");
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#a21caf";
      ctx.beginPath(); ctx.arc(-R * 0.2, R * 0.42, R * 0.4, 0, TAU); ctx.stroke();
      circle(-R * 0.35, R * 0.3, R * 0.1, "#fff");
    }
    // striped thorax
    ctx.strokeStyle = "rgba(112,26,117,0.6)";
    ctx.lineWidth = R * 0.12;
    ctx.beginPath();
    ctx.moveTo(-R * 0.5, -R * 0.5); ctx.lineTo(-R * 0.5, R * 0.5);
    ctx.moveTo(-R * 0.9, -R * 0.4); ctx.lineTo(-R * 0.9, R * 0.4);
    ctx.stroke();
    ctx.restore();
    lookEyes(R * 0.3, Math.max(2.2, R * 0.17), false);
  } else if (kind === "lunker") {
    // Gloom Lunker — abyssal ANGLERFISH, all jaw and patience
    aura(R + 10, "rgba(245,158,11,0.65)", 2.4, 0.5, 4);
    ctx.save();
    ctx.rotate(ang);
    const wag = Math.sin(t * 7 + ph) * R * 0.1;
    // broad sweeping tail
    ctx.fillStyle = "#451a03";
    ctx.beginPath();
    ctx.moveTo(-R * 0.85, 0);
    ctx.lineTo(-R * 1.7, -R * 0.6 + wag);
    ctx.lineTo(-R * 1.4, wag * 0.4);
    ctx.lineTo(-R * 1.7, R * 0.6 + wag);
    ctx.closePath(); ctx.fill();
    // long heavy body
    ctx.fillStyle = "#451a03";
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.2, R * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(R * 0.1, 0, R * 1.0, R * 0.58, 0, 0, TAU);
    ctx.fill();
    // mottled gloom spots
    ctx.fillStyle = "rgba(69,26,3,0.5)";
    circle(-R * 0.35, -R * 0.28, R * 0.2, "rgba(69,26,3,0.5)");
    circle(R * 0.3, R * 0.3, R * 0.16, "rgba(69,26,3,0.5)");
    circle(R * 0.1, -R * 0.4, R * 0.12, "rgba(69,26,3,0.5)");
    // dorsal fin + pectoral fin
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    ctx.moveTo(-R * 0.3, -R * 0.55);
    ctx.lineTo(R * 0.25, -R * 0.55);
    ctx.lineTo(0, -R * 1.0);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, R * 0.5);
    ctx.lineTo(-R * 0.7, R * 0.95 + wag);
    ctx.lineTo(-R * 0.5, R * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // lure stalk rising from the brow with a pulsing bulb
    const lx = Math.cos(ang - 0.6), ly = Math.sin(ang - 0.6);
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = Math.max(2, R * 0.07);
    ctx.beginPath();
    ctx.moveTo(lx * R * 0.5, ly * R * 0.5);
    ctx.quadraticCurveTo(lx * R * 1.1, ly * R * 1.1 - R * 0.3, lx * R * 1.15, ly * R * 1.15 - R * 0.55);
    ctx.stroke();
    const bulb = R * (0.22 + 0.06 * Math.sin(t * 5 + ph));
    circle(lx * R * 1.15, ly * R * 1.15 - R * 0.55, bulb + 4, "rgba(253,224,71,0.35)");
    circle(lx * R * 1.15, ly * R * 1.15 - R * 0.55, bulb, "#fef08a");
    circle(lx * R * 1.15 - 1, ly * R * 1.15 - R * 0.55 - 1, bulb * 0.35, "#fff");
    // gaping crescent jaw toward the player
    ctx.fillStyle = "#1c0a02";
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * R * 0.35, Math.sin(ang) * R * 0.35, R * 0.5, ang - 1.1, ang + 1.1);
    ctx.lineTo(Math.cos(ang) * R * 0.1, Math.sin(ang) * R * 0.1);
    ctx.closePath(); ctx.fill();
    // teeth along the jaw rim
    ctx.fillStyle = "#fef3c7";
    for (let i = -2; i <= 2; i++) {
      const a = ang + i * 0.42;
      const tx = Math.cos(ang) * R * 0.35 + Math.cos(a) * R * 0.5;
      const ty = Math.sin(ang) * R * 0.35 + Math.sin(a) * R * 0.5;
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(a + 1.57) * R * 0.06, ty + Math.sin(a + 1.57) * R * 0.06);
      ctx.lineTo(tx + Math.cos(a) * R * 0.14, ty + Math.sin(a) * R * 0.14);
      ctx.lineTo(tx - Math.cos(a + 1.57) * R * 0.06, ty - Math.sin(a + 1.57) * R * 0.06);
      ctx.closePath(); ctx.fill();
    }
    lookEyes(R * 0.42, Math.max(2.6, R * 0.16), true, null, R * 0.5);
    // scent line: when you're close it has your taste — a thin red thread
    {
      const sdx = P.x - e.x, sdy = P.y - e.y, sd = Math.hypot(sdx, sdy);
      if (sd < 230 && sd > 1) {
        ctx.strokeStyle = "rgba(248,113,113," + (0.16 + 0.12 * Math.sin(t * 7 + ph)).toFixed(3) + ")";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 10]);
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * R * 0.8, Math.sin(ang) * R * 0.8);
        ctx.lineTo(sdx, sdy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  } else if (kind === "snare") {
    // Snarejelly — drifting snare-sower with a sticky touch
    aura(R + 8, "rgba(165,243,252,0.7)", 3, 0.5, 3);
    // dangling snare threads below
    ctx.strokeStyle = "rgba(186,230,253,0.65)";
    ctx.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) {
      const sway = Math.sin(t * 3 + ph + i * 1.3) * R * 0.25;
      ctx.beginPath();
      ctx.moveTo(i * R * 0.28, R * 0.5);
      ctx.quadraticCurveTo(i * R * 0.28 + sway * 0.4, R * 1.1, i * R * 0.28 + sway, R * 1.7);
      ctx.stroke();
      circle(i * R * 0.28 + sway, R * 1.7, 1.8, "rgba(224,242,254,0.8)");
    }
    // translucent bell
    circle(0, 0, R, "rgba(165,243,252,0.5)");
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#22d3ee";
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    // inner coils
    ctx.strokeStyle = "rgba(14,116,144,0.7)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(Math.sin(t * 2 + ph + i * 2) * R * 0.15, -R * 0.1 + i * R * 0.18, R * (0.42 - i * 0.1), 0.3, Math.PI - 0.3); ctx.stroke();
    }
    // charged core: brightens as the snare cooldown readies
    const ready = 0.5 + 0.5 * Math.sin(t * 4 + ph);
    const cd = (e.snareCd || 0) <= 0;
    circle(0, -R * 0.1, R * 0.26, cd ? "rgba(253,224,71," + (0.5 + 0.4 * ready) + ")" : "rgba(103,232,249," + (0.4 + 0.3 * ready) + ")");
    lookEyes(R * 0.3, Math.max(2, R * 0.15), false);
  } else if (e.elite) {
    // Giltwisp — crowned golden KOI, a prize that wants to live
    aura(R + 10, "rgba(253,224,71,0.9)", 6, 0.55, 3);
    ctx.save();
    ctx.rotate(ang);
    const wag = Math.sin(t * 8 + ph) * R * 0.12;
    // long flowing tail
    ctx.fillStyle = "rgba(253,224,71,0.85)";
    ctx.beginPath();
    ctx.moveTo(-R * 0.85, 0);
    ctx.quadraticCurveTo(-R * 1.5, -R * 0.5 + wag, -R * 1.9, -R * 0.75 + wag * 1.4);
    ctx.quadraticCurveTo(-R * 1.6, wag * 0.5, -R * 1.9, R * 0.75 + wag * 1.4);
    ctx.quadraticCurveTo(-R * 1.5, R * 0.5 + wag, -R * 0.85, 0);
    ctx.closePath(); ctx.fill();
    // sleek koi body
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.2, R * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#713f12";
    ctx.stroke();
    // koi patches
    ctx.fillStyle = "rgba(180,83,9,0.4)";
    circle(-R * 0.3, -R * 0.2, R * 0.3, "rgba(180,83,9,0.4)");
    circle(R * 0.35, R * 0.18, R * 0.22, "rgba(180,83,9,0.4)");
    circle(R * 0.55, -R * 0.25, R * 0.3, "rgba(255,255,255,0.5)");
    // dorsal fin
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.moveTo(-R * 0.35, -R * 0.55);
    ctx.lineTo(R * 0.2, -R * 0.55);
    ctx.lineTo(-R * 0.05, -R * 0.95);
    ctx.closePath(); ctx.fill();
    // crown riding the brow
    const bob = Math.sin(t * 6 + ph) * 1.5;
    ctx.fillStyle = "#fef08a";
    ctx.strokeStyle = "#713f12";
    ctx.lineWidth = 1.5;
    const cw = R * 0.7, cx = R * 0.45, cy = -R * 0.35 + bob;
    ctx.beginPath();
    ctx.moveTo(cx - cw / 2, cy + R * 0.28);
    ctx.lineTo(cx - cw / 2, cy);
    ctx.lineTo(cx - cw / 4, cy + R * 0.16);
    ctx.lineTo(cx, cy - R * 0.1);
    ctx.lineTo(cx + cw / 4, cy + R * 0.16);
    ctx.lineTo(cx + cw / 2, cy);
    ctx.lineTo(cx + cw / 2, cy + R * 0.28);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    circle(cx, cy - R * 0.1, 2, "#ef4444");
    // orbiting sparkles
    for (let i = 0; i < 2; i++) {
      const a = t * 3 + ph + i * Math.PI;
      const sx = Math.cos(a) * (R + 12), sy = Math.sin(a) * (R + 12);
      const l = 3 + 2 * Math.sin(t * 10 + i * 3);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx - l, sy); ctx.lineTo(sx + l, sy);
      ctx.moveTo(sx, sy - l); ctx.lineTo(sx, sy + l);
      ctx.stroke();
    }
    ctx.restore();
    lookEyes(R * 0.3, Math.max(2.4, R * 0.18), false, "rgba(253,224,71,0.4)", R * 0.55);
    // elite affix tells
    if (e.affix === "shielded" && e.shield > 0) {
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 5 + ph);
      ctx.strokeStyle = "#67e8f9";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R + 5, t * 1.5 + ph, t * 1.5 + ph + Math.PI * 1.5); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.affix === "vampiric") {
      aura(R + 7, "rgba(248,113,113,0.8)", 4, 0.5, 2);
    } else if (e.affix === "hasted") {
      ctx.strokeStyle = "rgba(254,240,138,0.7)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const yy = -R * 0.4 + i * R * 0.8;
        ctx.beginPath();
        ctx.moveTo(-R * 1.1, yy + Math.sin(t * 30 + i * 2) * 2);
        ctx.lineTo(-R * 1.9, yy);
        ctx.stroke();
      }
    } else if (e.affix === "splitter") {
      circle(R * 0.5, -R * 0.5, R * 0.3, "rgba(74,222,128,0.8)");
      circle(-R * 0.5, R * 0.45, R * 0.24, "rgba(74,222,128,0.8)");
    }
  } else if (e.clam) {
    // Maw of the Reef — ancient bivalve fortress with a living pearl
    aura(R + 14, "rgba(249,168,212,0.7)", 2.2, 0.5, 5);
    const open = 0.5 + 0.5 * Math.sin((e.openT || 0) * 1.5);
    // shell fan
    circle(0, 0, R, "#7c2d4e");
    circle(0, 0, R * 0.86, base);
    // radiating ridges
    ctx.strokeStyle = "#4a1d33";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.85 + (i / 8) * Math.PI * 1.7;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
      ctx.lineTo(Math.cos(a) * (R + 3), Math.sin(a) * (R + 3));
      ctx.stroke();
    }
    // hinge knobs
    circle(-R * 0.75, -R * 0.55, 4, "#4a1d33");
    circle(R * 0.75, -R * 0.55, 4, "#4a1d33");
    // dark maw that gapes open and shut
    ctx.fillStyle = "#1c0713";
    ctx.beginPath();
    ctx.ellipse(0, R * 0.12, R * 0.52, R * (0.14 + open * 0.3), 0, 0, TAU);
    ctx.fill();
    // the pearl — brightens as the maw opens
    const pr = 7 + open * 4 + Math.sin(t * 4 + ph) * 1.2;
    ctx.globalAlpha = 0.25 + open * 0.25;
    circle(0, R * 0.1, pr + 7, "#fbcfe8");
    ctx.globalAlpha = 0.6 + 0.4 * open;
    circle(0, R * 0.1, pr, "#fef3c7");
    ctx.globalAlpha = 1;
    circle(-2, R * 0.1 - 2, pr * 0.35, "#fff");
    // barnacles
    ctx.fillStyle = "#e7d8c9";
    circle(-R * 0.55, R * 0.5, 3, "#e7d8c9");
    circle(R * 0.5, -R * 0.62, 2.4, "#e7d8c9");
    circle(R * 0.62, R * 0.34, 2, "#e7d8c9");
    lookEyes(R * 0.55, Math.max(2.6, R * 0.11), true);
  } else if (e.hadal) {
    // HADAL MOTHER — trench matriarch, a cathedral of teeth and light
    aura(R + 20, "rgba(45,212,191,0.8)", 2.2, 0.6, 5);
    // trailing tentacle curtain
    ctx.strokeStyle = base;
    ctx.lineCap = "round";
    for (let i = -4; i <= 4; i++) {
      const sway = Math.sin(t * 2.2 + ph + i * 0.9) * R * 0.3;
      ctx.lineWidth = Math.max(2, R * 0.07);
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(i * R * 0.2, R * 0.55);
      ctx.quadraticCurveTo(i * R * 0.2 + sway * 0.5, R * 1.2, i * R * 0.2 + sway, R * 1.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // bell: lightless dome over a glowing heart
    circle(0, 0, R, "#042f2e");
    circle(0, 0, R * 0.88, "#0f766e");
    circle(0, 0, R * 0.7, base);
    // rim bulbs: a crown of cold lanterns
    for (let i = 0; i < 10; i++) {
      const a = t * 0.3 + ph + (i / 10) * TAU;
      const bx = Math.cos(a) * R * 0.92, by = Math.sin(a) * R * 0.92;
      const pulse = 0.6 + 0.4 * Math.sin(t * 4 + i * 1.7);
      circle(bx, by, 3.5 * pulse + 2, "rgba(240,171,252,0.4)");
      circle(bx, by, 2.5 * pulse + 1, "#f0abfc");
    }
    // magenta core beating at the center
    const beat = 0.5 + 0.5 * Math.sin(t * 5 + ph);
    circle(0, 0, R * (0.3 + beat * 0.08), "rgba(240,171,252,0.5)");
    circle(0, 0, R * (0.18 + beat * 0.05), "#f0abfc");
    circle(0, 0, R * 0.07, "#fdf4ff");
    lookEyes(R * 0.45, R * 0.13, true, "rgba(45,212,191,0.5)");
  } else if (e.boss) {
    // REEF TYRANT — horned leviathan with a burning heart
    if (e.epic) {
      // epic aura: twin pulsing gold + blood rings, spinning faster when enraged
      const er = e.enraged ? 1.6 : 1;
      ctx.save();
      ctx.rotate(t * 0.7 * er + ph);
      ctx.strokeStyle = e.enraged ? "rgba(248,113,113,0.9)" : "rgba(253,224,71,0.85)";
      ctx.lineWidth = 4;
      ctx.setLineDash([22, 14]);
      ctx.beginPath(); ctx.arc(0, 0, R + 22, 0, TAU); ctx.stroke();
      ctx.rotate(-t * 1.4 * er);
      ctx.strokeStyle = "rgba(239,68,68,0.6)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 18]);
      ctx.beginPath(); ctx.arc(0, 0, R + 32, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    aura(R + 18, "rgba(239,68,68,0.85)", 2.6, 0.6, 5);
    // rotating rune ring
    ctx.save();
    ctx.rotate(t * 0.5 + ph);
    ctx.strokeStyle = "rgba(252,165,165,0.7)";
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.arc(0, 0, R + 12, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // horn crown
    spikes(8, R + 16, R * 0.75, t * 0.25 + ph, "#450a0a", "#991b1b");
    // hulking body
    circle(0, 0, R, "#450a0a");
    circle(0, 0, R * 0.88, base);
    // armored arcs
    ctx.strokeStyle = "rgba(69,10,10,0.8)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, R * (0.55 + i * 0.14), ang + 2.2, ang + 4.1);
      ctx.stroke();
    }
    // burning heart-core
    const pulse = 0.5 + 0.5 * Math.sin(t * 5 + ph);
    circle(Math.cos(ang + Math.PI) * R * 0.25, Math.sin(ang + Math.PI) * R * 0.25, R * (0.24 + pulse * 0.08), "rgba(249,115,22,0.45)");
    circle(Math.cos(ang + Math.PI) * R * 0.25, Math.sin(ang + Math.PI) * R * 0.25, R * (0.15 + pulse * 0.05), "#fdba74");
    circle(Math.cos(ang + Math.PI) * R * 0.25, Math.sin(ang + Math.PI) * R * 0.25, R * 0.07, "#fff7ed");
    // triple gaze: one great eye + two lesser
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const px = -Math.sin(ang), py = Math.cos(ang);
    circle(ex * R * 0.35, ey * R * 0.35, R * 0.24, "#fff");
    circle(ex * R * 0.35 + ex * R * 0.09, ey * R * 0.35 + ey * R * 0.09, R * 0.12, "#dc2626");
    circle(ex * R * 0.35 + ex * R * 0.09, ey * R * 0.35 + ey * R * 0.09, R * 0.05, "#0b1020");
    for (const s of [-1, 1]) {
      circle(s * px * R * 0.52 + ex * R * 0.1, s * py * R * 0.52 + ey * R * 0.1, R * 0.13, "#fff");
      circle(s * px * R * 0.52 + ex * R * 0.16, s * py * R * 0.52 + ey * R * 0.16, R * 0.07, "#7f1d1d");
      circle(s * px * R * 0.52 + ex * R * 0.16, s * py * R * 0.52 + ey * R * 0.16, R * 0.03, "#0b1020");
    }
    // furious brows
    ctx.strokeStyle = "rgba(12,4,8,0.95)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * px * R * 0.62 - ex * R * 0.05, s * py * R * 0.62 - ey * R * 0.05);
      ctx.lineTo(s * px * R * 0.28 + ex * R * 0.22, s * py * R * 0.28 + ey * R * 0.22);
      ctx.stroke();
    }
    // jagged maw full of fangs
    ctx.strokeStyle = "#1c0505";
    ctx.lineWidth = 3;
    ctx.beginPath();
    const ma = ang;
    for (let i = -2; i <= 2; i++) {
      const a = ma + (i / 2) * 0.35;
      const rr = R * (0.62 + (Math.abs(i) % 2) * 0.08);
      const qx = Math.cos(a) * rr, qy = Math.sin(a) * rr;
      i === -2 ? ctx.moveTo(qx, qy) : ctx.lineTo(qx, qy);
    }
    ctx.stroke();
    ctx.fillStyle = "#fecaca";
    for (let i = -2; i <= 2; i += 2) {
      const a = ma + (i / 2) * 0.35;
      circle(Math.cos(a) * R * 0.58, Math.sin(a) * R * 0.58, 2.4, "#fecaca");
    }
  } else if (kind === "superboss") {
    // ABYSSAL LEVIATHAN — abyssal dreadnought, death given form
    aura(R + 24, "rgba(167,139,250,0.9)", 2.4, 0.65, 6);
    // twin counter-rotating rune rings
    ctx.save();
    ctx.rotate(t * 0.4 + ph);
    ctx.strokeStyle = "rgba(196,181,253,0.75)";
    ctx.lineWidth = 5;
    ctx.setLineDash([20, 14]);
    ctx.beginPath(); ctx.arc(0, 0, R + 14, 0, TAU); ctx.stroke();
    ctx.rotate(-t * 0.9);
    ctx.strokeStyle = "rgba(239,68,68,0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 16]);
    ctx.beginPath(); ctx.arc(0, 0, R + 24, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // obsidian horn crown
    spikes(12, R + 20, R * 0.78, -t * 0.2 + ph, "#0c0a1d", "#4c1d95");
    // lightless body with violet mantle
    circle(0, 0, R, "#0c0a1d");
    circle(0, 0, R * 0.86, base);
    circle(0, 0, R * 0.86, "rgba(12,10,29,0.45)");
    // void core: a hole in the water, rimmed in violet fire
    const vp = 0.5 + 0.5 * Math.sin(t * 4 + ph);
    const coreX = Math.cos(ang + Math.PI) * R * 0.28, coreY = Math.sin(ang + Math.PI) * R * 0.28;
    circle(coreX, coreY, R * (0.3 + vp * 0.07), "rgba(167,139,250,0.5)");
    circle(coreX, coreY, R * 0.22, "#020108");
    circle(coreX, coreY, R * (0.1 + vp * 0.05), "#7c3aed");
    circle(coreX - R * 0.04, coreY - R * 0.04, R * 0.05, "#e9d5ff");
    // five-eyed gaze: great eye + four lessers fanned around it
    const ex = Math.cos(ang), ey = Math.sin(ang);
    const px = -Math.sin(ang), py = Math.cos(ang);
    const gaze = [[0, 0.4, 0.26, "#fff", "#dc2626"], [-0.5, 0.14, 0.14, "#fef3c7", "#7c2a12"], [0.5, 0.14, 0.14, "#fef3c7", "#7c2a12"], [-0.85, -0.12, 0.11, "#e9d5ff", "#4c1d95"], [0.85, -0.12, 0.11, "#e9d5ff", "#4c1d95"]];
    for (const g of gaze) {
      const gx = ex * R * g[1] + px * R * g[0], gy = ey * R * g[1] + py * R * g[0];
      circle(gx, gy, R * g[2], g[3]);
      circle(gx + ex * R * g[2] * 0.4, gy + ey * R * g[2] * 0.4, R * g[2] * 0.55, g[4]);
      circle(gx + ex * R * g[2] * 0.4, gy + ey * R * g[2] * 0.4, R * g[2] * 0.24, "#020108");
    }
    // furious shard brows
    ctx.strokeStyle = "rgba(2,1,8,0.95)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * px * R * 0.7 - ex * R * 0.05, s * py * R * 0.7 - ey * R * 0.05);
      ctx.lineTo(s * px * R * 0.3 + ex * R * 0.26, s * py * R * 0.3 + ey * R * 0.26);
      ctx.stroke();
    }
    // red rim-light on the facing edge
    ctx.strokeStyle = "rgba(239,68,68,0.85)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, R - 2, ang - 0.9, ang + 0.9);
    ctx.stroke();
    // trailing void wisps
    for (let i = 0; i < 3; i++) {
      const wa = ang + Math.PI + (i - 1) * 0.5 + Math.sin(t * 2 + ph + i * 2) * 0.15;
      ctx.strokeStyle = "rgba(124,58,237," + (0.5 - i * 0.12).toFixed(2) + ")";
      ctx.lineWidth = 5 - i;
      ctx.beginPath();
      ctx.moveTo(Math.cos(wa) * R * 0.9, Math.sin(wa) * R * 0.9);
      ctx.quadraticCurveTo(Math.cos(wa) * R * 1.5, Math.sin(wa) * R * 1.5, Math.cos(wa + 0.3) * R * (1.9 + 0.2 * Math.sin(t * 3 + i)), Math.sin(wa + 0.3) * R * (1.9 + 0.2 * Math.sin(t * 3 + i)));
      ctx.stroke();
    }
    // charge telegraph: a bloody lane shows exactly where the dash is going
    if (e.chargeT <= 0.9 && e.chargeT > 0 && !e.dead) {
      const ca = Math.atan2(P.y - e.y, P.x - e.x);
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.12 * Math.sin(t * 24);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = R * 0.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(Math.cos(ca) * R, Math.sin(ca) * R);
      ctx.lineTo(Math.cos(ca) * (R + 700), Math.sin(ca) * (R + 700));
      ctx.stroke();
      ctx.restore();
    }
    // name plate
    ctx.fillStyle = "#fca5a5";
    ctx.font = "900 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("☠ ABYSSAL LEVIATHAN ☠", 0, -R - 34);
  } else if (kind === "dasher") {
    // Ripfin — crimson needlefish built for one blinding rip
    ctx.save();
    ctx.rotate(ang);
    const dwag = Math.sin(t * 14 + ph) * R * 0.1;
    // ribbon tail
    ctx.fillStyle = "#7f1d1d";
    ctx.beginPath();
    ctx.moveTo(-R * 0.9, 0);
    ctx.lineTo(-R * 1.8, -R * 0.4 + dwag);
    ctx.lineTo(-R * 1.5, dwag * 0.3);
    ctx.lineTo(-R * 1.8, R * 0.4 + dwag);
    ctx.closePath(); ctx.fill();
    // needle body
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.3, R * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#450a0a";
    ctx.stroke();
    // swept dorsal fin
    ctx.fillStyle = "#b91c1c";
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, -R * 0.4);
    ctx.lineTo(-R * 0.7, -R * 1.1);
    ctx.lineTo(-R * 0.9, -R * 0.35);
    ctx.closePath(); ctx.fill();
    // white-hot snout tip while the rip is armed
    circle(R * 1.25, 0, 2.6, e.windup > 0 ? "#ffffff" : "#fecaca");
    ctx.restore();
    lookEyes(R * 0.35, R * 0.16, true, e.windup > 0 ? "rgba(239,68,68,0.8)" : null, R * 0.5);
    // lunge telegraph: a throbbing red lane locks where the rip will go
    if (e.windup > 0 && e.lungeDx !== undefined) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 30);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 4 + e.windup * 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(e.lungeDx * 260, e.lungeDy * 260);
      ctx.stroke();
      ctx.restore();
    }
  } else if (kind === "mender") {
    // Reef Mender — plump amber nurse-fish with a white cross, humming while it knits
    if (e.healFx > 0) {
      ctx.globalAlpha = Math.min(1, e.healFx * 2);
      ctx.strokeStyle = "#6ee7b7";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R + 8 + (0.6 - e.healFx) * 30, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    aura(R + 6, "rgba(251,191,36,0.7)", 3, 0.4, 2.5);
    ctx.save();
    ctx.rotate(ang);
    const mwag = Math.sin(t * 8 + ph) * R * 0.1;
    ctx.fillStyle = "#92400e";
    ctx.beginPath();
    ctx.moveTo(-R * 0.7, 0);
    ctx.lineTo(-R * 1.4, -R * 0.45 + mwag);
    ctx.lineTo(-R * 1.4, R * 0.45 + mwag);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.05, R * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#78350f";
    ctx.stroke();
    ctx.restore();
    // white cross badge
    const cxp = Math.cos(ang) * R * 0.1, cyp = Math.sin(ang) * R * 0.1;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillRect(cxp - 2, cyp - 6, 4, 12);
    ctx.fillRect(cxp - 6, cyp - 2, 12, 4);
    lookEyes(R * 0.3, R * 0.17, false, "rgba(251,191,36,0.5)", R * 0.35);
  } else {
    // reef-mite fry — a tiny pink baby fish, barely a bite
    ctx.save();
    ctx.rotate(ang);
    const wag = Math.sin(t * 12 + ph) * R * 0.12;
    ctx.fillStyle = "#be185d";
    ctx.beginPath();
    ctx.moveTo(-R * 0.7, 0);
    ctx.lineTo(-R * 1.5, -R * 0.5 + wag);
    ctx.lineTo(-R * 1.5, R * 0.5 + wag);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.05, R * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#831843";
    ctx.stroke();
    circle(R * 0.3, -R * 0.15, R * 0.2, "rgba(255,255,255,0.5)");
    ctx.restore();
    lookEyes(R * 0.28, Math.max(2.2, R * 0.2), false, null, R * 0.4);
  }
  // HD finish on every foe: top-light, depth shade, grain, scales, rim
  hdWash(R, e.id || 1);
  ctx.restore();
  // elemental status rims: burning foes smolder, chilled ones wear frost
  if (!e.dead && e.burnT > 0) {
    ctx.strokeStyle = "rgba(249,115,22," + (0.55 + 0.35 * Math.sin(G.time * 22 + ph)).toFixed(3) + ")";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 2.5, 0, TAU); ctx.stroke();
  }
  if (!e.dead && e.slowT > 0) {
    ctx.strokeStyle = "rgba(186,230,253," + (0.55 + 0.3 * Math.sin(G.time * 9 + ph)).toFixed(3) + ")";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 2.5, 0, TAU); ctx.stroke();
  }
  // second-phase ember ring: the duel has changed shape and so has the boss
  if (!e.dead && e.phase2 && (e.boss || e.superboss || e.hadal)) {
    ctx.strokeStyle = "rgba(240,171,252," + (0.5 + 0.35 * Math.sin(G.time * 10 + ph)).toFixed(3) + ")";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 11, 0, TAU); ctx.stroke();
  }
  // hp tide-arc for tough foes (bosses/tanks/clams/elites + anything chewed below max)
  if (e.boss || e.type === "tank" || e.type === "clam" || e.elite || (e.maxHp > 45 && e.hp < e.maxHp)) {    const fr = clamp(e.hp / e.maxHp, 0, 1);
    ctx.lineCap = "round";
    // dark trench under-arc
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(2,10,24,0.6)";
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 6, 0, TAU);
    ctx.stroke();
    // flowing water fill: cyan full, amber hurt, red critical
    const tide = fr > 0.5 ? "#67e8f9" : fr > 0.25 ? "#fbbf24" : "#ef4444";
    ctx.strokeStyle = tide;
    ctx.shadowColor = tide;
    ctx.shadowBlur = G.lowQ ? 0 : 8;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * fr);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // foam bead riding the leading edge
    if (fr > 0.02 && fr < 0.999) {
      const tipA = -Math.PI / 2 + TAU * fr;
      circle(e.x + Math.cos(tipA) * (e.r + 6), e.y + Math.sin(tipA) * (e.r + 6), 2.6, "#ecfeff");
    }
    ctx.lineCap = "butt";
  }
}

function drawChest(c) {
  const bob = Math.sin(c.t * 3) * 2;
  ctx.save();
  ctx.translate(c.x, c.y + bob);
  if (c.life < 5) ctx.globalAlpha = Math.sin(c.t * 10) > 0 ? 1 : 0.35;
  circle(0, 0, 26 + Math.sin(c.t * 3) * 3, "rgba(253,224,71,0.22)");
  // wooden body + lid: HD gradient + plank grain + lid sheen
  const wg = ctx.createLinearGradient(0, -15, 0, 18);
  wg.addColorStop(0, "#a16207");
  wg.addColorStop(0.5, "#7c4a21");
  wg.addColorStop(1, "#4a2a10");
  ctx.fillStyle = wg;
  ctx.strokeStyle = "#3f2410"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.rect(-20, -6, 40, 24); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.rect(-20, -15, 40, 12); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(61,36,12,0.6)";
  ctx.lineWidth = 1;
  for (let wi = 0; wi < 3; wi++) {
    const wy = -2 + wi * 7;
    ctx.beginPath(); ctx.moveTo(-18, wy);
    ctx.quadraticCurveTo(-6, wy + 2, 6, wy - 1);
    ctx.quadraticCurveTo(12, wy - 2, 18, wy);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,235,190,0.35)";
  ctx.beginPath(); ctx.moveTo(-18, -12); ctx.lineTo(18, -12); ctx.stroke();
  // gold bands + lock
  ctx.fillStyle = "#fbbf24";
  ctx.fillRect(-4, -15, 8, 33);
  ctx.fillStyle = "#fde047";
  ctx.beginPath(); ctx.arc(0, 1, 5, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#3f2410"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 1, 5, 0, TAU); ctx.stroke();
  ctx.fillStyle = "#3f2410";
  ctx.fillRect(-1.2, -1, 2.4, 5);
  ctx.restore();
}

function render() {
  const shx = G.shake > 0 ? rand(-G.shake, G.shake) : 0;
  const shy = G.shake > 0 ? rand(-G.shake, G.shake) : 0;
  ctx.save();
  ctx.translate(-Math.round(camX) + shx, -Math.round(camY) + shy);
  // kill-cam punch-in: brief zoom about screen center on elite/boss kills
  if (G.zoom > 1.001) {
    ctx.translate(camX + W / 2, camY + H / 2);
    ctx.scale(G.zoom, G.zoom);
    ctx.translate(-(camX + W / 2), -(camY + H / 2));
  }

  // bg: sunlit teal shallows melting into the abyss
  const grad = ctx.createLinearGradient(0, camY, 0, camY + H);
  grad.addColorStop(0, "#14638c");
  grad.addColorStop(0.5, "#0c4066");
  grad.addColorStop(1, "#072440");
  ctx.fillStyle = grad;
  ctx.fillRect(camX - 10, camY - 10, W + 20, H + 20);
  // depth: darker toward the map edges, richer pickings out there
  const dg = ctx.createRadialGradient(WORLD.w / 2, WORLD.h / 2, Math.min(WORLD.w, WORLD.h) * 0.28, WORLD.w / 2, WORLD.h / 2, Math.max(WORLD.w, WORLD.h) * 0.62);
  dg.addColorStop(0, "rgba(2,8,20,0)");
  dg.addColorStop(1, "rgba(2,8,20,0.42)");
  ctx.fillStyle = dg;
  ctx.fillRect(camX - 10, camY - 10, W + 20, H + 20);
  // depth grading: the water darkens and cools around you the deeper you swim
  const pDeep = depthAt(P.x, P.y);
  if (pDeep > 0.02 && G.state !== "menu") {
    ctx.fillStyle = "rgba(2,8,24," + (pDeep * 0.3).toFixed(3) + ")";
    ctx.fillRect(camX - 10, camY - 10, W + 20, H + 20);
  }
  // HD water shimmer: drifting caustic web tiled over the column
  if (!TEX.caustic) { TEX.caustic = causticTile(); TEX.causticPat = ctx.createPattern(TEX.caustic, "repeat"); }
  ctx.save();
  // caustics flare near explosions: flash energy brightens the shimmer
  ctx.globalAlpha = 0.8 + clamp((G.flashR || 0) / 260, 0, 1) * 0.5;
  ctx.fillStyle = TEX.causticPat;
  try { TEX.causticPat.setTransform(new DOMMatrix().translate(-camX * 0.15 - (G.time * 12) % 256, -camY * 0.1)); } catch (err) {}
  ctx.fillRect(camX - 10, camY - 10, W + 20, H + 20);
  ctx.restore();
  ctx.globalAlpha = 1;

  // seabed mottling: soft light-pools breathing with the current
  for (const b of G.blobs) {
    if (!onScreen(b.x, b.y, Math.max(b.rx, b.ry))) continue;
    ctx.globalAlpha = b.a * (0.8 + 0.2 * Math.sin(G.time * 0.6 + b.x * 0.01));
    ctx.fillStyle = b.c;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.rx, b.ry, b.rot, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // drifting caustic light bands
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const cxp = camX + ((i * 397 + G.time * (12 + i * 4)) % (W + 600)) - 300;
    const cyp = camY + H * (0.15 + i * 0.18);
    ctx.save();
    ctx.translate(cxp, cyp);
    ctx.rotate(0.5);
    ctx.globalAlpha = 0.085;
    ctx.fillStyle = "#bff3ff";
    ctx.beginPath();
    ctx.ellipse(0, 0, 210, 52 + i * 9, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.05;
    ctx.beginPath();
    ctx.ellipse(0, 0, 130, 22, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // grid (visible range only)
  ctx.strokeStyle = "rgba(125,249,255,0.055)";
  ctx.lineWidth = 1;
  const gs = 44;
  const gx0 = Math.floor(camX / gs) * gs, gx1 = camX + W;
  const gy0 = Math.floor(camY / gs) * gs, gy1 = camY + H;
  ctx.beginPath();
  for (let x = gx0; x <= gx1; x += gs) { ctx.moveTo(x, camY - 10); ctx.lineTo(x, gy1 + 10); }
  for (let y = gy0; y <= gy1; y += gs) { ctx.moveTo(camX - 10, y); ctx.lineTo(gx1 + 10, y); }
  ctx.stroke();

  // ambient: rising bubbles + drifting motes
  for (const a of G.ambient) {
    if (!onScreen(a.x, a.y, a.r + 10)) continue;
    if (a.bubble) {
      const wob = Math.sin(G.time * 2 + a.y * 0.02) * 3;
      ctx.globalAlpha = a.a;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#9be9ff";
      ctx.beginPath();
      ctx.arc(a.x + wob, a.y, a.r * 0.5, 0, TAU);
      ctx.stroke();
      // HD glass: inner depth shade on the lower curve
      ctx.globalAlpha = a.a * 0.5;
      ctx.strokeStyle = "rgba(2,60,90,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.x + wob, a.y, a.r * 0.38, 0.6, 2.2);
      ctx.stroke();
      ctx.globalAlpha = a.a * 0.9;
      circle(a.x + wob - a.r * 0.15, a.y - a.r * 0.15, Math.max(1, a.r * 0.12), "#e0faff");
    } else if (a.tw) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(G.time * 3 + a.seed));
      ctx.globalAlpha = a.a * tw;
      circle(a.x, a.y, a.r * 0.4, a.tint);
      ctx.globalAlpha = a.a * tw * 0.35;
      circle(a.x, a.y, a.r * 0.9, a.tint);
    } else {
      ctx.globalAlpha = a.a * 0.7;
      circle(a.x, a.y, a.r * 0.5, "#7dd3fc");
    }
  }
  ctx.globalAlpha = 1;

  // sandy seafloor patches first
  for (const d of G.decor) {
    if (d.kind !== "sand" || !onScreen(d.x, d.y, d.r + 40)) continue;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#0e2f4b";
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.r, d.r * 0.7, d.seed, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    circle(d.x - d.r * 0.3, d.y - d.r * 0.1, d.r * 0.12, "#174a6e");
    circle(d.x + d.r * 0.25, d.y + d.r * 0.15, d.r * 0.09, "#174a6e");
    if (d.specks) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#3f7ea6";
      for (const sp of d.specks) {
        ctx.beginPath();
        ctx.arc(d.x + sp.dx * d.r, d.y + sp.dy * d.r, sp.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#bff3ff";
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.1, d.y - d.r * 0.05, 2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // decorations: rocks, corals, weeds, shells
  for (const d of G.decor) {
    if (!onScreen(d.x, d.y, d.r + 40)) continue;
    if (d.kind === "rock") {
      circle(d.x, d.y, d.r, "#1d3a52");
      circle(d.x - d.r * 0.25, d.y - d.r * 0.3, d.r * 0.45, "#2c5a7c");
      circle(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.14, "rgba(224,250,255,0.5)");
      speckle(d.x, d.y, d.r, (d.x | 0) + (d.y | 0) * 7, 5, "#7fb2d9", "#0b2036");
    } else if (d.kind === "coral") {
      circle(d.x, d.y, d.r * 0.75, "#db2777");
      circle(d.x - d.r * 0.45, d.y - d.r * 0.3, d.r * 0.45, "#f472b6");
      circle(d.x + d.r * 0.45, d.y - d.r * 0.25, d.r * 0.4, "#fb7185");
      circle(d.x, d.y - d.r * 0.45, d.r * 0.3, "#fda4af");
      speckle(d.x, d.y - d.r * 0.2, d.r * 0.7, (d.x | 0) * 3 + (d.y | 0), 5, "#ffe4ec", "#9d174d");
    } else if (d.kind === "shell") {
      ctx.fillStyle = "#fcd9a8";
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 0.55, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#c98f4e";
      ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y - d.r * 0.5);
        ctx.lineTo(d.x + k * d.r * 0.35, d.y + d.r * 0.45);
        ctx.stroke();
      }
    } else {
      drawWeed(d);
    }
  }

  // world edge walls
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(34,211,238,0.45)";
  ctx.strokeRect(4, 4, WORLD.w - 8, WORLD.h - 8);
  // currents: soft-edged flow bands with glowing rails, haloed chevrons, streaks + drift motes
  for (const c of G.currents) {
    if (c.x > camX + W || c.x + c.w < camX || c.y > camY + H || c.y + c.h < camY) continue;
    const horiz = c.dx !== 0;
    const dir = horiz ? c.dx : c.dy;
    // soft body: gradient melts the band edges into the water
    let bg;
    if (horiz) bg = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    else bg = ctx.createLinearGradient(c.x, 0, c.x + c.w, 0);
    bg.addColorStop(0, "rgba(125,249,255,0)");
    bg.addColorStop(0.18, "rgba(125,249,255,0.09)");
    bg.addColorStop(0.5, "rgba(165,243,252,0.13)");
    bg.addColorStop(0.82, "rgba(125,249,255,0.09)");
    bg.addColorStop(1, "rgba(125,249,255,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    // glowing edge rails with current-driven dashes
    ctx.save();
    ctx.strokeStyle = "rgba(165,243,252,0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 22]);
    ctx.lineDashOffset = -(G.time * c.sp * dir * 0.8);
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(c.x, c.y + 2); ctx.lineTo(c.x + c.w, c.y + 2);
      ctx.moveTo(c.x, c.y + c.h - 2); ctx.lineTo(c.x + c.w, c.y + c.h - 2);
    } else {
      ctx.moveTo(c.x + 2, c.y); ctx.lineTo(c.x + 2, c.y + c.h);
      ctx.moveTo(c.x + c.w - 2, c.y); ctx.lineTo(c.x + c.w - 2, c.y + c.h);
    }
    ctx.stroke();
    ctx.restore();
    // chevrons: soft halo pass + bright core, riding the flow
    const off = (G.time * 60) % 60;
    const chevPath = () => {
      ctx.beginPath();
      if (horiz) {
        for (let x = c.x + (dir > 0 ? off : c.w - off); dir > 0 ? x < c.x + c.w : x > c.x; x += dir * 60) {
          const cx = clamp(x, c.x, c.x + c.w);
          ctx.moveTo(cx - dir * 6, c.y + 12); ctx.lineTo(cx + dir * 6, c.y + c.h / 2); ctx.lineTo(cx - dir * 6, c.y + c.h - 12);
        }
      } else {
        for (let y = c.y + (dir > 0 ? off : c.h - off); dir > 0 ? y < c.y + c.h : y > c.y; y += dir * 60) {
          const cy = clamp(y, c.y, c.y + c.h);
          ctx.moveTo(c.x + 12, cy - dir * 6); ctx.lineTo(c.x + c.w / 2, cy + dir * 6); ctx.lineTo(c.x + c.w - 12, cy - dir * 6);
        }
      }
    };
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    chevPath(); ctx.strokeStyle = "rgba(125,249,255,0.20)"; ctx.lineWidth = 7; ctx.stroke();
    chevPath(); ctx.strokeStyle = "rgba(224,254,255,0.85)"; ctx.lineWidth = 2; ctx.stroke();
    // fast flow streaks racing with the push
    for (let i = 0; i < 6; i++) {
      const span = (horiz ? c.w : c.h) + 120;
      const s = ((((i * 197 + c.x * 0.13 + c.y * 0.29 + G.time * c.sp * dir * 2.4) % span) + span) % span) - 60;
      const cross = ((((i * 331 + c.x + c.y * 2) % 1000) + 1000) % 1000) / 1000;
      let sx, sy, ex, ey;
      const len = 30 + (i % 3) * 14;
      if (horiz) { sx = c.x + s; sy = c.y + 8 + cross * Math.max(4, c.h - 16); ex = sx + dir * len; ey = sy; }
      else { sx = c.x + 8 + cross * Math.max(4, c.w - 16); sy = c.y + s; ex = sx; ey = sy + dir * len; }
      ctx.strokeStyle = "rgba(186,230,253,0.30)";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(G.time * 3 + i * 2.1);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // drift motes tumbling along with the flow
    for (let i = 0; i < 8; i++) {
      const span = (horiz ? c.w : c.h) + 40;
      const s = ((((i * 269 + c.x * 0.31 + c.y * 0.7 + G.time * c.sp * dir) % span) + span) % span) - 20;
      const cross = ((((i * 733 + c.x * 1.7 + c.y) % 1000) + 1000) % 1000) / 1000;
      const mx = horiz ? c.x + s : c.x + 6 + cross * Math.max(4, c.w - 12);
      const my = horiz ? c.y + 6 + cross * Math.max(4, c.h - 12) : c.y + s;
      ctx.globalAlpha = 0.35;
      circle(mx, my, 1.2 + (i % 3) * 0.7, i % 2 ? "#cffafe" : "#67e8f9");
    }
    ctx.globalAlpha = 1;
  }
  // whirlpools: breathing suction halo, foam collar, twin-pass spiral arms,
  // glowing throat + rising throat bubbles + orbiting debris + rim chevrons
  for (const w of G.whirls) {
    if (!onScreen(w.x, w.y, w.r + 20)) continue;
    const calmK = OPT.calm ? 0.5 : 1;
    // outer suction halo: soft cyan bloom breathing with the spin (skipped on ECO)
    if (!G.lowQ) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const breathe = 1 + 0.06 * Math.sin(G.time * 2.2 + w.x * 0.05);
      const halo = ctx.createRadialGradient(w.x, w.y, w.r * 0.3, w.x, w.y, w.r * 1.6 * breathe);
      halo.addColorStop(0, "rgba(34,211,238,0)");
      halo.addColorStop(0.55, "rgba(34,211,238," + (0.10 * calmK).toFixed(3) + ")");
      halo.addColorStop(1, "rgba(34,211,238,0)");
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 1.6 * breathe, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // funnel mouth: squashed dark ellipse at the throat
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.scale(1, 0.62);
    const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, w.r * 0.42);
    fg.addColorStop(0, "rgba(1,6,16,0.9)");
    fg.addColorStop(0.7, "rgba(3,20,36,0.6)");
    fg.addColorStop(1, "rgba(3,20,36,0)");
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(0, 0, w.r * 0.42, 0, TAU); ctx.fill();
    ctx.restore();
    // glowing throat ring: a teal rune circling the dark
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.scale(1, 0.62);
    ctx.strokeStyle = "rgba(45,212,191," + (0.55 * calmK).toFixed(2) + ")";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([20, 26]);
    ctx.lineDashOffset = -G.time * w.spin * 40;
    ctx.beginPath(); ctx.arc(0, 0, w.r * 0.34, 0, TAU); ctx.stroke();
    ctx.restore();
    // spiral arms: wide soft underlay + bright core
    ctx.lineCap = "round";
    for (let k = 0; k < 3; k++) {
      const rr = w.r * (0.35 + k * 0.25) * (0.9 + 0.1 * Math.sin(G.time * 2 + k));
      const a0 = G.time * w.spin * (1.2 + k * 0.3);
      ctx.strokeStyle = "rgba(103,232,249,0.14)";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(w.x, w.y, rr, a0, a0 + Math.PI * 1.4);
      ctx.stroke();
      ctx.strokeStyle = "rgba(207,250,254," + (0.5 - k * 0.1).toFixed(2) + ")";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, rr, a0, a0 + Math.PI * 1.4);
      ctx.stroke();
    }
    // debris caught in the spin: deterministic orbiters, faster nearer the throat
    for (let i = 0; i < 8; i++) {
      const rr = w.r * (0.3 + (i % 4) * 0.18);
      const a = G.time * w.spin * (2.2 - (i % 4) * 0.35) + i * 1.7 + w.x * 0.01;
      const dx = Math.cos(a) * rr, dy = Math.sin(a) * rr * 0.7;
      ctx.globalAlpha = 0.5;
      circle(w.x + dx, w.y + dy, 1.6 + (i % 3) * 0.8, i % 2 ? "#9be9ff" : "#5b7a8c");
    }
    ctx.globalAlpha = 1;
    // foam collar: a broken white ring riding the rim with the spin
    ctx.save();
    ctx.strokeStyle = "rgba(240,253,255,0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 18, 3, 22]);
    ctx.lineDashOffset = -G.time * w.spin * 60;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.99, 0, TAU); ctx.stroke();
    ctx.restore();
    // foam flecks: bright chips caught on the collar (skipped on ECO)
    if (!G.lowQ) {
      for (let i = 0; i < 10; i++) {
        const a = G.time * w.spin * 1.6 + i * TAU / 10 + w.y * 0.01;
        const fr = w.r * (0.96 + 0.05 * Math.sin(G.time * 3 + i * 2.3));
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(G.time * 4 + i * 1.9);
        circle(w.x + Math.cos(a) * fr, w.y + Math.sin(a) * fr * 0.78, 1.4 + (i % 3) * 0.7, "#ecfeff");
      }
      ctx.globalAlpha = 1;
    }
    // throat bubbles: wisps spiraling up out of the dark, fading as they climb
    for (let i = 0; i < 6; i++) {
      const cyc = (((G.time * 0.5 + i / 6) % 1) + 1) % 1; // 0 throat -> 1 rim
      const a = i * 2.4 + G.time * w.spin * 2.5;
      const br = w.r * (0.08 + cyc * 0.3);
      ctx.globalAlpha = (1 - cyc) * 0.6 * calmK;
      circle(w.x + Math.cos(a) * br, w.y + Math.sin(a) * br * 0.7 - cyc * 10, 1 + cyc * 1.6, "#a5f3fc");
    }
    ctx.globalAlpha = 1;
    // rim arrows: six chevrons riding the outer rim show the spin direction before you drift in
    ctx.fillStyle = "rgba(165,243,252,0.6)";
    for (let i = 0; i < 6; i++) {
      const a = G.time * w.spin * 1.2 + i * TAU / 6;
      const ax = w.x + Math.cos(a) * w.r * 1.05, ay = w.y + Math.sin(a) * w.r * 1.05;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a + (w.spin > 0 ? Math.PI / 2 : -Math.PI / 2));
      ctx.beginPath();
      ctx.moveTo(9, 0); ctx.lineTo(-5, -6); ctx.lineTo(-1, 0); ctx.lineTo(-5, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  // surf lanes: rideable highways with streaming chevrons + flow streaks
  for (const L of G.lanes) {
    if (L.y > camY + H || L.y + L.h < camY) continue;
    const lbg = ctx.createLinearGradient(0, L.y, 0, L.y + L.h);
    lbg.addColorStop(0, "rgba(125,211,252,0)");
    lbg.addColorStop(0.2, "rgba(125,211,252,0.08)");
    lbg.addColorStop(0.5, "rgba(165,243,252,0.11)");
    lbg.addColorStop(0.8, "rgba(125,211,252,0.08)");
    lbg.addColorStop(1, "rgba(125,211,252,0)");
    ctx.fillStyle = lbg;
    ctx.fillRect(0, L.y, WORLD.w, L.h);
    // glowing edge rails with traveling dashes: the lane reads before you're inside it
    ctx.save();
    ctx.strokeStyle = "rgba(165,243,252,0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 24]);
    ctx.lineDashOffset = -(G.time * L.sp * L.dir * 0.6);
    ctx.beginPath();
    ctx.moveTo(0, L.y + 2); ctx.lineTo(WORLD.w, L.y + 2);
    ctx.moveTo(0, L.y + L.h - 2); ctx.lineTo(WORLD.w, L.y + L.h - 2);
    ctx.stroke();
    ctx.restore();
    // fast flow streaks racing down-lane (deterministic, no state)
    ctx.strokeStyle = "rgba(186,230,253,0.28)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      const span = WORLD.w + 240;
      let sx = ((i * 397 + L.ph * 173 + G.time * L.sp * L.dir * 2.2) % span + span) % span - 120;
      const sy = L.y + ((i * 167 + L.ph * 61) % Math.max(20, L.h));
      const len = 34 + (i % 3) * 18;
      ctx.globalAlpha = 0.16 + 0.12 * Math.sin(G.time * 3 + i * 1.7);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + L.dir * len, sy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(125,211,252,0.35)";
    ctx.lineWidth = 2;
    const off = (G.time * L.sp + L.ph * 60) % 90;
    ctx.beginPath();
    for (let x = (L.dir > 0 ? off : WORLD.w - off); L.dir > 0 ? x < WORLD.w : x > 0; x += L.dir * 90) {
      ctx.moveTo(x - L.dir * 10, L.y + L.h / 2 - 14); ctx.lineTo(x + L.dir * 10, L.y + L.h / 2); ctx.lineTo(x - L.dir * 10, L.y + L.h / 2 + 14);
    }
    ctx.stroke();
  }
  // greed rings: golden gambles — riches inside, hunger inbound
  if (G.greed) {
    const gr = G.greed;
    if (!(gr.x > camX + W || gr.x < camX - gr.r * 2 || gr.y > camY + H || gr.y < camY - gr.r * 2)) {
      const pulse = 0.5 + 0.5 * Math.sin(G.time * 4);
      // pooled gold light
      const gg = ctx.createRadialGradient(gr.x, gr.y, gr.r * 0.15, gr.x, gr.y, gr.r * 1.25);
      gg.addColorStop(0, "rgba(253,224,71,0.16)");
      gg.addColorStop(0.7, "rgba(253,224,71,0.07)");
      gg.addColorStop(1, "rgba(253,224,71,0)");
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(gr.x, gr.y, gr.r * 1.25, 0, TAU); ctx.fill();
      // solid gold ring + counter-rotating dashed halo
      ctx.strokeStyle = "rgba(253,224,71," + (0.65 + pulse * 0.25).toFixed(2) + ")";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(gr.x, gr.y, gr.r, 0, TAU); ctx.stroke();
      ctx.save();
      ctx.strokeStyle = "rgba(254,243,199,0.55)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([26, 18]);
      ctx.lineDashOffset = G.time * 50;
      ctx.beginPath(); ctx.arc(gr.x, gr.y, gr.r + 11, 0, TAU); ctx.stroke();
      ctx.restore();
      // floating stakes: stacks + XP bonus + seconds left
      ctx.fillStyle = "#fde047";
      ctx.font = "900 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("×" + Math.floor(gr.stacks) + "  +" + Math.round(((G.greedXp || 1) - 1) * 100) + "% XP", gr.x, gr.y - gr.r - 12);
      ctx.fillStyle = "rgba(254,243,199,0.8)";
      ctx.font = "800 13px system-ui, sans-serif";
      ctx.fillText(Math.ceil(gr.t) + "s", gr.x, gr.y + gr.r + 20);
    }
  }
  // weaver webs: sticky spiral snares
  for (const wb of G.webs) {
    if (!onScreen(wb.x, wb.y, wb.r + 20)) continue;
    ctx.globalAlpha = clamp(wb.t / 2, 0.15, 0.7);
    ctx.strokeStyle = "#e9d5ff"; ctx.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(wb.x, wb.y, wb.r * (0.4 + k * 0.3), G.time * 0.6 + k, G.time * 0.6 + k + Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.5;
    circle(wb.x, wb.y, 5, "#a78bfa");
    ctx.globalAlpha = 1;
  }
  // powder kegs: wooden barrels with a burning fuse
  for (const k of G.barrels) {
    if (!onScreen(k.x, k.y, 30)) continue;
    const bob = Math.sin(k.t * 3) * 2;
    circle(k.x, k.y + bob, 15, "rgba(0,0,0,0.35)");
    circle(k.x, k.y + bob, 13, "#7c4a21");
    circle(k.x, k.y + bob, 9, "#a16207");
    ctx.strokeStyle = "#3f2a12"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(k.x - 13, k.y + bob - 5); ctx.lineTo(k.x + 13, k.y + bob - 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k.x - 13, k.y + bob + 5); ctx.lineTo(k.x + 13, k.y + bob + 5); ctx.stroke();
    circle(k.x, k.y + bob, 3, "#451a03");
    if (k.fuse >= 0 && Math.floor(k.t * 10) % 2 === 0) { circle(k.x, k.y + bob - 15, 5.5, "rgba(253,224,71,0.4)"); circle(k.x, k.y + bob - 15, 3, "#fde047"); }
  }
  // implosion urchins: dark violet traps with an inward hunger
  for (const u of G.urchins) {
    if (!onScreen(u.x, u.y, 30)) continue;
    const bob = Math.sin(u.t * 2.5) * 2;
    const armed = u.fuse >= 0;
    circle(u.x, u.y + bob, 15, "rgba(0,0,0,0.35)");
    ctx.strokeStyle = armed ? "#f0abfc" : "#0f766e"; ctx.lineWidth = 2.5;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + u.t * 0.4;
      ctx.beginPath();
      ctx.moveTo(u.x + Math.cos(a) * 8, u.y + bob + Math.sin(a) * 8);
      ctx.lineTo(u.x + Math.cos(a) * 16, u.y + bob + Math.sin(a) * 16);
      ctx.stroke();
    }
    circle(u.x, u.y + bob, 9, "#134e4a");
    const gl = armed ? (Math.sin(u.t * 20) > 0 ? 1 : 0.3) : (0.5 + 0.3 * Math.sin(u.t * 4));
    ctx.globalAlpha = gl;
    circle(u.x, u.y + bob, 5, armed ? "#f0abfc" : "#2dd4bf");
    ctx.globalAlpha = 1;
    if (armed) {
      ctx.strokeStyle = "rgba(240,171,252,0.55)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(u.x, u.y + bob, 22 - (u.t * 30) % 14, 0, TAU); ctx.stroke();
    }
  }
  // treasure clams
  for (const c of G.clams) {    if (c.open || !onScreen(c.x, c.y, 60)) continue;
    ctx.fillStyle = "#8a5a6b";
    ctx.beginPath(); ctx.arc(c.x, c.y - 6, c.r * 0.75, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#6e4453";
    ctx.beginPath(); ctx.arc(c.x, c.y + 6, c.r * 0.75, 0, Math.PI); ctx.fill();
    const gl = 0.6 + 0.4 * Math.sin(G.time * 3 + c.x);
    ctx.globalAlpha = gl;
    circle(c.x, c.y - 2, 6, "#fef3c7");
    ctx.globalAlpha = 1;
  }

  // gems — premium faceted crystals with halo + twinkle
  for (const g of G.gems) {
    if (!onScreen(g.x, g.y, 20)) continue;
    const bob = Math.sin(g.t * 5) * 2;
    const big = g.val >= 5;
    const s = (6 + Math.min(5, g.val)) * (1 + 0.12 * Math.sin(g.t * 5));
    ctx.save();
    ctx.translate(g.x, g.y + bob);
    // breathing halo so they're easy to spot
    ctx.globalAlpha = (big ? 0.4 : 0.22) + 0.08 * Math.sin(g.t * 5);
    circle(0, 0, s * (big ? 2.2 : 1.8), big ? "#67e8f9" : "#22d3ee");
    ctx.globalAlpha = 1;
    // diamond body: HD vertical gradient + cut-facet seams
    const gg = ctx.createLinearGradient(0, -s, s * 0.4, s);
    gg.addColorStop(0, "#cffafe");
    gg.addColorStop(0.4, "#38bdf8");
    gg.addColorStop(0.75, "#0284c7");
    gg.addColorStop(1, "#075985");
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.72, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.72, 0);
    ctx.closePath();
    ctx.fillStyle = gg; ctx.fill();
    ctx.strokeStyle = "rgba(224,250,255,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(0, s);
    ctx.moveTo(-s * 0.72, 0); ctx.lineTo(s * 0.72, 0);
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.72, 0); ctx.lineTo(0, s);
    ctx.stroke();
    // table glint
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(-s * 0.16, -s * 0.52); ctx.lineTo(-s * 0.02, -s * 0.3); ctx.lineTo(-s * 0.16, -s * 0.08); ctx.lineTo(-s * 0.3, -s * 0.3);
    ctx.closePath(); ctx.fill();
    if (big) circle(0, 0, s * 0.22, "#fefce8");
    // twinkle sparkle
    const sp = Math.sin(g.t * 2.3 + g.x * 0.7);
    if (sp > 0.72) {
      const r = s * (0.9 + 0.5 * sp);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, r);
      ctx.stroke();
    }
    ctx.restore();
  }

  // pearls
  for (const q of G.pearls) {
    if (!onScreen(q.x, q.y, 20)) continue;
    const bob = Math.sin(q.t * 5) * 2;
    circle(q.x, q.y + bob, 7, "rgba(253,230,138,0.35)");
    // HD pearl: spherical gradient + crest rim
    {
      const pg = ctx.createRadialGradient(q.x - 1.8, q.y + bob - 2, 0.5, q.x, q.y + bob, 5.2);
      pg.addColorStop(0, "#ffffff");
      pg.addColorStop(0.45, "#fef3c7");
      pg.addColorStop(1, "#c8922a");
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(q.x, q.y + bob, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(q.x, q.y + bob, 4.2, -2.6, -0.8); ctx.stroke();
    }
  }
  // hearts
  for (const h of G.hearts) {
    if (!onScreen(h.x, h.y, 30)) continue;
    const bob = Math.sin(h.t * 4) * 2;
    ctx.font = "20px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("❤", h.x, h.y + bob);
  }
  // elemental power-ups: glowing fire/frost orbs, blink when about to fizzle
  for (const u of G.pups) {
    if (!onScreen(u.x, u.y, 30)) continue;
    if (u.life < 3 && Math.floor(u.t * 6) % 2 === 0) continue;
    const D = POWERS[u.kind];
    const bob = Math.sin(u.t * 4) * 2.5;
    ctx.globalAlpha = 0.4 + 0.15 * Math.sin(u.t * 6);
    circle(u.x, u.y + bob, 16, D.color);
    ctx.globalAlpha = 1;
    // HD orb: deep glass gradient instead of a flat disc
    {
      const ug = ctx.createRadialGradient(u.x - 3, u.y + bob - 3, 1, u.x, u.y + bob, 11);
      ug.addColorStop(0, "#334155");
      ug.addColorStop(0.6, "rgba(10,18,36,0.9)");
      ug.addColorStop(1, "rgba(2,6,16,0.95)");
      ctx.fillStyle = ug;
      ctx.beginPath(); ctx.arc(u.x, u.y + bob, 11, 0, TAU); ctx.fill();
    }
    ctx.font = "17px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(D.icon, u.x, u.y + bob + 1);
  }

  // milestone chests
  for (const c of G.chests) {
    if (!onScreen(c.x, c.y, 30)) continue;
    drawChest(c);
  }

  // enemies
  for (const e of G.enemies) { if (onScreen(e.x, e.y, e.r + 30)) drawFoe(e); }
  // rift gate to the next leg
  drawGate();
  // hasted elites shed sparks
  for (const e of G.enemies) {
    if (e.affix === "hasted" && !e.dead && onScreen(e.x, e.y, 30) && Math.random() < 0.35 && G.parts.length < 240) {
      G.parts.push({ x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), vx: rand(-40, 40), vy: rand(-40, 40), r: rand(1.5, 3), color: "#fef08a", life: 0.35, t: 0, kind: "spark", grow: 0 });
    }
  }
  // ghost rival: your best dive swims beside you
  if (G.ghostPlay) {
    const gp = ghostPosAt(G.time);
    if (gp && onScreen(gp.x, gp.y, 40)) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#a5f3fc";
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, 20, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      circle(gp.x, gp.y, 9, "rgba(165,243,252,0.5)");
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
  // decoy bubble: shimmering twin with a lifetime arc
  if (G.decoy && onScreen(G.decoy.x, G.decoy.y, 60)) {
    const dc = G.decoy;
    const pulse = 0.5 + 0.2 * Math.sin(G.time * 8);
    ctx.globalAlpha = 0.35 + 0.45 * (dc.t / dc.max);
    circle(dc.x, dc.y, P.r * 0.9, "rgba(240,171,252," + pulse.toFixed(2) + ")");
    ctx.strokeStyle = "#f0abfc";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(dc.x, dc.y, P.r * 0.9, 0, TAU); ctx.stroke();
    circle(dc.x + 5, dc.y - 5, 4, "#fff");
    circle(dc.x + 6, dc.y - 5, 2, "#701a75");
    ctx.strokeStyle = "#f0abfc";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(dc.x, dc.y, P.r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * (dc.t / dc.max)); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // wandering merchant: golden clam in a trader's hat
  if (G.merchant && onScreen(G.merchant.x, G.merchant.y, 60)) {
    const m = G.merchant;
    const bob = Math.sin(m.t * 3) * 3;
    circle(m.x, m.y + bob, 30, "rgba(253,224,71,0.25)");
    circle(m.x, m.y + bob, 20, "#a16207");
    circle(m.x, m.y + bob, 15, "#fde047");
    // trader hat
    ctx.fillStyle = "#7c2d12";
    ctx.beginPath();
    ctx.moveTo(m.x - 16, m.y + bob - 12); ctx.lineTo(m.x + 16, m.y + bob - 12); ctx.lineTo(m.x, m.y + bob - 34);
    ctx.closePath(); ctx.fill();
    circle(m.x, m.y + bob - 34, 3, "#fde047");
    ctx.fillStyle = "#fffbeb";
    ctx.font = "900 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🧭 TRADE!", m.x, m.y + bob - 42);
  }
  // minnows
  for (const m of G.minnows) {
    if (!onScreen(m.x, m.y, 20)) continue;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.a);
    const wag = Math.sin(G.time * 10 + m.seed) * 0.3;
    ctx.fillStyle = "rgba(186,230,253,0.9)";
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(-6, 0); ctx.rotate(wag);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-5, -3); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#0c4a6e";
    ctx.beginPath(); ctx.arc(3, 0, 1, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // jellyfish: pulsing bells with trailing tentacles
  for (const j of G.jellies) {
    if (!onScreen(j.x, j.y, 70)) continue;
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 2.2 + j.seed);
    const r = j.r * (0.92 + pulse * 0.12);
    ctx.globalAlpha = 0.28;
    circle(j.x, j.y, r + 9, j.c);
    ctx.globalAlpha = 0.85;
    // tentacles first (behind the bell)
    ctx.strokeStyle = j.c;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    for (let k = -2; k <= 2; k++) {
      const sway = Math.sin(G.time * 2.6 + j.seed + k * 1.3) * 7;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(j.x + k * r * 0.22, j.y + r * 0.35);
      ctx.quadraticCurveTo(j.x + k * r * 0.3 + sway, j.y + r * 1.1, j.x + k * r * 0.34 + sway * 1.6, j.y + r * (1.7 + pulse * 0.25));
      ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    // bell dome
    circle(j.x, j.y, r, j.c);
    ctx.globalAlpha = 0.5;
    circle(j.x, j.y, r * 0.62, "#ffffff");
    ctx.globalAlpha = 0.9;
    circle(j.x - r * 0.22, j.y - r * 0.25, r * 0.2, "rgba(255,255,255,0.9)");
    // bell rim
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(j.x, j.y + r * 0.1, r * 0.92, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // passing fish schools: dark silhouettes cruising by
  for (const s of G.schools) {
    const fa = Math.atan2(s.dy, s.dx);
    for (let i = 0; i < s.n; i++) {
      const ox = ((i * 53.7 + s.seed * 91) % 90) - 45;
      const oy = ((i * 91.3 + s.seed * 57) % 56) - 28;
      const fx = s.x + Math.cos(fa) * ox - Math.sin(fa) * oy + Math.sin(G.time * 3 + i * 1.7 + s.seed) * 4;
      const fy = s.y + Math.sin(fa) * ox + Math.cos(fa) * oy;
      if (!onScreen(fx, fy, 16)) continue;
      const wag = Math.sin(G.time * 12 + i * 2.1 + s.seed) * 0.35;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(fa + Math.sin(G.time * 2 + i + s.seed) * 0.12);
      ctx.fillStyle = "rgba(10,30,48,0.88)";
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(-7, 0); ctx.rotate(wag);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-5, -3.2); ctx.lineTo(-5, 3.2); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "rgba(125,211,252,0.5)";
      ctx.beginPath(); ctx.arc(3.5, -0.8, 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // enemy bullets: hostile magenta DIAMONDS (dark outline + hot core) — a silhouette
  // your cyan/white bubbles never wear, so colorblind players read them too
  for (const b of G.ebullets) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#881337";
    ctx.fillRect(-b.r - 2.5, -b.r - 2.5, (b.r + 2.5) * 2, (b.r + 2.5) * 2);
    ctx.fillStyle = "#fb7185";
    ctx.fillRect(-b.r, -b.r, b.r * 2, b.r * 2);
    ctx.restore();
    circle(b.x, b.y, Math.max(1.5, b.r * 0.35), "#fff");
  }

  // player bullets
  for (const b of G.bullets) {
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(2, b.r * 0.9);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.045, b.y - b.vy * 0.045);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    circle(b.x, b.y, b.r + (b.crit ? 3 : 0), b.color);
    // HD bubble: halo + hot liquid core under the specular
    ctx.globalAlpha = 0.30;
    circle(b.x, b.y, b.r * 1.7, b.color);
    ctx.globalAlpha = 1;
    circle(b.x, b.y, Math.max(1.2, b.r * 0.4), "rgba(255,255,255,0.95)");
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.stroke();
    circle(b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.32, "rgba(255,255,255,0.85)");
  }

  // level-up light beam (behind player)
  drawBeam();
  // player — Bubbles the pufferfish
  if (G.state !== "over") {
    const spd = Math.hypot(P.mvx || 0, P.mvy || 0);
    const py = P.y + Math.sin(G.time * 3.2) * 2;
    const stretch = clamp(spd / P.speed, 0, 1) * 0.07 + Math.min(1.2, P.squash) * 0.10;
    ctx.save();
    ctx.translate(P.x, py);
    ctx.rotate(P.face);
    const _ms = morphStages();
    const MS = morphStyle(_ms);
    const MC = morphDisplay(_ms).color;
    ctx.scale((1 + stretch) * MS.elong, 1 - stretch * 0.7);
    const r = P.r;
    ctx.globalAlpha = 1;
    // morph halo aura
    if (P.morph !== "a0t0f0") {
      ctx.globalAlpha = 0.5 + 0.15 * Math.sin(G.time * 4);
      ctx.lineWidth = 2;
      ctx.strokeStyle = MC;
      ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // active power-up aura: fire/ice ring while boosted
    if (G.powerKind) {
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(G.time * 8);
      ctx.lineWidth = 3;
      ctx.strokeStyle = POWERS[G.powerKind].color;
      ctx.beginPath(); ctx.arc(0, 0, r + 14, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // bubble-cannon snout (heavier barrel on the gunner line)
    const snX = MS.cannon ? r + 7 : r + 6, snR = MS.cannon ? 6.5 : 5;
    ctx.fillStyle = MS.snout1;
    ctx.fillRect(r - 4, -4.5, 10, 9);
    ctx.fillStyle = MS.snout2;
    ctx.beginPath(); ctx.arc(snX, 0, snR, 0, TAU); ctx.fill();
    ctx.fillStyle = "#083344";
    ctx.beginPath(); ctx.arc(snX, 0, snR * 0.52, 0, TAU); ctx.fill();
    // tail fin (wags, larger on gliders and serpents)
    const wag = Math.sin(P.finPhase) * 0.45;
    ctx.fillStyle = MS.fin;
    ctx.save();
    ctx.translate(-r - 1, 0);
    ctx.rotate(wag);
    const tl = 11 * MS.tail, tw = 8 * MS.tail;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-tl, -tw); ctx.lineTo(-tl * 0.72, 0); ctx.lineTo(-tl, tw); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // side fins — or swept wings on the glider line
    const flap = 0.3 + Math.abs(Math.sin(P.finPhase * 1.3)) * (0.4 + clamp(spd / P.speed, 0, 1) * 0.8);
    ctx.fillStyle = MS.fin;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(-1, s * (r - 2));
      if (MS.wings) {
        ctx.rotate(s * (0.5 + flap * 0.5));
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-r * 1.5, s * (r + 10)); ctx.lineTo(-r * 0.4, s * r * 0.4); ctx.closePath();
        ctx.fill();
      } else {
        ctx.rotate(s * flap);
        ctx.beginPath();
        ctx.ellipse(-7, 0, 8, 4.5, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    // dorsal crest on serpents and the sovereign
    if (MS.crest) {
      ctx.fillStyle = MS.dark;
      ctx.beginPath();
      ctx.moveTo(-2, -r + 2); ctx.lineTo(r * 0.5, -r - 9); ctx.lineTo(r * 0.3, -r + 4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r + 3); ctx.lineTo(-r * 0.1, -r - 7); ctx.lineTo(r * 0.05, -r + 4);
      ctx.closePath(); ctx.fill();
    }
    // armored brow on the dreadnought
    if (MS.armor) {
      ctx.fillStyle = MS.dark;
      ctx.fillRect(-2, -r * 0.55, 12, 5);
      ctx.fillStyle = "#fde047";
      ctx.fillRect(-2, -r * 0.55, 12, 1.5);
    }
    // morph spikes (gold when the combo is hot)
    ctx.fillStyle = G.combo >= 10 && G.state !== "over" ? "#fbbf24" : MS.spike;
    for (let i = 0; i < MS.spikeN; i++) {
      const a = (i / MS.spikeN) * TAU + 0.3;
      if (Math.abs(a) < 0.5 || Math.abs(a - TAU) < 0.5 || Math.abs(a - Math.PI) < 0.45) continue;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.09) * (r - 4), Math.sin(a - 0.09) * (r - 4));
      ctx.lineTo(Math.cos(a) * (r + MS.spikeL), Math.sin(a) * (r + MS.spikeL));
      ctx.lineTo(Math.cos(a + 0.09) * (r - 4), Math.sin(a + 0.09) * (r - 4));
      ctx.closePath();
      ctx.fill();
    }
    // body
    circle(0, 0, r, MS.body);
    ctx.lineWidth = 3;
    ctx.strokeStyle = MS.dark;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    // belly + shine
    circle(1, 5, r * 0.55, "rgba(224,250,255,0.35)");
    circle(-r * 0.3, -r * 0.35, r * 0.3, "rgba(255,255,255,0.8)");
    // molten cracks on the cinder maw
    if (MS.cracks) {
      ctx.strokeStyle = "#fdba74";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      const cr = [[-6, -4, 0], [2, 6, 2.2], [-2, 8, 1.1]];
      for (const cc of cr) {
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(G.time * 6 + cc[2] * 3);
        ctx.beginPath(); ctx.arc(cc[0], cc[1], 4.5, cc[2], cc[2] + 2.1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // bioluminescent dots on the abyssal line
    if (MS.dots) {
      const dc = _ms.f === 1 ? "#f0abfc" : "#c4b5fd";
      ctx.globalAlpha = 0.6 + 0.35 * Math.sin(G.time * 3);
      circle(-6, -8, 1.8, dc); circle(4, -11, 1.4, dc); circle(-10, 2, 1.4, dc);
      circle(2, 10, 1.8, dc); circle(-3, 6, 1.2, "#fefce8");
      ctx.globalAlpha = 1;
    }
    // cheeks
    const alive = 1;
    ctx.globalAlpha = alive * (G.hurtFlash > 0.25 ? 0.9 : 0.5);
    circle(2, -r * 0.55, 3.4, "#f9a8d4");
    circle(2, r * 0.55, 3.4, "#f9a8d4");
    ctx.globalAlpha = alive;
    // big eyes that blink
    for (const s of [-1, 1]) {
      const ex = 4, ey = s * 6.5;
      if (P.blink > 0) {
        ctx.strokeStyle = "#06222b";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(ex - 3, ey); ctx.lineTo(ex + 3, ey); ctx.stroke();
      } else {
        circle(ex, ey, 5, "#fff");
        circle(ex + 1.5, ey, 2.5, "#06222b");
        circle(ex + 2.3, ey - 0.8, 0.9, "#fff");
      }
    }
    // expressions: sad brows when weak, brave brows for bosses
    const sad = P.hp < P.maxHp * 0.4;
    ctx.strokeStyle = "#06222b";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    if (sad) {
      ctx.beginPath(); ctx.moveTo(1, -8); ctx.lineTo(9, -12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, 8); ctx.lineTo(9, 12); ctx.stroke();
    } else if (G.bossAlive) {
      ctx.beginPath(); ctx.moveTo(1, -11.5); ctx.lineTo(9, -8.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, 11.5); ctx.lineTo(9, 8.5); ctx.stroke();
    }
    // mouth: smile, "O" when firing/hit, sawtooth grimace when weak
    if (P.mouth > 0 || G.hurtFlash > 0.25) {
      circle(r - 5, 0, 3.4, "#06222b");
    } else if (sad) {
      ctx.strokeStyle = "#06222b";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const px = r - 10 + (7 / 6) * i;
        const py = 1 + (i % 2 ? -1.8 : 1.8);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      // sweat drop of worry (drips faster when critical)
      const drip = Math.abs(Math.sin(G.time * (P.hp < P.maxHp * 0.2 ? 6 : 3)));
      ctx.fillStyle = "#7dd3ff";
      ctx.beginPath(); ctx.arc(-2, -r - 5 - drip * 2, 2.6, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2, -r - 8 - drip * 2);
      ctx.lineTo(-4.2, -r - 3.5 - drip * 2);
      ctx.lineTo(0.2, -r - 3.5 - drip * 2);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = "#06222b";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(r - 6, 1, 3, 0.4, Math.PI - 0.4); ctx.stroke();
    }
    // angler lure on the abyssal line
    if (MS.lure) {
      const sway = Math.sin(G.time * 2.2) * 3;
      ctx.strokeStyle = MS.dark;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(6, -r + 3); ctx.quadraticCurveTo(8, -r - 8, 10 + sway, -r - 12); ctx.stroke();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.time * 5);
      circle(10 + sway, -r - 13, 3.6, "#fefce8");
      circle(10 + sway, -r - 13, 2, _ms.f === 1 ? "#f0abfc" : "#a78bfa");
      ctx.globalAlpha = alive;
    }
    // sovereign crown
    if (MS.crown) {
      ctx.fillStyle = "#fde047";
      ctx.strokeStyle = "#a16207"; ctx.lineWidth = 1.2;
      for (const cx of [-6, 1, 8]) {
        ctx.beginPath();
        ctx.moveTo(cx - 3.5, -r + 2); ctx.lineTo(cx - 3.5, -r - 4);
        ctx.lineTo(cx, -r); ctx.lineTo(cx + 3.5, -r - 4); ctx.lineTo(cx + 3.5, -r + 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    // muzzle flash
    if (P.muzzle > 0) {
      ctx.globalAlpha = (P.muzzle / 0.07) * alive;
      circle(r + 10, 0, 9, "#fefce8");
      ctx.globalAlpha = alive;
    }
    // muzzle heat: sustained fire warms the snout from cyan to gold
    if ((P.heat || 0) > 0.15) {
      ctx.globalAlpha = Math.min(0.8, P.heat) * alive;
      circle(r + 10, 0, 6 + P.heat * 8, P.heat > 0.7 ? "rgba(253,224,71,0.85)" : "rgba(165,243,252,0.6)");
      ctx.globalAlpha = alive;
    }
    // combo crown: earned at a 20+ kill chain
    // HD finish: light, grain, scales and rim over the body (crown stays crisp)
    hdWash(r, 7, { hi: 0.20 });
    if (G.combo >= 20 && G.state !== "over") {
      const cw = 13, cy = -r - 5, ch = 9 + Math.sin(G.time * 5) * 1;
      ctx.fillStyle = "#fde047";
      ctx.strokeStyle = "#a16207"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-cw / 2, cy); ctx.lineTo(-cw / 2, cy - ch);
      ctx.lineTo(-cw / 4, cy - ch + 4); ctx.lineTo(0, cy - ch - 1);
      ctx.lineTo(cw / 4, cy - ch + 4); ctx.lineTo(cw / 2, cy - ch);
      ctx.lineTo(cw / 2, cy); ctx.closePath();
      ctx.fill(); ctx.stroke();
      circle(0, cy - ch - 1, 1.8, "#f43f5e");
      circle(-cw / 4, cy - ch + 4, 1.3, "#22d3ee");
      circle(cw / 4, cy - ch + 4, 1.3, "#22d3ee");
    }
    ctx.restore();
    // brief shield bubble while invulnerable after a hit (no more strobe)
    if (P.iframes > 0 && G.state !== "over") {
      const sa = clamp(P.iframes / 0.7, 0, 1);
      ctx.globalAlpha = 0.22 * sa;
      ctx.fillStyle = "#e0faff";
      ctx.beginPath(); ctx.arc(P.x, py, P.r + 12, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.75 * sa;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#e0faff";
      ctx.beginPath(); ctx.arc(P.x, py, P.r + 12 + Math.sin(G.time * 18) * 2, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // faint magnet ring
    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#22d3ee";
    ctx.beginPath();
    ctx.arc(P.x, py, P.magnet, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // particles: sparks + lingering dust puffs + plankton motes + marine snow
  for (const p of G.parts) {
    const pa = 1 - p.t / p.life;
    if (p.kind === "dust") {
      ctx.globalAlpha = pa * 0.45;
      circle(p.x, p.y, p.r, p.color);
      ctx.globalAlpha = pa * 0.25;
      circle(p.x, p.y, p.r * 1.7, p.color);
    } else if (p.kind === "bubble") {
      ctx.globalAlpha = pa * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = pa;
      circle(p.x - p.r * 0.3, p.y - p.r * 0.3, Math.max(1, p.r * 0.35), "#e0faff");
    } else if (p.kind === "mote") {
      // bioluminescent plankton: breathes as it drifts
      const tw = 0.5 + 0.5 * Math.sin(G.time * 6 + (p.seed || 0));
      ctx.globalAlpha = pa * (0.35 + 0.65 * tw);
      circle(p.x, p.y, p.r, p.color);
      ctx.globalAlpha = pa * tw * 0.4;
      circle(p.x, p.y, p.r * 2.2, p.color);
    } else if (p.kind === "snow") {
      ctx.globalAlpha = pa * 0.55;
      circle(p.x, p.y, p.r, p.color);
    } else {
      ctx.globalAlpha = pa;
      circle(p.x, p.y, p.r, p.color);
    }
  }
  ctx.globalAlpha = 1;
  // spawn portals: ink swirls where foes tear into the reef
  for (const q of G.portals) {
    if (!onScreen(q.x, q.y, q.r + 40)) continue;
    const k = q.t / q.life; // 0 fresh → 1 gone
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.strokeStyle = q.color;
    ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(q.x, q.y, Math.max(2, q.r * (1.25 - k)), G.time * (3 + i * 2) * q.spin + i * 2.4, G.time * (3 + i * 2) * q.spin + i * 2.4 + Math.PI * (1.6 - k));
      ctx.stroke();
    }
    ctx.globalAlpha = (1 - k) * 0.5;
    circle(q.x, q.y, Math.max(1, q.r * (0.8 - k * 0.5)), "#06283d");
    ctx.globalAlpha = (1 - k) * 0.9;
    circle(q.x, q.y, Math.max(1, q.r * 0.16 * (1 - k) + 1), "#e0faff");
  }
  ctx.globalAlpha = 1;
  // soul wisps: the slain drift home to you as living light
  for (const w of G.wisps) {
    const pa = 1 - w.t / w.life;
    ctx.globalAlpha = pa;
    circle(w.x, w.y, 4.5, "rgba(165,243,252,0.35)");
    circle(w.x, w.y, 2.6, "#cffafe");
    circle(w.x - 0.8, w.y - 0.8, 1, "#fff");
  }
  ctx.globalAlpha = 1;
  // shockwave rings
  for (const r of G.rings) {
    ctx.globalAlpha = (1 - r.t / r.life) * 0.8;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // remora companion: your little follower
  if (G.remora && G.state !== "menu") {
    const R = G.remora, bob = Math.sin(G.time * 6) * 2;
    ctx.save();
    ctx.translate(R.x, R.y + bob);
    ctx.rotate(Math.atan2(P.y - R.y, P.x - R.x));
    ctx.fillStyle = "#0e7490";
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-13, -6); ctx.lineTo(-13, 6); ctx.closePath(); ctx.fill();
    circle(0, 0, 9, "#22d3ee");
    hdWash(9, 3, { hi: 0.2 });
    circle(4, -2, 1.6, "#083344");
    circle(4.5, -2.5, 0.7, "#e0faff");
    ctx.restore();
    ctx.font = "9px system-ui"; ctx.textAlign = "center";
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText("Lv" + R.lvl, R.x, R.y - 14 + bob);
  }
  // cosmetic hats: pure vanity, drawn screen-aligned above your head
  if (META.cos && META.cos.hat && META.cos.hat !== "none" && G.state !== "menu" && G.state !== "over") {
    const hx = P.x, hy = P.y - P.r - 8 + Math.sin(G.time * 3.2) * 2;
    if (META.cos.hat === "halo") {
      ctx.strokeStyle = "#fde047"; ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(G.time * 4);
      ctx.beginPath(); ctx.ellipse(hx, hy - 6, 14, 5, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (META.cos.hat === "party") {
      ctx.fillStyle = "#f0abfc";
      ctx.beginPath(); ctx.moveTo(hx - 8, hy); ctx.lineTo(hx, hy - 20); ctx.lineTo(hx + 8, hy); ctx.closePath(); ctx.fill();
      circle(hx, hy - 21, 3.5, "#fefce8");
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.moveTo(hx - 4, hy - 8); ctx.lineTo(hx, hy - 8); ctx.lineTo(hx + 4, hy); ctx.lineTo(hx, hy); ctx.closePath(); ctx.fill();
    } else if (META.cos.hat === "sailor") {
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath(); ctx.ellipse(hx, hy - 4, 11, 6, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#0ea5e9";
      ctx.fillRect(hx - 13, hy - 6, 26, 3);
    }
  }
  // texts
  ctx.textAlign = "center";
  for (const t of G.texts) {
    if (!onScreen(t.x, t.y, 60)) continue;
    ctx.globalAlpha = clamp(t.life / 0.5, 0, 1);
    ctx.font = "800 " + t.size + "px system-ui";
    ctx.fillStyle = t.color;
    ctx.fillText(t.str, t.x, t.y);
  }
  // damage numbers: pop off fast so big builds read as a satisfying spray
  for (const n of G.dnums) {
    if (!onScreen(n.x, n.y, 60)) continue;
    ctx.globalAlpha = clamp(n.life / n.max, 0, 1);
    ctx.font = "900 " + n.size + "px system-ui";
    ctx.fillStyle = n.col;
    ctx.fillText(n.str, n.x, n.y);
  }
  ctx.globalAlpha = 1;
  // living dark: the reef has a light level — your fish carries a pool of light,
  // and everything beyond it sinks toward black (explosions bloom back through it)
  const darkK = clamp(G.dark || 0, 0, 1);
  if (darkK > 0.01 && G.state !== "menu") {
    const lr = 400 + (G.flashR || 0);
    const dk = ctx.createRadialGradient(P.x, P.y, lr * 0.22, P.x, P.y, lr);
    dk.addColorStop(0, "rgba(1,4,12,0)");
    dk.addColorStop(0.6, "rgba(1,4,12," + (darkK * 0.5).toFixed(3) + ")");
    dk.addColorStop(1, "rgba(1,4,12," + (darkK * 0.75).toFixed(3) + ")");
    ctx.fillStyle = dk;
    ctx.fillRect(camX - 10, camY - 10, W + 20, H + 20);
  }
  // transient combat lights: explosions and novas bloom on the water
  if (G.lights.length) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const l of G.lights) {
      if (!onScreen(l.x, l.y, l.r + 40)) continue;
      const k = clamp(l.t / l.max, 0, 1);
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * (1.2 - 0.4 * k));
      g.addColorStop(0, "rgba(" + l.color + "," + (0.35 * k).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + l.color + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
  drawWaterFX();
  drawMinimap();
}

// ---------- HUD ----------
let hudAcc = 0;
function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ":" + String(ss).padStart(2, "0");
}
function hudTick(dt) {
  hudAcc += dt;
  if (hudAcc < 0.1) return;
  hudAcc = 0;
  updateHud();
  updateStreak();
  updateComboMeter();
}
function updateHud(force) {
  if (!force && G.state !== "play") return;
  xpFill.style.width = clamp((P.xp / P.xpNeed) * 100, 0, 100) + "%";
  hpFill.style.width = clamp((P.hp / P.maxHp) * 100, 0, 100) + "%";
  hpFill.style.background = P.hp / P.maxHp > 0.5 ? "linear-gradient(180deg,#d1fae5 0%,#34d399 35%,#059669 100%)" : P.hp / P.maxHp > 0.25 ? "linear-gradient(180deg,#fef3c7 0%,#fbbf24 35%,#c2410c 100%)" : "linear-gradient(180deg,#fecaca 0%,#ef4444 35%,#991b1b 100%)";
  document.getElementById("hpBar").classList.toggle("low", P.hp / P.maxHp <= 0.25);
  lvlBadge.textContent = "LV " + P.lvl;
  const mb = document.getElementById("morphBadge");
  if (mb && P.morph) {
    const D = morphDisplay();
    if (mb.textContent !== D.icon) mb.textContent = D.icon;
    if (mb.title !== D.name) mb.title = D.name;
    mb.style.color = D.color;
    mb.style.borderColor = D.color;
  }
  const rb = document.getElementById("relicBadge");
  if (rb) {
    if (G.relic) { rb.hidden = false; if (rb.textContent !== G.relic.icon) rb.textContent = G.relic.icon; const rt = G.relic.name + " — " + G.relic.boon + " / " + G.relic.bane; if (rb.title !== rt) rb.title = rt; }
    else rb.hidden = true;
  }
  hudStats.textContent = (G.daily ? "DAILY " : G.weekly ? "WEEKLY " : diffDef(G.diff).icon + " " + diffDef(G.diff).name + " • ") + (G.lowQ ? "ECO " : "") + (G.mutName ? G.mutName + " • " : "") + "WAVE " + G.wave + "  •  " + fmtTime(G.time) + "  •  " + G.kills + " pops • ● " + G.runPearls;
  const dashBtn = document.getElementById("dashBtn");
  if (dashBtn) dashBtn.classList.toggle("cool", P.dashCD > 0);
  const magBtn = document.getElementById("magnetBtn");
  if (magBtn) magBtn.classList.toggle("cool", G.magPulseCD > 0);
  // active ability buttons: hidden until learnt, countdown while cooling
  const abilBtn = (id, have, cd) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !have;
    if (have) {
      el.classList.toggle("cool", cd > 0);
      el.innerHTML = cd > 0 ? Math.ceil(cd) : el.dataset.icon;
    }
  };
  abilBtn("novaBtn", P.abil.nova > 0, G.cdNova);
  abilBtn("freezeBtn", P.abil.freeze > 0, G.cdFreeze);
  abilBtn("decoyBtn", P.abil.decoy > 0, G.cdDecoy);
  // combo finisher button: lights up at 20+, counts down after firing
  const fin = document.getElementById("finBtn");
  if (fin) {
    fin.hidden = !(G.combo >= 20 || G.cdFin > 0);
    fin.classList.toggle("cool", G.cdFin > 0);
    fin.innerHTML = G.cdFin > 0 ? Math.ceil(G.cdFin) : "×" + G.combo;
  }
  // elemental power-up chip: icon + seconds left while boosted
  const pb = document.getElementById("powerBadge");
  if (pb) {
    pb.hidden = !G.powerKind;
    if (G.powerKind) {
      const D = POWERS[G.powerKind];
      const txt = D.icon + " " + Math.ceil(G.powerT) + "s";
      if (pb.textContent !== txt) pb.textContent = txt;
      pb.style.color = D.color;
      pb.style.borderColor = D.color;
    }
  }
  // map objective tracker: icon + name + progress/countdown
  const ol = document.getElementById("objLine");
  if (ol) {
    if (!G.obj) ol.hidden = true;
    else {
      ol.hidden = false;
      const def = OBJS.find((o) => o.id === G.obj.id);
      let prog = "";
      if (G.obj.id === "exterm") prog = Math.min(def.need, G.kills - G.obj.have) + "/" + def.need;
      else if (G.obj.id === "hunt") prog = (ACH.stat.elite || 0) - G.obj.have >= 1 ? "1/1" : "0/1";
      else prog = Math.ceil(G.obj.t) + "s";
      const txt = def.icon + " " + def.name + " " + prog + " • " + Math.ceil(G.obj.t) + "s";
      if (ol.textContent !== txt) ol.textContent = txt;
    }
  }
  // greed tracker: live stacks + bonus while the ring is up
  const gl = document.getElementById("greedLine");
  if (gl) {
    if (!G.greed || G.greed.stacks < 1) gl.hidden = true;
    else {
      gl.hidden = false;
      const gtxt = "◉ GREED ×" + Math.floor(G.greed.stacks) + " +" + Math.round(((G.greedXp || 1) - 1) * 100) + "%";
      if (gl.textContent !== gtxt) gl.textContent = gtxt;
    }
  }
  // synergy line: live list of unlocked hybrid bonuses
  const syn = document.getElementById("synLine");
  if (syn) {
    const list = synList();
    syn.hidden = !list.length;
    const html = list.map((s) => `<span title="${s.name}: ${s.desc}">${s.icon}</span>`).join(" ");
    if (syn.innerHTML !== html) syn.innerHTML = html;
  }
  // stage line: current generated stage + its twist
  const sl = document.getElementById("stageLine");
  if (sl) {
    if (!G.stage) sl.hidden = true;
    else {
      sl.hidden = false;
      const txt = "◈ " + G.stage.n + " · " + G.stage.name + " " + G.stage.twist.icon;
      if (sl.textContent !== txt) sl.textContent = txt;
      const tt = "STAGE " + G.stage.n + " — " + G.stage.name + " • " + G.stage.twist.name + ": " + G.stage.twist.desc;
      if (sl.title !== tt) sl.title = tt;
    }
  }
}

// ---------- side combo meter: count + tier + time-left bar ----------
function updateComboMeter() {
  const m = document.getElementById("comboMeter");
  if (!m) return;
  const active = (G.state === "play" || G.state === "pause") && G.combo >= 2;
  m.hidden = !active;
  if (!active) return;
  const cnt = document.getElementById("comboCount");
  const txt = "×" + G.combo;
  if (cnt.textContent !== txt) {
    cnt.textContent = txt;
    cnt.classList.remove("pop");
    void cnt.offsetWidth;
    cnt.classList.add("pop");
  }
  const hot = G.combo >= 20, warm = G.combo >= 10;
  m.classList.toggle("warm", warm && !hot);
  m.classList.toggle("hot", hot);
  document.getElementById("comboTier").textContent = hot ? "NOVA READY" : warm ? "RAGING" : "CHAIN";
  const frac = clamp(G.comboT / (G.comboWin || 2.5), 0, 1);
  document.querySelector("#comboBar i").style.height = (frac * 100) + "%";
  m.classList.toggle("urgent", G.comboT < 0.7);
}
function updateStreak() {
  const el = document.getElementById("streakBanner");
  if (!el) return;  let txt = null;
  if (G.announce) txt = G.announce;
  if (!txt) { el.hidden = true; return; }
  // tiered kill-streak looks: class ramps bubbles → surge → sparks → blaze → vortex → wrath
  const cls = "streakT" + ((G.announceTier == null || G.announceTier < 0) ? "H" : Math.min(5, G.announceTier));
  if (el.textContent !== txt || el.dataset.tier !== cls) {
    el.textContent = txt;
    el.dataset.tier = cls;
    el.className = cls;
    el.hidden = false;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  } else if (el.hidden) el.hidden = false;
}

function showLevelBanner() {
  levelBanner.hidden = false;
  levelBanner.style.animation = "none";
  void levelBanner.offsetWidth;
  levelBanner.style.animation = "";
  clearTimeout(showLevelBanner.t);
  showLevelBanner.t = setTimeout(() => { levelBanner.hidden = true; }, 1900);
}

// boss cinematics: letterbox bars close in and a name card slams down (game keeps running)
function playCine(name, sub) {
  const top = document.getElementById("cineTop"), bot = document.getElementById("cineBot"), card = document.getElementById("cineTitle");
  if (!top || !bot || !card) return;
  document.getElementById("cineName").textContent = name;
  document.getElementById("cineSub").textContent = sub || "";
  top.hidden = false; bot.hidden = false; card.hidden = false;
  // reflow + timer (not rAF: background tabs pause rAF and would stall the show)
  void top.offsetHeight;
  setTimeout(() => { top.classList.add("on"); bot.classList.add("on"); card.classList.add("on"); }, 30);
  clearTimeout(playCine.t); clearTimeout(playCine.t2);
  playCine.t = setTimeout(() => { top.classList.remove("on"); bot.classList.remove("on"); card.classList.remove("on"); playCine.t2 = setTimeout(() => { top.hidden = true; bot.hidden = true; card.hidden = true; }, 600); }, 2900);
}
// skippable cinematics: a tap / Space / Esc during the boss pan ends it at once
// (the same touch also starts the joystick, so one tap skips AND takes control)
function skipCine() {
  if (!(G.focusT > 0)) return false;
  G.focusT = 0; G.focusHold = 0;
  P.iframes = Math.max(P.iframes, 1.0);
  clearTimeout(playCine.t); clearTimeout(playCine.t2);
  const top = document.getElementById("cineTop"), bot = document.getElementById("cineBot"), card = document.getElementById("cineTitle");
  if (top) { top.classList.remove("on"); top.hidden = true; }
  if (bot) { bot.classList.remove("on"); bot.hidden = true; }
  if (card) { card.classList.remove("on"); card.hidden = true; }
  return true;
}
function setAnnounce(text, tier) {  G.announce = text;
  G.announceTier = (tier == null ? -1 : tier);
  // hotter streaks hang around a beat longer and herald in at a higher pitch
  const heat = Math.max(0, G.announceTier);
  G.announceT = 1.8 + heat * 0.15;
  const base = 660 + heat * 90;
  tone(base, 0.09, "square", 0.07);
  setTimeout(() => tone(base * 1.33, 0.09, "square", 0.07), 90);
  setTimeout(() => tone(base * 2, 0.16, "square", 0.07), 180);
}

// banner queue: events line up instead of wiping/overlapping each other.
// Urgent banners (bosses, warnings, revives, the rift) jump to the front.
const BANNER_Q = [];
let bannerBusy = false;
function showBanner(text, opts) {
  const item = { text };
  if (opts && opts.urgent) BANNER_Q.unshift(item);
  else { BANNER_Q.push(item); if (BANNER_Q.length > 3) BANNER_Q.splice(0, BANNER_Q.length - 3); }
  pumpBanner();
}
function pumpBanner() {
  if (bannerBusy) return;
  const n = BANNER_Q.shift();
  if (!n) return;
  bannerBusy = true;
  waveBanner.textContent = n.text;
  waveBanner.hidden = false;
  waveBanner.style.animation = "none";
  void waveBanner.offsetWidth;
  waveBanner.style.animation = "";
  clearTimeout(pumpBanner.t);
  pumpBanner.t = setTimeout(() => { waveBanner.hidden = true; bannerBusy = false; pumpBanner(); }, 1700);
}

// rift gate: the way forward after an epic — swim in and the next leg begins at once
function enterGate() {
  if (!G.gate) return;
  const g = G.gate;
  G.gate = null; G.gateHold = false;
  burst(g.x, g.y, "#c084fc", 40, 340, 14);
  burst(g.x, g.y, "#f0abfc", 24, 220, 10);
  pushRing(g.x, g.y, 200, "#d946ef", 5);
  pushRing(g.x, g.y, 120, "#f5d0fe", 3);
  spawnPearls(g.x, g.y, 3);
  tone(520, 0.4, "triangle", 0.12, 1040);
  setTimeout(() => tone(780, 0.4, "triangle", 0.12, 1560), 150);
  G.time = G.wave * WAVE_LEN; // next tick rolls the next wave
  updateHud(true);
}

// rift gate render: a beckoning purple portal where the epic fell
function drawGate() {
  const g = G.gate;
  if (!g || !onScreen(g.x, g.y, 150)) return;
  const t = G.time;
  // bloom-in: easeOutBack pop over the first half-second (clamped: ease starts at 0)
  const c = Math.min(1, g.t / 0.45), cd = c - 1;
  const pop = Math.max(0.06, 1 + 2.70158 * cd * cd * cd + 1.70158 * cd * cd);
  const R = g.r * pop;
  const breathe = 0.9 + 0.1 * Math.sin(t * 3.2);
  ctx.save();
  // violet ambience bleeding into the water
  let halo = ctx.createRadialGradient(g.x, g.y, R * 0.4, g.x, g.y, R * 2.6);
  halo.addColorStop(0, "rgba(168,85,247," + (0.35 * breathe).toFixed(3) + ")");
  halo.addColorStop(0.55, "rgba(126,34,206," + (0.16 * breathe).toFixed(3) + ")");
  halo.addColorStop(1, "rgba(88,28,135,0)");
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(g.x, g.y, Math.max(1, R * 2.6), 0, TAU); ctx.fill();
  ctx.restore();
  if (R < 16) return; // still blooming: glow only until the rings have real radii
  ctx.save();
  // light spilling onto the seabed below
  ctx.globalAlpha = 0.20 * breathe;
  ctx.fillStyle = "#a855f7";
  ctx.beginPath(); ctx.ellipse(g.x, g.y + R * 1.15, R * 1.5, R * 0.42, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(g.x, g.y);
  // outer rune ring (slow forward) + tick runes (counter-drift)
  ctx.save();
  ctx.rotate(t * 0.9);
  ctx.strokeStyle = "rgba(192,132,252,0.95)";
  ctx.lineWidth = 5;
  ctx.setLineDash([30, 22]);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  ctx.save();
  ctx.rotate(-t * 0.55);
  ctx.fillStyle = "rgba(240,171,252,0.9)";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    circle(Math.cos(a) * (R - 6), Math.sin(a) * (R - 6), 2.6, "rgba(240,171,252,0.9)");
  }
  ctx.restore();
  // mid ring: magenta, counter-rotating dashes
  ctx.save();
  ctx.rotate(-t * 1.7);
  ctx.strokeStyle = "rgba(232,121,249,0.9)";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 16]);
  ctx.beginPath(); ctx.arc(0, 0, R - 14, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // event horizon: deep violet void, taller than wide
  const ex = R * 0.62, ey = R * 0.98;
  let void_ = ctx.createLinearGradient(0, -ey, 0, ey);
  void_.addColorStop(0, "#4c1d95");
  void_.addColorStop(0.5, "#150826");
  void_.addColorStop(1, "#020108");
  ctx.fillStyle = void_;
  ctx.beginPath(); ctx.ellipse(0, 0, ex, ey, 0, 0, TAU); ctx.fill();
  // swirling arms inside the void
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, 0, ex, ey, 0, 0, TAU); ctx.clip();
  for (let arm = 0; arm < 3; arm++) {
    const off = t * (1.4 + arm * 0.35) + arm * 2.1;
    ctx.strokeStyle = arm === 0 ? "rgba(240,171,252,0.55)" : "rgba(168,85,247,0.5)";
    ctx.lineWidth = arm === 0 ? 3 : 2;
    ctx.beginPath();
    for (let k = 0; k <= 20; k++) {
      const f = k / 20;
      const a = off + f * 4.2;
      const rr = ex * (0.12 + 0.8 * f);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr * (ey / ex);
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  // bubbles rising through the void
  for (let i = 0; i < 3; i++) {
    const f = (t * (0.35 + i * 0.09) + i * 0.27) % 1;
    const bx = Math.sin(i * 2.4 + t * 1.8) * ex * 0.55;
    const by = ey * (0.85 - 1.7 * f);
    const br = 1.5 + 3.5 * f;
    ctx.globalAlpha = 0.6 * (1 - f * 0.6);
    ctx.strokeStyle = "#f5d0fe";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.9;
    circle(bx - br * 0.3, by - br * 0.3, Math.max(0.8, br * 0.32), "#ffffff");
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // glowing rim around the horizon
  ctx.save();
  ctx.shadowColor = "#d946ef";
  ctx.shadowBlur = G.lowQ ? 0 : 22;
  ctx.strokeStyle = "rgba(240,171,252,0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(0, 0, ex, ey, 0, 0, TAU); ctx.stroke();
  ctx.restore();
  // crest glint
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, ex - 2, ey - 2, 0, -2.4, -1.2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  // bubbling: glass bubbles stream up past the portal + violet fizz at the rim
  if (G.parts.length < 240) {
    if (Math.random() < 0.35) {
      const a = rand(0, TAU), rr = rand(4, R * 0.7);
      G.parts.push({ x: g.x + Math.cos(a) * rr, y: g.y + R * (0.9 + Math.random() * 0.4), vx: rand(-14, 14) + Math.sin(t * 3 + a) * 12, vy: rand(-130, -80), r: rand(1.5, 3.5), color: "#e9d5ff", life: rand(0.6, 1.0), t: 0, kind: "bubble", grow: 0.6 });
    }
    if (Math.random() < 0.5) {
      const a = rand(0, TAU);
      G.parts.push({ x: g.x + Math.cos(a) * R, y: g.y + Math.sin(a) * R, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40 - 30, r: rand(1.5, 3), color: Math.random() < 0.5 ? "#c084fc" : "#f0abfc", life: 0.5, t: 0, kind: "spark", grow: 0 });
    }
  }
}

function drawMinimap() {
  const sx = MS / WORLD.w, sy = MS / WORLD.h;
  mctx.clearRect(0, 0, MS, MS);
  mctx.fillStyle = "rgba(8,13,28,0.9)";
  mctx.fillRect(0, 0, MS, MS);
  mctx.fillStyle = "#a5f3fc";
  for (const g of G.gems) mctx.fillRect(g.x * sx - 1.5, g.y * sy - 1.5, 3, 3);
  mctx.fillStyle = "#4ade80";
  for (const h of G.hearts) mctx.fillRect(h.x * sx - 1.5, h.y * sy - 1.5, 3, 3);
  mctx.fillStyle = "#fde047";
  for (const c of G.chests) mctx.fillRect(c.x * sx - 2, c.y * sy - 2, 4, 4);
  for (const u of G.pups) { mctx.fillStyle = u.kind === "fire" ? "#fb923c" : "#7dd3fc"; mctx.fillRect(u.x * sx - 1.5, u.y * sy - 1.5, 3, 3); }
  for (const e of G.enemies) {
    if (e.hadal) { mctx.fillStyle = "#2dd4bf"; mctx.fillRect(e.x * sx - 4, e.y * sy - 4, 8, 8); }
    else if (e.superboss) { mctx.fillStyle = "#a855f7"; mctx.fillRect(e.x * sx - 4, e.y * sy - 4, 8, 8); }
    else if (e.boss) { mctx.fillStyle = "#f43f5e"; mctx.fillRect(e.x * sx - 3, e.y * sy - 3, 6, 6); }
    else if (e.elite) { mctx.fillStyle = "#fde047"; mctx.fillRect(e.x * sx - 1.5, e.y * sy - 1.5, 3, 3); }
    else if (e.clam) { mctx.fillStyle = "#f9a8d4"; mctx.fillRect(e.x * sx - 2, e.y * sy - 2, 4, 4); }
    else { mctx.fillStyle = "#fb7185"; mctx.fillRect(e.x * sx - 1, e.y * sy - 1, 2.5, 2.5); }
  }
  mctx.fillStyle = "#fef3c7";
  for (const q of G.pearls) mctx.fillRect(q.x * sx - 1, q.y * sy - 1, 2, 2);
  mctx.fillStyle = "#fbbf24";
  for (const c of G.clams) if (!c.open) mctx.fillRect(c.x * sx - 1.5, c.y * sy - 1.5, 3, 3);
  if (G.gate) { // the rift gate shines violet with a white heart
    mctx.fillStyle = "#c084fc";
    mctx.fillRect(G.gate.x * sx - 3, G.gate.y * sy - 3, 6, 6);
    mctx.strokeStyle = "#ffffff";
    mctx.strokeRect(G.gate.x * sx - 3.5, G.gate.y * sy - 3.5, 7, 7);
  }
  if (G.greed) { // greed rings glow gold with a white heart
    mctx.fillStyle = "#fde047";
    mctx.fillRect(G.greed.x * sx - 3, G.greed.y * sy - 3, 6, 6);
    mctx.strokeStyle = "#ffffff";
    mctx.strokeRect(G.greed.x * sx - 3.5, G.greed.y * sy - 3.5, 7, 7);
  }
  // viewport
  mctx.strokeStyle = "rgba(255,255,255,0.55)";
  mctx.lineWidth = 1;
  mctx.strokeRect(camX * sx, camY * sy, W * sx, H * sy);
  // player
  mctx.fillStyle = "#fff";
  mctx.beginPath(); mctx.arc(P.x * sx, P.y * sy, 3, 0, TAU); mctx.fill();
  mctx.strokeStyle = "#22d3ee";
  mctx.beginPath(); mctx.arc(P.x * sx, P.y * sy, 4.5, 0, TAU); mctx.stroke();
  // border
  mctx.strokeStyle = "rgba(34,211,238,0.6)";
  mctx.strokeRect(0.5, 0.5, MS - 1, MS - 1);
}

function drawWeed(d) {
  const tall = (d.seed % 1) > 0.45;
  const blades = tall ? 4 : 7;
  // part around the swimmer: push away + drag along motion + lingering swish
  const pdx = d.x - P.x, pdy = d.y - P.y;
  const pd = Math.hypot(pdx, pdy) || 1;
  const infl = clamp(1 - pd / 130, 0, 1);
  const pspd = Math.hypot(P.mvx || 0, P.mvy || 0);
  const sw = d.swish || 0;
  const push = infl * (8 + Math.min(1, pspd / 280) * 30) + sw * 16;
  const drag = infl * Math.min(1, pspd / 280) * 12;
  const bendBX = (pdx / pd) * push - (pspd > 1 ? (P.mvx / pspd) * drag : 0);
  const wobAmp = infl * 4 + sw * 6;
  // holdfast rock anchoring the base
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#123043";
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + d.r * 0.9, d.r * 0.5, d.r * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  for (let i = 0; i < blades; i++) {
    const f = blades === 1 ? 0 : i / (blades - 1) - 0.5;
    const jitter = (((i * 53 + d.seed * 91) % 17) / 17 - 0.5);
    const h = tall ? d.r * (2.1 + (1 - Math.abs(f)) * 1.1 + jitter * 0.5)
                   : d.r * (0.9 + (1 - Math.abs(f)) * 0.7 + jitter * 0.4);
    const lean = f * d.r * (tall ? 1.1 : 0.7);
    const sway = Math.sin(G.time * (tall ? 1.1 : 1.7) + d.seed + i * 0.85) * (2.5 + i * 0.9);
    const wob = Math.sin(G.time * 10 + d.seed * 3 + i * 1.1) * wobAmp;
    const bx = d.x + f * d.r * 0.55;
    const by = d.y + d.r * 0.85;
    const bendK = 0.6 + 0.6 * (blades <= 1 ? 0.5 : i / (blades - 1));
    const tipX = bx + lean + sway + (bendBX + wob) * bendK, tipY = by - h;
    const cx = bx + lean * 0.3 + sway * 0.45 + bendBX * 0.35, cy = by - h * 0.6;
    // dark back blade for depth
    ctx.strokeStyle = "rgba(4,47,33,0.9)";
    ctx.lineWidth = tall ? 8 : 5;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cx, cy, tipX, tipY); ctx.stroke();
    // main blade
    ctx.strokeStyle = tall ? "#0e7a54" : "#12926a";
    ctx.lineWidth = tall ? 5.5 : 3.5;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cx, cy, tipX, tipY); ctx.stroke();
    // sunlit core
    ctx.strokeStyle = "rgba(167,243,208,0.7)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cx, cy, tipX, tipY); ctx.stroke();
    // side leaves on tall blades
    if (tall && h > d.r * 2) {
      for (let s = 1; s <= 3; s++) {
        const t = s / 4.2, mt = 1 - t;
        const px = mt * mt * bx + 2 * mt * t * cx + t * t * tipX;
        const py = mt * mt * by + 2 * mt * t * cy + t * t * tipY;
        const side = (s % 2 ? 1 : -1) * (1 + (i % 2) * 0.2);
        ctx.fillStyle = "rgba(52,211,153,0.85)";
        ctx.beginPath();
        ctx.ellipse(px + side * 5, py, 5.5, 2.6, side * 0.55, 0, TAU);
        ctx.fill();
      }
    }
    // glowing tip on alternating blades
    if (i % 2 === 0) {
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(G.time * 2 + d.seed + i);
      circle(tipX, tipY, 2.4, "#d1fae5");
      ctx.globalAlpha = 1;
    }
  }
  // kelp bulb + floating ribbon on tall weeds
  if (tall) {
    const bs = Math.sin(G.time * 1.2 + d.seed) * 5;
    const bulbX = d.x + bs * 0.5, bulbY = d.y - d.r * 2.2;
    ctx.strokeStyle = "#0e7a54";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y - d.r * 0.4);
    ctx.quadraticCurveTo(d.x + bs, d.y - d.r * 1.4, bulbX, bulbY);
    ctx.stroke();
    circle(bulbX, bulbY, 5, "#c99a3a");
    circle(bulbX - 1.5, bulbY - 1.5, 1.8, "#f3d68a");
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bulbX, bulbY - 4);
    ctx.quadraticCurveTo(bulbX + bs, bulbY - d.r * 0.5, bulbX - bs * 0.6, bulbY - d.r * 0.9);
    ctx.stroke();
  }
}

function drawBeam() {
  if (!G.beam) return;
  const b = G.beam;
  const a = 1 - b.t / b.life;
  const bw = 46 * (0.6 + 0.4 * a) + 30 * (b.t / b.life);
  const grad = ctx.createLinearGradient(0, camY - 20, 0, b.y);
  grad.addColorStop(0, "rgba(253,224,71,0)");
  grad.addColorStop(0.6, "rgba(253,224,71," + (0.35 * a).toFixed(3) + ")");
  grad.addColorStop(1, "rgba(255,255,255," + (0.55 * a).toFixed(3) + ")");
  ctx.fillStyle = grad;
  ctx.fillRect(b.x - bw / 2, camY - 20, bw, b.y - (camY - 20));
  ctx.globalAlpha = 0.5 * a;
  ctx.fillStyle = "#fef9c3";
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, 44 * a + 12, 20 * a + 8, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawWaterFX() {
  // GOD RAYS — volumetric-feeling sun shafts slanting down from the surface.
  // Each shaft is a soft outer sheath + a brighter inner core, both fading with
  // depth; shafts drift, sway and breathe on independent phases, with a slight
  // camera parallax so they feel anchored in the water. Additive blending makes
  // overlapping shafts bloom naturally. Kept cheap: a handful of gradient fills.
  const dreadDim = G.superAlive ? 0.22 : 1; // the abyssal reef swallows the light
  const wScale = clamp(W / 900, 0.7, 1.35);
  const NRAYS = W < 600 ? 5 : 7;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < NRAYS; i++) {
    const f1 = (i * 0.61803398875) % 1; // deterministic per-shaft variety
    const f2 = ((i + 3) * 0.38196601125) % 1;
    const spacing = (W + 480) / NRAYS;
    const drift = G.time * (10 + f1 * 18); // slow lateral drift
    let bx = ((i + 0.5) * spacing + drift - camX * 0.06) % (W + 480);
    if (bx < 0) bx += W + 480;
    bx -= 240;
    const sway = Math.sin(G.time * (0.22 + f2 * 0.3) + i * 2.4) * 34;
    const tilt = (50 + f1 * 70) * (W < 600 ? 0.6 : 1); // slant over full depth
    const wTop = (46 + f2 * 66) * wScale;
    const wBot = wTop * 2.1; // shafts spread as they descend
    const pulse = 0.72 + 0.28 * Math.sin(G.time * 0.6 + i * 1.9 + f1 * 6.28);
    const aCore = (0.10 + f1 * 0.08) * pulse * dreadDim;
    const len = H * (0.78 + f2 * 0.22); // rays dissolve before the seabed
    const xTop = bx + sway * 0.4, xBot = bx + tilt + sway;
    // outer soft sheath
    let g = ctx.createLinearGradient(0, -20, 0, len);
    g.addColorStop(0, "rgba(150,225,255," + (aCore * 0.55).toFixed(3) + ")");
    g.addColorStop(0.55, "rgba(150,225,255," + (aCore * 0.28).toFixed(3) + ")");
    g.addColorStop(1, "rgba(150,225,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(xTop - wTop, -20);
    ctx.lineTo(xTop + wTop, -20);
    ctx.lineTo(xBot + wBot, len);
    ctx.lineTo(xBot - wBot, len);
    ctx.closePath();
    ctx.fill();
    // bright inner core
    g = ctx.createLinearGradient(0, -20, 0, len);
    g.addColorStop(0, "rgba(215,250,255," + aCore.toFixed(3) + ")");
    g.addColorStop(0.5, "rgba(215,250,255," + (aCore * 0.45).toFixed(3) + ")");
    g.addColorStop(1, "rgba(215,250,255,0)");
    ctx.fillStyle = g;
    const cwTop = wTop * 0.45, cwBot = wBot * 0.45;
    ctx.beginPath();
    ctx.moveTo(xTop - cwTop, -20);
    ctx.lineTo(xTop + cwTop, -20);
    ctx.lineTo(xBot + cwBot, len);
    ctx.lineTo(xBot - cwBot, len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // surface light washing down from above
  const tl = ctx.createLinearGradient(0, 0, 0, H * 0.45);
  tl.addColorStop(0, "rgba(140,220,255,0.10)");
  tl.addColorStop(1, "rgba(140,220,255,0)");
  ctx.fillStyle = tl;
  ctx.fillRect(0, 0, W, H * 0.45);
  // depth vignette
  if (vigGrad) { ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, W, H); }
  // hurt flash + low-hp pulse
  let ha = G.hurtFlash > 0 ? G.hurtFlash * 0.9 : 0;
  if (G.state === "play" && P.hp < P.maxHp * 0.25) ha = Math.max(ha, OPT.calm ? 0.25 : 0.35 + 0.2 * Math.sin(G.time * 6));
  if (ha > 0 && hurtGrad) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, ha);
    ctx.fillStyle = hurtGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // hurt edge-flash: a white-hot ring snaps around the screen so hits read mid-action
  if (G.hurtEdge > 0 && G.state === "play") {
    ctx.save();
    ctx.globalAlpha = Math.min(1, G.hurtEdge * 1.4);
    ctx.strokeStyle = "#fef2f2";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, W - 10, H - 10);
    ctx.globalAlpha = Math.min(1, G.hurtEdge);
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.restore();
  }
  // offscreen-damage wedge: a red arrow at the screen edge points back at the blow
  if (G.wedgeT > 0 && G.state === "play") {
    const wx = G.wedgeX - camX, wy = G.wedgeY - camY;
    if (wx < 0 || wx > W || wy < 0 || wy > H) {
      const cx = W / 2, cy = H / 2;
      const a = Math.atan2(wy - cy, wx - cx);
      const tx = Math.cos(a), ty = Math.sin(a), m = 56;
      const kx = tx !== 0 ? ((tx > 0 ? W - m : m) - cx) / tx : Infinity;
      const ky = ty !== 0 ? ((ty > 0 ? H - m : m) - cy) / ty : Infinity;
      const k = Math.min(Math.abs(kx), Math.abs(ky));
      ctx.save();
      ctx.translate(cx + tx * k, cy + ty * k);
      ctx.rotate(a);
      ctx.globalAlpha = Math.min(1, G.wedgeT * 1.6) * (0.65 + 0.35 * Math.sin(G.time * 10));
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(20, 0); ctx.lineTo(-10, -14); ctx.lineTo(-3, 0); ctx.lineTo(-10, 14);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(2, 0, 3.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  // dying heartbeat: the edges thump twice per beat as HP runs out
  if (G.state === "play" && P.hp > 0 && P.hp < P.maxHp * 0.3 && hurtGrad) {
    const danger = 1 - P.hp / (P.maxHp * 0.3);
    const beat = Math.pow(Math.max(0, Math.sin(G.time * 5.2)), 6) + 0.55 * Math.pow(Math.max(0, Math.sin(G.time * 5.2 - 0.7)), 6);
    ctx.save();
    ctx.globalAlpha = clamp(danger * (0.22 + 0.5 * beat), 0, 0.85);
    ctx.fillStyle = hurtGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // the heart stutters audibly under 15%
    if (danger > 0.5) {
      G.heartT = (G.heartT || 0) - 1 / 60;
      if (G.heartT <= 0) { G.heartT = 0.95; tone(52, 0.16, "sine", 0.1, 40); setTimeout(() => tone(47, 0.14, "sine", 0.09, 36), 160); }
    }
  }
  // rift-gate edge arrow: points the way when the gate is offscreen
  if (G.state === "play" && G.gate) {
    const gx = G.gate.x - camX, gy = G.gate.y - camY;
    if (gx < 0 || gx > W || gy < 0 || gy > H) {
      const cx = W / 2, cy = H / 2;
      const a = Math.atan2(gy - cy, gx - cx);
      const tx = Math.cos(a), ty = Math.sin(a);
      const m = 48;
      const kx = tx !== 0 ? ((tx > 0 ? W - m : m) - cx) / tx : Infinity;
      const ky = ty !== 0 ? ((ty > 0 ? H - m : m) - cy) / ty : Infinity;
      const k = Math.min(Math.abs(kx), Math.abs(ky));
      ctx.save();
      ctx.translate(cx + tx * k, cy + ty * k);
      ctx.rotate(a);
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(G.time * 6);
      ctx.fillStyle = "#c084fc";
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(-8, -12); ctx.lineTo(-2, 0); ctx.lineTo(-8, 12);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#f5d0fe";
      ctx.font = "900 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("RIFT", 0, -20);
      ctx.restore();
    }
  }
  // stage atmosphere: each generated stage tints and dims the water
  const st = G.stage;
  if (G.state !== "menu" && st) {
    ctx.fillStyle = st.tint;
    ctx.fillRect(0, 0, W, H);
    if (st.dim > 0) {
      ctx.fillStyle = "rgba(4,6,20," + st.dim.toFixed(2) + ")";
      ctx.fillRect(0, 0, W, H);
    }
    if (st.ember) {
      // rising embers from the seafloor cracks
      for (let i = 0; i < 22; i++) {
        const yy = H + 20 - ((G.time * (40 + (i % 5) * 12) + i * 211) % (H + 40));
        const xx = (((i * 311.7 + Math.sin(G.time * 0.9 + i * 2.3) * 50) % W) + W) % W;
        ctx.globalAlpha = 0.3 + 0.35 * Math.sin(G.time * 4 + i * 1.9);
        circle(xx, yy, 1.5 + (i % 3), i % 2 ? "#fb923c" : "#fde047");
      }
      ctx.globalAlpha = 1;
    }
  }
  // abyss freeze: the whole reef holds its breath in blue
  if (G.freezeT > 0) {
    ctx.fillStyle = "rgba(186,230,253," + (0.10 + 0.05 * Math.sin(G.time * 6)).toFixed(3) + ")";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(224,242,254,0.5)";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
  }
  // ABYSSAL DREAD — while the leviathan lives the reef turns dark and threatening
  if (G.superAlive) {
    ctx.fillStyle = "rgba(8,2,18,0.5)";
    ctx.fillRect(0, 0, W, H);
    const dp = 0.5 + 0.5 * Math.sin(G.time * 2.2);
    if (hurtGrad) {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.4 * dp;
      ctx.fillStyle = hurtGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // rising ash embers (deterministic drift, no state)
    for (let i = 0; i < 36; i++) {
      const yy = H + 20 - ((G.time * (30 + (i % 5) * 9) + i * 173) % (H + 40));
      const xx = (((i * 197.3 + Math.sin(G.time * 0.7 + i * 2.1) * 40) % W) + W) % W;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(G.time * 3 + i * 1.7);
      circle(xx, yy, 1.5 + (i % 3), i % 2 ? "#fb923c" : "#c4b5fd");
    }
    ctx.globalAlpha = 1;
    // abyssal lightning: brief violet flash
    const cyc = G.time % 8;
    if (cyc < 0.14 && !OPT.calm) {
      ctx.fillStyle = "rgba(196,181,253," + (0.22 * (1 - cyc / 0.14)).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }
  // persistent boss HP bar (any boss alive — not just the dread ones): leviathan (violet) /
  // hadal (teal) / epic (gold) / boss (rose), with a white damage-ghost over the wound
  {
    const sb = G.enemies.find((e) => (e.superboss || e.hadal || e.boss) && !e.dead);
    if (sb) {
      const hadalBar = !!sb.hadal, superBar = !!sb.superboss && !sb.hadal, epicBar = !!sb.epic;
      const bw = Math.min(300, W - 120), bx = (W - bw) / 2, by = 62;
      const fr = clamp(sb.hp / sb.maxHp, 0, 1);
      // ghost chases the wound down at 25% max-HP per second (frame-rate independent-ish)
      if (sb.ghost === undefined || sb.hp > sb.ghost) sb.ghost = sb.hp;
      else if (sb.ghost > sb.hp) sb.ghost = Math.max(sb.hp, sb.ghost - sb.maxHp * 0.0042);
      const gfr = clamp(sb.ghost / sb.maxHp, 0, 1);
      const name = hadalBar ? "◉ HADAL MOTHER ◉" : superBar ? "☠ ABYSSAL LEVIATHAN ☠" : (epicBar ? "⚠ EPIC " : "") + (sb.patName || "REEF TYRANT");
      const edge = hadalBar ? "rgba(45,212,191,0.8)" : superBar ? "rgba(167,139,250,0.8)" : epicBar ? "rgba(253,224,71,0.85)" : "rgba(244,63,94,0.85)";
      const fg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      if (hadalBar) { fg.addColorStop(0, "#134e4a"); fg.addColorStop(0.55, "#2dd4bf"); fg.addColorStop(1, "#99f6e0"); }
      else if (superBar) { fg.addColorStop(0, "#2e1065"); fg.addColorStop(0.55, "#a78bfa"); fg.addColorStop(1, "#ddd6fe"); }
      else if (epicBar) { fg.addColorStop(0, "#713f12"); fg.addColorStop(0.55, "#f59e0b"); fg.addColorStop(1, "#fef3c7"); }
      else { fg.addColorStop(0, "#881337"); fg.addColorStop(0.55, "#f43f5e"); fg.addColorStop(1, "#fecdd3"); }
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "rgba(5,2,12,0.8)";
      ctx.fillRect(bx - 6, by - 20, bw + 12, 40);
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx - 6.5, by - 20.5, bw + 12, 40);
      ctx.font = "900 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = hadalBar ? "#5eead4" : superBar ? "#c4b5fd" : epicBar ? "#fde047" : "#fda4af";
      ctx.fillText(name, W / 2, by - 7);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(bx, by, bw, 9);
      if (gfr > fr + 0.004) { ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(bx + bw * fr, by, bw * (gfr - fr), 9); }
      ctx.fillStyle = fr > 0.25 ? fg : "#ef4444";
      ctx.fillRect(bx, by, bw * fr, 9);
      // foam crest riding the fill edge
      if (fr > 0.01 && fr < 0.999) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(bx + bw * fr - 1.5, by - 1.5, 3, 12);
        circle(bx + bw * fr, by - 2, 2.4, "#ecfeff");
      }
      ctx.restore();
    }
  }
}

// ---------- fish morphs: your puffer evolves with your build ----------
// Each branch grows its own traits at 3 picks (stage 1) and 6 picks (stage 2), and
// traits STACK: learn artillery + tide and you keep the gunner's cannon AND grow
// the glider's wings, instead of one form replacing the other. Legendary evolutions
// add their traits on top the same way (two or more evolutions fuse into the sovereign crown).
// Each stage grants its small bonus ONCE when first unlocked (tracked in P.morphGot);
// the displayed form is the blend of everything unlocked so far.
const MORPHS = {
  puffer:      { name: "Reef Puffer", icon: "●", color: "#22d3ee", desc: "Your trusty base form." },
  gunner:      { name: "Spikefin Gunner", icon: "✦", color: "#38bdf8", desc: "Artillery 3: longer spikes, swifter bubbles.", apply() { P.bulletSpeed *= 1.12; } },
  dreadnought: { name: "Dreadnought", icon: "✦", color: "#fde047", desc: "Artillery 6: living artillery, +8% damage.", apply() { P.dmg *= 1.08; } },
  glider:      { name: "Current Glider", icon: "≋", color: "#5eead4", desc: "Tide 3: wing fins, +10% pickup range.", apply() { P.magnet *= 1.1; } },
  manta:       { name: "Storm Manta", icon: "≋", color: "#2dd4bf", desc: "Tide 6: storm wings, +10% swim speed.", apply() { P.speed *= 1.1; } },
  lantern:     { name: "Lantern Warden", icon: "✧", color: "#f0abfc", desc: "Current 3: lure and lights, +0.4 HP/s.", apply() { P.regen += 0.4; } },
  monarch:     { name: "Abyss Monarch", icon: "✧", color: "#a78bfa", desc: "Current 6: abyssal glow, +20 max HP.", apply() { P.maxHp += 20; P.hp = Math.min(P.maxHp, P.hp + 20); } },
  serpent:     { name: "Trident Serpent", icon: "Ψ", color: "#4ade80", desc: "TRIDENT: serpentine volley, +7% fire rate.", apply() { P.fireRate *= 1.07; } },
  cinder:      { name: "Cinder Maw", icon: "✸", color: "#fb923c", desc: "DEPTH CHARGE: volcanic body, +15 blast.", apply() { P.blast = (P.blast || 0) + 15; } },
  starfall:    { name: "Starfall Herald", icon: "☄", color: "#fde047", desc: "STARFALL: falling-star volley, +5% damage.", apply() { P.dmg *= 1.05; } },
  leviathan:   { name: "Leviathan Heart", icon: "❥", color: "#f472b6", desc: "LEVIATHAN HEART: abyssal vitality, +30 max HP.", apply() { P.maxHp += 30; P.hp = Math.min(P.maxHp, P.hp + 30); } },
  maelstrom:   { name: "Maelstrom Eye", icon: "🌀", color: "#38bdf8", desc: "MAELSTROM: the storm's eye, +5% swim speed.", apply() { P.speed *= 1.05; } },
  sovereign:   { name: "Abyssal Sovereign", icon: "◆", color: "#fde047", desc: "Two or more evolutions: the reef kneels. +5% dmg/speed.", apply() { P.dmg *= 1.05; P.speed *= 1.05; } },
};
// short display metadata per unlocked stage (hybrid names blend these)
const MSTAGE = {
  art1:  { short: "Spikefin", full: "Spikefin Gunner", icon: "✦", color: "#38bdf8" },
  art2:  { short: "Dreadnought", full: "Dreadnought", icon: "✦", color: "#fde047" },
  tide1: { short: "Glider", full: "Current Glider", icon: "≋", color: "#5eead4" },
  tide2: { short: "Manta", full: "Storm Manta", icon: "≋", color: "#2dd4bf" },
  flow1: { short: "Lantern", full: "Lantern Warden", icon: "✧", color: "#f0abfc" },
  flow2: { short: "Monarch", full: "Abyss Monarch", icon: "✧", color: "#a78bfa" },
  tri:   { short: "Serpent", full: "Trident Serpent", icon: "Ψ", color: "#4ade80" },
  dep:   { short: "Cinder", full: "Cinder Maw", icon: "✸", color: "#fb923c" },
  star:  { short: "Starfall", full: "Starfall Herald", icon: "☄", color: "#fde047" },
  lhe:   { short: "Leviathan", full: "Leviathan Heart", icon: "❥", color: "#f472b6" },
  mae:   { short: "Maelstrom", full: "Maelstrom Eye", icon: "🌀", color: "#38bdf8" },
  sov:   { short: "Sovereign", full: "Abyssal Sovereign", icon: "◆", color: "#fde047" },
};
// per-form art direction for the player renderer (local frame faces +x)
const MSTYLE = {
  puffer:      { body: "#22d3ee", dark: "#0e7490", fin: "#0e9db8", snout1: "#155e75", snout2: "#0e7490", spike: "#0e7490", spikeN: 10, spikeL: 3.5, elong: 1, tail: 1 },
  gunner:      { body: "#38bdf8", dark: "#075985", fin: "#0284c7", snout1: "#0c4a6e", snout2: "#0369a1", spike: "#eab308", spikeN: 12, spikeL: 6, elong: 1.05, tail: 1, cannon: true },
  dreadnought: { body: "#0ea5e9", dark: "#0c4a6e", fin: "#0369a1", snout1: "#082f49", snout2: "#0c4a6e", spike: "#fde047", spikeN: 14, spikeL: 8, elong: 1.1, tail: 1.2, cannon: true, armor: true },
  glider:      { body: "#5eead4", dark: "#0f766e", fin: "#2dd4bf", snout1: "#115e59", snout2: "#0f766e", spike: "#0f766e", spikeN: 8, spikeL: 3, elong: 1.2, tail: 1.3, wings: true },
  manta:       { body: "#2dd4bf", dark: "#134e4a", fin: "#14b8a6", snout1: "#134e4a", snout2: "#0f766e", spike: "#134e4a", spikeN: 6, spikeL: 2.5, elong: 1.3, tail: 1.6, wings: true },
  lantern:     { body: "#334155", dark: "#0f172a", fin: "#64748b", snout1: "#1e293b", snout2: "#334155", spike: "#475569", spikeN: 8, spikeL: 3, elong: 1.05, tail: 1, lure: true, dots: true },
  monarch:     { body: "#1e1b4b", dark: "#4c1d95", fin: "#7c3aed", snout1: "#2e1065", snout2: "#4c1d95", spike: "#a78bfa", spikeN: 10, spikeL: 4.5, elong: 1.1, tail: 1.2, lure: true, dots: true },
  serpent:     { body: "#4ade80", dark: "#166534", fin: "#22c55e", snout1: "#14532d", snout2: "#166534", spike: "#166534", spikeN: 8, spikeL: 3, elong: 1.35, tail: 1.5, crest: true },
  cinder:      { body: "#431407", dark: "#7c2d12", fin: "#ea580c", snout1: "#7c2d12", snout2: "#9a3412", spike: "#fdba74", spikeN: 12, spikeL: 6, elong: 1.1, tail: 1.2, cracks: true },
  starfall:    { body: "#fef9c3", dark: "#a16207", fin: "#fde047", snout1: "#713f12", snout2: "#a16207", spike: "#f59e0b", spikeN: 14, spikeL: 7, elong: 1.1, tail: 1.2, cannon: true },
  leviathan:   { body: "#831843", dark: "#500f28", fin: "#f472b6", snout1: "#500f28", snout2: "#831843", spike: "#f9a8d4", spikeN: 10, spikeL: 4.5, elong: 1.15, tail: 1.3, lure: true, dots: true },
  maelstrom:   { body: "#0c4a6e", dark: "#082f49", fin: "#38bdf8", snout1: "#082f49", snout2: "#0c4a6e", spike: "#7dd3fc", spikeN: 12, spikeL: 6, elong: 1.25, tail: 1.5, wings: true },
  sovereign:   { body: "#7c3aed", dark: "#4c1d95", fin: "#fde047", snout1: "#2e1065", snout2: "#4c1d95", spike: "#fde047", spikeN: 14, spikeL: 7, elong: 1.2, tail: 1.4, lure: true, crest: true, crown: true },
};
function currentMorph() {
  return morphKey(morphStages());
}
// branch stages: 0 = locked, 1 = 3+ picks, 2 = 6+ picks
function morphStages() {
  const st = P.stacks || {};
  const a = branchCount("art"), t = branchCount("tide"), f = branchCount("flow");
  return {
    a: a >= 6 ? 2 : a >= 3 ? 1 : 0,
    t: t >= 6 ? 2 : t >= 3 ? 1 : 0,
    f: f >= 6 ? 2 : f >= 3 ? 1 : 0,
    tri: !!st.trident,
    dep: !!st.depth,
    star: !!st.star,
    lhe: !!st.lheart,
    mae: !!st.mael,
  };
}
function evoCount(s) {
  s = s || morphStages();
  return (s.tri ? 1 : 0) + (s.dep ? 1 : 0) + (s.star ? 1 : 0) + (s.lhe ? 1 : 0) + (s.mae ? 1 : 0);
}
function morphKey(s) {
  return "a" + s.a + "t" + s.t + "f" + s.f + (s.tri ? "T" : "") + (s.dep ? "D" : "") + (s.star ? "S" : "") + (s.lhe ? "H" : "") + (s.mae ? "M" : "");
}
// unlocked stage parts in display order (both evolutions fuse into Sovereign)
function morphParts(s) {
  s = s || morphStages();
  const parts = [];
  if (s.a === 2) parts.push("art2"); else if (s.a === 1) parts.push("art1");
  if (s.t === 2) parts.push("tide2"); else if (s.t === 1) parts.push("tide1");
  if (s.f === 2) parts.push("flow2"); else if (s.f === 1) parts.push("flow1");
  if (evoCount(s) >= 2) parts.push("sov"); // two or more evolutions fuse into the Sovereign
  else {
    if (s.tri) parts.push("tri");
    if (s.dep) parts.push("dep");
    if (s.star) parts.push("star");
    if (s.lhe) parts.push("lhe");
    if (s.mae) parts.push("mae");
  }
  return parts;
}
function hexAvg(colors) {
  let r = 0, g = 0, b = 0;
  for (const c of colors) {
    r += parseInt(c.slice(1, 3), 16); g += parseInt(c.slice(3, 5), 16); b += parseInt(c.slice(5, 7), 16);
  }
  const n = colors.length;
  const h = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}
function morphDisplay(s) {
  s = s || morphStages();
  const parts = morphParts(s);
  if (!parts.length) return { name: "Reef Puffer", icon: "●", color: "#22d3ee" };
  if (parts.length === 1) {
    const m = MSTAGE[parts[0]];
    return { name: m.full, icon: m.icon, color: m.color };
  }
  return {
    name: parts.map((p) => MSTAGE[p].short).join(" × "),
    icon: "◈",
    color: hexAvg(parts.map((p) => MSTAGE[p].color)),
  };
}
// blended art direction: body palette from the highest-priority unlocked part,
// signature accessories from EVERYTHING unlocked (cannon + wings + lure...).
function morphStyle(s) {
  s = s || morphStages();
  if (!s.a && !s.t && !s.f && !s.tri && !s.dep) return MSTYLE.puffer;
  const pri = { art1: 62, tide1: 61, flow1: 60, art2: 72, tide2: 71, flow2: 70, tri: 80, dep: 80, star: 81, lhe: 81, mae: 81, sov: 90 };
  const baseFor = { art1: "gunner", art2: "dreadnought", tide1: "glider", tide2: "manta", flow1: "lantern", flow2: "monarch", tri: "serpent", dep: "cinder", star: "starfall", lhe: "leviathan", mae: "maelstrom", sov: "sovereign" };
  let anchor = "puffer", best = -1;
  for (const p of morphParts(s)) if (pri[p] > best) { best = pri[p]; anchor = baseFor[p]; }
  const A = MSTYLE[anchor];
  // bodies grow roomier as more lines blend in (capped so hybrids stay readable)
  let elong = 1, tail = 1;
  const grow = (key) => { elong += MSTYLE[key].elong - 1; tail += MSTYLE[key].tail - 1; };
  if (s.a === 1) grow("gunner"); if (s.a === 2) grow("dreadnought");
  if (s.t === 1) grow("glider"); if (s.t === 2) grow("manta");
  if (s.f === 1) grow("lantern"); if (s.f === 2) grow("monarch");
  if (s.tri) grow("serpent"); if (s.dep) grow("cinder");
  if (s.star) grow("starfall"); if (s.lhe) grow("leviathan"); if (s.mae) grow("maelstrom");
  elong = Math.min(1.45, elong); tail = Math.min(1.9, tail);
  // spikes keep the longest unlocked set; artillery gold reads through any blend
  let spikeN = 0, spikeL = 0;
  const spikes = (key) => { spikeN = Math.max(spikeN, MSTYLE[key].spikeN); spikeL = Math.max(spikeL, MSTYLE[key].spikeL); };
  if (s.a === 1) spikes("gunner"); if (s.a === 2) spikes("dreadnought");
  if (s.t === 1) spikes("glider"); if (s.t === 2) spikes("manta");
  if (s.f === 1) spikes("lantern"); if (s.f === 2) spikes("monarch");
  if (s.tri) spikes("serpent"); if (s.dep) spikes("cinder");
  if (s.star) spikes("starfall"); if (s.lhe) spikes("leviathan"); if (s.mae) spikes("maelstrom");
  const sov = evoCount(s) >= 2;
  return {
    body: A.body, dark: A.dark, fin: A.fin, snout1: A.snout1, snout2: A.snout2,
    spike: s.a === 2 ? MSTYLE.dreadnought.spike : s.a === 1 ? MSTYLE.gunner.spike : A.spike,
    spikeN: spikeN || A.spikeN, spikeL: spikeL || A.spikeL,
    elong, tail,
    cannon: s.a >= 1, armor: s.a >= 2, wings: s.t >= 1,
    lure: s.f >= 1 || sov, dots: s.f >= 1,
    crest: s.tri, cracks: s.dep, crown: sov,
  };
}
function checkMorph() {
  const s = morphStages();
  const key = morphKey(s);
  if (key === P.morph) return;
  P.morph = key;
  const give = (id) => {
    if (!P.morphGot[id]) {
      P.morphGot[id] = 1;
      const M = MORPHS[id];
      if (M && M.apply) M.apply();
    }
  };
  // each newly unlocked stage pays its bonus — hybrids collect several at once
  if (s.a >= 1) give("gunner");
  if (s.a >= 2) give("dreadnought");
  if (s.t >= 1) give("glider");
  if (s.t >= 2) give("manta");
  if (s.f >= 1) give("lantern");
  if (s.f >= 2) give("monarch");
  if (s.tri) give("serpent");
  if (s.dep) give("cinder");
  if (s.star) give("starfall");
  if (s.lhe) give("leviathan");
  if (s.mae) give("maelstrom");
  if (evoCount(s) >= 2) give("sovereign");
  const D = morphDisplay(s);
  showBanner("✦ " + D.name.toUpperCase() + " ✦");
  setAnnounce("EVOLUTION!");
 // newly unlocked cross-branch synergies get their own callout
 for (const syn of synList()) {
   if (!P.synGot[syn.id]) {
     P.synGot[syn.id] = 1;
     setTimeout(((sn) => () => {
       addText(P.x, P.y - 56, sn.icon + " " + sn.name.toUpperCase(), "#fef08a", 16);
       tone(660, 0.15, "triangle", 0.1);
     })(syn), 900);
   }
 }
  pushRing(P.x, P.y, 150, D.color, 4);
  burst(P.x, P.y, D.color, 30, 300, 12);
  buzz([40, 60, 80]);
  tone(523, 0.15, "triangle", 0.12);
  setTimeout(() => tone(784, 0.2, "triangle", 0.12), 150);
  updateHud(true);
}

// ---------- flow ----------
function startGame(daily, weekly) {
  ensureAudio();
  touchStreak();
  const lf = loadLife(); lf.dives += 1; saveLife(lf);
  RNG = window.__pendingSeed ? mulberry32(hashSeed("bubble-dive-" + window.__pendingSeed)) : (daily ? mulberry32(hashSeed("bubble-dive-" + todayStr())) : weekly ? mulberry32(hashSeed("bubble-dive-week-" + weekStr())) : Math.random);
  window.__pendingSeed = null;
  G.daily = !!daily;
  G.weekly = !!weekly && !daily;
  G.mode = window.__pendingMode || "dive"; // selected mode (classic dive by default)
  window.__pendingMode = null;
  resetGame();
  startOverlay.hidden = true;
  levelOverlay.hidden = true;
  pauseOverlay.hidden = true;
  overOverlay.hidden = true;
  document.getElementById("clamOverlay").hidden = true;
  document.getElementById("shopOverlay").hidden = true;
  G.hideHud = false;
  document.getElementById("gameWrap").classList.remove("hidehud");
  // pact draft first: the oath gates the dive, picking it drops you in
  if (window.__noPact) { window.__noPact = false; document.getElementById("pactOverlay").hidden = true; openRelicDraft(); updateHud(true); } else openPactDraft();
  Music.on = true; Music.step = 0;
  document.getElementById("diffOverlay").hidden = true;
  document.getElementById("dailyOverlay").hidden = true;
  // first dive ever: two timed control hints (classic only, so mode scripts keep their banner beats)
  try {
    if (G.mode === "dive" && !localStorage.getItem("bubblePopArenaSeen")) {
      localStorage.setItem("bubblePopArenaSeen", "1");
      const touch = ("ontouchstart" in window) && navigator.maxTouchPoints > 0;
      setTimeout(() => { if (G.state === "play") showBanner(touch ? "👆 DRAG to swim — bubbles auto-fire!" : "⌨ WASD / ARROWS to swim — SPACE to dash"); }, 3600);
      setTimeout(() => { if (G.state === "play") showBanner("POP foes • GRAB ◆ gems • LEVEL UP: pick 1 of 3"); }, 7200);
    }
  } catch (e) {}
  checkAch(); // dive-count achievements check at launch
  if (!G.daily) {
    const dd = diffDef(G.diff);
    setTimeout(() => { if (G.state === "play") showBanner(dd.icon + " " + dd.name + " DIVE"); }, 2400);
  }
  if (G.daily && G.dailyMods.length) {
    const names = G.dailyMods.map((m) => m.name.toUpperCase()).join(" + ");
    setTimeout(() => { if (G.state === "play") showBanner("🌊 " + names); }, 2400);
  }
  if (G.weekly && G.dailyMods.length) {
    const names = G.dailyMods.map((m) => m.name.toUpperCase()).join(" + ");
    setTimeout(() => { if (G.state === "play") showBanner("🗓 " + names); }, 2400);
  }
  if (audioCtx) Music.nextT = audioCtx.currentTime + 0.1;
}

function togglePause() {
  if (G.state === "play") {
    G.state = "pause";
    pauseStats.textContent = diffDef(G.diff).icon + " " + diffDef(G.diff).name + " • Wave " + G.wave + " • " + fmtTime(G.time) + " • " + G.kills + " pops • LV " + P.lvl + (G.relic ? " • " + G.relic.icon + " " + G.relic.name : "");
    pauseOverlay.hidden = false;
  } else if (G.state === "pause") {
    pauseOverlay.hidden = true;
    G.state = "play";
  }
}

// Banks pearls + best + daily progress for the current run. Shared by gameOver and quitToMenu.
function bankRun() {
  const best = loadBest(G.diff);
  const score = { wave: G.wave, time: Math.floor(G.time), kills: G.kills, lvl: P.lvl, diff: G.diff };
  const isBest = !best || G.wave > best.wave || (G.wave === best.wave && G.kills > best.kills);
  if (isBest) saveBest(score, G.diff);
  const keepSeen = META.seen, keepSlain = META.slain; // bestiary counts live in memory; keep them across the reload
  META = loadMeta();
  if (keepSeen) META.seen = keepSeen;
  if (keepSlain) META.slain = keepSlain;
  META.pearls = (META.pearls || 0) + G.runPearls;
  saveMeta(META);
  const lfl = loadLife(); lfl.pops += G.kills; saveLife(lfl);
  // achievement run records
  ACH.stat.maxWave = Math.max(ACH.stat.maxWave || 0, G.wave);
  ACH.stat.maxStage = Math.max(ACH.stat.maxStage || 0, G.stageN);
  ACH.stat.maxLvl = Math.max(ACH.stat.maxLvl || 0, P.lvl);
  ACH.stat.maxCombo = Math.max(ACH.stat.maxCombo || 0, G.bestCombo);
  ACH.stat.bestAcc = Math.max(ACH.stat.bestAcc || 0, Math.round(G.kills / Math.max(1, G.shots) * 100));
  ACH.stat.secs = (ACH.stat.secs || 0) + Math.floor(G.time);
  if (G.daily) ACH.stat.daily = (ACH.stat.daily || 0) + 1;
  saveAch();
  checkAch();
  // loadout codex: every run is remembered; best dive also saves its ghost
  recordBuild();
  if (isBest && G.ghost.length > 10) saveGhost({ wave: G.wave, time: Math.floor(G.time), pts: G.ghost });
  let extra = " • ● " + G.runPearls + " pearls banked";
  let dailyNewBest = false, dailyBestWave = 0, weeklyNewBest = false, weeklyBestWave = 0;
  if (G.daily) {
    const dk = dailyKey();
    let db = null;
    try { db = JSON.parse(localStorage.getItem(dk) || "null"); } catch (err) { db = null; }
    if (!db || G.wave > db.wave) { try { localStorage.setItem(dk, JSON.stringify(score)); } catch (err) { /* ignore */ } extra += " • NEW DAILY BEST!"; dailyNewBest = true; }
    else { extra += " • daily best wave " + db.wave; dailyBestWave = db.wave; }
  }
  if (G.weekly) {
    const wk = weeklyKey();
    let wb = null;
    try { wb = JSON.parse(localStorage.getItem(wk) || "null"); } catch (err) { wb = null; }
    if (!wb || G.wave > wb.wave) { try { localStorage.setItem(wk, JSON.stringify(score)); } catch (err) { /* ignore */ } extra += " • NEW WEEKLY BEST!"; weeklyNewBest = true; }
    else { extra += " • weekly best wave " + wb.wave; weeklyBestWave = wb.wave; }
  }
  return { isBest, extra, dailyNewBest, dailyBestWave, weeklyNewBest, weeklyBestWave };
}

function countUp(el, target, fmt, dur) {
  // animated number roll for the game-over report card (timer-based, works even if rAF stalls)
  dur = dur || 900;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(target * e));
    if (k < 1 && G.state === "over") setTimeout(step, 30);
    else el.textContent = fmt(target);
  };
  step();
}

function gameOver() {
  G.state = "over";
  Music.on = false;
  document.getElementById("comboMeter").hidden = true;
  burst(P.x, P.y, "#22d3ee", 46, 340, 16);
  pushRing(P.x, P.y, 170, "#7df9ff", 4);
  tone(320, 0.5, "sawtooth", 0.12, 70); // descending womp as the screen drowns
  const prevWave = ACH.stat.maxWave || 0, prevLvl = ACH.stat.maxLvl || 0;
  const { isBest, dailyNewBest, dailyBestWave, weeklyNewBest, weeklyBestWave } = bankRun();
  const records = [];
  if (G.wave > prevWave) records.push("📏 deepest: wave " + G.wave);
  if (P.lvl > prevLvl) records.push("⭐ top level: LV " + P.lvl);
  if (isBest) records.push("🏆 new best!");
  const acc = G.kills / Math.max(1, G.shots);
  const dd = diffDef(G.diff);
  const pts = Math.round((G.wave * 15 + G.kills * 2 + G.bestCombo * 3 + Math.round(acc * 200)) * dd.score + G.depth * 400);
  const grade = pts >= 800 ? "S" : pts >= 500 ? "A" : pts >= 250 ? "B" : "C";
  const gcol = grade === "S" ? "#fde047" : grade === "A" ? "#67e8f9" : grade === "B" ? "#4ade80" : "#9ca3af";
  const gb = document.getElementById("gradeBadge");
  gb.textContent = grade; gb.style.color = gcol; gb.style.borderColor = gcol;
  const fKills = G.kills, fCombo = G.bestCombo, fPearls = G.runPearls, fAcc = Math.round(acc * 100);
  document.getElementById("reportCard").hidden = false;
  // showcase chips replace the old sentence-long stat line
  overStats.innerHTML = "";
  const chip = (t) => { const s = document.createElement("span"); s.className = "chip"; s.textContent = t; overStats.appendChild(s); };
  chip(dd.icon + " " + dd.name.toUpperCase());
  if (G.relic) chip(G.relic.icon + " " + G.relic.name.toUpperCase());
  if (dd.score > 1) chip("★ SCORE x" + dd.score);
  chip("🌊 WAVE " + G.wave);
  chip("◷ " + fmtTime(G.time));
  chip("LV " + P.lvl);
  if (G.depth > 0) chip("⛧ DEPTH " + G.depth);
  const ex = document.getElementById("overExtra");
  const bits = ["● " + G.runPearls + " pearls banked"];
  if (G.daily) bits.push(dailyNewBest ? "NEW DAILY BEST!" : "daily best wave " + dailyBestWave);
  if (G.weekly) bits.push(weeklyNewBest ? "NEW WEEKLY BEST!" : "weekly best wave " + weeklyBestWave);
  ex.textContent = bits.join("   •   ");
  ex.hidden = false;
  newBest.hidden = !isBest;
  refreshShop();
  setTimeout(() => {
    if (G.state !== "over") return;
    overOverlay.hidden = false;
    // numbers roll up as the rows slide in
    countUp(document.getElementById("repScore"), pts, (v) => v.toLocaleString("en-US"));
    countUp(document.getElementById("repKills"), fKills, (v) => String(v));
    countUp(document.getElementById("repCombo"), fCombo, (v) => "x" + v);
    countUp(document.getElementById("repPearls"), fPearls, (v) => "● " + v);
    countUp(document.getElementById("repAcc"), fAcc, (v) => v + "%");
    renderTimeline(records); // story graph + slain-by + broken records
  }, 600);
  updateHud(true);
  if (window.__modeOver) window.__modeOver(); // mode results-screen hook
}

function refreshShop() {
  META = loadMeta();
  renderVault();
  const pl = document.getElementById("pearlLine");
  if (pl) pl.textContent = "● " + (META.pearls || 0) + " pearls";
  const badge = document.getElementById("shopBadge");
  if (badge) {
    const n = META.pearls || 0;
    if (n > 0) { badge.hidden = false; badge.textContent = n > 99 ? "99+" : String(n); }
    else badge.hidden = true;
  }
  const ctn = document.getElementById("shopCtn");
  if (ctn) {
    ctn.innerHTML = "";
    for (const it of META_ITEMS) {
      const cost = metaCost(it);
      const row = document.createElement("div");
      row.className = "shopRow";
      const nm = document.createElement("b");
      nm.textContent = it.name;
      row.appendChild(nm);
      if (it.id !== "second") {
        const lv = document.createElement("i");
        lv.className = "lvl";
        lv.textContent = "Lv " + (META[it.id] || 0);
        row.appendChild(lv);
      }
      const ds = document.createElement("span");
      ds.textContent = it.desc + (cost === null ? " (owned)" : " — ●" + cost);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = cost === null ? "MAX" : "BUY";
      btn.disabled = cost === null || (META.pearls || 0) < cost;
      btn.addEventListener("click", () => {
        META = loadMeta();
        const c = metaCost(it);
        if (c === null || (META.pearls || 0) < c) return;
        META.pearls -= c;
        META[it.id] = (META[it.id] || 0) + 1;
        saveMeta(META);
        tone(800, 0.12, "triangle", 0.1, 1200);
        refreshShop();
      });
      row.appendChild(ds); row.appendChild(btn);
      ctn.appendChild(row);
    }
    // cosmetic vanity rows: trails + hats
    META.cos = META.cos || { trail: "cyan", hat: "none" };
    META.cosT = META.cosT || {}; META.cosH = META.cosH || {};
    const mkDiv = (t) => { const d = document.createElement("div"); d.className = "shopDiv"; d.textContent = t; ctn.appendChild(d); };
    const cosRow = (name, sub, btnTxt, dis, fn) => {
      const row = document.createElement("div"); row.className = "shopRow";
      const nm = document.createElement("b"); nm.textContent = name;
      const ds = document.createElement("span"); ds.textContent = sub;
      const btn = document.createElement("button"); btn.type = "button"; btn.textContent = btnTxt; btn.disabled = dis;
      btn.addEventListener("click", () => { fn(); refreshShop(); });
      row.append(nm, ds, btn); ctn.appendChild(row);
    };
    mkDiv("— BUBBLE TRAILS —");
    for (const t of COS_TRAILS) {
      const owned = t.cost === 0 || META.cosT[t.id];
      const equipped = META.cos.trail === t.id;
      const poor = !owned && (META.pearls || 0) < t.cost;
      cosRow((equipped ? "● " : "") + t.name,
        owned ? (equipped ? "in your wake" : "yours — dive in style") : "— ●" + t.cost,
        owned ? (equipped ? "ON" : "EQUIP") : "BUY", (owned && equipped) || poor,
        () => {
          META = loadMeta();
          META.cos = META.cos || { trail: "cyan", hat: "none" }; META.cosT = META.cosT || {}; META.cosH = META.cosH || {};
          if (t.cost > 0 && !META.cosT[t.id]) { if ((META.pearls || 0) < t.cost) return; META.pearls -= t.cost; META.cosT[t.id] = 1; tone(800, 0.12, "triangle", 0.1, 1200); }
          META.cos.trail = t.id; saveMeta(META);
        });
    }
    mkDiv("— HATS —");
    for (const h of COS_HATS) {
      const owned = h.cost === 0 || META.cosH[h.id];
      const equipped = META.cos.hat === h.id;
      const poor = !owned && (META.pearls || 0) < h.cost;
      cosRow((equipped ? "● " : "") + h.name,
        owned ? (equipped ? "looking sharp" : "yours — wear it proud") : "— ●" + h.cost,
        owned ? (equipped ? "ON" : "EQUIP") : "BUY", (owned && equipped) || poor,
        () => {
          META = loadMeta();
          META.cos = META.cos || { trail: "cyan", hat: "none" }; META.cosT = META.cosT || {}; META.cosH = META.cosH || {};
          if (h.cost > 0 && !META.cosH[h.id]) { if ((META.pearls || 0) < h.cost) return; META.pearls -= h.cost; META.cosH[h.id] = 1; tone(800, 0.12, "triangle", 0.1, 1200); }
          META.cos.hat = h.id; saveMeta(META);
        });
    }
  }
  const ds = document.getElementById("deepSub");
  if (ds) {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(dailyKey()) || "null"); } catch (e) { db = null; }
    const mods = rollDailyMods();
    let wb = null;
    try { wb = JSON.parse(localStorage.getItem(weeklyKey()) || "null"); } catch (e) { wb = null; }
    const wmods = rollWeeklyMods();
    // both reefs live on THE DEEP DIVE button: one compact line each (full details in the picker popup)
    ds.innerHTML = "";
    const l1 = document.createElement("div");
    l1.textContent = "🌊 " + mods.map((m) => (m.icon || "🌀") + " " + m.name).join(" • ") + (db ? "  ★ W" + db.wave : "");
    l1.title = mods.map((m) => m.name + ": " + m.desc).join("\n");
    const l2 = document.createElement("div");
    l2.textContent = "🗓 " + wmods.map((m) => (m.icon || "🌀") + " " + m.name).join(" • ") + (wb ? "  ★ W" + wb.wave : "");
    l2.title = wmods.map((m) => m.name + ": " + m.desc).join("\n") + "\nNew reef every week — best saved separately.";
    ds.appendChild(l1); ds.appendChild(l2);
  }
}

// ---------- lifetime stats (dives + total pops, shown on the menu) ----------
const LIFE_KEY = "bubblePopArenaLife";
function loadLife() { try { return Object.assign({ dives: 0, pops: 0 }, JSON.parse(localStorage.getItem(LIFE_KEY) || "{}")); } catch (e) { return { dives: 0, pops: 0 }; } }
function saveLife(l) { try { localStorage.setItem(LIFE_KEY, JSON.stringify(l)); } catch (e) { /* ignore */ } }
function fmtCompact(n) { return n >= 1000000 ? (n / 1000000).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }
function renderLifeStats() {
  const el = document.getElementById("lifeStats");
  if (!el) return;
  const l = loadLife();
  if (!l.dives) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = "";
  const mk = (icon, target, fmt, word, cls) => {
    const pill = document.createElement("div");
    pill.className = "statPill " + cls;
    const ic = document.createElement("span");
    ic.className = "statIco";
    ic.textContent = icon;
    const tx = document.createElement("span");
    tx.className = "statTx";
    const b = document.createElement("b");
    b.textContent = fmt(0);
    const sm = document.createElement("small");
    sm.textContent = word;
    tx.appendChild(b); tx.appendChild(sm);
    pill.appendChild(ic); pill.appendChild(tx);
    el.appendChild(pill);
    // count-up flourish every time the menu renders
    try {
      const t0 = performance.now(), dur = 900;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        b.textContent = fmt(Math.round(target * e));
        if (k < 1 && b.isConnected) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } catch (err) { b.textContent = fmt(target); }
  };
  mk("◈", l.dives, (v) => String(v), l.dives === 1 ? "dive" : "dives", "sp-dives");
  mk("✦", l.pops, fmtCompact, "lifetime pops", "sp-pops");
}

function refreshBestLine() {
  // best across all difficulties, labeled with the mode it was set on
  let best = null;
  for (const id of ["easy", "normal", "hard"]) {
    const b = loadBest(id);
    if (b && (!best || b.wave > best.wave || (b.wave === best.wave && b.kills > best.kills))) best = b;
  }
  const card = document.getElementById("bestCard");
  if (best) {
    const dd = diffDef(best.diff || "normal");
    card.hidden = false;
    if (!card.querySelector(".bspk")) {
      for (let i = 0; i < 6; i++) {
        const sp = document.createElement("i");
        sp.className = "bspk";
        sp.setAttribute("aria-hidden", "true");
        card.appendChild(sp);
      }
    }
    document.getElementById("bestWave").textContent = "🌊 wave " + best.wave + " • " + dd.icon + " " + dd.name;
    document.getElementById("bestTime").textContent = "⏱ " + fmtTime(best.time);
    document.getElementById("bestKills").textContent = "✦ " + best.kills + " pops";
  } else card.hidden = true;
  renderStreakLine();
  renderLifeStats();
  const chip = document.getElementById("pearlChip");
  if (chip) {
    const n = (loadMeta().pearls || 0);
    if (n > 0) { chip.hidden = false; chip.textContent = "● " + n + " pearls — spend them in the SHOP tab"; }
    else chip.hidden = true;
  }
}

// ---------- daily streak (consecutive play days) ----------
const STREAK_KEY = "bubblePopArenaStreak";
function loadStreak() { try { return Object.assign({ n: 0, last: "" }, JSON.parse(localStorage.getItem(STREAK_KEY) || "{}")); } catch (e) { return { n: 0, last: "" }; } }
function touchStreak() {
  const t = todayStr();
  let s = loadStreak();
  if (s.last === t) return s;
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  s = { n: (s.last === y ? s.n + 1 : 1), last: t };
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  return s;
}
function renderStreakLine() {
  const el = document.getElementById("streakLine");
  if (!el) return;
  const s = loadStreak();
  if (!s.n) { el.hidden = true; return; }
  el.hidden = false;
  const lit = Math.min(s.n, 7);
  el.innerHTML = "";
  const flame = document.createElement("span");
  flame.className = "flame";
  flame.textContent = "🔥";
  const label = document.createElement("span");
  label.className = "sl";
  label.textContent = s.n + "-day streak";
  const d = document.createElement("span");
  d.className = "dots";
  for (let i = 0; i < 7; i++) {
    const p = document.createElement("i");
    p.className = i < lit ? (i === lit - 1 ? "on new" : "on") : "off";
    d.appendChild(p);
  }
  el.appendChild(flame); el.appendChild(label); el.appendChild(d);
}

// ---------- pearl vault showcase (grows with banked pearls) ----------
function renderVault() {
  const v = document.getElementById("vault");
  if (!v) return;
  const pearls = META.pearls || 0;
  const n = pearls <= 0 ? 0 : Math.min(15, 1 + Math.floor(pearls / 25));
  if (!n) { v.innerHTML = ""; v.style.filter = ""; return; }
  const rows = [5, 4, 3, 2, 1];
  let circles = "", placed = 0;
  for (let r = 0; r < rows.length && placed < n; r++) {
    const y = 96 - r * 17;
    for (let i = 0; i < rows[r] && placed < n; i++, placed++) {
      const x = 100 + (i - (rows[r] - 1) / 2) * 21 + (r % 2 ? 4 : -4);
      const g = 8.5 - r * 0.5;
      circles += '<circle cx="' + x.toFixed(1) + '" cy="' + y + '" r="' + g.toFixed(1) + '" fill="url(#vp)"/>';
    }
  }
  v.innerHTML = '<svg viewBox="0 0 200 112"><defs><radialGradient id="vp" cx=".35" cy=".3" r=".95"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f9a8d4"/><stop offset="1" stop-color="#a21caf"/></radialGradient></defs><ellipse cx="100" cy="104" rx="72" ry="7" fill="rgba(0,0,0,.45)"/>' + circles + '<path d="M150 22 l2.2 5.4 5.4 2.2 -5.4 2.2 -2.2 5.4 -2.2 -5.4 -5.4 -2.2 5.4 -2.2 Z" fill="#fefce8"/><path d="M48 44 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 Z" fill="#fefce8" opacity=".8"/></svg>';
  const glow = 0.35 + Math.min(0.65, n / 15 * 0.65);
  v.style.filter = "drop-shadow(0 0 " + Math.round(6 + n) + "px rgba(249,168,212," + glow.toFixed(2) + "))";
}

function showMenuTab(which) {
  for (const t of ["play", "shop", "ach", "build", "mode"]) {
    document.getElementById(t + "Tab").hidden = (t !== which);
    document.getElementById(t + "TabBtn").classList.toggle("active", t === which);
  }
  if (which === "shop") refreshShop();
  if (which === "ach") renderAch();
  if (which === "build") renderBuilds();
  if (which === "mode" && window.renderModes) window.renderModes();
}
// ---------- daily/weekly dive briefing: what it is + twists, confirm to dive ----------
let dailyInfoWeekly = false;
function deepPickSel(weekly) {
  dailyInfoWeekly = !!weekly;
  const dd = document.getElementById("deepDaily"), ww = document.getElementById("deepWeekly");
  if (dd) dd.classList.toggle("sel", !dailyInfoWeekly);
  if (ww) ww.classList.toggle("sel", dailyInfoWeekly);
  const go = document.getElementById("dailyGoBtn");
  if (go) go.textContent = dailyInfoWeekly ? "🗓 DIVE IN" : "🌊 DIVE IN";
}
function openDailyInfo() {
  const dBest = (() => { try { return JSON.parse(localStorage.getItem(dailyKey()) || "null"); } catch (e) { return null; } })();
  const wBest = (() => { try { return JSON.parse(localStorage.getItem(weeklyKey()) || "null"); } catch (e) { return null; } })();
  const dmods = rollDailyMods(), wmods = rollWeeklyMods();
  const dd = document.getElementById("deepDailyDate"), wd = document.getElementById("deepWeeklyDate");
  if (dd) dd.textContent = "📅 " + todayStr();
  if (wd) wd.textContent = "🗓 " + weekStr();
  const dt = document.getElementById("deepDailyTwists"), wt = document.getElementById("deepWeeklyTwists");
  if (dt) { dt.textContent = dmods.map((m) => (m.icon || "🌀") + " " + m.name).join(" • "); dt.title = dmods.map((m) => m.name + ": " + m.desc).join("\n"); }
  if (wt) { wt.textContent = wmods.map((m) => (m.icon || "🌀") + " " + m.name).join(" • "); wt.title = wmods.map((m) => m.name + ": " + m.desc).join("\n") + "\nNew reef every week — best saved separately."; }
  const db = document.getElementById("deepDailyBest"), wb = document.getElementById("deepWeeklyBest");
  if (db) db.textContent = dBest ? ("★ today: wave " + dBest.wave) : "no dive logged today — the reef awaits";
  if (wb) wb.textContent = wBest ? ("★ this week: wave " + wBest.wave) : "no dive logged this week";
  const dc = document.getElementById("deepDaily"), wc = document.getElementById("deepWeekly");
  if (dc) dc.onclick = () => { deepPickSel(false); tone(700, 0.06, "triangle", 0.07, 900); };
  if (wc) wc.onclick = () => { deepPickSel(true); tone(700, 0.06, "triangle", 0.07, 900); };
  deepPickSel(false);
  document.getElementById("dailyOverlay").hidden = false;
}

// ---------- difficulty picker (PLAY opens a popup, pick starts the dive) ----------
// per-mode color identity + punchy tagline for the PLAY popup cards
const MODE_STYLE = {
  rush: { c: "#fb7185", tag: "Four bosses. No mercy." },
  swarm: { c: "#4ade80", tag: "How long can you last?" },
  descent: { c: "#a78bfa", tag: "Draft trials. Slay 3 act bosses." },
  story: { c: "#fbbf24", tag: "12 hand-crafted dives + lore." },
  challenge: { c: "#22d3ee", tag: "Seeded runs. Share the code." },
  reef: { c: "#fb923c", tag: "Turrets, walls & last stands." },
  predator: { c: "#f87171", tag: "You are the Maw." },
  remora: { c: "#a3e635", tag: "Tiny. Fragile. Clever." },
};
function renderDiffPick() {
  const row = document.getElementById("diffPickRow");
  if (!row) return;
  const cur = loadDiff();
  row.innerHTML = "";
  for (const id of ["easy", "normal", "hard"]) {
    const d = DIFFS[id];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "diffBtn" + (cur === id ? " sel" : "");
    b.dataset.diff = id;
    b.style.setProperty("--dc", d.color);
    const ico = document.createElement("span");
    ico.className = "dIco";
    ico.textContent = d.icon;
    const main = document.createElement("span");
    main.className = "dMain";
    const nm = document.createElement("span");
    nm.className = "dName";
    nm.textContent = d.name;
    const bl = document.createElement("span");
    bl.className = "dBlurb";
    bl.textContent = d.blurb;
    const tp = document.createElement("span");
    tp.className = "dTip";
    tp.textContent = d.tip;
    main.appendChild(nm); main.appendChild(bl); main.appendChild(tp);
    const chips = document.createElement("span");
    chips.className = "dChips";
    for (const [sym, k, label] of [["★", "score", "score"], ["●", "pearl", "pearls"], ["✦", "xp", "XP"]]) {
      const c = document.createElement("i");
      c.textContent = sym + " ×" + d[k];
      c.title = label + " multiplier";
      chips.appendChild(c);
    }
    b.appendChild(ico); b.appendChild(main); b.appendChild(chips);
    b.addEventListener("click", () => {
      saveDiff(id);
      document.getElementById("diffOverlay").hidden = true;
      tone(700, 0.08, "triangle", 0.09, 1000);
      startGame(false);
    });
    row.appendChild(b);
  }
  // other waters: every registered mode, launched straight from PLAY
  const mg = document.getElementById("diveModeGrid");
  if (mg && window.ModeCore && window.ModeCore.modes) {
    mg.innerHTML = "";
    for (const m of window.ModeCore.modes) {
      const st = MODE_STYLE[m.id] || { c: "#22d3ee", tag: m.desc };
      const card = document.createElement("div");
      card.className = "modeCard";
      card.style.setProperty("--mc", st.c);
      let best = "";
      try { best = m.bestText ? (m.bestText(window.ModeCore.modeBest(m.id)) || "") : ""; } catch (e) { best = ""; }
      card.title = m.desc + (best ? " • " + best : "");
      const top = document.createElement("div");
      top.className = "mTop";
      const mi = document.createElement("span");
      mi.className = "mIco";
      mi.textContent = m.icon;
      const head = document.createElement("div");
      head.className = "mHead";
      const nm = document.createElement("b");
      nm.textContent = m.name;
      const tag = document.createElement("span");
      tag.className = "mTag";
      tag.textContent = st.tag;
      head.appendChild(nm); head.appendChild(tag);
      top.appendChild(mi); top.appendChild(head);
      card.appendChild(top);
      if (best) {
        const mb = document.createElement("div");
        mb.className = "mBest";
        mb.textContent = best;
        card.appendChild(mb);
      }
      const go = document.createElement("div");
      go.className = "go";
      go.textContent = "▶ DIVE IN";
      card.appendChild(go);
      card.addEventListener("click", () => {
        document.getElementById("diffOverlay").hidden = true;
        tone(700, 0.08, "triangle", 0.09, 1000);
        window.ModeCore.launch(m.id);
      });
      mg.appendChild(card);
    }
  }
}
function openDiffPick() {
  wakeFish();
  renderDiffPick();
  showDivePane("classic", true);
  document.getElementById("diffOverlay").hidden = false;
}
function showDivePane(which, silent) {
  const classic = which !== "modes";
  document.getElementById("diveClassicPane").hidden = !classic;
  document.getElementById("diveModesPane").hidden = classic;
  document.getElementById("diveTabClassic").classList.toggle("active", classic);
  document.getElementById("diveTabModes").classList.toggle("active", !classic);
  if (!silent) tone(classic ? 600 : 800, 0.06, "triangle", 0.07, 900);
}
// ---------- loadout codex tab: favorite builds + deepest dives ----------
const SKILL_NAMES = { dmg: "Heavy", rate: "Rapid", size: "Big", crit: "Lucky", multi: "Split", pierce: "Pierce", bounce: "Bouncy", speed: "Swift", hp: "Heart", magnet: "Magnet", regen: "Regen", xp: "Learner", heal: "Snack", trident: "TRIDENT", depth: "DEPTH", star: "STARFALL", lheart: "L.HEART", mael: "MAELSTROM", echo: "Echo", patience: "Patience", vow: "Vow" };
function renderBuilds() {
  const list = document.getElementById("buildList");
  if (!list) return;
  const all = loadBuilds();
  document.getElementById("buildCount").textContent = all.length ? "📚 " + all.length + " dives remembered — deepest first" : "📚 No dives recorded yet — go pop something!";
  list.innerHTML = "";
  // bestiary journal: every species met + popped (unseen ones stay mysterious)
  META.seen = META.seen || {}; META.slain = META.slain || {};
  const metN = BEASTS.filter((b) => (META.seen[b.id] || 0) > 0).length;
  const bh = document.createElement("div");
  bh.className = "best";
  bh.textContent = "🐠 BESTIARY — " + metN + " / " + BEASTS.length + " species met";
  list.appendChild(bh);
  const bar = document.createElement("div");
  bar.className = "bestBar";
  const fill = document.createElement("i");
  fill.style.width = Math.round((metN / BEASTS.length) * 100) + "%";
  bar.appendChild(fill);
  list.appendChild(bar);
  const grid = document.createElement("div");
  grid.className = "beastGrid";
  for (const b of BEASTS) {
    const s = META.seen[b.id] || 0, k = META.slain[b.id] || 0;
    const row = document.createElement("div");
    row.className = "beastRow" + (s ? " met" : " locked") + (b.apex ? " apex" : "") + (b.id === "elite" ? " eliteBeast" : "");
    row.title = s ? (b.name + ": met ×" + s + " • popped ×" + k) : "not yet encountered — keep diving";
    if (s) {
      row.style.borderTopColor = b.color;
      row.style.background = "linear-gradient(180deg, " + b.color + "2e, rgba(255,255,255,.04) 55%)";
    }
    const top = document.createElement("div");
    top.className = "bTop";
    const med = document.createElement("span");
    med.className = "bi";
    med.textContent = s ? b.icon : "?";
    if (s) {
      med.style.background = "radial-gradient(circle at 35% 30%, #ffffff, " + b.color + " 78%)";
      med.style.borderColor = "rgba(255,255,255,.55)";
      med.style.boxShadow = "0 0 10px " + b.color;
    }
    const nm = document.createElement("b");
    nm.className = "bnm";
    nm.textContent = s ? b.name : "???";
    top.appendChild(med); top.appendChild(nm);
    if (b.apex && s) {
      const tag = document.createElement("span");
      tag.className = "apexTag";
      tag.textContent = "APEX";
      top.appendChild(tag);
    }
    const bl = document.createElement("small");
    bl.className = "blurb";
    bl.textContent = s ? b.blurb : "keep diving…";
    row.appendChild(top); row.appendChild(bl);
    const stats = document.createElement("div");
    stats.className = "bStats";
    if (s) {
      const m1 = document.createElement("span");
      m1.textContent = "👁 " + s + " met";
      const m2 = document.createElement("span");
      m2.textContent = "💥 " + k + " popped";
      stats.appendChild(m1); stats.appendChild(m2);
    } else {
      const u = document.createElement("span");
      u.className = "unseenTag";
      u.textContent = "UNSEEN";
      stats.appendChild(u);
    }
    row.appendChild(stats);
    grid.appendChild(row);
  }
  list.appendChild(grid);
  const dh = document.createElement("div");
  dh.className = "best";
  dh.textContent = all.length ? "🐡 PAST DIVE BUILDS" : "";
  if (all.length) list.appendChild(dh);
  for (const r of all) {
    const row = document.createElement("div");
    row.className = "achRow" + (r.daily ? "" : "");
    const ic = document.createElement("span");
    ic.className = "ai";
    ic.textContent = "🐡";
    const an = document.createElement("span");
    an.className = "an";
    const b = document.createElement("b");
    b.textContent = "Wave " + r.wave + " • " + r.morph + (r.daily ? " (daily)" : r.weekly ? " (weekly)" : " (" + (r.diff || "normal") + ")");
    const sm = document.createElement("small");
    const tops = r.tops.map((t) => { const [id, n] = t.split(" "); return (SKILL_NAMES[id] || id) + " " + n; }).join(" • ");
    sm.textContent = fmtTime(r.time) + " • " + r.kills + " pops • LV" + r.lvl + " • " + tops + " • " + r.date;
    an.appendChild(b);
    an.appendChild(sm);
    row.appendChild(ic);
    row.appendChild(an);
    list.appendChild(row);
  }
}

document.getElementById("playTabBtn").addEventListener("click", () => showMenuTab("play"));
document.getElementById("shopTabBtn").addEventListener("click", () => showMenuTab("shop"));
document.getElementById("achTabBtn").addEventListener("click", () => showMenuTab("ach"));
document.getElementById("buildTabBtn").addEventListener("click", () => showMenuTab("build"));
document.getElementById("playBtn").addEventListener("click", () => openDiffPick());
document.getElementById("diffCancelBtn").addEventListener("click", () => { document.getElementById("diffOverlay").hidden = true; sleepFish(); });
document.getElementById("diveTabClassic").addEventListener("click", () => showDivePane("classic"));
document.getElementById("diveTabModes").addEventListener("click", () => showDivePane("modes"));
document.getElementById("lvlTabUp").addEventListener("click", () => showLvlTab("up"));
document.getElementById("lvlTabCodex").addEventListener("click", () => showLvlTab("codex"));
document.getElementById("againBtn").addEventListener("click", () => { if (window.__againFn) window.__againFn(); else startGame(G.daily, G.weekly); });
document.getElementById("restartBtn").addEventListener("click", () => { if (window.__againFn) window.__againFn(); else startGame(G.daily, G.weekly); });
document.getElementById("deepBtn").addEventListener("click", () => openDailyInfo());
document.getElementById("dailyGoBtn").addEventListener("click", () => { document.getElementById("dailyOverlay").hidden = true; startGame(!dailyInfoWeekly, dailyInfoWeekly); });
document.getElementById("dailyBackBtn").addEventListener("click", () => { document.getElementById("dailyOverlay").hidden = true; });
document.getElementById("depthGoBtn").addEventListener("click", diveDeeper);
document.getElementById("depthEndBtn").addEventListener("click", endDive);
document.getElementById("pactSkipBtn").addEventListener("click", () => pickPact(-1));
document.getElementById("relicSkipBtn").addEventListener("click", () => pickRelic(-1));
document.getElementById("resumeBtn").addEventListener("click", togglePause);
document.getElementById("pauseBtn").addEventListener("click", () => {
  if (document.getElementById("confirmOverlay").hidden === false) return;
  if (G.state === "play" || G.state === "pause") togglePause();
});
let homeFromPause = false;
document.getElementById("homeBtn").addEventListener("click", () => {
  if (G.state !== "play" && G.state !== "pause") return;
  homeFromPause = (G.state === "pause");
  G.state = "pause";
  pauseOverlay.hidden = true;
  document.getElementById("confirmOverlay").hidden = false;
});
document.getElementById("confirmYesBtn").addEventListener("click", () => quitToMenu());
document.getElementById("confirmNoBtn").addEventListener("click", () => {
  document.getElementById("confirmOverlay").hidden = true;
  if (homeFromPause) pauseOverlay.hidden = false;
  else G.state = "play";
});
document.getElementById("quitBtn").addEventListener("click", () => quitToMenu());

// Quits the current run and returns to the main menu, banking progress like a normal run end.
function quitToMenu() {
  const inDraft = G.state === "pact" || G.state === "relic" || G.state === "levelup";
  if (G.state !== "play" && G.state !== "pause" && !inDraft) return;
  if (!inDraft) bankRun(); // drafts haven't started a run yet — nothing to bank
  G.state = "menu";
  Music.on = false;
  levelOverlay.hidden = true;
  pauseOverlay.hidden = true;
  pactOverlay.hidden = true;
  document.getElementById("relicOverlay").hidden = true;
  document.getElementById("confirmOverlay").hidden = true;
  overOverlay.hidden = true;
  refreshShop();
  refreshBestLine();
  document.getElementById("diffOverlay").hidden = true;
  document.getElementById("comboMeter").hidden = true;
  G.gate = null; G.gateHold = false;
  sleepFish();
  startOverlay.hidden = false;
  showMenuTab("play");
  updateHud(true);
}
// vacuum all nearby gems toward the player (12s cooldown)
function magnetPulse() {
  if (G.state !== "play" || G.magPulseCD > 0) return;
  G.magPulseCD = 12;
  const R = 460;
  for (const g of G.gems) {
    const dx = P.x - g.x, dy = P.y - g.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    if (d < R) {
      const k = 1100 * (1 - d / (R + 60));
      g.vx += (dx / d) * k; g.vy += (dy / d) * k;
    }
  }
  for (const u of G.pups) {
    const dx = P.x - u.x, dy = P.y - u.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    if (d < R) {
      const k = 1100 * (1 - d / (R + 60));
      u.vx += (dx / d) * k; u.vy += (dy / d) * k;
    }
  }
  pushRing(P.x, P.y, R, "#67e8f9", 3);
  burst(P.x, P.y, "#67e8f9", 14, 260);
  tone(300, 0.3, "sine", 0.12, 1200);
  updateHud(true);
}
// ---------- active abilities ----------
function abilCD(which) {
  const r = P.abil[which] || 0;
  if (!r) return 0;
  const base = which === "nova" ? 12 : which === "freeze" ? 25 : 20;
  return base * (r > 1 ? 0.7 : 1) * (G.relicFrostCD || 1);
}
function shockwavePulse() {
  if (G.state !== "play" || !P.abil.nova || G.cdNova > 0) return false;
  G.cdNova = abilCD("nova");
  const R = 280;
  pushRing(P.x, P.y, R, "#67e8f9", 6);
  pushRing(P.x, P.y, R * 0.6, "#ffffff", 3);
  burst(P.x, P.y, "#67e8f9", 30, 420, 10);
  G.lights.push({ x: P.x, y: P.y, t: 0.4, max: 0.4, color: "103,232,249", r: 300 });
  G.shake = Math.min(10, G.shake + 5);
  partWeeds(P.x, P.y, 320);
  tone(120, 0.4, "sawtooth", 0.18, 40);
  setTimeout(() => tone(240, 0.3, "sawtooth", 0.12, 80), 120);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const d = Math.max(1, Math.hypot(e.x - P.x, e.y - P.y));
    if (d < R + e.r) {
      damageFoe(e, 60 * dmgMul(), false, P.x, P.y);
      e.kx += ((e.x - P.x) / d) * 620;
      e.ky += ((e.y - P.y) / d) * 620;
    }
  }
  buzz([50, 40, 70]);
  updateHud(true);
  return true;
}
function timeFreeze() {
  if (G.state !== "play" || !P.abil.freeze || G.cdFreeze > 0) return false;
  G.cdFreeze = abilCD("freeze");
  G.freezeT = 3 + (G.relicFreeze || 0);
  pushRing(P.x, P.y, 420, "#bae6fd", 5);
  burst(P.x, P.y, "#e0f2fe", 26, 300, 8);
  addText(P.x, P.y - 40, "❄ FROZEN ❄", "#bae6fd", 22);
  tone(880, 0.4, "sine", 0.12, 110);
  setTimeout(() => tone(440, 0.5, "sine", 0.1, 80), 200);
  buzz([60, 60, 60]);
  updateHud(true);
  return true;
}
function decoyBubble() {
  if (G.state !== "play" || !P.abil.decoy || G.cdDecoy > 0) return false;
  G.cdDecoy = abilCD("decoy");
  G.decoy = { x: P.x + Math.cos(P.face) * 60, y: P.y + Math.sin(P.face) * 60, t: 6, max: 6 };
  pushRing(G.decoy.x, G.decoy.y, 90, "#f0abfc", 3);
  burst(G.decoy.x, G.decoy.y, "#f0abfc", 16, 240);
  addText(G.decoy.x, G.decoy.y - 30, "DECOY!", "#f0abfc", 15);
  tone(600, 0.2, "triangle", 0.1, 1200);
  updateHud(true);
  return true;
}
// ---------- combo finisher: cash in a 20+ chain for a screen-clearing nova ----------
function comboFinisher() {
  if (G.state !== "play" || G.combo < 20 || G.cdFin > 0) { if (G.combo < 20) buzz(30); return false; }
  const power = 20 + G.combo * 3;
  G.cdFin = 20;
  addText(P.x, P.y - 46, "NOVA ×" + G.combo + "!", "#fde047", 24);
  pushRing(P.x, P.y, 520, "#fde047", 7);
  pushRing(P.x, P.y, 320, "#ffffff", 4);
  burst(P.x, P.y, "#fde047", 46, 520, 14);
  G.lights.push({ x: P.x, y: P.y, t: 0.5, max: 0.5, color: "253,224,71", r: 480 });
  G.flashR = Math.min(260, G.flashR + 200 * (OPT.calm ? 0.25 : 1)); // novas flare the whole reef
  G.shake = Math.min(12, G.shake + 7);
  partWeeds(P.x, P.y, 460);
  tone(150, 0.5, "sawtooth", 0.2, 50);
  setTimeout(() => tone(600, 0.4, "triangle", 0.14, 1200), 150);
  buzz([80, 60, 100]);
  for (const e of G.enemies) {
    if (e.dead || e.boss) continue;
    if (!onScreen(e.x, e.y, 40)) continue;
    const d = Math.max(1, Math.hypot(e.x - P.x, e.y - P.y));
    damageFoe(e, power * dmgMul(), true, P.x, P.y);
    e.kx += ((e.x - P.x) / d) * 400;
    e.ky += ((e.y - P.y) / d) * 400;
  }
  if (OPT.slowmo !== false) G.slowmo = Math.max(G.slowmo, 0.4);
  G.combo = 0; G.comboT = 0;
  updateHud(true);
  return true;
}
// ---------- shockwaves part the seaweed (kill cams, novas, pulses) ----------
function partWeeds(x, y, r) {
  let n = 0;
  for (const d of G.decor) {
    if (d.kind !== "weed") continue;
    const dx = d.x - x, dy = d.y - y;
    if (dx * dx + dy * dy > r * r) continue;
    d.swish = 1.2;
    if (n < 14 && G.parts.length < 240) {
      n++;
      G.parts.push({ x: d.x + rand(-8, 8), y: d.y - d.r * 0.5, vx: rand(-60, 60) + dx * 0.6, vy: rand(-160, -60), r: rand(2, 4), color: "#c8f6ff", life: rand(0.6, 1.1), t: 0, kind: "bubble", grow: 0, seed: Math.random() * TAU });
    }
  }
  for (const m of G.minnows) {
    const dx = m.x - x, dy = m.y - y;
    if (dx * dx + dy * dy < r * r * 1.4) { m.scare = 1.4; m.a = Math.atan2(dy, dx); }
  }
}
// ---------- risk/reward: clam choices + wandering merchant ----------
function openClamChoice(c) {
  G.pendingClam = c;
  G.state = "clam";
  document.getElementById("clamOverlay").hidden = false;
  tone(700, 0.15, "triangle", 0.1, 1050);
}
function resolveClam(release) {
  const c = G.pendingClam;
  G.pendingClam = null;
  document.getElementById("clamOverlay").hidden = true;
  if (G.state === "clam") G.state = "play";
  if (!c) return;
  if (release) {
    // release the spirit: a lasting blessing instead of loot
    P.regen += 0.3;
    P.hp = Math.min(P.maxHp, P.hp + 30);
    burst(c.x, c.y, "#6ee7b7", 24, 260, 8);
    pushRing(c.x, c.y, 120, "#6ee7b7");
    addText(c.x, c.y - 30, "SPIRIT RELEASED! +regen", "#6ee7b7", 15);
    tone(523, 0.2, "triangle", 0.1, 1046);
  } else {
    spawnGems(c.x, c.y, 8);
    spawnPearls(c.x, c.y, 3);
    burst(c.x, c.y, "#fde68a", 16, 200, 8);
    pushRing(c.x, c.y, 90, "#fde68a");
    addText(c.x, c.y - 30, "TREASURE!", "#fde68a", 16);
    tone(900, 0.15, "triangle", 0.1, 1400);
  }
  updateHud(true);
}
function openShop() {
  if (G.state !== "play" || !G.merchant) return;
  G.state = "shop";
  // 3 random upgrades, priced by how deep your build already is
  const pool = UPS.filter((u) => !u.can || u.can());
  const stock = [];
  const cp = pool.slice();
  while (stock.length < 3 && cp.length) {
    const u = cp.splice((RNG() * cp.length) | 0, 1)[0];
    const cost = 3 + (P.stacks[u.id] || 0) * 3 + Math.floor(G.wave / 3);
    stock.push({ u, cost, sold: false });
  }
  G.merchant.stock = stock;
  updateShopDom();
  document.getElementById("shopOverlay").hidden = false;
  tone(520, 0.2, "triangle", 0.1, 780);
}
function updateShopDom() {
  const m = G.merchant;
  if (!m) return;
  document.getElementById("shopPearls").textContent = "● " + G.runPearls + " pearls on you";
  const ctn = document.getElementById("shopStock");
  ctn.innerHTML = "";
  for (let i = 0; i < m.stock.length; i++) {
    const s = m.stock[i];
    const row = document.createElement("div");
    row.className = "shopRow";
    const b = document.createElement("b");
    b.textContent = (s.u.icon || "◆") + " " + s.u.name;
    const sp = document.createElement("span");
    sp.textContent = s.sold ? "SOLD" : s.u.desc;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = s.sold ? "✓" : "● " + s.cost;
    btn.disabled = s.sold || G.runPearls < s.cost;
    if (!s.sold) btn.addEventListener("click", () => buyStock(i));
    row.appendChild(b);
    row.appendChild(sp);
    row.appendChild(btn);
    ctn.appendChild(row);
  }
}
function buyStock(i) {
  const m = G.merchant;
  const s = m && m.stock[i];
  if (!s || s.sold || G.runPearls < s.cost) { buzz(30); return; }
  G.runPearls -= s.cost;
  s.sold = true;
  s.u.apply();
  P.stacks[s.u.id] = (P.stacks[s.u.id] || 0) + 1;
  checkMorph();
  tone(880, 0.12, "triangle", 0.1, 1320);
  updateShopDom();
  updateHud(true);
}
function closeChoice() {
  // ESC / leave: shop closes (merchant swims off), clam defaults to cracking
  if (G.state === "shop") {
    document.getElementById("shopOverlay").hidden = true;
    G.merchant = null;
    G.state = "play";
    tone(440, 0.15, "triangle", 0.08, 330);
  } else if (G.state === "clam") {
    resolveClam(false);
  }
}
// ---------- ascension: Dive Deeper past wave 28 for stacking foe power + pearls ----------
function openDepth() {
  document.getElementById("depthTitle").textContent = "⛧ Dive Deeper? (Depth " + (G.depth + 1) + ")";
  document.getElementById("depthDesc").textContent = "Foes +25% HP & damage, +50% pearls — your build carries on. Or bank everything and end the dive.";
  document.getElementById("depthOverlay").hidden = false;
  G.state = "depth";
  tone(110, 0.6, "sawtooth", 0.12, 55);
}
function diveDeeper() {
  if (G.state !== "depth") return;
  document.getElementById("depthOverlay").hidden = true;
  G.depth += 1;
  G.depthOffered = G.depth;
  G.depthHp = Math.pow(1.25, G.depth);
  G.depthDmg = Math.pow(1.25, G.depth);
  G.pearlDepth = 1 + 0.5 * G.depth;
  G.time = 0; G.wave = 1;
  G.enemies.length = 0; G.bullets.length = 0; G.ebullets.length = 0;
  G.bossAlive = false; G.bossSpawnedWave = 0; G.epicAlive = false; G.superAlive = false; G.superSpawnedWave = 0; G.hadalAlive = false; G.hadalSpawnedWave = 0;
  G.barrels.length = 0; G.webs.length = 0; G.pups.length = 0;
  G.gate = null; G.gateHold = false;
  G.powerKind = null; G.powerT = 0;
  G.combo = 0; G.comboT = 0; G.streak = 0; G.streakT = 0;
  G.obj = null; G.objT = 30; G.merchant = null; G.merchT = 50;
  G.clamWave = 0; G.chests.length = 0; G.nextChest = G.kills + 25;
  G.eliteT = 20; G.spawnTimer = 0.8; G.previewDone = false;
  G.mut = null; G.mutName = ""; G.mutSpd = 1; G.mutHp = 1; G.mutXp = 1; G.mutDmg = 1; G.mutGem = 1; G.mutHeart = false;
  G.stageN = 0; G.stageBag = [];
  snapCamera();
  enterStage(false); // fresh waters below: new stage sequence, quietly (DEPTH banner keeps the spotlight)
  G.state = "play";
  showBanner("⛧ DEPTH " + G.depth + " — THE REEF HUNGERS");
  setAnnounce("FOES +25% HP & DMG • +50% PEARLS");
  updateHud(true);
}
function endDive() {
  if (G.state !== "depth") return;
  document.getElementById("depthOverlay").hidden = true;
  gameOver();
}
// run timeline: wave curve + level dots + death mark, drawn on the game-over card
function renderTimeline(records) {
  const cv = document.getElementById("tlCanvas");
  if (!cv) return;
  const cx = cv.getContext("2d");
  const Wd = cv.width, Ht = cv.height;
  cx.clearRect(0, 0, Wd, Ht);
  const pts = G.tl.length ? G.tl.concat([{ t: Math.round(G.time), w: G.wave, l: P.lvl }]) : [{ t: 0, w: 1, l: 1 }];
  const maxT = Math.max(1, pts[pts.length - 1].t);
  const maxW = Math.max(1, ...pts.map((p) => p.w));
  const maxL = Math.max(1, ...pts.map((p) => p.l));
  cx.strokeStyle = "rgba(255,255,255,0.08)"; cx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) { cx.beginPath(); cx.moveTo(0, Ht * i / 4); cx.lineTo(Wd, Ht * i / 4); cx.stroke(); }
  cx.strokeStyle = "#22d3ee"; cx.lineWidth = 2; cx.beginPath();
  pts.forEach((p, i) => { const x = (p.t / maxT) * Wd, y = Ht - 8 - (p.w / maxW) * (Ht - 20); if (i) cx.lineTo(x, y); else cx.moveTo(x, y); });
  cx.stroke();
  cx.fillStyle = "#fde047";
  for (const p of pts) { const x = (p.t / maxT) * Wd, y = Ht - 8 - (p.l / maxL) * (Ht - 20); cx.fillRect(x - 1.5, y - 1.5, 3, 3); }
  const ex = Wd - 4, ey = Ht - 8 - (G.wave / maxW) * (Ht - 20);
  cx.strokeStyle = "#f87171"; cx.lineWidth = 3;
  cx.beginPath(); cx.moveTo(ex - 5, ey - 5); cx.lineTo(ex + 5, ey + 5); cx.moveTo(ex + 5, ey - 5); cx.lineTo(ex - 5, ey + 5); cx.stroke();
  const tn = document.getElementById("tlNote");
  if (tn) tn.textContent = "☠ slain by " + (FOE_NAMES[G.lastHitBy] || G.lastHitBy) + (records.length ? "   •   " + records.join("   •   ") : "");
}
// ---------- screenshot mode: hide the HUD, save your fish ----------
function screenshotMode() {
  if (G.state !== "play") return;
  G.hideHud = true;
  const wrap = document.getElementById("gameWrap");
  if (wrap) wrap.classList.add("hidehud");
  render();
  try {
    const a = document.createElement("a");
    a.download = "reef-portrait-" + morphDisplay().name.replace(/[^a-z0-9]+/gi, "-") + ".png";
    a.href = document.getElementById("gameCanvas").toDataURL("image/png");
    a.click();
    addText(P.x, P.y - 50, "📷 SAVED!", "#fff", 16);
  } catch (err) { /* ignore */ }
  G.hideHud = false;
  if (wrap) wrap.classList.remove("hidehud");
  tone(880, 0.1, "sine", 0.08, 1320);
}
// ---------- ghost replays: your best dive swims beside you ----------
const GHOST_KEY = "bubblePopArenaGhost";
function loadGhost() { try { return JSON.parse(localStorage.getItem(GHOST_KEY) || "null"); } catch (e) { return null; } }
function saveGhost(g) { try { localStorage.setItem(GHOST_KEY, JSON.stringify(g)); } catch (e) {} }
function ghostPosAt(t) {
  const gh = G.ghostPlay;
  if (!gh || !gh.pts || !gh.pts.length) return null;
  if (t < 0 || t > gh.t + 1.5) return null;
  let lo = 0, hi = gh.pts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (gh.pts[mid].t <= t) lo = mid; else hi = mid - 1; }
  return gh.pts[lo];
}
// ---------- loadout codex: builds + deepest dives, auto-recorded ----------
const BLD_KEY = "bubblePopArenaBuilds";
function loadBuilds() { try { return JSON.parse(localStorage.getItem(BLD_KEY) || "[]"); } catch (e) { return []; } }
function saveBuilds(b) { try { localStorage.setItem(BLD_KEY, JSON.stringify(b)); } catch (e) {} }
function recordBuild() {
  const tops = Object.entries(P.stacks || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + " " + v);
  const rec = {
    morph: morphDisplay().name, wave: G.wave, time: Math.floor(G.time),
    kills: G.kills, lvl: P.lvl, tops, daily: !!G.daily, weekly: !!G.weekly, diff: G.diff || "normal", date: todayStr(),
  };
  const all = loadBuilds();
  all.push(rec);
  all.sort((a, b) => b.wave - a.wave || b.kills - a.kills);
  saveBuilds(all.slice(0, 12));
  renderBuilds();
}
document.getElementById("dashBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); tryDash(); });
document.getElementById("magnetBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); magnetPulse(); });
document.getElementById("novaBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); shockwavePulse(); });
document.getElementById("freezeBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); timeFreeze(); });
document.getElementById("decoyBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); decoyBubble(); });
document.getElementById("finBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); comboFinisher(); });
document.getElementById("camBtn").addEventListener("click", () => screenshotMode());
document.getElementById("clamCrackBtn").addEventListener("click", () => resolveClam(false));
document.getElementById("clamFreeBtn").addEventListener("click", () => resolveClam(true));
document.getElementById("shopLeaveBtn").addEventListener("click", () => closeChoice());
document.getElementById("muteBtn").addEventListener("click", () => setMuted(!muted));
setMuted(muted);

function refreshOpts() {
  const sv = document.getElementById("optSfxVol"), mv = document.getElementById("optMusVol");
  if (sv) { sv.value = OPT.sfxVol; const lb = document.getElementById("optSfxVal"); if (lb) lb.textContent = OPT.sfxVol; }
  if (mv) { mv.value = OPT.musVol; const lb = document.getElementById("optMusVal"); if (lb) lb.textContent = OPT.musVol; }
  const sh = document.getElementById("optShake");
  if (sh) { sh.textContent = OPT.shake ? "ON" : "OFF"; sh.classList.toggle("off", !OPT.shake); }
  const pa = document.getElementById("optParticles");
  if (pa) { pa.textContent = OPT.particles ? "FULL" : "REDUCED"; pa.classList.toggle("off", !OPT.particles); }
  const dn = document.getElementById("optDmg");
  if (dn) { dn.textContent = OPT.dmgNums !== false ? "ON" : "OFF"; dn.classList.toggle("off", OPT.dmgNums === false); }
  const hs = document.getElementById("optHitstop");
  if (hs) { hs.textContent = OPT.hitStop !== false ? "ON" : "OFF"; hs.classList.toggle("off", OPT.hitStop === false); }
  const sm = document.getElementById("optSlowmo");
  if (sm) { sm.textContent = OPT.slowmo !== false ? "ON" : "OFF"; sm.classList.toggle("off", OPT.slowmo === false); }
  const ca = document.getElementById("optCalm");
  if (ca) { ca.textContent = OPT.calm ? "ON" : "OFF"; ca.classList.toggle("off", !OPT.calm); }
  const vb = document.getElementById("optVib");
  if (vb) { vb.textContent = OPT.vib !== false ? "ON" : "OFF"; vb.classList.toggle("off", OPT.vib === false); }
}
document.getElementById("gearBtn").addEventListener("click", () => { refreshOpts(); document.getElementById("optionsOverlay").hidden = false; });
document.getElementById("optClose").addEventListener("click", () => { document.getElementById("optionsOverlay").hidden = true; });
document.getElementById("optSfxVol").addEventListener("input", (e) => { OPT.sfxVol = +e.target.value; saveOpts(); refreshOpts(); ensureAudio(); tone(880, 0.08, "sine", 0.08); });
document.getElementById("optMusVol").addEventListener("input", (e) => { OPT.musVol = +e.target.value; saveOpts(); refreshOpts(); ensureAudio(); tone(523, 0.12, "triangle", 0.08); });
document.getElementById("optShake").addEventListener("click", () => { OPT.shake = !OPT.shake; saveOpts(); refreshOpts(); });
document.getElementById("optParticles").addEventListener("click", () => { OPT.particles = !OPT.particles; saveOpts(); refreshOpts(); });
document.getElementById("optDmg").addEventListener("click", () => { OPT.dmgNums = !(OPT.dmgNums !== false); saveOpts(); refreshOpts(); });
document.getElementById("optHitstop").addEventListener("click", () => { OPT.hitStop = !(OPT.hitStop !== false); saveOpts(); refreshOpts(); });
document.getElementById("optSlowmo").addEventListener("click", () => { OPT.slowmo = !(OPT.slowmo !== false); saveOpts(); refreshOpts(); });
document.getElementById("optCalm").addEventListener("click", () => { OPT.calm = !OPT.calm; saveOpts(); refreshOpts(); });
document.getElementById("optVib").addEventListener("click", () => { OPT.vib = !(OPT.vib !== false); saveOpts(); refreshOpts(); buzz(20); });
let resetArmT = 0;
document.getElementById("optReset").addEventListener("click", (e) => {
  const now = performance.now();
  if (now - resetArmT > 4000) {
    resetArmT = now;
    e.currentTarget.textContent = "TAP AGAIN TO CONFIRM";
    setTimeout(() => { e.currentTarget.textContent = "RESET PROGRESS"; }, 4000);
    return;
  }
  try {
    localStorage.removeItem("bubblePopArenaBest");
    localStorage.removeItem("bubblePopArenaBest_easy");
    localStorage.removeItem("bubblePopArenaBest_normal");
    localStorage.removeItem("bubblePopArenaBest_hard");
    localStorage.removeItem(META_KEY);
    localStorage.removeItem("bubblePopArenaStreak");
    localStorage.removeItem(dailyKey());
    try { localStorage.removeItem(weeklyKey()); } catch (err) { /* ignore */ }
  } catch (err) { /* ignore */ }
  e.currentTarget.textContent = "RESET PROGRESS";
  refreshBestLine();
  refreshShop();
  tone(200, 0.2, "triangle", 0.1, 100);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && G.state === "play") togglePause();
});

// ---------- sizing ----------
function resize() {
  const r = wrap.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(280, r.width);
  H = Math.max(420, r.height);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  vigGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  vigGrad.addColorStop(0, "rgba(2,10,24,0)");
  vigGrad.addColorStop(1, "rgba(2,10,24,0.38)");
  hurtGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
  hurtGrad.addColorStop(0, "rgba(244,63,94,0)");
  hurtGrad.addColorStop(1, "rgba(244,63,94,0.7)");
  if (P.x !== undefined) {
    P.x = clamp(P.x, P.r || 16, WORLD.w - (P.r || 16));
    P.y = clamp(P.y, P.r || 16, WORLD.h - (P.r || 16));
  }
  snapCamera();
}
new ResizeObserver(resize).observe(wrap);
window.addEventListener("orientationchange", () => setTimeout(resize, 200));
resize();

genDecor();
resetPlayer();
snapCamera();
sleepFish();
refreshBestLine();
refreshShop();

// ---------- animated main-menu decor (JS-driven: CSS timelines can freeze in some embeds) ----------
let menuFx = null, menuT = 0;
function menuFxInit() {
  if (menuFx) return;
  menuFx = { bubbles: [], fish: [], snow: [], rays: [...document.querySelectorAll("#startOverlay .rays i")], mascot: document.querySelector("#startOverlay .mascot"), title: document.querySelector("#startOverlay h1"), shine: document.querySelector("#playBtn .shine"), glowW: document.getElementById("menuGlowW"), glowR: document.getElementById("menuGlowR"), dailyBtn: document.getElementById("deepBtn"), playBtn: document.getElementById("playBtn"), waves: [], panel: document.querySelector(".menuPanel"), parFarX: 0, parMidX: 0, orbitC: document.getElementById("orbitFish") };
  menuFx.parFar = document.querySelector("#startOverlay .parFar");
  menuFx.parMid = document.querySelector("#startOverlay .parMid");
  menuFx.orbitX = menuFx.orbitC ? menuFx.orbitC.getContext("2d") : null;
  document.querySelectorAll("#menuBubbles span").forEach((el, i) => {
    // steady bottom-fed stream: staggered heights, spread sizes/speeds; each
    // riser resurfaces at a fresh random x so bubbles keep blowing up along the whole bottom
    const sz = 6 + ((i * 53) % 17);
    el.style.width = sz.toFixed(0) + "px";
    el.style.height = sz.toFixed(0) + "px";
    menuFx.bubbles.push({ el, x: 2 + ((i * 61) % 93), y: Math.random() * 1.1, dur: 5 + ((i * 37) % 60) / 10, wob: Math.random() * 6.28 });
  });
  const f = [document.querySelector(".menuFish .f1"), document.querySelector(".menuFish .f2"), document.querySelector(".menuFish .f3")];
  const spec = [{ x: -0.1, dir: 1, dur: 17, ph: 0 }, { x: 1.05, dir: -1, dur: 23, ph: 2.1 }, { x: 0.3, dir: 1, dur: 29, ph: 4.2 }];
  f.forEach((el, i) => { if (el) menuFx.fish.push({ el, ...spec[i] }); });
  const w1 = document.querySelector("#deepBtn .w1"), w2 = document.querySelector("#deepBtn .w2");
  if (w1) menuFx.waves.push({ el: w1, x: 0, sp: -42 });
  if (w2) menuFx.waves.push({ el: w2, x: 60, sp: 27 });
  // transparent surf behind the title: two translucent swells sliding past each other
  document.querySelectorAll("#startOverlay .titleWaves i").forEach((el, i) => menuFx.waves.push({ el, x: i ? 60 : 0, sp: i ? -46 : 30 }));
  menuFx.zzz = [...document.querySelectorAll("#startOverlay .zee")].map((el, i) => ({ el, off: i * 0.33 }));
  const snowCtn = document.getElementById("snow");
  if (snowCtn) {
    for (let i = 0; i < 26; i++) {
      const el = document.createElement("span");
      const plank = (i % 3 === 0);
      if (plank) el.className = "plankton";
      const sz = plank ? 3 + (i % 3) : 2 + (i % 4);
      el.style.width = sz + "px"; el.style.height = sz + "px";
      const x = (i * 37.7 + 11) % 100;
      el.style.left = x.toFixed(1) + "%";
      snowCtn.appendChild(el);
      menuFx.snow.push({ el, y: ((i * 53.3) % 100) / 100, sp: (plank ? -(0.008 + (i % 5) * 0.004) : 0.012 + (i % 5) * 0.006) });
    }
  }
}

// pufferfish portrait for the menu orbit: same palette as the in-game player,
// sized by Vitality, snout by Power, gold halo if Second Wind is owned
function drawOrbitPuffer() {
  const F = menuFx;
  if (!F.orbitX || startOverlay.hidden || !F.panel || !F.orbitC) return;
  const or = startOverlay.getBoundingClientRect();
  const pr = F.panel.getBoundingClientRect();
  const m = 30;
  const x0 = pr.left - or.left - m, y0 = pr.top - or.top - m + 6;
  const x1 = pr.right - or.left + m, y1 = pr.bottom - or.top + m;
  const w = x1 - x0, h = y1 - y0;
  const per = 2 * (w + h);
  let t = ((menuT * 46) % per + per) % per;
  let px, py, vx;
  if (t < w) { px = x0 + t; py = y0; vx = 1; }
  else if (t < w + h) { px = x1; py = y0 + (t - w); vx = 0; }
  else if (t < 2 * w + h) { px = x1 - (t - w - h); py = y1; vx = -1; }
  else { px = x0; py = y1 - (t - 2 * w - h); vx = 0; }
  F.orbitC.style.left = (px - 42) + "px";
  F.orbitC.style.top = (py - 31) + "px";
  const x = F.orbitX;
  x.clearRect(0, 0, 84, 63);
  x.save();
  x.translate(42, 32);
  x.scale(vx < 0 ? -0.9 : 0.9, 0.9);
  const M = loadMeta();
  const sc = Math.min(1.45, 1 + (M.vitality || 0) * 0.07);
  x.scale(sc, sc);
  const r = 15;
  const wag = Math.sin(menuT * 9) * 0.4;
  x.fillStyle = "#0e9db8";
  x.save(); x.translate(-r - 1, 0); x.rotate(wag);
  x.beginPath(); x.moveTo(0, 0); x.lineTo(-10, -7); x.lineTo(-7, 0); x.lineTo(-10, 7); x.closePath(); x.fill(); x.restore();
  const flap = 0.3 + Math.abs(Math.sin(menuT * 7)) * 0.7;
  for (const s of [-1, 1]) {
    x.save(); x.translate(-1, s * (r - 2)); x.rotate(s * flap);
    x.beginPath(); x.ellipse(-6, 0, 7, 4, 0, 0, TAU); x.fill(); x.restore();
  }
  x.fillStyle = "#0e7490";
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    if (Math.abs(a) < 0.5 || Math.abs(a - TAU) < 0.5 || Math.abs(a - Math.PI) < 0.45) continue;
    x.beginPath();
    x.moveTo(Math.cos(a - 0.09) * (r - 4), Math.sin(a - 0.09) * (r - 4));
    x.lineTo(Math.cos(a) * (r + 3.2), Math.sin(a) * (r + 3.2));
    x.lineTo(Math.cos(a + 0.09) * (r - 4), Math.sin(a + 0.09) * (r - 4));
    x.closePath(); x.fill();
  }
  if ((M.second || 0) > 0) {
    x.strokeStyle = "rgba(253,224,71,.85)"; x.lineWidth = 1.6;
    x.beginPath(); x.arc(0, 0, r + 6 + Math.sin(menuT * 3), 0, TAU); x.stroke();
  }
  x.fillStyle = "#22d3ee";
  x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
  x.lineWidth = 2.5; x.strokeStyle = "#0e7490";
  x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke();
  const snout = 8 + Math.min(8, M.power || 0) * 1.4;
  x.fillStyle = "#155e75"; x.fillRect(r - 4, -4, snout + 2, 8);
  x.fillStyle = "#0e7490"; x.beginPath(); x.arc(r + snout - 2, 0, 4.4, 0, TAU); x.fill();
  x.fillStyle = "#083344"; x.beginPath(); x.arc(r + snout - 2, 0, 2.3, 0, TAU); x.fill();
  x.fillStyle = "rgba(224,250,255,0.35)";
  x.beginPath(); x.arc(1, 5, r * 0.55, 0, TAU); x.fill();
  x.fillStyle = "rgba(255,255,255,0.8)";
  x.beginPath(); x.arc(-r * 0.3, -r * 0.35, r * 0.3, 0, TAU); x.fill();
  x.globalAlpha = 0.55;
  x.fillStyle = "#f9a8d4";
  x.beginPath(); x.arc(2, -r * 0.55, 3, 0, TAU); x.fill();
  x.beginPath(); x.arc(2, r * 0.55, 3, 0, TAU); x.fill();
  x.globalAlpha = 1;
  const blink = (menuT % 4.1) < 0.15;
  for (const s of [-1, 1]) {
    if (blink) {
      x.strokeStyle = "#06222b"; x.lineWidth = 1.8; x.lineCap = "round";
      x.beginPath(); x.moveTo(2, s * 6.5 - 2.5); x.lineTo(6, s * 6.5 - 2.5); x.stroke();
    } else {
      x.fillStyle = "#fff"; x.beginPath(); x.arc(4, s * 6.5, 3.6, 0, TAU); x.fill();
      x.fillStyle = "#06222b"; x.beginPath(); x.arc(5, s * 6.5, 1.9, 0, TAU); x.fill();
      x.fillStyle = "#fff"; x.beginPath(); x.arc(5.7, s * 6.5 - 0.7, 0.7, 0, TAU); x.fill();
    }
  }
  x.restore();
}
// click the mascot: it boings (hop + squash) with a happy chirp, asleep or awake
function boingFish() {
  const m = document.querySelector("#startOverlay .mascot");
  if (!m || document.getElementById("startOverlay").hidden) return;
  m.classList.remove("boing");
  void m.offsetWidth;
  m.classList.add("boing");
  try {
    ensureAudio();
    tone(520, 0.09, "square", 0.06);
    setTimeout(() => tone(780, 0.12, "square", 0.06), 90);
  } catch (e) {}
  setTimeout(() => m.classList.remove("boing"), 600);
}
try { document.querySelector("#startOverlay .mascot").addEventListener("click", boingFish); } catch (e) {}
// ---------- sleepy menu mascot: snoozes on the menu, wakes when PLAY is pressed ----------
function sleepFish() {
  const m = document.querySelector("#startOverlay .mascot");
  if (!m) return;
  m.classList.remove("waking");
  m.classList.remove("boing");
  m.classList.add("sleeping");
}
function wakeFish() {
  const m = document.querySelector("#startOverlay .mascot");
  if (!m || !m.classList.contains("sleeping")) return;
  m.classList.remove("sleeping");
  m.classList.remove("waking");
  m.classList.remove("boing");
  void m.offsetWidth;
  m.classList.add("waking");
  try {
    ensureAudio();
    tone(520, 0.09, "sine", 0.1, 780);
    setTimeout(() => tone(780, 0.14, "sine", 0.1, 1040), 110);
  } catch (e) { /* ignore */ }
  setTimeout(() => m.classList.remove("waking"), 850);
}

// splits the menu title into per-letter spans once, so the decor loop can wave them
function titleLetters() {
  const h = document.querySelector("#startOverlay h1");
  if (!h || h.dataset.split) return;
  h.dataset.split = "1";
  const words = h.textContent.trim().split(/\s+/);
  h.innerHTML = "";
  menuFx.letters = [];
  words.forEach((w, wi) => {
    const tw = document.createElement("span");
    tw.className = "tw";
    for (const ch of w) {
      const s = document.createElement("span");
      s.className = "tl";
      s.textContent = ch;
      tw.appendChild(s);
      menuFx.letters.push(s);
    }
    h.appendChild(tw);
    if (wi < words.length - 1) h.appendChild(document.createTextNode(" "));
  });
  menuFx.sub = h.nextElementSibling;
}

function menuDecorTick(dt) {
  if (startOverlay.hidden) return;
  menuFxInit();
  menuT += dt;
  for (const b of menuFx.bubbles) {
    b.y -= dt / b.dur;
    if (b.y < -0.06) {
      b.y = 1.06;
      b.x = 2 + Math.random() * 93;
      b.dur = 5 + Math.random() * 6;
      const sz = 6 + Math.random() * 16;
      b.el.style.width = sz.toFixed(0) + "px";
      b.el.style.height = sz.toFixed(0) + "px";
    }
    b.el.style.left = b.x.toFixed(2) + "%";
    b.el.style.top = (b.y * 100).toFixed(2) + "%";
    b.el.style.transform = "translateX(" + (Math.sin(menuT * 1.7 + b.wob) * 14).toFixed(1) + "px)";
  }
  for (const fl of menuFx.fish) {
    fl.x += fl.dir * dt / fl.dur * 1.18;
    if (fl.x > 1.12) fl.x = -0.16; else if (fl.x < -0.16) fl.x = 1.12;
    fl.el.style.left = (fl.x * 100).toFixed(2) + "%";
    fl.el.style.transform = "translateY(" + (Math.sin(menuT * 2 + fl.ph) * 5).toFixed(1) + "px) scaleX(" + (fl.dir < 0 ? -1 : 1) + ")";
  }
  if (menuFx.mascot) {
    // awake: playful swimming; asleep: slow breathing with drifting Z's
    if (menuFx.mascot.classList.contains("sleeping")) {
      menuFx.mascot.style.transform = "translateX(" + (Math.sin(menuT * 0.9) * 4).toFixed(1) + "px) rotate(-8deg) scale(" + (1 + 0.03 * Math.sin(menuT * 1.3)).toFixed(3) + ")";
      if (menuFx.zzz) {
        for (const z of menuFx.zzz) {
          const t = (menuT / 2.6 + z.off) % 1;
          z.el.style.opacity = (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88).toFixed(2);
          z.el.style.transform = "translate(" + (16 + Math.sin(menuT + z.off * 6) * 6).toFixed(1) + "px," + (-6 - t * 46).toFixed(1) + "px) scale(" + (0.5 + t * 0.9).toFixed(2) + ") rotate(" + (t * 24).toFixed(0) + "deg)";
        }
      }
    } else {
      menuFx.mascot.style.transform = "translateX(" + (Math.sin(menuT * 1.4) * 9).toFixed(1) + "px) rotate(" + (Math.sin(menuT * 1.4) * 7).toFixed(1) + "deg)";
      if (menuFx.zzz) for (const z of menuFx.zzz) z.el.style.opacity = "0";
    }
  }
  if (menuFx.title) {
    if (!menuFx.letters) titleLetters();
    menuFx.title.style.filter = "drop-shadow(0 2px 0 rgba(2,44,74,.9)) drop-shadow(0 6px 18px rgba(34,211,238,.5)) hue-rotate(" + (30 + 30 * Math.sin(menuT * 0.4)).toFixed(1) + "deg)";
    // letter wave: each letter bobs on its own phase (no traveling shine band)
    const L = menuFx.letters;
    if (L) {
      for (let i = 0; i < L.length; i++) {
        const ph = menuT * 2.2 - i * 0.45;
        L[i].style.transform = "translateY(" + (Math.sin(ph) * 5).toFixed(1) + "px) rotate(" + (Math.cos(ph) * 5).toFixed(1) + "deg)";
        L[i].style.filter = "";
      }
    }
    if (menuFx.sub) menuFx.sub.style.textShadow = "0 0 " + (6 + 6 * (0.5 + 0.5 * Math.sin(menuT * 1.3))).toFixed(0) + "px rgba(103,232,249,.55)";
  }
  if (menuFx.playBtn) {
    const p = 0.5 + 0.5 * Math.sin(menuT * 2.4);
    menuFx.playBtn.style.boxShadow = "0 0 0 2px rgba(34,211,238,.25), 0 " + (6 + p * 8).toFixed(0) + "px " + (22 + p * 18).toFixed(0) + "px rgba(34,211,238," + (0.35 + p * 0.3).toFixed(2) + "), 0 2px 0 rgba(255,255,255,.5) inset, 0 -4px 10px rgba(2,44,74,.35) inset";
  }
  if (menuFx.parFar) { menuFx.parFarX -= dt * 9; menuFx.parFar.style.backgroundPositionX = menuFx.parFarX.toFixed(1) + "px"; }
  if (menuFx.parMid) { menuFx.parMidX += dt * 22; menuFx.parMid.style.backgroundPositionX = menuFx.parMidX.toFixed(1) + "px"; }
  for (const s of menuFx.snow) {
    s.y += s.sp * dt;
    if (s.y > 1.04) s.y = -0.04; else if (s.y < -0.04) s.y = 1.04;
    s.el.style.top = (s.y * 100).toFixed(2) + "%";
  }
  drawOrbitPuffer();
  menuFx.rays.forEach((r, i) => {
    const s = Math.sin(menuT * 0.5 + i * 2.1);
    r.style.transform = "rotate(" + (14 + s * 4).toFixed(1) + "deg) translateX(" + (s * 16).toFixed(1) + "px)";
  });
  // white moon-glow pulse: slow-breathing white glow above, faint white glow below
  if (menuFx.glowW) {
    const p = 0.5 + 0.5 * Math.sin(menuT * 0.9);
    menuFx.glowW.style.opacity = (0.55 + p * 0.4).toFixed(3);
    menuFx.glowW.style.transform = "translateX(-50%) scale(" + (1 + p * 0.09).toFixed(3) + ")";
  }
  if (menuFx.glowR) {
    const q = 0.5 + 0.5 * Math.sin(menuT * 0.7 + 2.1);
    menuFx.glowR.style.opacity = (0.5 + q * 0.4).toFixed(3);
    menuFx.glowR.style.transform = "translateX(-50%) scale(" + (1.06 - q * 0.08).toFixed(3) + ")";
  }
  if (menuFx.shine) {
    const ph = menuT % 3.4;
    menuFx.shine.style.left = ph < 1.1 ? (-30 + (ph / 1.1) * 160).toFixed(1) + "%" : "-30%";
  }
  for (const w of menuFx.waves) {
    w.x += w.sp * dt;
    w.el.style.backgroundPositionX = w.x.toFixed(1) + "px";
  }
  if (menuFx.dailyBtn) {
    const g = 0.42 + 0.16 * Math.sin(menuT * 2.1);
    menuFx.dailyBtn.style.boxShadow = "0 0 18px rgba(34,211,238," + g.toFixed(2) + "), 0 0 44px rgba(34,211,238,.22), 0 2px 0 rgba(255,255,255,.25) inset, 0 -6px 12px rgba(2,20,40,.5) inset";
  }
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  pollPad(); // gamepad axes cache + edge-fired buttons (dash/powers/pause)
  // hit-stop freezes the sim for a beat; slow-mo runs it at ~20% while the level beam hits
  if (G.slowmo > 0) G.slowmo = Math.max(0, G.slowmo - dt);
  // auto-quality: sustained sub-45fps drops snow/shadow/particles (ECO in the HUD) until it recovers
  if (dt > 0) {
    G.fpsEMA += (1 / Math.max(1e-3, dt) - G.fpsEMA) * 0.05;
    if (!G.lowQ) { if (G.fpsEMA < 45) { G.qLowT += dt; if (G.qLowT > 3) { G.lowQ = true; G.qHighT = 0; } } else G.qLowT = 0; }
    else if (G.fpsEMA > 55) { G.qHighT += dt; if (G.qHighT > 10) { G.lowQ = false; G.qLowT = 0; } } else G.qHighT = 0;
  }
  if (G.hitstop > 0) G.hitstop = Math.max(0, G.hitstop - dt);
  else if (G.state === "play") { if (G.mode !== "dive" && window.__modeTick) window.__modeTick(dt * (G.slowmo > 0 ? 0.2 : 1)); else update(dt * (G.slowmo > 0 ? 0.2 : 1)); }
  else { driftAmbient(dt); updateFx(dt); menuDecorTick(dt); }
  if (!OPT.shake) G.shake = 0;
  musicTick();
  if (G.mode !== "dive" && window.__modeDraw) window.__modeDraw(); else render();
}
requestAnimationFrame(loop);

// debug/testing handle
document.getElementById("menuBtn").addEventListener("click", () => { overOverlay.hidden = true; G.state = "menu"; document.getElementById("comboMeter").hidden = true; refreshShop(); refreshBestLine(); sleepFish(); startOverlay.hidden = false; showMenuTab("play"); });
window.__bubble = { G, P, startGame, spawnEnemy, spawnBoss, spawnSuperBoss, spawnHadal, spawnElite, spawnPortal, playCine, gainXp, resetGame, damageFoe, killFoe, tryDash, spawnClam, spawnElite, depthAt, openLevelUp, detonate, Music, refreshShop, loadMeta, showMenuTab, quitToMenu, checkMorph, currentMorph, update, render, renderTimeline, countUp, fmtTime, rand, clamp, dist2, showBanner, addText, burst, pushRing, tone, sfxPop, sfxHurt, sfxLevel, sfxBoss, sfxGem, moveInput, snapCamera, spawnOffscreen, spawnGems, spawnPearls, spawnChest, spawnClam, spawnPowerup, updateHud, gameOver, bankRun, loadBest, saveBest, saveMeta, FOE, WORLD, canvas, ctx, joy, keys, magnetPulse, hurtPlayer, drawFoe, drawWaterFX, drawWeed, drawMinimap, circle, updateFx, driftAmbient, musicTick, get cam() { return { x: camX, y: camY }; } };
window.__bubble.skipCine = skipCine; window.__bubble.pollPad = pollPad;
Object.defineProperties(window.__bubble, { META: { get() { return META; } }, OPT: { get() { return OPT; } }, W: { get() { return W; } }, H: { get() { return H; } } });
window.__bubble.morphStages = morphStages; window.__bubble.morphDisplay = morphDisplay; window.__bubble.morphStyle = morphStyle;
window.__bubble.abil = { shockwavePulse, timeFreeze, decoyBubble, comboFinisher, synList, hasSyn, biomeFor, rollDailyMods, rollWeeklyMods, weekStr, weeklyKey, partWeeds, openClamChoice, resolveClam, openShop, closeChoice, screenshotMode, ghostPosAt, recordBuild, renderBuilds, loadBuilds, magR, loadDiff, saveDiff, diffDef, renderDiffPick, openDiffPick, grantRelic, spawnHadal, openRelicDraft, pickRelic, rollStage, enterStage, STAGE_LEN, enterGate };
