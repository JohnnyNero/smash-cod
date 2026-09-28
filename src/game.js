// Match flow, hit resolution, projectiles, grabs, KOs, camera and the menu state machine.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SIM_DT, STAGE, SHIELD, COMBAT, PLAYER_COLORS, RULES, TYPE_COLORS } from './config.js';
import { SPECIES, SPECIES_LIST } from './data/pokemon.js';
import { SLOTS, moveInfo } from './data/moveset.js';
import { loadTeam, saveTeam, randomTeam, cycleSpecies, cycleMove, matchupScore, member } from './team.js';
import { PUMMEL } from './data/moves.js';
import { damageFor } from './damage.js';
import { Fighter } from './fighter.js';
import { CreatureModel, glowMat } from './models/creature.js';
import { buildStage } from './stage.js';
import { Effects } from './effects.js';
import { CpuBrain } from './ai.js';
import { UI } from './ui.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { BUTTONS } from './input.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (n) => Math.floor(Math.random() * n);
const DEVICE_LABELS = { kb1: 'KEYBOARD · WASD', kb2: 'KEYBOARD · ARROWS', touch: 'TOUCH', cpu: 'CPU' };
const hexColor = (css) => parseInt(css.slice(1), 16);
const SWITCH_COOLDOWN = 300; // frames between voluntary switches
const PICK_TIME = 6; // seconds for the hidden picks after a KO
const PREVIEW_TIME = 15; // seconds to pick a lead at team preview
// Hidden picks: ◀ / ▲ / ▶ choose team member 1 / 2 / 3 (the mapping is public, the choice is not).
const pickFromNav = (d) => (d.nav.left ? 0 : d.nav.up ? 1 : d.nav.right ? 2 : -1);

