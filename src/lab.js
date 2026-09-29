// Animation lab (?lab): one Pokémon, big, with a timeline. Pick a species and any move or
// movement loop, play / pause / step / scrub / slow it down, and see the hitboxes live. It's for
// tuning animation by eye: what you see here is exactly what plays in a match.

import * as THREE from 'three';
import { CreatureModel } from './models/creature.js';
import { SPECIES, SPECIES_LIST } from './data/pokemon.js';
import { buildMoveset, SLOTS } from './data/moveset.js';
import { fighterStats } from './data/pokemon.js';
import { PLAYER_COLORS } from './config.js';
import { Game } from './game.js';
import { choreoFor, phaseU } from './models/choreo.js';

const LOOPS = ['idle', 'walk', 'run', 'dash', 'skid', 'jump', 'double jump', 'shield', 'hitstun', 'sleep', 'victory'];
const NORMAL_ORDER = ['jab', 'ftilt', 'utilt', 'dtilt', 'dash', 'fsmash', 'usmash', 'dsmash', 'nair', 'fair', 'bair', 'uair', 'dair', 'grab'];

const css = `
#lab { position: fixed; left: 12px; top: 12px; z-index: 100; width: 290px; padding: 12px;
  background: rgba(16,12,26,0.88); color: #eee; font: 13px/1.35 system-ui, sans-serif;
  border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.4); }
#lab h3 { margin: 0 0 8px; font: 700 15px system-ui; letter-spacing: 0.04em; }
#lab label { display: block; margin: 6px 0 2px; color: #aab; font-size: 11px; text-transform: uppercase; }
#lab select, #lab input[type=range] { width: 100%; }
#lab .row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
#lab button { flex: 1; padding: 6px 4px; background: #3a3354; color: #fff; border: 0; border-radius: 6px; cursor: pointer; font-weight: 600; }
#lab button.on { background: #7a5cff; }
#lab .info { margin-top: 8px; font-family: ui-monospace, monospace; font-size: 12px; color: #cde; white-space: pre; }
#lab .tag { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
#lab .sig { background: #2d7a3e; } #lab .gen { background: #5a5a6a; }
@media (max-width: 700px) { #lab { width: auto; right: 12px; } }
`;

