// Match flow, projectiles, hit resolution, KOs, camera and the menu state machine.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  SIM_DT, STAGE, OPERATORS, WEAPONS, KNIFE, GRENADE, PLAYER_COLORS, RULES,
} from './config.js';
import { Fighter } from './fighter.js';
import { SoldierModel } from './models/soldier.js';
import { buildStage } from './stage.js';
import { Effects } from './effects.js';
import { CpuBrain } from './ai.js';
import { UI } from './ui.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { BUTTONS } from './input.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (n) => Math.floor(Math.random() * n);
const SELECT_ROWS = [['op', 'weapon', 'mode', 'limit', 'cpu', 'ready'], ['op', 'weapon', 'ready']];
const DEVICE_LABELS = { kb1: 'KEYBOARD · WASD', kb2: 'KEYBOARD · ARROWS', touch: 'TOUCH', cpu: 'CPU' };

// Liang-Barsky segment vs box. Returns entry fraction along the segment, or null.
function segAABB(x0, y0, x1, y1, minX, minY, maxX, maxY) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - minX, maxX - x0, y0 - minY, maxY - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0;
}

function weaponName(id) {
  if (id === 'knife') return KNIFE.name;
  if (id === 'grenade') return GRENADE.name;
  const w = WEAPONS.find((x) => x.id === id);
  return w ? w.name : '???';
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
    this.fighters = [];
    this.models = [];
    this.bullets = [];
    this.grenades = [];
    this.tracerPool = {};
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

  newSlot(i) {
    return { device: null, op: i % OPERATORS.length, weapon: i === 0 ? 0 : 2, row: 0, ready: false };
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

  // ---------------------------------------------------------------- states

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
    for (const s of this.slots) s.ready = s.device === 'cpu';
    if (joinId) this.join(joinId);
    this.refreshCpuSlot();
    this.ui.show('select');
    this.renderSelect();
  }

  join(id) {
    if (this.slots.some((s) => s.device === id)) return;
    const slot = this.slots.find((s) => !s.device) || (this.slots[1].device === 'cpu' ? this.slots[1] : null);
    if (!slot) return;
    slot.device = id;
    slot.ready = false;
    slot.row = 0;
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
      s.op = rand(OPERATORS.length);
      s.weapon = rand(WEAPONS.length);
      s.ready = true;
    } else if (this.settings.cpu === 0 && s.device === 'cpu') {
      s.device = null;
      s.ready = false;
    }
  }

  deviceLabel(id) {
    if (DEVICE_LABELS[id]) return DEVICE_LABELS[id];
    if (id && id.startsWith('pad')) return `GAMEPAD ${+id.slice(3) + 1}`;
    return '';
  }

  rowValue(key, s) {
    const st = this.settings;
    switch (key) {
      case 'op': return OPERATORS[s.op].name;
      case 'weapon': return WEAPONS[s.weapon].type;
      case 'mode': return RULES.modes[st.mode];
      case 'limit': return st.mode === 0 ? `${st.stocks} STOCK` : `${st.minutes} MIN`;
      case 'cpu': return RULES.cpu[st.cpu];
      default: return '';
    }
  }

  change(i, key, dir) {
    const s = this.slots[i];
    const st = this.settings;
    if (!s.device || s.device === 'cpu' || s.ready) return;
    const cyc = (v, n) => (v + dir + n) % n;
    if (key === 'op') s.op = cyc(s.op, OPERATORS.length);
    else if (key === 'weapon') s.weapon = cyc(s.weapon, WEAPONS.length);
    else if (i !== 0) return;
    else if (key === 'mode') st.mode = cyc(st.mode, RULES.modes.length);
    else if (key === 'limit') {
      if (st.mode === 0) st.stocks = clamp(st.stocks + dir, 1, 5);
      else st.minutes = clamp(st.minutes + dir, 1, 5);
    } else if (key === 'cpu') {
      st.cpu = cyc(st.cpu, RULES.cpu.length);
      this.refreshCpuSlot();
    }
    this.audio.ui();
    this.renderSelect();
  }

  canStart() {
    return this.slots.every((s) => s.device) && this.slots.some((s) => s.device !== 'cpu');
  }

  renderSelect() {
    if (this.state !== 'select') return;
    const st = this.settings;
    const slots = this.slots.map((s, i) => ({
      joined: !!s.device,
      cpu: s.device === 'cpu',
      deviceLabel: this.deviceLabel(s.device),
      op: s.op,
      weapon: s.weapon,
      row: s.row,
      ready: s.ready,
      color: PLAYER_COLORS[i].css,
      rows: SELECT_ROWS[i].map((key) => ({
        key,
        label: { op: 'OPERATOR', weapon: 'PRIMARY', mode: 'MODE', limit: 'LIMIT', cpu: 'CPU' }[key],
        value: this.rowValue(key, s),
      })),
    }));
    const full = this.canStart();
    const allReady = full && this.slots.every((s) => s.ready);
    this.ui.renderSelect({
      slots,
      cpuName: RULES.cpu[st.cpu],
      rulesText: `${RULES.modes[st.mode]} · ${this.rowValue('limit')} · STAGE: OUTPOST`,
      canStart: full && this.slots[0].ready,
      hint: !full
        ? 'Waiting for P2: press <b>A</b> on a second controller, or set <b>CPU</b> in P1\'s rules'
        : allReady ? 'DEPLOYING…'
          : this.mobile ? 'Tap <b>◀ ▶</b> to change your class, then <b>READY UP</b>'
            : '<b>↑↓</b> choose · <b>←→</b> change · <b>A</b> ready up · <b>B</b> back',
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
      const rows = SELECT_ROWS[i];
      if (s.ready) {
        if (d.pressed.back) { s.ready = false; this.audio.uiBack(); this.renderSelect(); }
        continue;
      }
      if (d.nav.up) { s.row = (s.row - 1 + rows.length) % rows.length; this.audio.ui(); this.renderSelect(); }
      if (d.nav.down) { s.row = (s.row + 1) % rows.length; this.audio.ui(); this.renderSelect(); }
      if (d.nav.left) this.change(i, rows[s.row], -1);
      if (d.nav.right) this.change(i, rows[s.row], 1);
      if (d.pressed.confirm || d.pressed.start) { s.ready = true; this.audio.uiConfirm(); this.renderSelect(); }
      else if (d.pressed.back) this.leave(i);
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
      const key = s.device ? `${s.op}-${s.weapon}` : null;
      const p = this.previews[i];
      if ((p && p.key) !== key) {
        if (p) { this.scene.remove(p.model.root); p.model.dispose(); }
        this.previews[i] = null;
        if (key) {
          const model = new SoldierModel({
            operator: OPERATORS[s.op], colors: PLAYER_COLORS[i], weaponId: WEAPONS[s.weapon].id, label: `P${i + 1}`,
          });
          model.root.position.set(i === 0 ? -0.85 : 0.85, 0, 1);
          this.scene.add(model.root);
          this.previews[i] = { key, model };
        }
      }
      const pv = this.previews[i];
      if (pv) {
        const t = this.realTime + i;
        pv.model.update({
          grounded: true, vx: 0, vy: 0, facing: i === 0 ? 1 : -1, yaw: i === 0 ? 0.75 : -0.75,
          aimAngle: s.ready ? 0.9 : Math.sin(t * 0.8) * 0.15, hitstun: false, tumble: false, recoil: 0,
          reload: s.ready ? -1 : (t % 6 < 1.5 ? (t % 6) / 1.5 : -1), knife: -1, ads: 0, adsCharged: false,
          shield: false, boosting: s.ready, dashing: false, flash: 0, invuln: false, landSquash: 0,
          muzzle: s.ready && Math.random() < 0.15, showTag: false,
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

  startMatch(demo) {
    this.clearMatch();
    this.demo = demo;
    const st = this.settings;
    const picks = demo
      ? [0, 1].map(() => ({ op: rand(OPERATORS.length), weapon: rand(WEAPONS.length), device: 'cpu' }))
      : this.slots;
    this.fighters = picks.map((s, i) => {
      const f = new Fighter(this, i, OPERATORS[s.op], WEAPONS[s.weapon], PLAYER_COLORS[i]);
      f.stocks = st.stocks;
      f.device = s.device;
      f.isCpu = s.device === 'cpu';
      if (f.isCpu) f.brain = new CpuBrain(demo ? 2 : st.cpu);
      return f;
    });
    this.models = this.fighters.map((f) => {
      const m = new SoldierModel({ operator: f.op, colors: f.colors, weaponId: f.weapon.id, label: `P${f.slot + 1}` });
      this.scene.add(m.root);
      return m;
    });
    this.pending = [{}, {}];
    this.timeLeft = st.minutes * 60;
    this.suddenDeath = false;
    this.timeScale = 1;
    this.hitstop = 0;
    this.acc = 0;
    if (demo) {
      this.canAct = true;
      return;
    }
    this.state = 'countdown';
    this.countdown = 3.6;
    this.lastCount = null;
    this.canAct = false;
    this.ui.buildHUD(this.fighters, st);
    this.ui.show('hud');
    this.audio.setQuiet(false);
    const touchPlayer = this.fighters.find((f) => f.device === 'touch');
    this.touch.setVisible(!!touchPlayer);
    if (touchPlayer) this.touch.setAbilityLabel(touchPlayer.op.ability.id === 'shield' ? 'SHIELD' : 'DASH');
  }

  clearMatch() {
    for (const m of this.models) {
      this.scene.remove(m.root);
      m.dispose();
    }
    this.models = [];
    for (const b of this.bullets) this.releaseTracer(b);
    this.bullets = [];
    for (const g of this.grenades) this.scene.remove(g.mesh);
    this.grenades = [];
    this.fighters = [];
    for (const d of this.stage.drones) d.visible = false;
    this.effects.clear();
    this.removePreviews();
  }

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
      if (a.type === 'join' && this.mobile) this.join('touch');
      else if (a.type === 'change') this.change(a.slot, a.row, a.dir);
      else if (a.type === 'ready') {
        const sl = this.slots[a.slot];
        if (sl.device && sl.device !== 'cpu') { sl.ready = !sl.ready; this.audio.uiConfirm(); this.renderSelect(); }
      } else if (a.type === 'leave') this.leave(a.slot);
      else if (a.type === 'start' && this.canStart()) {
        for (const sl of this.slots) sl.ready = true;
        this.startMatch(false);
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
    return this.fighters.filter((f) => !f.isCpu && f.device).map((f) => this.input.get(f.device));
  }

  setPaused(p) {
    if (p) {
      this.pausedFrom = this.state;
      this.state = 'paused';
    } else {
      this.state = this.pausedFrom || 'playing';
    }
    this.ui.showPause(p);
    this.touch.setVisible(!p && this.fighters.some((f) => f.device === 'touch'));
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
          this.ui.showResults(this.winner, this.fighters);
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
    this.fighters.forEach((f, i) => {
      if (f.isCpu || !f.device) return;
      const d = this.input.get(f.device);
      for (const b of BUTTONS) if (d.pressed[b]) this.pending[i][b] = true;
    });
    this.acc += dt * this.timeScale;
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 5) {
      this.step();
      this.acc -= SIM_DT;
      steps++;
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
      if (f.active && f.hitstun > 0 && Math.hypot(f.vel.x, f.vel.y) > 13 && Math.round(this.time * 60) % 2 === 0) {
        this.effects.trail(f.pos.x, f.pos.y + f.h * 0.5, f.colors.main);
      }
    });
    this.updateBullets(SIM_DT);
    this.updateGrenades(SIM_DT);
    if (this.state === 'playing' && this.settings.mode === 1 && !this.suddenDeath && !this.demo) {
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

  onFire(f, mx, my, charged) {
    const W = f.weapon;
    this.effects.muzzle(mx, my, f.aim.x, f.aim.y, W.id);
    this.audio.shot(W.id, mx);
    this.shake(W.shake * (charged ? 1.4 : 1));
    if (W.id !== 'smg') this.rumble(f, 0.5, 0.3, 90);
  }

  getTracer(W) {
    const pool = (this.tracerPool[W.id] ||= []);
    let m = pool.pop();
    if (!m) {
      m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({
        color: W.tracer, toneMapped: false, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.scale.set(W.tracerLen, W.tracerWidth, W.tracerWidth);
      this.scene.add(m);
    }
    m.visible = true;
    return m;
  }

  releaseTracer(b) {
    b.mesh.visible = false;
    this.tracerPool[b.W.id].push(b.mesh);
  }

  spawnBullet(owner, x, y, dx, dy, W, kbMult, shot) {
    this.bullets.push({ owner, x, y, dx, dy, W, kbMult, shot, life: W.life, mesh: this.getTracer(W) });
  }

  updateBullets(dt) {
    const S = STAGE.main;
    const B = STAGE.blast;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const W = b.W;
      const nx = b.x + b.dx * W.speed * dt;
      const ny = b.y + b.dy * W.speed * dt;
      let best = 2;
      let target = null;
      for (const f of this.fighters) {
        if (f === b.owner || !f.active || f.onRevival || f.invuln > 0 || f.dashTimer > 0) continue;
        let minX = f.pos.x - f.w / 2;
        let maxX = f.pos.x + f.w / 2;
        if (f.shieldUp) {
          if (f.facing > 0) maxX += 0.5;
          else minX -= 0.5;
        }
        const t = segAABB(b.x, b.y, nx, ny, minX, f.pos.y, maxX, f.pos.y + f.h);
        if (t !== null && t < best) { best = t; target = f; }
      }
      const ts = segAABB(b.x, b.y, nx, ny, S.left, S.bottom, S.right, S.top);
      if (ts !== null && ts < best) {
        const hx = b.x + (nx - b.x) * ts;
        const hy = b.y + (ny - b.y) * ts;
        this.effects.sparks(hx, hy, -b.dx, Math.abs(b.dy) + 0.5, 0xffd27a, W.light ? 2 : 5, 6);
        if (!W.light || Math.random() < 0.3) this.audio.impact(hx);
        this.releaseTracer(b);
        this.bullets.splice(i, 1);
        continue;
      }
      if (target) {
        const hx = b.x + (nx - b.x) * best;
        const hy = b.y + (ny - b.y) * best;
        const res = target.takeHit({
          damage: W.damage, baseKB: W.baseKB, growth: W.growth, dirX: b.dx, dirY: b.dy + W.lift,
          light: W.light, kbMult: b.kbMult, attacker: b.owner, source: W.id, fromX: b.x,
        });
        if (res.result === 'hit') {
          if (!b.shot.hit) {
            b.shot.hit = true;
            b.owner.stats.hits++;
            const heavy = !W.light;
            this.effects.hitmarker(hx, hy, heavy && res.launch > 15);
            this.audio.hitmarker(heavy);
          }
          if (W.light) {
            this.effects.sparks(hx, hy, b.dx, b.dy, 0xffd27a, 3, 7);
            this.rumble(target, 0.1, 0.3, 50);
          } else {
            this.effects.sparks(hx, hy, b.dx, b.dy, 0xffffff, 10, 14);
            this.hitstop = Math.max(this.hitstop, Math.round(W.hitstop * (b.kbMult > 1 ? 1.5 : 1)));
            this.shake(0.2 + res.launch * 0.02);
            this.audio.launch(hx, res.launch);
            this.rumble(target, 0.9, 0.6, 160);
            this.rumble(b.owner, 0.3, 0.3, 80);
          }
        } else if (res.result === 'blocked') {
          this.effects.sparks(hx, hy, -b.dx, -b.dy, target.colors.accent, 6, 9);
          this.audio.block(hx);
        }
        if (res.result !== 'miss') {
          this.releaseTracer(b);
          this.bullets.splice(i, 1);
          continue;
        }
      }
      if (W.id === 'sniper') this.effects.add(0, b.x, b.y, 0, 0, 0, 0, 0.35, 0.07, W.tracer);
      b.x = nx;
      b.y = ny;
      b.life -= dt;
      if (b.life <= 0 || b.x < B.left || b.x > B.right || b.y < B.bottom || b.y > B.top) {
        this.releaseTracer(b);
        this.bullets.splice(i, 1);
      }
    }
  }

  spawnGrenade(owner, x, y, vx, vy) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3e4a2c, flatShading: true }));
    body.scale.y = 1.2;
    body.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    cap.position.y = 0.19;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: owner.colors.main, toneMapped: false }));
    led.position.set(0, 0.05, 0.14);
    mesh.add(body, cap, led);
    this.scene.add(mesh);
    this.grenades.push({ owner, x, y, vx, vy, fuse: GRENADE.fuse, mesh, led, spin: (Math.random() - 0.5) * 20 });
  }

  updateGrenades(dt) {
    const S = STAGE.main;
    const B = STAGE.blast;
    const r = 0.15;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.vy -= GRENADE.gravity * dt;
      let nx = g.x + g.vx * dt;
      let ny = g.y + g.vy * dt;
      const bounceY = (top) => {
        ny = top + r;
        g.vx *= 0.7;
        g.spin *= 0.6;
        if (Math.abs(g.vy) < 2.5) g.vy = 0;
        else {
          g.vy = -g.vy * GRENADE.bounce;
          this.audio.bounce(g.x);
        }
      };
      if (nx + r > S.left && nx - r < S.right && ny - r < S.top && ny + r > S.bottom) {
        if (g.y - r >= S.top - 0.02 && g.vy <= 0) bounceY(S.top);
        else if (g.y + r <= S.bottom + 0.02) { ny = S.bottom - r; g.vy = -g.vy * GRENADE.bounce; }
        else { nx = g.x; g.vx = -g.vx * GRENADE.bounce; }
      }
      for (const p of STAGE.platforms) {
        if (g.vy <= 0 && g.y - r >= p.y - 0.02 && ny - r <= p.y && Math.abs(nx - p.x) <= p.w / 2) bounceY(p.y);
      }
      if (g.vy === 0) g.vx *= Math.max(0, 1 - 6 * dt);
      g.x = nx;
      g.y = ny;
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.explode(g);
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      } else if (g.x < B.left || g.x > B.right || g.y < B.bottom) {
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  explode(g) {
    const R = GRENADE.radius;
    this.effects.explosion(g.x, g.y, R);
    this.audio.explosion(g.x);
    this.shake(0.8);
    this.hitstop = Math.max(this.hitstop, GRENADE.hitstop);
    for (const f of this.fighters) {
      if (!f.active) continue;
      const c = f.center;
      const d = Math.hypot(c.x - g.x, c.y - g.y);
      if (d > R + f.w * 0.5) continue;
      const fall = 1 - clamp(d / R, 0, 1) * 0.5;
      const self = f === g.owner;
      const res = f.takeHit({
        damage: GRENADE.damage * fall * (self ? GRENADE.selfDamageMult : 1),
        baseKB: GRENADE.baseKB * fall, growth: GRENADE.growth * fall,
        dirX: c.x - g.x, dirY: c.y - g.y + 0.8, attacker: g.owner, source: 'grenade', fromX: g.x,
      });
      if (res.result === 'hit') {
        this.rumble(f, 1, 0.8, 250);
        if (!self) this.effects.hitmarker(c.x, c.y, res.launch > 15);
      }
    }
  }

  meleeCheck(attacker, box) {
    for (const f of this.fighters) {
      if (f === attacker || !f.active || attacker.knifeHits.has(f)) continue;
      const overlapX = Math.abs(f.pos.x - box.x) < box.hw + f.w / 2;
      const overlapY = Math.abs(f.pos.y + f.h / 2 - box.y) < box.hh + f.h / 2;
      if (!overlapX || !overlapY) continue;
      attacker.knifeHits.add(f);
      const res = f.takeHit({
        damage: KNIFE.damage, baseKB: KNIFE.baseKB, growth: KNIFE.growth,
        dirX: attacker.facing, dirY: 0.75, attacker, source: 'knife', fromX: attacker.pos.x,
      });
      const hx = f.pos.x - attacker.facing * f.w * 0.3;
      const hy = box.y;
      if (res.result === 'hit') {
        this.effects.sparks(hx, hy, attacker.facing, 0.6, 0xff5040, 14, 12);
        this.effects.ring(hx, hy, 0xffffff, 1.6, 0.2);
        this.effects.hitmarker(hx, hy, true);
        this.audio.knifeHit(hx);
        this.audio.hitmarker(true);
        this.hitstop = Math.max(this.hitstop, KNIFE.hitstop);
        this.shake(0.4);
        this.rumble(f, 0.9, 0.6, 150);
        this.rumble(attacker, 0.4, 0.3, 80);
      } else if (res.result === 'blocked') {
        this.effects.sparks(hx, hy, -attacker.facing, 0.5, f.colors.accent, 8, 9);
        this.audio.block(hx);
      }
    }
  }

  onKO(f) {
    if (f.dead) return;
    const killer = f.lastHitBy && this.time - f.lastHitTime < 8 ? f.lastHitBy : null;
    f.dead = true;
    f.respawnTimer = 1.6;
    const cx = clamp(f.pos.x, -17, 17);
    const cy = clamp(f.pos.y, -7, 13);
    const nx = -cx;
    const ny = 3 - cy;
    const m = Math.hypot(nx, ny) || 1;
    this.effects.koBlast(cx, cy, f.colors.main, nx / m, ny / m);
    this.shake(1.2);
    this.audio.ko(cx);
    for (const x of this.fighters) this.rumble(x, 1, 1, x === f ? 500 : 250);
    if (this.demo || (this.state !== 'playing' && this.state !== 'countdown')) return;

    f.stats.falls++;
    f.streak = 0;
    if (killer) {
      killer.stats.kos++;
      killer.streak++;
    } else {
      f.stats.sds++;
    }
    this.ui.feed(killer, weaponName(f.lastHitWeapon), f);
    if (killer) {
      this.ui.popup(killer.slot, '+1 RING OUT', 'good');
      const streakText = { 2: 'DOUBLE KO!', 3: 'TRIPLE KO!' }[killer.streak] || (killer.streak >= 4 ? 'UNSTOPPABLE!' : null);
      if (streakText) {
        this.ui.announce(streakText, 'streak', 1400);
        this.audio.say(streakText.replace('KO', 'kill').replace('!', ''));
      }
    } else {
      this.ui.popup(f.slot, 'SELF-DESTRUCT', 'bad');
    }

    if (this.settings.mode === 0 || this.suddenDeath) {
      f.stocks--;
      if (f.stocks <= 0) {
        f.eliminated = true;
        const alive = this.fighters.filter((x) => !x.eliminated);
        if (alive.length <= 1) this.endMatch(alive[0] || null);
      }
    }
  }

  timeUp() {
    const score = (f) => f.stats.kos - f.stats.falls;
    const best = Math.max(...this.fighters.map(score));
    const leaders = this.fighters.filter((f) => score(f) === best);
    if (leaders.length === 1) {
      this.endMatch(leaders[0]);
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

  endMatch(winner) {
    this.state = 'gameover';
    this.winner = winner;
    this.gameoverTimer = 2.6;
    this.canAct = false;
    this.ui.announce('GAME!', 'game', 2400);
    this.audio.say('Game!');
  }

  // ------------------------------------------------------------ visuals

  fighterView(f) {
    const W = f.weapon;
    return {
      grounded: f.grounded, vx: f.vel.x, vy: f.vel.y, facing: f.facing,
      aimAngle: Math.atan2(f.aim.y, Math.abs(f.aim.x)),
      hitstun: f.hitstun > 0, tumble: f.tumble && !f.grounded, recoil: f.recoilKick,
      reload: f.reloadTimer > 0 ? 1 - f.reloadTimer / W.reload : -1,
      knife: f.knifeTimer > 0 ? 1 - f.knifeTimer / KNIFE.duration : -1,
      ads: f.adsTime > 0 ? Math.min(1, f.adsTime / W.adsTime) : 0, adsCharged: f.adsTime >= W.adsTime,
      shield: f.shieldUp, boosting: f.exoTimer > 0 || f.dashTimer > 0, dashing: f.dashTimer > 0,
      flash: f.flash, invuln: f.invuln > 0 || f.onRevival, landSquash: f.landSquash, muzzle: f.muzzle > 0,
      showTag: !this.demo,
    };
  }

  updateVisuals(dt) {
    this.fighters.forEach((f, i) => {
      const m = this.models[i];
      m.root.visible = f.active;
      if (f.active) {
        m.root.position.set(f.pos.x, f.pos.y, 0);
        m.update(this.fighterView(f), dt);
      }
      const drone = this.stage.drones[i];
      drone.visible = f.active && f.onRevival;
      if (drone.visible) {
        drone.position.set(f.pos.x, f.pos.y + Math.sin(this.realTime * 3) * 0.03, 0);
        drone.userData.ringMat.color.set(f.colors.main);
      }
    });
    for (const b of this.bullets) {
      const L = b.W.tracerLen;
      b.mesh.position.set(b.x - (b.dx * L) / 2, b.y - (b.dy * L) / 2, 0);
      b.mesh.rotation.z = Math.atan2(b.dy, b.dx);
    }
    for (const g of this.grenades) {
      g.mesh.position.set(g.x, g.y, 0);
      g.mesh.rotation.z += g.spin * dt;
      g.led.visible = Math.sin(g.fuse * (g.fuse < 0.6 ? 60 : 25)) > 0;
    }
    this.effects.update(dt);
    if (!this.demo && this.fighters.length) this.ui.updateHUD(this.fighters, this.settings, this.timeLeft);
  }

  updateCamera(dt) {
    const c = this.cam;
    let tx;
    let ty;
    let td;
    if (this.state === 'select') {
      tx = 0;
      ty = 0.9;
      td = this.camera.aspect < 1.2 ? 12 : 8.2;
    } else {
      const pts = this.fighters.filter((f) => f.active).map((f) => ({
        x: clamp(f.pos.x, -19, 19), y: clamp(f.pos.y + f.h * 0.5, -8, 14),
      }));
      if (!pts.length) pts.push({ x: 0, y: 2 });
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      tx = clamp(((minX + maxX) / 2) * 0.85, -10, 10);
      ty = clamp(((minY + maxY) / 2) * 0.7 + 0.9, 0.5, 9);
      const w = maxX - minX + 10;
      const h = maxY - minY + 7;
      const halfH = Math.max(h / 2, w / 2 / this.camera.aspect, 6.5);
      td = clamp(halfH / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), 17, 48);
      if (this.state === 'title') {
        tx = Math.sin(this.realTime * 0.15) * 3;
        ty = 3;
        td = Math.max(td, 30);
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
    const lift = this.state === 'select' ? 0.7 : 2.2;
    this.camera.position.set(c.x + ox, c.y + lift + oy, c.dist);
    this.camera.lookAt(c.x + ox * 0.5, c.y + (this.state === 'select' ? 0.25 : 0.3), 0);
  }
}
