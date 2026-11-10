// ---------- modecore: framework for new game modes (registry, MODES tab, hooks) ----------
const B = window.__bubble;
const G = B.G, P = B.P;

// seeded RNG for modes (mirrors game.js helpers)
function mHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777219); } return h >>> 0; }
function mRng(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const Modes = [];            // {id, icon, name, tag, desc, bestText(), setup(opts)}
const ModeSecs = [];         // {title, render(bodyEl)}
const DiveMods = [];         // passive fns(dt) run inside every classic update
const RunStarts = [];        // fns() fired once when a new run's update begins
let __lastT = Infinity; // first-ever update must count as a fresh run

function registerMode(def) { Modes.push(def); }
function addSection(title, render) { ModeSecs.push({ title, render }); }
function addDiveMod(fn) { DiveMods.push(fn); }
function addRunStart(fn) { RunStarts.push(fn); }

window.__diveMod = (dt) => {
  if (G.time < __lastT) { __lastT = G.time; for (const f of RunStarts) { try { f(); } catch (e) {} } }
  __lastT = G.time;
  for (const f of DiveMods) { try { f(dt); } catch (e) {} }
};

// results-screen dispatcher: classic runs clear any stale replay; modes keep theirs
window.__modeOver = () => {
  if ((B.G.mode || "dive") === "dive") window.__againFn = null;
  const m = Modes.find((x) => x.id === (G.mode || "dive"));
  if (m && m.onOver) { try { m.onOver(); } catch (e) {} }
};

let modeSeq = 0;
function armAgain(id, fn) {
  const tok = ++modeSeq;
  window.__modeToken = tok;
  window.__againFn = () => {
    if ((B.G.mode || "dive") !== id || window.__modeToken !== tok) { window.__againFn = null; B.startGame(B.G.daily); return; }
    fn();
  };
}

// per-mode bests (separate from classic bests)
const MB_KEY = "bpa_modebest2_";
function modeBest(id) { try { return JSON.parse(localStorage.getItem(MB_KEY + id) || "null"); } catch (e) { return null; } }
function saveModeBest(id, rec) { try { localStorage.setItem(MB_KEY + id, JSON.stringify(rec)); } catch (e) {} }

function startMode(id, opts) {
  opts = opts || {};
  const m = Modes.find((x) => x.id === id);
  if (!m) return;
  if (opts.seed) window.__pendingSeed = opts.seed;
  window.__pendingMode = id;
  if (!opts.keepPact) window.__noPact = true;
  B.startGame(false);
  armAgain(id, () => startMode(id, opts));
  try { m.setup(opts); } catch (e) { console.error("mode setup failed", id, e); }
  B.updateHud(true);
}

// launch: for modes that run their own startGame (dive-run scripts, custom sims).
// Arms PLAY-AGAIN replay, then hands off to the mode's setup.
function launch(id, opts) {
  const m = Modes.find((x) => x.id === id);
  if (!m) return;
  armAgain(id, () => launch(id, opts));
  try { m.setup(opts || {}); } catch (e) { console.error("mode setup failed", id, e); }
}

// ---------- MODES tab ----------
function el(tag, cls, text) { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; }
function addCSS(s) { const st = document.createElement("style"); st.textContent = s; document.head.appendChild(st); }

addCSS(`
#modeCtn { display: flex; flex-direction: column; gap: 10px; padding-bottom: 18px; }
#modeCtn > .best { background: linear-gradient(180deg, rgba(103,232,249,.14), rgba(103,232,249,.04)); border: 1px solid rgba(103,232,249,.35); border-radius: 12px; padding: 8px 12px; font-size: 12px; line-height: 1.45; }
.modeGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.modeCard { background: linear-gradient(180deg, rgba(30,41,82,.92), rgba(12,18,38,.94)); border: 1px solid rgba(148,197,255,.3); border-radius: 14px; padding: 10px 9px; text-align: left; color: #eaf2ff; }
.modeCard:active { transform: scale(.97); }
.modeCard .mi { font-size: 24px; }
.modeCard b { display: block; font-size: 14px; margin: 2px 0; }
.modeCard small { display: block; font-size: 11px; opacity: .75; line-height: 1.35; min-height: 30px; }
.modeCard .mb { display: block; font-size: 11px; font-weight: 800; color: #fde047; margin-top: 4px; min-height: 14px; }
.modeCard .go { display: block; margin-top: 6px; font-size: 12px; font-weight: 900; letter-spacing: .08em; color: #03252e; background: linear-gradient(180deg, #a5f3fc, #22d3ee); border-radius: 9px; padding: 6px 0; text-align: center; }
/* --- premium sections: per-section accent, collapsible headers --- */
.modeSec { --sec: #94a3b8; position: relative; flex: 0 0 auto; overflow: hidden; background: linear-gradient(180deg, rgba(22,32,64,.88), rgba(8,13,30,.92)); border: 1px solid rgba(148,197,255,.22); border-top: 2px solid var(--sec); border-radius: 16px; padding: 10px 10px 11px 10px; box-shadow: 0 6px 22px rgba(0,0,0,.35); }
.modeSec::before { content: ""; position: absolute; top: 0; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, var(--sec), transparent); opacity: .7; pointer-events: none; }
.modeSec.sec-0 { --sec: #fbbf24; }
.modeSec.sec-1 { --sec: #22d3ee; }
.modeSec.sec-2 { --sec: #4ade80; }
.modeSec.sec-3 { --sec: #c084fc; }
.modeSec.sec-4 { --sec: #818cf8; }
.modeSec > h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px 0; padding: 2px 2px 0 2px; font-size: 13px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; }
.modeSec > h3 .chev { margin-left: auto; font-size: 12px; opacity: .65; transition: transform .18s ease; }
.modeSec.closed > h3 .chev { transform: rotate(-90deg); }
.modeSec .secBody { display: flex; flex-direction: column; }
.modeSec.closed .secBody { display: none; }
.modeSec .row { display: flex; align-items: center; gap: 9px; background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 8px 10px; margin-bottom: 6px; font-size: 12px; }
.modeSec .row:last-child { margin-bottom: 2px; }
.modeSec .row .grow { flex: 1; min-width: 0; }
.modeSec .row small { display: block; opacity: .7; font-size: 11px; line-height: 1.4; margin-top: 1px; }
.modeSec .row b { font-size: 12.5px; }
/* expedition states: gold done, glowing next, dim locked */
.modeSec .erow.done { border-left: 3px solid #fbbf24; background: linear-gradient(180deg, rgba(251,191,36,.12), rgba(255,255,255,.02)); }
.modeSec .erow.done b { color: #fde047; }
.modeSec .erow.next { border-color: rgba(52,211,153,.65); box-shadow: 0 0 14px rgba(52,211,153,.22); }
.modeSec .erow.locked { opacity: .55; }
.modeSec .erow.locked b { letter-spacing: .04em; }
@keyframes divePulse { 0%, 100% { box-shadow: 0 0 6px rgba(52,211,153,.45); } 50% { box-shadow: 0 0 18px rgba(52,211,153,.85); } }
.modeSec .mBtn.goDive { background: linear-gradient(180deg, #6ee7b7, #059669); color: #022c22; animation: divePulse 1.6s ease-in-out infinite; }
/* reef structure pips + maxed gold */
.modeSec .pips { display: inline-flex; gap: 3px; margin-left: 7px; vertical-align: 2px; }
.modeSec .pips i { width: 16px; height: 7px; border-radius: 99px; background: rgba(255,255,255,.13); border: 1px solid rgba(255,255,255,.2); }
.modeSec .pips i.on { background: linear-gradient(90deg, #34d399, #a7f3d0); border-color: rgba(255,255,255,.5); box-shadow: 0 0 7px rgba(52,211,153,.8); }
.modeSec .mBtn.maxed { background: linear-gradient(180deg, #fef9c3, #f59e0b); color: #451a03; border: 1px solid rgba(255,255,255,.6); box-shadow: 0 0 10px rgba(253,224,71,.5); }
/* lab armed row + season live row */
.modeSec .row.armed { border-color: rgba(192,132,252,.65); background: linear-gradient(180deg, rgba(192,132,252,.14), rgba(255,255,255,.02)); box-shadow: 0 0 14px rgba(192,132,252,.25); }
.modeSec .row.live { border-top: 2px solid #818cf8; box-shadow: 0 0 12px rgba(129,140,248,.2); }
/* buttons + inputs */
.mBtn { background: linear-gradient(180deg, #67e8f9, #0284c7); color: #03252e; font-weight: 900; border: none; border-radius: 9px; padding: 7px 12px; font-size: 12px; box-shadow: 0 2px 10px rgba(34,211,238,.25); transition: filter .12s ease, transform .06s ease; }
.mBtn:hover { filter: brightness(1.12); }
.mBtn:active { transform: scale(.96); }
.mBtn:disabled { opacity: .38; box-shadow: none; }
.mBtn.ghost { background: rgba(255,255,255,.08); color: #eaf2ff; border: 1px solid rgba(255,255,255,.2); box-shadow: none; }
#modeCtn input, #modeCtn select { width: 100%; background: rgba(0,0,0,.42); color: #eaf2ff; border: 1px solid rgba(103,232,249,.35); border-radius: 9px; padding: 8px; font-size: 12px; margin-bottom: 6px; }
#modeCtn input::placeholder { color: rgba(165,243,252,.45); }
#modeCtn input:focus, #modeCtn select:focus { outline: none; border-color: #22d3ee; box-shadow: 0 0 10px rgba(34,211,238,.35); }
#modeCtn .modeGrid .mBtn.picked { border: 1px solid #fde047; color: #fde047; box-shadow: 0 0 10px rgba(253,224,71,.4); }
.codeBox { width: 100%; background: rgba(0,0,0,.4); color: #a5f3fc; border: 1px solid rgba(103,232,249,.4); border-radius: 8px; padding: 7px; font-size: 11px; font-family: monospace; word-break: break-all; }
`);

const MSECCOL_KEY = "bpa_modeSecCol";
function modeSecCollapsed() { try { return JSON.parse(localStorage.getItem(MSECCOL_KEY) || "[]"); } catch (e) { return []; } }
function renderModes() {
  const ctn = document.getElementById("modeCtn");
  if (!ctn) return;
  ctn.innerHTML = "";
  const note = el("div", "best");
  note.textContent = "Press PLAY to pick a dive — this tab keeps your reef, lab, expeditions, challenges & seasons.";
  ctn.appendChild(note);
  const col = modeSecCollapsed();
  let idx = 0;
  for (const s of ModeSecs) {
    const myIdx = idx;
    const sec = el("div", "modeSec sec-" + myIdx);
    const h = el("h3");
    h.textContent = s.title;
    const chev = el("span", "chev", "▾");
    h.appendChild(chev);
    h.setAttribute("role", "button");
    h.title = "tap to collapse / expand";
    if (col.includes(myIdx)) sec.classList.add("closed");
    ((n, hd, ni) => {
      hd.addEventListener("click", () => {
        n.classList.toggle("closed");
        let c = modeSecCollapsed();
        if (n.classList.contains("closed")) { if (!c.includes(ni)) c.push(ni); }
        else c = c.filter((x) => x !== ni);
        try { localStorage.setItem(MSECCOL_KEY, JSON.stringify(c)); } catch (e) {}
      });
    })(sec, h, myIdx);
    sec.appendChild(h);
    const body = el("div", "secBody");
    sec.appendChild(body);
    try { s.render(body); } catch (e) { console.error("section render failed", s.title, e); }
    ctn.appendChild(sec);
    idx++;
  }
}
window.renderModes = renderModes;

document.getElementById("modeTabBtn").addEventListener("click", () => B.showMenuTab("mode"));

window.ModeCore = { register: registerMode, addSection, addDiveMod, addRunStart, startMode, launch, armAgain, modeBest, saveModeBest, el, addCSS, mHash, mRng, modes: Modes };