export function startLab(game) {
  game.clearMatch();
  game.state = 'lab';
  game.demo = true;
  if (game.touch) game.touch.setVisible(false);
  document.getElementById('ui').style.display = 'none';
  game.audio.setQuiet(true);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'lab';
  panel.innerHTML = `
    <h3>ANIMATION LAB</h3>
    <label>Pokémon</label><select data-k="sp"></select>
    <label>Move / loop</label><select data-k="entry"></select>
    <label>Timeline</label><input type="range" data-k="scrub" min="0" max="100" step="0.01" value="0">
    <div class="row">
      <button data-k="prev">◀ frame</button><button data-k="play" class="on">❚❚ pause</button><button data-k="next">frame ▶</button>
    </div>
    <div class="row">
      <button data-s="1" class="on">1x</button><button data-s="0.5">½x</button><button data-s="0.25">¼x</button><button data-s="0.1">0.1x</button>
    </div>
    <div class="row">
      <button data-k="hb" class="on">hitboxes</button><button data-k="view">side view</button><button data-k="flip">face ◀</button>
    </div>
    <div class="info"></div>
    <div style="margin-top:8px;color:#889;font-size:11px">Keys: space play/pause · ←/→ step · ↑/↓ move</div>`;
  document.body.appendChild(panel);
  const $ = (k) => panel.querySelector(`[data-k="${k}"]`);

  const S = {
    sp: 'lucario', entry: 'jab', model: null, moveset: null, f: 0, playing: true, speed: 1,
    hitboxes: true, side: false, facing: 1, hold: 0, t: 0,
  };
  for (const sp of SPECIES_LIST.filter((x) => x.model)) {
    const o = document.createElement('option');
    o.value = sp.model;
    o.textContent = sp.name;
    $('sp').appendChild(o);
  }
  $('sp').value = S.sp;

  const hbMat = new THREE.MeshBasicMaterial({ color: 0xff3050, transparent: true, opacity: 0.35, depthTest: false });
  const hbMatGrab = new THREE.MeshBasicMaterial({ color: 0x40a0ff, transparent: true, opacity: 0.35, depthTest: false });
  const hbGeo = new THREE.SphereGeometry(1, 20, 14);
  const hbPool = [];

  function entries() {
    const out = LOOPS.map((l) => ({ key: `loop:${l}`, label: `· ${l}` }));
    for (const k of NORMAL_ORDER) if (S.moveset.normals[k]) out.push({ key: `n:${k}`, label: `${S.moveset.normals[k].name || k}${choreoFor(S.sp, S.moveset.normals[k].anim) ? '  ★' : ''}` });
    for (const slot of SLOTS) {
      const m = S.moveset.specials[slot];
      out.push({ key: `s:${slot}`, label: `${slot} special: ${m.name}${choreoFor(S.sp, m.anim) ? '  ★' : ''}` });
    }
    return out;
  }

  function currentMove() {
    const [kind, k] = S.entry.split(':');
    if (kind === 'n') return S.moveset.normals[k];
    if (kind === 's') return S.moveset.specials[k];
    return null;
  }

  function loadSpecies(id) {
    if (S.model) { game.scene.remove(S.model.root); S.model.dispose(); }
    S.sp = id;
    const sp = SPECIES_LIST.find((x) => x.model === id);
    S.species = sp;
    S.stats = fighterStats(sp);
    S.moveset = buildMoveset(sp, sp.moves);
    S.model = new CreatureModel({ species: sp, colors: PLAYER_COLORS[0], label: 'LAB' });
    game.scene.add(S.model.root);
    const sel = $('entry');
    const prev = S.entry;
    sel.innerHTML = '';
    for (const e of entries()) {
      const o = document.createElement('option');
      o.value = e.key;
      o.textContent = e.label;
      sel.appendChild(o);
    }
    S.entry = [...sel.options].some((o) => o.value === prev) ? prev : 'n:jab';
    sel.value = S.entry;
    setEntry(S.entry);
  }

  function setEntry(key) {
    S.entry = key;
    S.f = 0;
    S.hold = 0;
    const m = currentMove();
    $('scrub').max = m ? m.total : 120;
  }

  const total = () => { const m = currentMove(); return m ? m.total : 120; };

  function view(dtSim) {
    const run = S.stats.runSpeed;
    const base = {
      state: 'ground', sf: 0, grounded: true, vx: 0, vy: 0, facing: S.facing, runSpeed: run, anim: null, p: 0, hits: null,
      charging: false, tumble: false, flash: 0, shieldFrac: 1, landSquash: 0, flip: -1, showTag: false, shake: 0,
      dash: false, skid: false, yaw: S.side ? (S.facing > 0 ? Math.PI / 2 : -Math.PI / 2) : undefined,
    };
    const m = currentMove();
    if (m) {
      return { ...base, state: 'attack', anim: m.anim, p: Math.min(1, S.f / m.total), hits: Game.hitWindows(m), grounded: !m.aerial, vy: m.aerial ? 0.001 : 0 };
    }
    const loop = S.entry.slice(5);
    const cyc = (S.f % 60) / 60;
    switch (loop) {
      case 'walk': return { ...base, vx: run * 0.45 * S.facing };
      case 'run': return { ...base, vx: run * S.facing };
      case 'dash': return { ...base, vx: run * 1.1 * S.facing, dash: true };
      case 'skid': return { ...base, vx: run * 0.6 * S.facing, skid: true };
      case 'jump': return { ...base, state: 'air', grounded: false, vy: 14 - cyc * 28 };
      case 'double jump': return { ...base, state: 'air', grounded: false, vy: 6, flip: (S.f % 30) / 20 < 1 ? (S.f % 30) / 20 : -1 };
      case 'shield': return { ...base, state: 'shield', shieldFrac: 0.8 };
      case 'hitstun': return { ...base, state: 'hitstun', grounded: false, vx: -8 * S.facing, vy: 6, flash: Math.max(0, 1 - cyc * 3) };
      case 'sleep': return { ...base, state: 'sleep' };
      case 'victory': return { ...base, victory: true };
      default: return base;
    }
  }

  function drawHitboxes() {
    hbPool.forEach((h) => { h.visible = false; });
    const m = currentMove();
    if (!m || !S.hitboxes) return;
    const fr = Math.floor(S.f);
    let i = 0;
    for (const hb of m.hitboxes || []) {
      if (fr < hb.f[0] || fr > hb.f[1]) continue;
      let mesh = hbPool[i];
      if (!mesh) { mesh = new THREE.Mesh(hbGeo, hbMat); mesh.renderOrder = 50; game.scene.add(mesh); hbPool.push(mesh); }
      mesh.material = hb.grab ? hbMatGrab : hbMat;
      mesh.position.set(hb.x * S.facing, hb.y, 0.4);
      mesh.scale.setScalar(hb.r);
      mesh.visible = true;
      i++;
    }
  }

  function info() {
    const m = currentMove();
    const fr = Math.floor(S.f);
    let txt = '';
    if (m) {
      const hits = (m.hitboxes || []).map((h) => `${h.f[0]}-${h.f[1]}`).join(', ') || '(events)';
      const w = Game.hitWindows(m)[0];
      const phase = fr < w[0] * m.total ? 'startup' : fr <= w[1] * m.total ? 'ACTIVE' : 'end lag';
      txt = `frame ${String(fr).padStart(2)} / ${m.total}   ${phase}\nactive: ${hits}\nu = ${phaseU(S.f / m.total, w[0], w[1]).toFixed(2)}`;
      const sig = choreoFor(S.sp, m.anim);
      panel.querySelector('.info').innerHTML = `${txt}\n<span class="tag ${sig ? 'sig' : 'gen'}">${sig ? 'SIGNATURE' : 'GENERIC'}</span> anim: ${m.anim}`;
    } else {
      panel.querySelector('.info').textContent = `loop: ${S.entry.slice(5)}\nframe ${fr}`;
    }
    $('scrub').value = S.f;
  }

  // ---- controls
  $('sp').onchange = (e) => loadSpecies(e.target.value);
  $('entry').onchange = (e) => setEntry(e.target.value);
  $('scrub').oninput = (e) => { S.f = +e.target.value; S.playing = false; syncPlay(); };
  const syncPlay = () => { $('play').textContent = S.playing ? '❚❚ pause' : '▶ play'; $('play').classList.toggle('on', S.playing); };
  $('play').onclick = () => { S.playing = !S.playing; syncPlay(); };
  $('prev').onclick = () => { S.playing = false; S.f = Math.max(0, Math.floor(S.f) - 1); syncPlay(); };
  $('next').onclick = () => { S.playing = false; S.f = Math.min(total(), Math.floor(S.f) + 1); syncPlay(); };
  panel.querySelectorAll('[data-s]').forEach((b) => {
    b.onclick = () => {
      S.speed = +b.dataset.s;
      panel.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b));
    };
  });
  $('hb').onclick = () => { S.hitboxes = !S.hitboxes; $('hb').classList.toggle('on', S.hitboxes); };
  $('view').onclick = () => { S.side = !S.side; $('view').classList.toggle('on', S.side); };
  $('flip').onclick = () => { S.facing = -S.facing; $('flip').textContent = S.facing > 0 ? 'face ◀' : 'face ▶'; };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { S.playing = !S.playing; syncPlay(); e.preventDefault(); }
    if (e.code === 'ArrowLeft') $('prev').click();
    if (e.code === 'ArrowRight') $('next').click();
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const sel = $('entry');
      sel.selectedIndex = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + (e.code === 'ArrowUp' ? -1 : 1)));
      setEntry(sel.value);
      e.preventDefault();
    }
  });

  loadSpecies(S.sp);
  setEntry('n:jab');
  $('entry').value = 'n:jab';

  game.lab = {
    state: S,
    update(dt) {
      const sim = dt * S.speed;
      const T = total();
      if (S.playing) {
        if (S.f >= T) {
          S.hold += dt; // pause a moment at the end of a move before looping
          if (S.hold > 0.5 || !currentMove()) { S.f = 0; S.hold = 0; }
        } else S.f = Math.min(T, S.f + sim * 60);
      }
      const v = view(sim);
      S.model.root.position.set(0, 0, 0);
      S.model.update(v, S.playing ? sim : 0);
      drawHitboxes();
      info();
      const h = S.model.h;
      game.labCam = { x: 0, y: h * 0.62, ty: h * 0.5, dist: Math.max(4.2, h * 3.1) };
    },
  };
}