function circleBox(cx, cy, r, minX, minY, maxX, maxY) {
  const nx = clamp(cx, minX, maxX);
  const ny = clamp(cy, minY, maxY);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

export class Game {
  constructor(canvas, uiRoot, input, audio) {
    this.input = input;
    this.audio = audio;
    this.mobile = isTouchDevice();
    const params = new URLSearchParams(location.search);
    this.quality = params.get('quality') || (this.mobile ? 'low' : 'high');
    const low = this.quality === 'low';

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 1200);
    this.stage = buildStage(this.scene, { shadowSize: low ? 1024 : 2048 });
    this.effects = new Effects(this.scene);

    if (!low) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.ui = new UI(uiRoot);
    this.ui.onAction = (a) => this.handleAction(a);
    this.touch = new TouchControls(uiRoot);
    input.addVirtual('touch', this.touch);

    this.settings = { mode: 0, stocks: 3, minutes: 3, cpu: this.mobile ? 2 : 0 };
    this.slots = [this.newSlot(0), this.newSlot(1)];
    this.players = [];
    this.fighters = []; // the active fighter of each player, indexed by player slot
    this.projectiles = [];
    this.previews = [null, null];
    this.pending = [{}, {}];
    this.time = 0;
    this.realTime = 0;
    this.acc = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.canAct = false;
    this.cam = { x: 0, y: 3, dist: 30, trauma: 0 };

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.enterTitle();
  }

  get mode() { return RULES.modes[this.settings.mode]; }
  get teamMode() { return this.mode === 'TEAM' && !this.demo; }

  newSlot(i) {
    return { device: null, team: loadTeam(i), row: 0, ready: false, edit: -1 };
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloom.resolution.set(w / 2, h / 2);
    }
  }

  // ---------------------------------------------------------------- menus

  enterTitle() {
    this.state = 'title';
    this.ui.show('title');
    this.audio.setQuiet(true);
    this.startMatch(true);
  }

  goSelect(joinId) {
    this.clearMatch();
    this.state = 'select';
    this.audio.setQuiet(false);
    this.touch.setVisible(false);
    this.ui.announcer.innerHTML = '';
    this.ui.killfeed.innerHTML = '';
    for (const s of this.slots) {
      s.ready = s.device === 'cpu';
      s.edit = -1;
      if (s.device === 'cpu') s.team = randomTeam(); // a fresh CPU team each time
    }
    if (joinId) this.join(joinId);
    this.refreshCpuSlot();
    this.ui.show('select');
    this.renderSelect();
  }

  join(id) {
    if (this.slots.some((s) => s.device === id)) return;
    const i = this.slots.findIndex((s) => !s.device);
    const idx = i >= 0 ? i : this.slots[1].device === 'cpu' ? 1 : -1;
    if (idx < 0) return;
    const slot = this.slots[idx];
    if (slot.device === 'cpu') slot.team = loadTeam(idx);
    slot.device = id;
    slot.ready = false;
    slot.row = 0;
    slot.edit = -1;
    this.audio.uiConfirm();
    this.renderSelect();
  }

  leave(i) {
    const s = this.slots[i];
    if (!s.device || s.device === 'cpu') return;
    s.device = null;
    s.ready = false;
    this.audio.uiBack();
    this.refreshCpuSlot();
    if (!this.slots.some((x) => x.device && x.device !== 'cpu')) {
      this.enterTitle();
      return;
    }
    this.renderSelect();
  }

  refreshCpuSlot() {
    const s = this.slots[1];
    if (this.settings.cpu > 0 && !s.device) {
      s.device = 'cpu';
      s.team = randomTeam();
      s.ready = true;
    } else if (this.settings.cpu === 0 && s.device === 'cpu') {
      s.device = null;
      s.ready = false;
      s.team = loadTeam(1);
    }
  }

  deviceLabel(id) {
    if (DEVICE_LABELS[id]) return DEVICE_LABELS[id];
    if (id && id.startsWith('pad')) return `GAMEPAD ${+id.slice(3) + 1}`;
    return '';
  }

  // Card rows. On a Pokémon row, ◀▶ changes species and A opens its move editor.
  rowsFor(i) {
    const s = this.slots[i];
    if (s.edit >= 0) return [...SLOTS.map((k) => 'mv:' + k), 'done'];
    const mons = this.mode === 'TEAM' ? [0, 1, 2] : [0];
    const rules = i === 0 ? (this.mode === 'TEAM' ? ['mode', 'cpu'] : ['mode', 'limit', 'cpu']) : [];
    return [...mons.map((k) => 'mon:' + k), ...rules, 'ready'];
  }

  rowLabel(key) {
    if (key.startsWith('mon:')) return this.mode === 'TEAM' ? `POKÉMON ${+key.slice(4) + 1}` : 'POKÉMON';
    if (key.startsWith('mv:')) return { neutral: 'B', side: '→B', up: '↑B', down: '↓B' }[key.slice(3)];
    return { mode: 'MODE', limit: 'LIMIT', cpu: 'CPU', done: '', ready: '' }[key];
  }

  rowValue(key, s) {
    const st = this.settings;
    if (key.startsWith('mon:')) return SPECIES[s.team[+key.slice(4)].species].name.toUpperCase();
    if (key.startsWith('mv:')) return moveInfo(s.team[s.edit].moves[key.slice(3)]).name;
    switch (key) {
      case 'mode': return RULES.modes[st.mode];
      case 'limit': return this.mode === 'TIME' ? `${st.minutes} MIN` : `${st.stocks} STOCK`;
      case 'cpu': return RULES.cpu[st.cpu];
      default: return '';
    }
  }

  change(i, key, dir) {
    const s = this.slots[i];
    const st = this.settings;
    if (!s.device || s.device === 'cpu' || s.ready || !key) return;
    const cyc = (v, n) => (v + dir + n) % n;
    if (key.startsWith('mon:')) {
      cycleSpecies(s.team, +key.slice(4), dir);
      saveTeam(i, s.team);
    } else if (key.startsWith('mv:')) {
      cycleMove(s.team[s.edit], key.slice(3), dir);
      saveTeam(i, s.team);
    } else if (i !== 0) {
      return;
    } else if (key === 'mode') {
      st.mode = cyc(st.mode, RULES.modes.length);
      for (const [k, sl] of this.slots.entries()) sl.row = Math.min(sl.row, this.rowsFor(k).length - 1);
    } else if (key === 'limit') {
      if (this.mode === 'TIME') st.minutes = clamp(st.minutes + dir, 1, 5);
      else st.stocks = clamp(st.stocks + dir, 1, 5);
    } else if (key === 'cpu') {
      st.cpu = cyc(st.cpu, RULES.cpu.length);
      this.refreshCpuSlot();
    } else {
      return;
    }
    this.audio.ui();
    this.renderSelect();
  }

  // A / confirm on a row: open or close the move editor, or ready up.
  confirmRow(i) {
    const s = this.slots[i];
    const key = this.rowsFor(i)[s.row];
    if (key.startsWith('mon:')) {
      s.edit = +key.slice(4);
      s.row = 0;
      this.audio.ui();
    } else if (s.edit >= 0) {
      const k = s.edit;
      s.edit = -1;
      s.row = this.rowsFor(i).indexOf('mon:' + k);
      this.audio.uiBack();
    } else {
      s.ready = true;
      this.audio.uiConfirm();
    }
    this.renderSelect();
  }

  canStart() {
    return this.slots.every((s) => s.device) && this.slots.some((s) => s.device !== 'cpu');
  }

  focusIndex(s, i) {
    if (s.edit >= 0) return s.edit;
    const key = this.rowsFor(i)[s.row] || '';
    return key.startsWith('mon:') ? +key.slice(4) : 0;
  }

  renderSelect() {
    if (this.state !== 'select') return;
    const st = this.settings;
    const slots = this.slots.map((s, i) => ({
      joined: !!s.device,
      cpu: s.device === 'cpu',
      deviceLabel: this.deviceLabel(s.device),
      row: s.row,
      ready: s.ready,
      edit: s.edit,
      focus: this.focusIndex(s, i),
      team: this.mode === 'TEAM' ? s.team : s.team.slice(0, 1),
      color: PLAYER_COLORS[i].css,
      rows: this.rowsFor(i).map((key) => ({ key, label: this.rowLabel(key), value: this.rowValue(key, s) })),
    }));
    const full = this.canStart();
    const allReady = full && this.slots.every((s) => s.ready);
    const rules = this.mode === 'TEAM' ? 'TEAM BATTLE · 3v3' : `${this.mode} · ${this.rowValue('limit')}`;
    this.ui.renderSelect({
      slots,
      mode: this.mode,
      cpuName: RULES.cpu[st.cpu],
      rulesText: `${rules} · STAGE: OUTPOST`,
      canStart: full && this.slots[0].ready,
      hint: !full
        ? 'Waiting for P2: press <b>A</b> on a second controller, or set <b>CPU</b> in P1\'s rules'
        : allReady ? 'GET READY…'
          : this.mobile ? 'Tap <b>◀ ▶</b> to change, tap a Pokémon to edit its moves, then <b>READY UP</b>'
            : '<b>↑↓</b> choose · <b>←→</b> change · <b>A</b> on a Pokémon = edit moves · <b>A</b> on READY · <b>B</b> back',
    });
  }

  updateSelect(dt) {
    for (const id of this.input.list()) {
      const d = this.input.get(id);
      const i = this.slots.findIndex((s) => s.device === id);
      if (i < 0) {
        if (d.pressed.confirm || d.pressed.start) this.join(id);
        else if (d.pressed.back && !this.slots.some((s) => s.device && s.device !== 'cpu')) this.enterTitle();
        continue;
      }
      const s = this.slots[i];
      const rows = this.rowsFor(i);
      if (s.ready) {
        if (d.pressed.back) { s.ready = false; this.audio.uiBack(); this.renderSelect(); }
        continue;
      }
      if (d.nav.up) { s.row = (s.row - 1 + rows.length) % rows.length; this.audio.ui(); this.renderSelect(); }
      if (d.nav.down) { s.row = (s.row + 1) % rows.length; this.audio.ui(); this.renderSelect(); }
      if (d.nav.left) this.change(i, rows[s.row], -1);
      if (d.nav.right) this.change(i, rows[s.row], 1);
      if (d.pressed.start) { s.edit = -1; s.ready = true; this.audio.uiConfirm(); this.renderSelect(); }
      else if (d.pressed.confirm) this.confirmRow(i);
      else if (d.pressed.back) {
        if (s.edit >= 0) this.confirmRow(i);
        else this.leave(i);
      }
    }
    if (this.canStart() && this.slots.every((s) => s.ready)) {
      this.startDelay = (this.startDelay ?? 0.6) - dt;
      if (this.startDelay <= 0) {
        this.startDelay = null;
        this.startMatch(false);
      }
    } else {
      this.startDelay = null;
    }
  }

  updatePreviews(dt) {
    this.slots.forEach((s, i) => {
      const species = s.device ? s.team[this.focusIndex(s, i)].species : null;
      const p = this.previews[i];
      if ((p && p.key) !== species) {
        if (p) { this.scene.remove(p.model.root); p.model.dispose(); }
        this.previews[i] = null;
        if (species) {
          const model = new CreatureModel({ species: SPECIES[species], colors: PLAYER_COLORS[i], label: `P${i + 1}` });
          model.root.position.set(i === 0 ? -0.95 : 0.95, 0, 1);
          this.scene.add(model.root);
          this.previews[i] = { key: species, model };
        }
      }
      const pv = this.previews[i];
      if (pv) {
        const t = this.realTime + i * 1.3;
        const cheer = s.ready && t % 3 < 0.6;
        pv.model.update({
          state: cheer ? 'attack' : 'ground', anim: cheer ? 'usmash' : null, p: (t % 3) / 0.6, sf: 0,
          grounded: true, vx: 0, vy: 0, facing: i === 0 ? 1 : -1, yaw: i === 0 ? 0.6 : -0.6,
          runSpeed: 8, shieldFrac: 1, flash: 0, landSquash: 0, showTag: false,
        }, dt);
      }
    });
  }

  removePreviews() {
    for (const p of this.previews) {
      if (p) { this.scene.remove(p.model.root); p.model.dispose(); }
    }
    this.previews = [null, null];
  }

  // ---------------------------------------------------------------- match setup

  // Build both players. Each has a team (1 Pokémon outside team mode) of Fighters; only the
  // active one is on stage and in this.fighters.
  setupPlayers(demo) {
    const st = this.settings;
    this.players = [0, 1].map((i) => {
      const slot = this.slots[i];
      const device = demo ? 'cpu' : slot.device;
      const isCpu = device === 'cpu';
      const defs = demo ? [member(SPECIES_LIST[rand(SPECIES_LIST.length)].id)] : this.mode === 'TEAM' ? slot.team : slot.team.slice(0, 1);
      const brain = isCpu ? new CpuBrain(demo ? 2 : st.cpu) : null;
      const team = defs.map((m) => {
        const f = new Fighter(this, i, SPECIES[m.species], PLAYER_COLORS[i], m.moves);
        Object.assign(f, { device, isCpu, brain, stocks: this.mode === 'TEAM' && !demo ? 1 : st.stocks, benched: true });
        f.model = new CreatureModel({ species: f.sp, colors: f.colors, label: `P${i + 1}` });
        f.model.root.visible = false;
        this.scene.add(f.model.root);
        return f;
      });
      return { slot: i, device, isCpu, brain, team, active: 0, switchCd: 0, benchTick: 0 };
    });
  }

  startMatch(demo) {
    this.clearMatch();
    this.demo = demo;
    this.setupPlayers(demo);
    this.pending = [{}, {}];
    if (this.teamMode) {
      this.enterPreview();
      return;
    }
    this.beginBattle([0, 0]);
  }

  // Team preview: both teams on show (moves hidden), each player secretly picks a lead.
  enterPreview() {
    this.state = 'preview';
    this.picks = { picks: [null, null], timer: PREVIEW_TIME, needs: [true, true] };
    this.players.forEach((p, i) => { if (p.isCpu) this.picks.picks[i] = this.cpuLead(i); });
    this.ui.showPreview(this.players, this.picks, this.mobile);
    this.touch.setVisible(false);
  }

  updatePreview(dt) {
    const k = this.picks;
    k.timer -= dt;
    this.players.forEach((p, i) => {
      if (p.isCpu || k.picks[i] !== null) return;
      const idx = pickFromNav(this.input.get(p.device));
      if (idx >= 0) { k.picks[i] = idx; this.audio.uiConfirm(); }
    });
    this.ui.updatePicks(k);
    if (k.picks.every((x) => x !== null) || k.timer <= 0) {
      this.beginBattle(k.picks.map((x) => x ?? 0));
    }
  }

  beginBattle(leads) {
    const st = this.settings;
    this.players.forEach((p, i) => {
      p.active = leads[i];
      const f = p.team[p.active];
      f.benched = false;
      f.spawn(STAGE.spawns[i], 0);
      f.facing = i === 0 ? 1 : -1;
    });
    this.fighters = this.players.map((p) => p.team[p.active]);
    this.ui.hidePicks();
    this.timeLeft = st.minutes * 60;
    this.suddenDeath = false;
    this.timeScale = 1;
    this.hitstop = 0;
    this.acc = 0;
    this.kopick = null;
    if (this.demo) {
      this.canAct = true;
      return;
    }
    this.state = 'countdown';
    this.countdown = 3.6;
    this.lastCount = null;
    this.canAct = false;
    this.ui.buildHUD(this.players, st, this.teamMode);
    this.ui.show('hud');
    this.audio.setQuiet(false);
    this.touch.setVisible(this.players.some((p) => p.device === 'touch'));
    if (this.teamMode) {
      const [a, b] = this.fighters;
      this.ui.announce(`${a.sp.name.toUpperCase()} <small>vs</small> ${b.sp.name.toUpperCase()}`, 'matchup', 1500);
    }
  }

  clearMatch() {
    for (const p of this.players) {
      for (const f of p.team) {
        this.scene.remove(f.model.root);
        f.model.dispose();
      }
    }
    this.players = [];
    for (const p of this.projectiles) this.removeProjectile(p);
    this.projectiles = [];
    this.fighters = [];
    for (const d of this.stage.drones) d.visible = false;
    this.effects.clear();
    this.removePreviews();
    this.ui.hidePicks();
  }

  // ---------------------------------------------------------------- switching (team mode)

  aliveIndexes(p) {
    return p.team.map((f, k) => (f.eliminated ? -1 : k)).filter((k) => k >= 0);
  }

  // Which team member a SWAP press should bring in (-1 = can't switch right now).
  switchTargetFor(slot, idx, ignoreCooldown = false) {
    if (!this.teamMode || this.state !== 'playing') return -1;
    const p = this.players[slot];
    if (p.switchCd > 0 && !ignoreCooldown) {
      if (p.switchCd < SWITCH_COOLDOWN - 30) this.popup(slot, `SWITCH IN ${Math.ceil(p.switchCd / 60)}s`, 'bad');
      return -1;
    }
    const ok = (k) => k !== p.active && p.team[k] && !p.team[k].eliminated;
    if (idx >= 0 && ok(idx)) return idx;
    for (let n = 1; n < p.team.length; n++) {
      const k = (p.active + n) % p.team.length;
      if (ok(k)) return k;
    }
    return -1;
  }

  performSwitch(slot, idx, free) {
    const p = this.players[slot];
    const out = p.team[p.active];
    const inn = p.team[idx];
    if (!inn || inn.eliminated || idx === p.active) {
      out.toNeutral();
      return false;
    }
    out.onSwitchOut();
    out.model.root.visible = false;
    inn.onSwitchIn(out);
    p.active = idx;
    this.fighters[slot] = inn;
    p.switchCd = free ? 90 : SWITCH_COOLDOWN;
    const c = inn.center;
    this.effects.ring(c.x, c.y, inn.colors.main, 2.6, 0.4);
    this.effects.ring(c.x, c.y, 0xffffff, 1.6, 0.3);
    this.effects.sparks(c.x, c.y, 0, 0, inn.colors.main, 20, 8);
    this.audio.switchIn(c.x);
    this.effects.callout(c.x, inn.pos.y + inn.h + 0.7, `GO! ${inn.sp.name.toUpperCase()}!`, hexColor(inn.colors.css));
    return true;
  }

  // Volt Switch: after it hits, switch to the next healthy teammate for free.
  pivot(f) {
    const target = this.switchTargetFor(f.slot, -1, true);
    if (target < 0) return false;
    return this.performSwitch(f.slot, target, true);
  }

  // Benched Pokémon slowly recover (1% a second), so rotating your team pays off.
  benchHeal() {
    for (const p of this.players) {
      if (p.switchCd > 0) p.switchCd--;
      if (++p.benchTick % 60 !== 0) continue;
      p.team.forEach((f, k) => {
        if (k !== p.active && !f.eliminated && f.percent > 0) f.percent = Math.max(0, f.percent - 1);
      });
    }
  }

  // ---------------------------------------------------------------- hidden KO picks

  queueKOPick(slot) {
    if (!this.kopick) this.kopick = { needs: [false, false], picks: [null, null], timer: PICK_TIME };
    this.kopick.needs[slot] = true;
    this.state = 'kopick';
    this.canAct = false;
  }

  startKOPick() {
    const k = this.kopick;
    this.players.forEach((p, i) => { if (p.isCpu) k.picks[i] = this.cpuPick(i, k.needs[i]); });
    this.ui.showKOPick(this.players, k, this.mobile);
    this.touch.setVisible(false);
    this.kopickShown = true;
  }

  updateKOPick(dt) {
    const k = this.kopick;
    if (!this.kopickShown) this.startKOPick();
    k.timer -= dt;
    this.players.forEach((p, i) => {
      if (p.isCpu || k.picks[i] !== null) return;
      const d = this.input.get(p.device);
      const idx = pickFromNav(d);
      const alive = this.aliveIndexes(p);
      if (idx >= 0 && alive.includes(idx)) { k.picks[i] = idx; this.audio.uiConfirm(); }
      else if (!k.needs[i] && (d.pressed.confirm || d.nav.down)) { k.picks[i] = p.active; this.audio.uiConfirm(); }
    });
    this.ui.updatePicks(k);
    if (k.picks.every((x) => x !== null) || k.timer <= 0) this.revealKOPicks();
  }

  revealKOPicks() {
    const k = this.kopick;
    this.kopick = null;
    this.kopickShown = false;
    this.players.forEach((p, i) => {
      const alive = this.aliveIndexes(p);
      let pick = k.picks[i];
      if (pick === null || !alive.includes(pick)) pick = k.needs[i] ? alive[0] : p.active;
      if (k.needs[i]) {
        const f = p.team[pick];
        p.active = pick;
        f.benched = false;
        f.respawn();
        this.fighters[i] = f;
      } else if (pick !== p.active) {
        this.state = 'playing'; // performSwitch only works mid-battle
        this.performSwitch(i, pick, true);
      }
    });
    this.ui.hidePicks();
    const [a, b] = this.fighters;
    this.ui.announce(`${a.sp.name.toUpperCase()} <small>vs</small> ${b.sp.name.toUpperCase()}`, 'matchup', 1400);
    this.audio.beep(true);
    this.state = 'playing';
    this.canAct = true;
    this.touch.setVisible(this.players.some((p) => p.device === 'touch'));
  }

  // CPU lead: best average matchup into the opponent's team.
  cpuLead(i) {
    const me = this.players[i];
    const foe = this.players[1 - i];
    let best = 0;
    let bestScore = -Infinity;
    me.team.forEach((f, k) => {
      const score = foe.team.reduce((sum, g) => sum + matchupScore(f.sp, this.slotMoves(f), g.sp), 0) + Math.random() * 0.5;
      if (score > bestScore) { bestScore = score; best = k; }
    });
    return best;
  }

  // CPU KO pick: bring in the best answer to what's out (or switch if it's clearly better).
  cpuPick(i, mustPick) {
    const me = this.players[i];
    const foe = this.players[1 - i];
    const foes = this.aliveIndexes(foe).map((k) => foe.team[k]);
    const threat = this.kopick && this.kopick.needs[1 - i] ? foes : [foe.team[foe.active]];
    const score = (f) => threat.reduce((sum, g) => sum + matchupScore(f.sp, this.slotMoves(f), g.sp), 0) / threat.length;
    let best = me.active;
    let bestScore = mustPick ? -Infinity : score(me.team[me.active]) + 0.8; // staying in is the default
    for (const k of this.aliveIndexes(me)) {
      if (k === me.active && mustPick) continue;
      const sc = score(me.team[k]) + Math.random() * 0.3;
      if (sc > bestScore) { bestScore = sc; best = k; }
    }
    return best;
  }

  // CPU mid-fight switch: only when a teammate has a clearly better matchup into the foe.
  cpuSwitchChoice(slot) {
    const p = this.players[slot];
    if (!this.teamMode || p.switchCd > 0 || this.state !== 'playing') return -1;
    const pick = this.cpuPick(slot, false);
    return pick !== p.active ? pick : -1;
  }

  slotMoves(f) {
    return Object.fromEntries(Object.entries(f.moveset.specials).map(([k, m]) => [k, m.id]));
  }

  // ---------------------------------------------------------------- input routing

  handleAction(a) {
    const s = this.state;
    if (a.type === 'title' && s === 'title') {
      if (this.mobile) {
        const de = document.documentElement;
        if (de.requestFullscreen) de.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
      }
      this.audio.unlock();
      this.goSelect(this.mobile ? 'touch' : null);
    } else if (s === 'select') {
      const sl = this.slots[a.slot];
      if (a.type === 'join' && this.mobile) this.join('touch');
      else if (a.type === 'change') {
        sl.row = this.rowsFor(a.slot).indexOf(a.row);
        this.change(a.slot, a.row, a.dir);
      } else if (a.type === 'edit' && sl && !sl.ready && sl.device !== 'cpu') {
        sl.row = this.rowsFor(a.slot).indexOf(a.row);
        this.confirmRow(a.slot);
      } else if (a.type === 'ready') {
        if (sl.device && sl.device !== 'cpu') { sl.edit = -1; sl.ready = !sl.ready; this.audio.uiConfirm(); this.renderSelect(); }
      } else if (a.type === 'leave') this.leave(a.slot);
      else if (a.type === 'start' && this.canStart()) {
        for (const x of this.slots) { x.ready = true; x.edit = -1; }
        this.startMatch(false);
      }
    } else if ((s === 'preview' || s === 'kopick') && a.type === 'pick') {
      const k = s === 'preview' ? this.picks : this.kopick;
      const p = this.players[a.slot];
      const idx = +a.row;
      if (k && p && !p.isCpu && k.picks[a.slot] === null && this.aliveIndexes(p).includes(idx)) {
        if (s === 'kopick' && k.needs[a.slot] && idx === p.active) return;
        k.picks[a.slot] = idx;
        this.audio.uiConfirm();
      }
    } else if (s === 'paused') {
      if (a.type === 'resume') this.setPaused(false);
      else if (a.type === 'quit') this.goSelect();
    } else if (s === 'results') {
      if (a.type === 'rematch') this.startMatch(false);
      else if (a.type === 'toSelect') this.goSelect();
    }
  }

  humanDevices() {
    return this.players.filter((p) => !p.isCpu && p.device).map((p) => this.input.get(p.device));
  }

  setPaused(p) {
    if (p) {
      this.pausedFrom = this.state;
      this.state = 'paused';
    } else {
      this.state = this.pausedFrom || 'playing';
    }
    this.ui.showPause(p);
    this.touch.setVisible(!p && this.players.some((x) => x.device === 'touch'));
    this.audio.ui();
  }

  // ------------------------------------------------------------ main loop

  frame(dt) {
    this.input.update(dt);
    if (this.input.anyInput) {
      this.audio.unlock();
      this.input.anyInput = false;
    }
    this.realTime += dt;
    const devs = () => this.humanDevices();

    switch (this.state) {
      case 'title':
        for (const id of this.input.list()) {
          const d = this.input.get(id);
          if (id !== 'touch' && (d.pressed.confirm || d.pressed.start)) {
            this.goSelect(id);
            break;
          }
        }
        if (this.state === 'title') this.simulate(dt);
        break;
      case 'select':
        this.updateSelect(dt);
        if (this.state === 'select') this.updatePreviews(dt);
        break;
      case 'preview':
        this.updatePreview(dt);
        break;
      case 'countdown': {
        this.countdown -= dt;
        const n = Math.ceil(this.countdown);
        if (n !== this.lastCount) {
          this.lastCount = n;
          if (n > 0 && n <= 3) {
            this.ui.announce(String(n), 'count', 900);
            this.audio.beep(false);
          }
        }
        if (this.countdown <= 0) {
          this.state = 'playing';
          this.canAct = true;
          this.ui.announce('GO!', 'go', 800);
          this.audio.beep(true);
        }
        if (devs().some((d) => d.pressed.start)) this.setPaused(true);
        else this.simulate(dt);
        break;
      }
      case 'playing':
        if (devs().some((d) => d.pressed.start)) this.setPaused(true);
        else this.simulate(dt);
        break;
      case 'kopick':
        this.updateKOPick(dt);
        this.updateVisuals(dt);
        break;
      case 'paused': {
        const ds = devs();
        if (ds.some((d) => d.pressed.start)) this.setPaused(false);
        else if (ds.some((d) => d.pressed.back)) this.goSelect();
        this.updateVisuals(0);
        break;
      }
      case 'gameover':
        this.gameoverTimer -= dt;
        this.timeScale = this.gameoverTimer > 1.2 ? 0.25 : Math.min(1, this.timeScale + dt);
        this.simulate(dt);
        if (this.gameoverTimer <= 0) {
          this.state = 'results';
          this.touch.setVisible(false);
          this.ui.showResults(this.winner, this.resultSummaries());
        }
        break;
      case 'results': {
        const ds = this.input.list().map((id) => this.input.get(id)).filter((d) => d.id !== 'touch');
        if (ds.some((d) => d.pressed.confirm || d.pressed.start)) this.startMatch(false);
        else if (ds.some((d) => d.pressed.back)) this.goSelect();
        else this.simulate(dt);
        break;
      }
      default:
        break;
    }

    this.stage.update(this.realTime, dt);
    this.updateCamera(dt);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  simulate(dt) {
    // Collect button presses since the last sim step so none are lost or doubled
    // when the display refresh rate differs from the 60 Hz simulation.
    this.players.forEach((p, i) => {
      if (p.isCpu || !p.device) return;
      const d = this.input.get(p.device);
      for (const b of BUTTONS) if (d.pressed[b]) this.pending[i][b] = true;
    });
    this.acc += dt * this.timeScale;
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 5) {
      this.step();
      this.acc -= SIM_DT;
      steps++;
      if (this.state === 'kopick') { this.acc = 0; break; } // a KO paused the battle for picks
    }
    if (steps === 5) this.acc = 0;
    this.updateVisuals(dt * this.timeScale);
  }

  inputFor(f, i) {
    if (f.brain) return f.brain.update(f, this.fighters[1 - i], SIM_DT);
    const d = this.input.get(f.device);
    const inp = { ...d, pressed: this.pending[i] };
    this.pending[i] = {};
    return inp;
  }

  step() {
    this.time += SIM_DT;
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    this.fighters.forEach((f, i) => {
      f.update(SIM_DT, this.inputFor(f, i));
      const cur = this.fighters[i]; // may have switched this frame
      if (cur.active && cur.state === 'hitstun' && Math.hypot(cur.vel.x, cur.vel.y) > 13 && Math.round(this.time * 60) % 2 === 0) {
        this.effects.trail(cur.pos.x, cur.pos.y + cur.h * 0.5, cur.colors.main);
      }
    });
    this.resolveHits();
    this.updateProjectiles(SIM_DT);
    if (this.teamMode) this.benchHeal();
    if (this.state === 'playing' && this.mode === 'TIME' && !this.suddenDeath && !this.demo) {
      this.timeLeft -= SIM_DT;
      if (this.timeLeft <= 0) this.timeUp();
    }
  }

  // ------------------------------------------------------------ combat

  shake(amount) {
    this.cam.trauma = Math.min(1.2, this.cam.trauma + amount);
  }

  rumble(f, strong, weak, ms) {
    if (!f || !f.device) return;
    if (f.device.startsWith('pad')) this.input.rumble(f.device, strong, weak, ms);
    else if (f.device === 'touch' && navigator.vibrate && strong >= 0.5) navigator.vibrate(Math.round(ms * 0.6));
  }

  popup(slot, text, cls) {
    if (!this.demo) this.ui.popup(slot, text, cls);
  }

  ledgeOccupied(side, me) {
    return this.fighters.some((f) => f !== me && f.state === 'ledge' && f.ledge === side);
  }

  onMoveStart(f, m) {
    if (m.special) {
      this.audio.special(f.pos.x, m.type);
      // Showdown-style callout: "Thunderbolt!" on the user's HUD card.
      if (!this.demo) this.ui.popup(f.slot, m.name + '!', 'move', TYPE_COLORS[m.type]);
    } else if (m.hitboxes && !m.grab) {
      this.audio.swing(f.pos.x, m.smash);
    }
  }

  onGrab(a) {
    this.audio.grab(a.pos.x);
    this.effects.ring(a.pos.x + a.facing * 0.6, a.pos.y + a.h * 0.5, 0xffffff, 1, 0.2);
  }

  // Melee hitboxes: each move hits each target at most once.
  resolveHits() {
    for (const a of this.fighters) {
      if (a.state !== 'attack' || !a.move || !a.move.hitboxes || a.curF < 0) continue;
      for (const hb of a.move.hitboxes) {
        if (a.curF < hb.f[0] || a.curF > hb.f[1]) continue;
        const hx = a.pos.x + hb.x * a.facing;
        const hy = a.pos.y + hb.y;
        for (const d of this.fighters) {
          if (d === a || !d.active || d.onRevival || !a.canHit(d, hb)) continue;
          if (!circleBox(hx, hy, hb.r, d.pos.x - d.w / 2, d.pos.y, d.pos.x + d.w / 2, d.pos.y + d.h)) continue;
          if (hb.grab) {
            if (d.grounded && !d.intangible && d.state !== 'held' && d.state !== 'holding') {
              a.markHit(d, hb);
              a.startHolding(d);
            }
            continue;
          }
          if (d.intangible) continue;
          a.markHit(d, hb);
          const base = hb.dmg * (a.move.smash ? a.chargeMult : 1);
          const dirSign = hb.radial ? Math.sign(d.pos.x - a.pos.x) || a.facing : a.facing;
          this.applyHit(a, d, hb, a.move, base, dirSign, hx, hy);
          if (!a.move) break; // the hit ended the attacker's move (e.g. recoil KO)
        }
      }
    }
  }

  // Resolve one hit: type effectiveness (immunities pass through), status moves, damage and
  // knockback, drain/recoil, and the Showdown-style callouts.
  applyHit(a, d, hb, move, base, dirSign, hx, hy) {
    const dmg = damageFor(a, d, base, move);
    const grassImmune = d.sp.types.includes('Grass') && (move.powder || hb.effect === 'seed');
    if (dmg.eff === 0 || grassImmune) {
      if (!this.demo) this.effects.callout(hx, hy + 0.6, 'NO EFFECT', 0xb8c0d0);
      this.audio.block(hx);
      return { result: 'immune' };
    }
    if (hb.effect) {
      if (d.state === 'shield') {
        this.effects.sparks(hx, hy, -dirSign, 0.5, d.colors.accent, 6, 8);
        this.audio.block(hx);
        return { result: 'blocked' };
      }
      const ok = d.applyStatus(hb.effect, a);
      if (ok) {
        const text = hb.effect === 'sleep' ? 'FELL ASLEEP!' : 'SEEDED!';
        this.effects.callout(d.pos.x, d.pos.y + d.h + 0.7, text, hb.effect === 'sleep' ? 0xc8b8ff : 0x8ee060);
        this.audio.status(hx, hb.effect);
        a.stats.hits++;
      }
      return { result: ok ? 'status' : 'miss' };
    }

    const res = d.takeHit({
      damage: dmg.damage, kb: hb.kb, grow: hb.grow, ang: hb.ang, dirSign,
      attacker: a, source: move.name || move.id,
    });
    const color = move.type ? hexColor(TYPE_COLORS[move.type] || '#ffffff') : 0xffffff;
    if (res.result === 'hit') {
      a.stats.hits++;
      const heavy = res.launch > 10;
      const superEff = dmg.eff > 1;
      this.effects.sparks(hx, hy, dirSign, 0.5, color, heavy || superEff ? 16 : 7, heavy ? 14 : 9);
      this.effects.ring(hx, hy, heavy || superEff ? color : 0xffffff, heavy ? 2.2 : 1.1, heavy ? 0.3 : 0.18);
      let stop = Math.min(COMBAT.hitstopMax, Math.round(COMBAT.hitstopBase + dmg.damage * COMBAT.hitstopPerDamage));
      if (superEff) stop = Math.min(COMBAT.hitstopMax + 6, stop + 6);
      this.hitstop = Math.max(this.hitstop, stop);
      this.shake(0.08 + res.launch * 0.018 + (superEff ? 0.25 : 0));
      this.audio.hit(hx, dmg.damage, move.type);
      if (heavy) this.audio.launch(hx, res.launch);
      if (!this.demo && move.type && dmg.eff !== 1 && dmg.damage >= 2.5) {
        if (superEff) {
          this.effects.callout(hx, hy + 0.8, dmg.eff >= 4 ? 'SUPER EFFECTIVE!!' : 'SUPER EFFECTIVE!', 0xffd23a);
          this.audio.superEffective(hx);
        } else {
          this.effects.callout(hx, hy + 0.8, 'NOT VERY EFFECTIVE…', 0x9aa3b5);
        }
      }
      if (move.drain) {
        const heal = dmg.damage * move.drain;
        a.percent = Math.max(0, a.percent - heal);
        this.effects.drain(hx, hy, a.pos.x, a.pos.y + a.h * 0.5, 0x8ee060);
        this.popup(a.slot, `-${Math.round(heal)}% DRAINED`, 'good');
      }
      if (move.recoilFrac) {
        a.percent = Math.min(999, a.percent + dmg.damage * move.recoilFrac);
        this.popup(a.slot, 'RECOIL', 'bad');
      }
      this.rumble(d, Math.min(1, 0.3 + dmg.damage / 20 + (superEff ? 0.3 : 0)), 0.5, 60 + dmg.damage * 8);
      this.rumble(a, 0.2, 0.2, 60);
    } else if (res.result === 'blocked') {
      this.effects.sparks(hx, hy, -dirSign, 0.5, d.colors.accent, 6, 8);
      this.audio.block(hx);
      this.hitstop = Math.max(this.hitstop, 3);
    }
    return res;
  }

  onBoost(f, text) {
    this.popup(f.slot, text, 'good');
    this.effects.ring(f.pos.x, f.pos.y + f.h * 0.5, 0xff6a4a, 2.4, 0.4);
    this.effects.boost(f.pos.x, f.pos.y + f.h * 0.3, 0, 1, 0xff8a4a, true);
    if (!this.demo) this.effects.callout(f.pos.x, f.pos.y + f.h + 0.7, text, 0xff9a5a);
    this.audio.statUp(f.pos.x);
  }

  onSeedTick(victim, by) {
    this.effects.drain(victim.pos.x, victim.pos.y + victim.h * 0.6, by.pos.x, by.pos.y + by.h * 0.5, 0x8ee060);
  }

  moveFx(f, fx) {
    const x = f.pos.x;
    const y = f.pos.y + f.h * 0.6;
    if (fx === 'powder') {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 2.5;
        this.effects.add(0, x, y + 0.5, 0, Math.cos(a) * s, Math.sin(a) * s + 1, 0, 0.9, 0.07, i % 2 ? 0x9ae060 : 0xf0a0d0, { drag: 2 });
      }
      this.audio.status(x, 'powder');
    } else if (fx === 'hypno') {
      for (let i = 0; i < 3; i++) this.effects.ring(x + f.facing * (0.8 + i * 0.4), y, 0xb07aff, 0.8 + i * 0.3, 0.35 + i * 0.1);
      this.audio.status(x, 'sleep');
    } else if (fx === 'wave') {
      this.effects.ring(x, f.pos.y + 0.5, 0xb04ad0, 3.4, 0.4);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        this.effects.add(0, x, f.pos.y + 0.6, 0, Math.cos(a) * 9, Math.sin(a) * 6 + 2, 0, 0.4, 0.14, 0xc060e0, { drag: 4 });
      }
    }
  }

  pummel(a, v) {
    const dmg = damageFor(a, v, PUMMEL.dmg, { cat: 'physical' }).damage;
    v.percent = Math.min(999, v.percent + dmg);
    v.stats.damageTaken += dmg;
    a.stats.damageDealt += dmg;
    v.flash = 0.8;
    this.hitstop = Math.max(this.hitstop, 3);
    this.effects.sparks(v.pos.x, v.pos.y + v.h * 0.6, a.facing, 0.3, 0xffffff, 4, 5);
    this.audio.hit(v.pos.x, 2);
  }

  throwHit(a, v, T) {
    a.holding = null;
    v.heldBy = null;
    const dmg = damageFor(a, v, T.dmg, { cat: 'physical' }).damage;
    const res = v.takeHit({
      damage: dmg, kb: T.kb, grow: T.grow, ang: T.ang, dirSign: a.facing,
      attacker: a, source: `${T.dir.toUpperCase()} THROW`, throw: true,
    });
    if (res.result === 'hit') {
      a.stats.hits++;
      this.effects.sparks(v.pos.x, v.pos.y + v.h * 0.5, a.facing, 0.5, 0xffffff, 10, 10);
      this.hitstop = Math.max(this.hitstop, 6);
      this.shake(0.3);
      this.audio.hit(v.pos.x, dmg);
      this.rumble(v, 0.8, 0.5, 150);
    }
  }

  // ------------------------------------------------------------ projectiles

  spawnProjectile(owner, p, move) {
    const a = ((p.ang || 0) * Math.PI) / 180;
    const dir = owner.facing;
    const x = owner.pos.x + dir * owner.w * 0.6;
    const y = owner.pos.y + owner.h * (p.y ?? 0.45); // p.y: launch height as a fraction of body height
    const mesh = new THREE.Group();
    let core;
    if (p.visual === 'seed' || p.visual === 'sludge') {
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(p.r * 0.9, 0), new THREE.MeshStandardMaterial({ color: p.color, flatShading: true, roughness: 0.5 }));
    } else if (p.visual === 'shadow') {
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(p.r * 0.9, 1), new THREE.MeshBasicMaterial({ color: 0x14081e }));
    } else if (p.visual === 'beam') {
      core = new THREE.Mesh(new THREE.BoxGeometry(1.4, p.r * 0.6, p.r * 0.6), glowMat(0xffffff, 1));
    } else {
      core = new THREE.Mesh(new THREE.OctahedronGeometry(p.r * 0.8, 0), glowMat(0xffffff, 1));
    }
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(p.r * 1.5, 0), glowMat(p.color, p.visual === 'seed' ? 0.2 : 0.6));
    if (p.visual === 'beam') shell.scale.set(2.2, 0.6, 0.6);
    mesh.add(core, shell);
    mesh.position.set(x, y, 0);
    this.scene.add(mesh);
    this.projectiles.push({
      owner, move, p, x, y, vx: Math.cos(a) * p.speed * dir, vy: Math.sin(a) * p.speed,
      life: p.life, mesh, shell, core, dirSign: dir, passed: new Set(),
    });
  }

  removeProjectile(pr) {
    this.scene.remove(pr.mesh);
    pr.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  updateProjectiles(dt) {
    const S = STAGE.main;
    const B = STAGE.blast;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const p = pr.p;
      pr.vy -= (p.gravity || 0) * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      let dead = pr.life <= 0 || pr.x < B.left || pr.x > B.right || pr.y < B.bottom;
      if (!dead && pr.x > S.left && pr.x < S.right && pr.y < S.top && pr.y > S.bottom) {
        this.effects.sparks(pr.x, pr.y, -Math.sign(pr.vx), 0.5, p.color, 6, 6);
        dead = true;
      }
      if (!dead) {
        for (const d of this.fighters) {
          if (d === pr.owner || !d.active || d.onRevival || d.intangible || pr.passed.has(d)) continue;
          if (!circleBox(pr.x, pr.y, p.r, d.pos.x - d.w / 2, d.pos.y, d.pos.x + d.w / 2, d.pos.y + d.h)) continue;
          const hb = { kb: p.kb, grow: p.grow, ang: p.kbAng ?? 40, effect: p.effect };
          const res = this.applyHit(pr.owner, d, hb, pr.move, p.dmg, Math.sign(pr.vx) || pr.dirSign, pr.x, pr.y);
          if (res.result === 'immune' || res.result === 'miss') {
            pr.passed.add(d); // immune targets let it fly straight through
            continue;
          }
          dead = true;
          break;
        }
      }
      if (dead) {
        this.removeProjectile(pr);
        this.projectiles.splice(i, 1);
      } else if (Math.random() < 0.7) {
        this.effects.add(0, pr.x, pr.y, 0, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0, 0.2, 0.06 + Math.random() * 0.06, p.color);
      }
    }
  }

  // ------------------------------------------------------------ KOs & match end

  // forced: a Destiny Bond KO, which still counts even if the match just ended.
  onKO(f, forced = false) {
    if (f.dead) return;
    const killer = f.lastHitBy && this.time - f.lastHitTime < 8 ? f.lastHitBy : null;
    f.dead = true;
    f.respawnTimer = 1.6;
    if (f.holding) f.releaseGrab(false);
    const cx = clamp(f.pos.x, -17, 17);
    const cy = clamp(f.pos.y, -7, 14);
    const nx = -cx;
    const ny = 3 - cy;
    const m = Math.hypot(nx, ny) || 1;
    this.effects.koBlast(cx, cy, f.colors.main, nx / m, ny / m);
    this.shake(1.2);
    this.audio.ko(cx);
    for (const x of this.fighters) this.rumble(x, 1, 1, x === f ? 500 : 250);
    const live = this.state === 'playing' || this.state === 'countdown';
    if (this.demo || (!live && !forced)) return;

    f.stats.falls++;
    f.streak = 0;
    if (killer) {
      killer.stats.kos++;
      killer.streak++;
    } else {
      f.stats.sds++;
    }
    this.ui.feed(killer, f.lastHitMove || '', f);
    if (killer) {
      this.ui.popup(killer.slot, '+1 KO', 'good');
      const streakText = { 2: 'DOUBLE KO!', 3: 'TRIPLE KO!' }[killer.streak] || (killer.streak >= 4 ? 'UNSTOPPABLE!' : null);
      if (streakText) {
        this.ui.announce(streakText, 'streak', 1400);
        this.audio.say(streakText.replace('!', ''));
      }
    } else {
      this.ui.popup(f.slot, 'SELF-DESTRUCT', 'bad');
    }

    if (this.teamMode) {
      // Each Pokémon is one stock: it faints, then both players make hidden picks.
      f.stocks = 0;
      f.eliminated = true;
      this.popup(f.slot, `${f.sp.name.toUpperCase()} FAINTED`, 'bad');
      const out = this.players.map((p) => this.aliveIndexes(p).length === 0);
      if (out[0] || out[1]) this.endMatch(out[0] && out[1] ? null : out[0] ? 1 : 0);
      else if (this.state !== 'gameover') this.queueKOPick(f.slot);
    } else if (this.mode === 'STOCK' || this.suddenDeath) {
      f.stocks--;
      if (f.stocks <= 0) {
        f.eliminated = true;
        const alive = this.fighters.filter((x) => !x.eliminated);
        if (alive.length <= 1) this.endMatch(alive[0] ? alive[0].slot : null);
      }
    }

    // Destiny Bond: whoever KOs the bonded Pokémon goes down with it.
    if (f.destinyBond > 0 && killer && killer.active) {
      f.destinyBond = 0;
      killer.lastHitBy = f;
      killer.lastHitTime = this.time;
      killer.lastHitMove = 'Destiny Bond';
      this.ui.announce('DESTINY BOND!', 'streak', 1600);
      this.onKO(killer, true);
    }
  }

  timeUp() {
    const score = (f) => f.stats.kos - f.stats.falls;
    const best = Math.max(...this.fighters.map(score));
    const leaders = this.fighters.filter((f) => score(f) === best);
    if (leaders.length === 1) {
      this.endMatch(leaders[0].slot);
      return;
    }
    this.suddenDeath = true;
    for (const f of this.fighters) {
      f.eliminated = false;
      f.respawn();
      f.percent = 300;
      f.stocks = 1;
    }
    this.ui.announce('SUDDEN DEATH', 'streak', 1800);
    this.audio.say('Sudden death');
  }

  // winner: the winning player's slot, or null for a draw.
  endMatch(winner) {
    this.state = 'gameover';
    this.kopick = null;
    this.ui.hidePicks();
    this.winner = winner;
    this.gameoverTimer = 2.6;
    this.canAct = false;
    this.ui.announce('GAME!', 'game', 2400);
    this.audio.say('Game!');
  }

  // Per-player totals across the whole team for the results screen.
  resultSummaries() {
    return this.players.map((p) => {
      const stats = { kos: 0, falls: 0, sds: 0, damageDealt: 0, hits: 0 };
      for (const f of p.team) for (const k of Object.keys(stats)) stats[k] += f.stats[k];
      return {
        slot: p.slot, colors: p.team[0].colors, stats,
        label: p.team.map((f) => f.sp.name.toUpperCase()).join(' · '),
        team: p.team.map((f) => ({ name: f.sp.name, fainted: f.eliminated })),
      };
    });
  }

  // ------------------------------------------------------------ visuals

  fighterView(f) {
    const inMove = f.state === 'attack' && f.move;
    return {
      state: f.state, sf: f.sf, grounded: f.grounded, vx: f.vel.x, vy: f.vel.y, facing: f.facing,
      runSpeed: f.st.runSpeed,
      anim: inMove ? f.move.anim : null,
      p: inMove ? f.moveF / f.move.total : f.state === 'getup' ? f.sf / (f.getupTotal || 1) : 0,
      charging: f.charging, tumble: f.tumble, dodge: f.dodge && f.dodge.kind, intangible: f.intangible,
      shieldFrac: Math.max(0, f.shieldHP / SHIELD.hp), flash: f.flash, invuln: f.invuln > 0 || f.onRevival,
      landSquash: f.landSquash, zipDir: f.zip ? { x: f.zip.vx, y: f.zip.vy } : null,
      boosted: Object.values(f.boosts).some((v) => v > 0), seeded: !!f.seed, bond: f.destinyBond > 0,
      showTag: !this.demo,
    };
  }

  updateVisuals(dt) {
    for (const p of this.players) for (const f of p.team) if (f !== this.fighters[p.slot]) f.model.root.visible = false;
    this.fighters.forEach((f, i) => {
      const m = f.model;
      m.root.visible = f.active;
      if (f.active) {
        m.root.position.set(f.pos.x, f.pos.y, 0);
        m.update(this.fighterView(f), dt);
        if (f.state === 'sleep' && dt > 0 && Math.random() < 0.06) {
          this.effects.add(0, f.pos.x + f.facing * 0.3, f.pos.y + f.h * 0.5, 0, 0.4, 1.2, 0, 1.2, 0.12, 0xd8d0ff, { drag: 0.5 });
        }
      }
      const drone = this.stage.drones[i];
      drone.visible = f.active && f.onRevival;
      if (drone.visible) {
        drone.position.set(f.pos.x, f.pos.y + Math.sin(this.realTime * 3) * 0.03, 0);
        drone.userData.ringMat.color.set(f.colors.main);
      }
    });
    for (const pr of this.projectiles) {
      pr.mesh.position.set(pr.x, pr.y, 0);
      if (pr.p.visual === 'beam') {
        pr.mesh.rotation.set(0, 0, Math.atan2(pr.vy, pr.vx));
      } else {
        pr.shell.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        pr.core.rotation.x += dt * 8;
        pr.shell.scale.setScalar(0.8 + Math.random() * 0.5);
      }
      if (pr.p.visual === 'flame') pr.mesh.scale.setScalar(0.7 + (1 - pr.life / pr.p.life) * 1.2);
    }
    this.effects.update(dt);
    if (!this.demo && this.fighters.length) this.ui.updateHUD(this.players, this.settings, this.timeLeft, this.teamMode);
  }

  updateCamera(dt) {
    const c = this.cam;
    let tx;
    let ty;
    let td;
    if (this.state === 'select') {
      tx = 0;
      ty = 0.5;
      td = this.camera.aspect < 1.2 ? 10 : 6.2;
    } else {
      const pts = this.fighters.filter((f) => f.active).map((f) => ({
        x: clamp(f.pos.x, -19, 19), y: clamp(f.pos.y + f.h * 0.5, -8, 15),
      }));
      if (!pts.length) pts.push({ x: 0, y: 2 });
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      tx = clamp(((minX + maxX) / 2) * 0.85, -10, 10);
      ty = clamp(((minY + maxY) / 2) * 0.8 + 0.4, 0.2, 9);
      // Pokémon are small, so frame them tightly (Smash-style zoom).
      const w = maxX - minX + 6.5;
      const h = maxY - minY + 4.5;
      const halfH = Math.max(h / 2, w / 2 / this.camera.aspect, 3.6);
      td = clamp(halfH / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), 11, 46);
      if (this.state === 'title') {
        tx = Math.sin(this.realTime * 0.15) * 3;
        ty = 3;
        td = Math.max(td, 28);
      }
    }
    const k = 1 - Math.exp(-dt * 4);
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    c.dist += (td - c.dist) * k;
    c.trauma = Math.max(0, c.trauma - dt * 1.8);
    const s = c.trauma * c.trauma;
    const t = this.realTime * 40;
    const ox = s * 0.9 * Math.sin(t * 1.1) * Math.cos(t * 0.37);
    const oy = s * 0.9 * Math.sin(t * 0.9 + 2) * Math.cos(t * 0.53);
    const lift = this.state === 'select' ? 0.6 : 1.4;
    this.camera.position.set(c.x + ox, c.y + lift + oy, c.dist);
    this.camera.lookAt(c.x + ox * 0.5, c.y + (this.state === 'select' ? 0.2 : 0.3), 0);
  }
}
