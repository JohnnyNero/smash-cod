// Fighter simulation: a Smash-style state machine driven by data from src/data/.
// No rendering in here. The game reads this state to drive the 3D model, and resolves
// hitboxes/projectiles between fighters. Everything is counted in 60 fps frames.
//
// States: ground, air, jumpsquat, attack, landlag, shield, shieldbreak, dodge, holding, held,
// hitstun, ledge, getup, helpless, sleep, switching.

import { PHYS, COMBAT, SHIELD, DODGE, LEDGE, STAGE, INPUT } from './config.js';
import { THROWS, PUMMEL } from './data/moves.js';
import { buildMoveset } from './data/moveset.js';
import { fighterStats } from './data/pokemon.js';
import { STATUS, CONFUSION_FRAMES, PAR_SPEED, PAR_CHECK, PAR_CHANCE, PAR_STUN, statusImmune, freezeFrames } from './status.js';

const DT = 1 / 60;
const FIGHTER_TAUNT_FRAMES = 75;
const BUFFERED = ['jump', 'attack', 'special', 'shield', 'grab', 'smash'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

export class Fighter {
  constructor(game, slot, species, colors, moves) {
    this.game = game;
    this.slot = slot;
    this.sp = species;
    this.colors = colors;
    this.st = fighterStats(species);
    this.w = species.size.w;
    this.h = species.size.h;
    this.moveset = buildMoveset(species, moves || species.moves);
    this.benched = false; // on the bench in team mode (not on stage)
    this.stocks = 3;
    this.eliminated = false;
    this.streak = 0;
    this.stats = { kos: 0, falls: 0, sds: 0, damageDealt: 0, damageTaken: 0, hits: 0 };
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.revealed = new Set(); // specials the opponent has seen (Showdown-style info)
    this.spawn(STAGE.spawns[slot] ?? 0, 0);
    this.facing = this.pos.x > 0 ? -1 : 1;
  }

  spawn(x, y) {
    Object.assign(this, {
      dead: false, onRevival: false, revivalTimer: 0, respawnTimer: 0,
      state: 'ground', sf: 0, grounded: true, platform: 'main', dropTimer: 0, fastFall: false,
      airJumps: this.st.airJumps, airDodgeReady: true,
      hitstun: 0, tumble: false, percent: 0, invuln: 0, flash: 0,
      lastHitBy: null, lastHitTime: -99, lastHitMove: null,
      move: null, moveF: 0, curF: -1, charge: 0, charging: false, chargeDone: false, chargeMult: 1,
      hitTimes: new Map(), zip: null, moveAir: false, moveLeftGround: false, landLagF: 0,
      shieldHP: SHIELD.hp, shieldStun: 0, dodge: null,
      holding: null, heldBy: null, holdTimer: 0, pummelCd: 0,
      ledge: null, ledgeInvuln: 0, ledgeCooldown: 0, getupKind: null, getupFrom: null,
      shieldPressedAt: -99, prevMag: 0, flickT: 99, flickX: 0, flickY: 0, sx: 0, sy: 0,
      landSquash: 0, t: 0,
      buf: {}, bufFlick: null, bufStick: null, forceShortHop: false, softLand: false,
      dashF: 0, dashDir: 1, skidF: 0,
      boosts: {}, sleepFrames: 0, seed: null, destinyBond: 0,
      status: null, confusion: 0, frozenF: 0,
    });
    this.st = fighterStats(this.sp);
    this.pp = {};
    for (const [slot, m] of Object.entries(this.moveset.specials)) this.pp[slot] = m.pp;
    this.pos.x = x;
    this.pos.y = y;
    this.vel.x = 0;
    this.vel.y = 0;
  }

  respawn() {
    this.spawn(0, STAGE.revivalY);
    this.grounded = false;
    this.platform = null;
    this.state = 'air';
    this.onRevival = true;
    this.facing = this.slot === 0 ? 1 : -1;
  }

  get center() { return { x: this.pos.x, y: this.pos.y + this.h * 0.5 }; }
  get active() { return !this.dead && !this.eliminated && !this.benched; }

  get intangible() {
    if (this.invuln > 0 || this.onRevival) return true;
    if (this.state === 'dodge') {
      const [a, b] = this.dodge.cfg.intangible;
      return this.sf >= a && this.sf <= b;
    }
    if (this.state === 'attack' && this.move && this.move.intangible) {
      const [a, b] = this.move.intangible;
      return this.moveF >= a && this.moveF <= b;
    }
    if (this.state === 'ledge') return this.ledgeInvuln > 0;
    return this.state === 'getup';
  }

  setState(s) {
    this.state = s;
    this.sf = 0;
    this.holdAtk = null;
    if (s !== 'ground') { this.dashF = 0; this.skidF = 0; this.shieldDropF = 0; }
  }

  // Input buffer: an action that uses a press clears it so it can't fire twice.
  consume(...btns) {
    for (const b of btns) this.buf[b] = 0;
    this.inp.pressed = { ...this.inp.pressed };
    for (const b of btns) this.inp.pressed[b] = false;
  }

  toNeutral() {
    this.setState(this.grounded ? 'ground' : 'air');
  }

  update(dt, inp) {
    const g = this.game;
    if (this.eliminated) return;
    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }
    this.t += dt;
    if (this.flipF > 0) this.flipF--;
    if (this.coyoteF > 0 && (this.grounded || --this.coyoteF === 0)) this.coyoteF = 0;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.landSquash = Math.max(0, this.landSquash - dt * 5);
    if (this.invuln > 0) this.invuln--;
    if (this.ledgeCooldown > 0) this.ledgeCooldown--;
    if (this.dropTimer > 0) this.dropTimer--;
    if (this.state !== 'shield') this.shieldHP = Math.min(SHIELD.hp, this.shieldHP + SHIELD.regen);
    if (this.destinyBond > 0) this.destinyBond--;
    if (this.seed) this.tickSeed();
    if (this.status || this.confusion) this.tickStatus();
    this.readInput(inp);

    if (this.onRevival) {
      this.revivalTimer += dt;
      const moved = Math.abs(this.sx) > 0.5 || this.sy < -0.5 || inp.pressed.jump || inp.pressed.attack || inp.pressed.special;
      if (g.canAct && this.revivalTimer > 0.5 && (moved || this.revivalTimer > 4)) {
        this.onRevival = false;
        this.invuln = 90;
        if (inp.pressed.jump) this.vel.y = this.st.doubleJump;
      }
      return;
    }

    const canAct = g.canAct;
    switch (this.state) {
      case 'ground':
        if (canAct) this.groundControl();
        else this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
        break;
      case 'air':
        if (canAct) this.airControl(true);
        break;
      case 'helpless':
        this.airDrift(0.6);
        break;
      case 'jumpsquat':
        // Attack during jumpsquat = short hop + that aerial (the buffered attack comes out
        // on the first airborne frame).
        if (this.inp.pressed.attack || this.inp.pressed.smash) this.forceShortHop = true;
        if (this.sf >= 3) this.doJump();
        break;
      case 'attack':
        this.runMove();
        break;
      case 'landlag':
        if (this.knockdown && this.sf >= 10 && canAct && this.knockdownOptions()) break;
        // A plain landing can be jumped or shielded out of straight away.
        if (this.sf >= this.landLagF || (this.softLand && (this.inp.pressed.jump || this.inp.held.shield))) {
          this.toNeutral();
          if (canAct && this.state === 'ground') this.groundControl(); // buffered action comes out this frame
        }
        break;
      case 'shield':
        this.shieldControl();
        break;
      case 'shieldbreak':
        if (this.sf >= SHIELD.breakFrames) {
          this.shieldHP = SHIELD.hp * 0.5;
          this.toNeutral();
        }
        break;
      case 'dodge':
        this.runDodge();
        break;
      case 'holding':
        this.holdControl();
        break;
      case 'held':
        this.heldControl();
        break;
      case 'hitstun':
        this.hitstunControl();
        break;
      case 'ledge':
        this.ledgeControl();
        break;
      case 'getup':
        this.runGetup();
        break;
      case 'sleep':
        this.runSleep();
        break;
      case 'trumped':
        this.airDrift(0.3);
        if (this.sf >= LEDGE.trumpFrames) this.setState(this.grounded ? 'ground' : 'air');
        break;
      case 'frozen':
        this.runFrozen();
        break;
      case 'paralyzed':
        this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
        if (this.sf >= PAR_STUN) this.toNeutral();
        break;
      case 'taunt':
        this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
        if (this.sf >= FIGHTER_TAUNT_FRAMES || !this.grounded) this.toNeutral();
        break;
      case 'switching':
        // Recall wind-up: you can be hit out of it.
        this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
        if (this.sf >= 14) this.game.performSwitch(this.slot, this.switchTarget, false);
        break;
      default:
        break;
    }
    this.sf++;
    if (!['held', 'ledge', 'getup'].includes(this.state)) this.physics();
    if (this.state === 'holding' || (this.state === 'attack' && this.holding)) this.positionHeld();
    this.checkLedgeGrab();
    this.checkBlast();
  }

  // ------------------------------------------------------------------ input

  readInput(inp) {
    // Confused: left and right are swapped.
    if (this.confusion > 0) inp = { ...inp, moveX: -inp.moveX, smashX: -(inp.smashX || 0) };
    this.inp = inp;
    const x = Math.abs(inp.moveX) > 0.25 ? inp.moveX : 0;
    const y = Math.abs(inp.moveY) > 0.25 ? inp.moveY : 0;
    const mag = Math.max(Math.abs(x), Math.abs(y));
    if (mag > 0.75 && this.prevMag < 0.3) {
      this.flickT = 0;
      this.flickX = x;
      this.flickY = y;
    } else {
      this.flickT++;
    }
    this.prevMag = mag;
    this.sx = x;
    this.sy = y;
    // Tech input: only a press that isn't part of mashing counts (lockout after any press).
    if (inp.pressed.shield) {
      if (this.t - (this.lastShieldPress ?? -99) >= COMBAT.techLockout / 60) this.shieldPressedAt = this.t;
      this.lastShieldPress = this.t;
    }
    // Buffer presses for a few frames so one made during lag (landing, end of a move,
    // jumpsquat) comes out on the first frame you can act instead of being lost.
    this.rawPressed = inp.pressed;
    const pressed = { ...inp.pressed };
    for (const b of BUFFERED) {
      if (inp.pressed[b]) this.buf[b] = INPUT.buffer;
      else if (this.buf[b] > 0) this.buf[b]--;
      pressed[b] = this.buf[b] > 0;
    }
    // Remember whether an attack press was a smash (direction tapped just before it).
    if (inp.pressed.attack) this.bufFlick = this.flickT <= COMBAT.flickFrames ? { x: this.flickX, y: this.flickY } : null;
    if (inp.pressed.smash) this.bufStick = { x: inp.smashX || 0, y: inp.smashY || 0 };
    this.inp = { ...inp, pressed };
  }

  // Tap a direction and attack together (or flick the right stick) for a smash attack.
  smashDir() {
    const inp = this.inp;
    if (inp.pressed.smash) return this.bufStick || { x: inp.smashX || 0, y: inp.smashY || 0 };
    if (inp.pressed.attack && this.bufFlick) return this.bufFlick;
    return null;
  }

  dirSlot(x, y) {
    if (y > 0.5 && y >= Math.abs(x)) return 'up';
    if (y < -0.5 && -y >= Math.abs(x)) return 'down';
    if (Math.abs(x) > 0.4) return 'side';
    return 'neutral';
  }

  // ------------------------------------------------------------------ ground / air

  groundControl() {
    const inp = this.inp;
    const n = this.moveset.normals;
    if (this.holdAtk && this.runHoldAttack()) return;
    if (this.shieldDropF > 0) {
      this.shieldDropF--;
      this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
      if (inp.pressed.jump) { this.consume('jump'); this.shieldDropF = 0; this.setState('jumpsquat'); }
      else if (inp.held.shield) { this.shieldDropF = 0; this.setState('shield'); } // re-shield
      return;
    }
    if (inp.pressed.swap && this.tryStartSwitch()) return;
    if (inp.pressed.taunt) { this.startTaunt(); return; }
    if (inp.pressed.jump) { this.consume('jump'); this.setState('jumpsquat'); return; }
    if (inp.pressed.grab || (inp.held.shield && inp.pressed.attack)) { this.startMove(n.grab); return; }
    if (inp.pressed.special) { this.startSpecial(); return; }
    const sm = this.smashDir();
    if (sm) { this.groundSmash(sm); return; }
    if (inp.pressed.attack) { this.groundAttack(); return; }
    if (inp.held.shield || inp.pressed.shield) { this.consume('shield'); this.setState('shield'); return; }
    if (this.platform !== 'main' && this.flickT === 0 && this.flickY < -0.7) {
      this.dropTimer = 12;
      this.leaveGround();
      this.vel.y = -2;
      return;
    }
    const sx = this.sx;
    const fx = this.game.effects;
    const run = this.st.runSpeed;
    const brake = PHYS.groundFriction + PHYS.groundAccel * 0.5;
    const frame = Math.round(this.t * 60);
    // Initial dash: a hard flick bursts past run speed for a few frames. Flick back during it to
    // dash-dance; reverse right at the end of it to pivot (turn and keep sliding).
    if (this.flickT === 0 && Math.abs(this.flickX) > 0.8 && Math.abs(this.flickX) >= Math.abs(this.flickY)) {
      const dir = Math.sign(this.flickX);
      if (this.dashF > 0 && dir !== this.dashDir && this.dashF <= 3) {
        this.dashF = 0;
        this.skidF = PHYS.skidFrames;
        this.facing = dir;
        this.pivoted = true;
        fx.puff(this.pos.x, this.pos.y, -dir, 3);
      } else if (this.dashF > 0 || this.skidF > 0 || Math.abs(this.vel.x) < run * 0.75) {
        this.dashF = PHYS.dashFrames;
        this.dashDir = dir;
        this.skidF = 0;
        this.facing = dir;
        this.vel.x = dir * run * PHYS.dashSpeed;
        fx.puff(this.pos.x - dir * this.w * 0.3, this.pos.y, -dir, 5);
        this.game.audio.dash(this.pos.x);
      }
    }
    if (this.dashF > 0) {
      this.dashF--;
      this.vel.x = approach(this.vel.x, this.dashDir * run * PHYS.dashSpeed, PHYS.groundAccel * 2 * DT);
      // Let go (or run out of dash without holding on) and you brake. One neutral frame is
      // allowed, since flicking back for a dash-dance or pivot passes through neutral.
      this.dashNeutral = sx ? 0 : (this.dashNeutral || 0) + 1;
      if (this.dashNeutral > 1 || (this.dashF === 0 && Math.sign(sx) !== this.dashDir)) {
        this.dashF = 0;
        this.skidF = PHYS.skidFrames;
      }
      if (this.dashF > 0) return;
    }
    // Running, then letting go or reversing: skid to a stop, turning around at the end.
    if (!this.skidF && Math.abs(this.vel.x) > run * 0.75 && (!sx || Math.sign(sx) !== Math.sign(this.vel.x))) {
      this.skidF = PHYS.skidFrames;
      this.pivoted = false;
    }
    if (this.skidF > 0) {
      this.skidF--;
      this.vel.x = approach(this.vel.x, 0, brake * DT);
      if (Math.abs(this.vel.x) > 2 && frame % 3 === 0) fx.puff(this.pos.x, this.pos.y, Math.sign(this.vel.x), 2);
      if (Math.abs(this.vel.x) < 0.3) this.skidF = 0;
      if (this.skidF > 0) return;
      if (sx) this.facing = Math.sign(sx);
    }
    if (sx) this.facing = Math.sign(sx);
    const speed = Math.abs(sx) > 0.6 ? this.st.runSpeed : this.st.runSpeed * 0.45;
    const rate = sx && Math.sign(sx) === Math.sign(this.vel.x || sx) ? PHYS.groundAccel : PHYS.groundFriction + PHYS.groundAccel * 0.5;
    this.vel.x = approach(this.vel.x, sx * speed, rate * DT);
  }

  // Taunt: up roars, side glares, down cheers (the Pokémon's own Sword/Shield clips). Fully
  // committal, like Smash's.
  startTaunt() {
    const dir = this.inp.tauntDir || (this.sy > 0.5 ? 'up' : this.sy < -0.5 ? 'down' : Math.abs(this.sx) > 0.5 ? 'side' : 'up');
    this.taunt = { up: 'roar', side: 'angry', down: 'happy' }[dir];
    if (Math.abs(this.sx) > 0.5) this.facing = Math.sign(this.sx);
    this.setState('taunt');
    if (this.taunt === 'roar' || Math.random() < 0.5) this.game.audio.cry(this.model.species.model, this.pos.x, { gain: 0.4 });
  }

  groundAttack() {
    const n = this.moveset.normals;
    const { sx, sy } = this;
    if (Math.abs(this.vel.x) > this.st.runSpeed * 0.75 && Math.abs(sx) > 0.6) return this.startMove(n.dash);
    // Direction + attack: a tap is the tilt; keep holding attack and it becomes that
    // direction's smash attack, charging while held (as well as the flick / right stick).
    let tilt = null;
    let smash = null;
    if (sy > 0.5 && sy >= Math.abs(sx)) { tilt = n.utilt; smash = n.usmash; }
    else if (sy < -0.5 && -sy >= Math.abs(sx)) { tilt = n.dtilt; smash = n.dsmash; }
    else if (Math.abs(sx) > 0.4) { this.facing = Math.sign(sx); tilt = n.ftilt; smash = n.fsmash; }
    if (tilt) {
      this.consume('attack');
      if (!this.inp.held.attack) return this.startMove(tilt); // already let go (CPU taps, buffered presses)
      this.holdAtk = { tilt, smash, f: 0 };
      return undefined;
    }
    return this.startMove(n.jab);
  }

  // Waiting to see whether a directional attack press is a tap (tilt) or a hold (smash).
  runHoldAttack() {
    const h = this.holdAtk;
    this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
    if (this.inp.pressed.jump) { this.holdAtk = null; return false; } // jump cancels it
    if (!this.inp.held.attack) { this.holdAtk = null; this.startMove(h.tilt); return true; }
    if (++h.f >= INPUT.holdSmash) { this.holdAtk = null; this.startMove(h.smash); return true; }
    return true;
  }

  groundSmash(d) {
    const n = this.moveset.normals;
    if (d.y > 0.5 && d.y >= Math.abs(d.x)) return this.startMove(n.usmash);
    if (d.y < -0.5 && -d.y >= Math.abs(d.x)) return this.startMove(n.dsmash);
    if (d.x) this.facing = Math.sign(d.x);
    return this.startMove(n.fsmash);
  }

  doJump() {
    const full = this.inp.held.jump && !this.forceShortHop;
    this.forceShortHop = false;
    this.vel.y = full ? this.st.jump : this.st.jump * 0.72; // release early for a short hop
    this.vel.x = this.sx * this.st.airSpeed * 0.9 + this.vel.x * 0.3;
    this.leaveGround();
    this.setState('air');
    this.game.effects.dust(this.pos.x, this.pos.y, 5);
    this.game.audio.jump(this.pos.x, false);
  }

  airControl() {
    const inp = this.inp;
    if (inp.pressed.swap && this.tryStartSwitch()) return;
    if (inp.pressed.jump && this.coyoteF > 0) {
      // Late jump off an edge: counts as the ground jump, keeping the double jump.
      this.consume('jump');
      this.coyoteF = 0;
      this.vel.y = this.inp.held.jump ? this.st.jump : this.st.jump * 0.72;
      this.vel.x = this.sx * this.st.airSpeed * 0.9 + this.vel.x * 0.3;
      this.game.audio.jump(this.pos.x, false);
      return;
    }
    if (inp.pressed.jump && this.airJumps > 0) {
      this.consume('jump');
      this.airJumps--;
      this.flipF = 20; // double-jump flip (visual)
      this.vel.y = this.st.doubleJump;
      this.vel.x = this.sx * this.st.airSpeed;
      this.fastFall = false;
      this.tumble = false;
      this.game.effects.ring(this.pos.x, this.pos.y + 0.1, 0xffffff, 1.2, 0.25);
      this.game.audio.jump(this.pos.x, true);
      return;
    }
    if (inp.pressed.shield && this.airDodgeReady) { this.startDodge('air'); return; }
    if (inp.pressed.special) { this.startSpecial(); return; }
    const sm = this.smashDir();
    if (sm) { this.aerial(sm.x, sm.y); return; }
    if (inp.pressed.attack || inp.pressed.grab) { this.aerial(this.sx, this.sy); return; }
    this.airDrift(1);
  }

  aerial(x, y) {
    const n = this.moveset.normals;
    const rx = x * this.facing;
    let m = n.nair;
    if (Math.abs(y) > Math.abs(x) && Math.abs(y) > 0.5) m = y > 0 ? n.uair : n.dair;
    else if (rx > 0.5) m = n.fair;
    else if (rx < -0.5) m = n.bair;
    this.tumble = false;
    this.startMove(m);
  }

  airDrift(mult) {
    const sx = this.sx;
    const st = this.st;
    if (sx) {
      const target = sx * st.airSpeed * mult;
      if (Math.abs(this.vel.x) < st.airSpeed || Math.sign(this.vel.x) !== Math.sign(sx)) {
        this.vel.x = approach(this.vel.x, target, PHYS.airAccel * DT);
      }
    }
    // Fast fall: flick down at or after the peak. A flick shortly before the peak is
    // remembered and kicks in as soon as you start to fall.
    if (this.flickT === 0 && this.flickY < -0.7) this.ffBuf = PHYS.fastFallBuffer;
    else if (this.ffBuf > 0) this.ffBuf--;
    if (this.ffBuf > 0 && this.vel.y < 1.5 && !this.fastFall) {
      this.ffBuf = 0;
      this.fastFall = true;
      this.game.effects.glint(this.pos.x, this.pos.y + this.h * 0.5); // Smash's fast-fall sparkle
    }
  }

  leaveGround() {
    this.grounded = false;
    this.platform = null;
    if (this.state === 'attack') this.moveLeftGround = true;
    if (['ground', 'shield', 'landlag', 'taunt'].includes(this.state)) this.setState('air');
  }

  // ------------------------------------------------------------------ moves

  startMove(m) {
    if (this.inp) this.consume('attack', 'special', 'grab', 'smash');
    this.move = m;
    this.moveSerial = (this.moveSerial || 0) + 1;
    this.moveF = 0;
    this.curF = -1;
    this.hitTimes = new Map();
    this.charge = 0;
    this.charging = false;
    this.chargeDone = false;
    this.chargeMult = 1;
    this.zip = null;
    this.moveAir = !this.grounded;
    this.moveLeftGround = false;
    this.moveStick = { x: this.sx, y: this.sy }; // direction held when the move started
    this.setState('attack');
    this.game.onMoveStart(this, m);
  }

  startSpecial() {
    const slot = this.dirSlot(this.sx, this.sy);
    if (slot === 'side' && this.sx) this.facing = Math.sign(this.sx);
    let m = this.moveset.specials[slot];
    if (this.pp[slot] <= 0) {
      m = slot === 'up' ? this.moveset.struggle.up : this.moveset.struggle.other;
    } else {
      this.pp[slot]--;
      this.revealed.add(slot);
    }
    if (!this.grounded && m.air) m = { ...m, ...m.air, air: undefined };
    this.startMove(m);
  }

  runMove() {
    const m = this.move;
    const inp = this.inp;
    const f = this.moveF;
    this.curF = f;

    if (m.chargeF !== undefined && f === m.chargeF && !this.chargeDone) {
      if ((inp.held.attack || inp.held.smash) && this.charge < COMBAT.smashChargeFrames) {
        this.charge++;
        this.charging = true;
        this.chargeMult = 1 + (this.charge / COMBAT.smashChargeFrames) * COMBAT.smashChargeBonus;
        this.curF = -1;
        this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
        return;
      }
      this.chargeDone = true;
      this.charging = false;
    }

    if (m.events) for (const ev of m.events) if (ev.f === f) this.doEvent(ev);
    if (this.zip) {
      this.zip.frames--;
      this.vel.x = this.zip.vx;
      this.vel.y = this.zip.vy;
      if (this.zip.frames <= 0) {
        this.vel.x *= 0.3;
        this.vel.y *= 0.3;
        this.zip = null;
      }
    }
    this.moveF++;

    if (m.recycle && f >= m.recycle && inp.pressed.attack) { this.startMove(m); return; }
    if (this.moveF >= m.total) { this.endMove(); return; }

    if (this.grounded) {
      if (!this.zip) this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT * 0.8);
    } else if (!this.zip) {
      this.airDrift(m.aerial ? 1 : 0.5);
    }
  }

  doEvent(ev) {
    const g = this.game;
    switch (ev.do) {
      case 'vel': {
        const e = !this.grounded && ev.air ? ev.air : ev;
        if (e.x !== undefined) this.vel.x = e.x * this.facing;
        if (e.y !== undefined && (e.y !== 0 || !this.grounded)) {
          this.vel.y = e.y;
          if (e.y > 0) this.leaveGround();
        }
        break;
      }
      case 'rise':
        this.vel.y = Math.max(this.vel.y, 16);
        this.vel.x = this.sx * Math.max(5, this.st.airSpeed);
        this.fastFall = false;
        this.leaveGround();
        g.effects.ring(this.pos.x, this.pos.y, this.colors.accent, 1.6, 0.3);
        break;
      case 'zip': {
        // Aim with the stick now, else the direction held when the move started, else straight up.
        let dx = this.sx;
        let dy = this.sy;
        if (Math.hypot(dx, dy) < 0.3) ({ x: dx, y: dy } = this.moveStick);
        if (Math.hypot(dx, dy) < 0.3) { dx = 0; dy = 1; }
        if (this.grounded && dy < 0) dy = 0;
        const m = Math.hypot(dx, dy) || 1;
        dx /= m;
        dy /= m;
        if (Math.abs(dx) > 0.1) this.facing = Math.sign(dx);
        this.zip = { vx: dx * ev.speed, vy: dy * ev.speed, frames: ev.frames };
        this.fastFall = false;
        if (dy > 0.1) this.leaveGround();
        g.effects.boost(this.pos.x, this.pos.y + this.h * 0.5, -dx, -dy, 0xffffff, true);
        g.audio.dash(this.pos.x);
        break;
      }
      case 'dash': {
        // Charge straight ahead (Flare Blitz, Volt Switch); can carry you off the stage.
        const vy = !this.grounded && ev.air ? ev.air.y : 0;
        this.zip = { vx: this.facing * ev.speed, vy, frames: ev.frames };
        this.fastFall = false;
        g.effects.boost(this.pos.x, this.pos.y + this.h * 0.5, -this.facing, 0, this.colors.accent, true);
        g.audio.dash(this.pos.x);
        break;
      }
      case 'projectile':
        g.spawnProjectile(this, ev.proj, this.move);
        break;
      case 'boost':
        this.applyBoosts(ev.boosts);
        break;
      case 'destinybond':
        this.destinyBond = ev.frames;
        g.popup(this.slot, 'DESTINY BOND', 'move', '#b07aff');
        break;
      case 'fx':
        g.moveFx(this, ev.fx);
        break;
      case 'release':
        if (this.holding) g.throwHit(this, this.holding, this.move.throwDef);
        break;
      default:
        break;
    }
  }

  endMove() {
    const m = this.move;
    this.move = null;
    this.charging = false;
    this.zip = null;
    if (m && m.recoil) this.percent = Math.min(999, this.percent + m.recoil);
    if (this.pivotPending) {
      // Volt Switch / U-turn: land the hit, then switch out for free.
      this.pivotPending = false;
      if (this.game.pivot(this)) return;
    }
    if (this.holding) this.releaseGrab(false);
    if (this.grounded) this.setState('ground');
    else this.setState(m && m.helpless ? 'helpless' : 'air');
  }

  // Clank: our attack met theirs and bounced off. The move ends in a short recoil.
  rebound(frames) {
    if (this.holding) this.releaseGrab(false);
    this.charging = false;
    this.vel.x = -this.facing * 3;
    this.landLag(frames);
  }

  landLag(frames) {
    this.softLand = false;
    this.knockdown = false;
    this.move = null;
    this.zip = null;
    this.landLagF = frames;
    this.setState('landlag');
  }

  // ------------------------------------------------------------------ defence

  shieldControl() {
    const inp = this.inp;
    this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
    if (this.shieldStun > 0) { this.shieldStun--; return; }
    if (inp.pressed.jump) { this.consume('jump'); this.setState('jumpsquat'); return; }
    if (inp.pressed.attack || inp.pressed.grab) { this.startMove(this.moveset.normals.grab); return; }
    if (this.flickT === 0 && Math.abs(this.flickX) > 0.7 && Math.abs(this.flickX) >= Math.abs(this.flickY)) {
      this.startDodge('roll', Math.sign(this.flickX));
      return;
    }
    if (this.flickT === 0 && this.flickY < -0.7) { this.startDodge('spot'); return; }
    // Out of shield: up-special and up-smash come straight out (like jump and grab).
    if (inp.pressed.special && this.sy > 0.5) { this.startSpecial(); return; }
    const sm = this.smashDir();
    if (sm && sm.y > 0.5) { this.startMove(this.moveset.normals.usmash); return; }
    if (!inp.held.shield) {
      this.setState('ground');
      this.shieldDropF = SHIELD.dropFrames; // dropping shield isn't free
      return;
    }
    this.shieldHP -= SHIELD.drain;
    if (this.shieldHP <= 0) this.breakShield();
  }

  breakShield() {
    this.shieldHP = 0;
    this.shieldStun = 0;
    this.setState('shieldbreak');
    this.vel.y = 9;
    this.grounded = false;
    this.platform = null;
    this.game.effects.sparks(this.pos.x, this.pos.y + this.h * 0.5, 0, 1, this.colors.accent, 30, 10);
    this.game.audio.shieldBreak(this.pos.x);
    this.game.popup(this.slot, 'SHIELD BREAK', 'bad');
  }

  startDodge(kind, dir = 0) {
    if (this.inp) this.consume('shield');
    const cfg = DODGE[kind];
    this.dodge = { kind, cfg, dir };
    if (kind === 'air') {
      let dx = this.sx;
      let dy = this.sy;
      const m = Math.hypot(dx, dy);
      if (m > 0.3) { dx /= m; dy /= m; } else { dx = 0; dy = 0; }
      this.dodge.vx = dx * cfg.speed;
      this.dodge.vy = dy * cfg.speed;
      this.airDodgeReady = false;
      this.fastFall = false;
    }
    this.setState('dodge');
    this.game.audio.dodge(this.pos.x);
  }

  runDodge() {
    const d = this.dodge;
    const cfg = d.cfg;
    if (d.kind === 'roll') {
      this.vel.x = this.sf >= 4 && this.sf < 22 ? (d.dir * cfg.dist) / (18 / 60) : approach(this.vel.x, 0, PHYS.groundFriction * DT);
    } else if (d.kind === 'spot') {
      this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
    } else if (this.sf < cfg.moveFrames) {
      this.vel.x = d.vx;
      this.vel.y = d.vy;
    } else if (this.sf === cfg.moveFrames) {
      this.vel.x *= 0.3;
      this.vel.y *= 0.3;
    }
    if (this.sf >= cfg.total) {
      this.dodge = null;
      this.toNeutral();
    }
  }

  // ------------------------------------------------------------------ grabs

  startHolding(v) {
    this.move = null;
    this.holding = v;
    this.holdTimer = 70 + v.percent * 0.6;
    this.pummelCd = 0;
    this.setState('holding');
    this.vel.x = 0;
    v.heldBy = this;
    v.move = null;
    v.zip = null;
    v.dodge = null;
    v.facing = -this.facing;
    v.setState('held');
    v.vel.x = v.vel.y = 0;
    this.game.onGrab(this, v);
  }

  holdControl() {
    const v = this.holding;
    const inp = this.inp;
    if (!v || v.state !== 'held' || !v.active) { this.holding = null; this.toNeutral(); return; }
    this.holdTimer--;
    this.pummelCd--;
    this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
    if (this.holdTimer <= 0) { this.releaseGrab(true); return; }
    if (this.sf < 6) return;
    let dx = this.sx;
    let dy = this.sy;
    if (inp.pressed.smash) { dx = inp.smashX; dy = inp.smashY; }
    if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) {
      const dir = Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 'up' : 'down') : dx * this.facing > 0 ? 'forward' : 'back';
      this.startThrow(dir);
      return;
    }
    if (inp.pressed.attack && this.pummelCd <= 0) {
      this.consume('attack');
      this.pummelCd = PUMMEL.every;
      this.game.pummel(this, v);
    }
  }

  startThrow(dir) {
    const T = THROWS[dir];
    const v = this.holding;
    this.startMove({ id: 'throw', name: `${dir} throw`, anim: T.anim, total: T.total, throwDef: { ...T, dir }, events: [{ f: T.release, do: 'release' }] });
    this.holding = v;
  }

  // Keep the held fighter in the grabber's hands, swinging them around during throws.
  positionHeld() {
    const v = this.holding;
    if (!v) return;
    const reach = this.w / 2 + v.w / 2 - 0.05;
    let fx = this.facing * reach;
    let y = this.pos.y + 0.1;
    if (this.state === 'attack' && this.move && this.move.throwDef) {
      const T = this.move.throwDef;
      const p = Math.min(1, this.moveF / T.release);
      if (T.dir === 'back') fx = this.facing * reach * Math.cos(p * Math.PI);
      else if (T.dir === 'up') { fx *= 1 - p; y += p * this.h; }
      else if (T.dir === 'down') y -= p * 0.2;
    }
    v.pos.x = this.pos.x + fx;
    v.pos.y = y;
    v.vel.x = v.vel.y = 0;
  }

  heldControl() {
    const inp = this.inp;
    const by = this.heldBy;
    if (!by || (by.state !== 'holding' && !(by.state === 'attack' && by.holding === this))) {
      this.heldBy = null;
      this.toNeutral();
      return;
    }
    // Mash to escape.
    const raw = this.rawPressed; // mashing counts real presses, not buffered ones
    const mashed = raw.attack || raw.special || raw.jump || raw.shield || this.flickT === 0;
    if (mashed && by.state === 'holding') by.holdTimer -= 5;
  }

  releaseGrab(push) {
    const v = this.holding;
    this.holding = null;
    if (v && v.state === 'held') {
      v.heldBy = null;
      if (push) {
        v.vel.x = this.facing * 7;
        v.vel.y = 6;
        v.grounded = false;
        v.platform = null;
        v.setState('air');
        this.vel.x = -this.facing * 5;
      } else {
        v.toNeutral();
      }
    }
    if (this.state === 'holding') this.toNeutral();
  }

  // ------------------------------------------------------------------ hitstun & ledges

  hitstunControl() {
    if (this.diPending) {
      // DI: the stick held as hitlag ends bends the launch angle (most when perpendicular to it);
      // ASDI nudges your position a little in the stick direction.
      this.diPending = false;
      const mag = Math.min(1, Math.hypot(this.sx, this.sy));
      const speed = Math.hypot(this.vel.x, this.vel.y);
      if (mag > 0.3 && speed > 1) {
        const th = Math.atan2(this.vel.y, this.vel.x);
        const st = Math.atan2(this.sy, this.sx);
        const nt = th + (COMBAT.diMaxDeg * Math.PI / 180) * Math.sin(st - th) * mag;
        this.vel.x = Math.cos(nt) * speed;
        this.vel.y = Math.sin(nt) * speed;
        this.pos.x += (this.sx / mag) * COMBAT.asdi * mag;
        this.pos.y += (this.sy / mag) * COMBAT.asdi * mag * (this.grounded ? 0 : 1);
      }
    }
    // Hitstun cancel (Ultimate-style): once a big launch has slowed down you can act early:
    // air dodge after a while, jump or attack a little later. Combos still hold (only long
    // launches reach the windows) but big hits stop feeling like cutscenes.
    if (!this.grounded && this.hitstun > DT && this.game.canAct && this.launchedHard) {
      const speed = Math.hypot(this.vel.x, this.vel.y);
      const inp = this.inp;
      const nearGround = this.vel.y < 0 && this.pos.y > STAGE.main.top - 0.5 && this.pos.y < STAGE.main.top + 1.6
        && Math.abs(this.pos.x) < STAGE.main.right + 0.5; // leave presses there for teching
      const canDodge = this.sf >= COMBAT.hsCancelDodgeF && speed < COMBAT.hsCancelDodgeSpeed;
      const canAct = this.sf >= COMBAT.hsCancelActF && speed < COMBAT.hsCancelActSpeed;
      if (canDodge && !this.hsCancelShown) {
        this.hsCancelShown = true;
        this.game.effects.glint(this.pos.x, this.pos.y + this.h * 0.6, 0xbfe8ff); // "you can act"
      }
      if (canDodge && !nearGround && inp.pressed.shield && this.airDodgeReady) {
        this.tumble = false;
        this.startDodge('air');
        return;
      }
      if (canAct && (inp.pressed.jump || inp.pressed.attack || inp.pressed.special || inp.pressed.smash)) {
        this.tumble = false;
        this.setState('air');
        this.airControl();
        return;
      }
    }
    this.hitstun -= DT;
    if (this.hitstun <= 0) this.toNeutral();
  }

  checkLedgeGrab() {
    const okState = this.state === 'air' || this.state === 'helpless' || (this.state === 'attack' && this.move && this.move.helpless);
    if (!okState || this.vel.y > 0 || this.ledgeCooldown > 0 || this.onRevival || this.sy < -0.6) return;
    const S = STAGE.main;
    for (const side of [-1, 1]) {
      const edgeX = side < 0 ? S.left : S.right;
      const out = (this.pos.x - edgeX) * side; // > 0 when outside the stage on this side
      if (out < -0.4 || out > this.w / 2 + LEDGE.reachX) continue;
      const hands = this.pos.y + this.h * 0.85;
      if (hands < S.top - LEDGE.reachDown || hands > S.top + LEDGE.reachUp) continue;
      // Someone already hanging there gets popped off (a ledge trump), like Ultimate.
      const occ = this.game.ledgeOccupied(side, this);
      if (occ) occ.ledgeTrumped();
      this.grabLedge(side);
      return;
    }
  }

  grabLedge(side) {
    const S = STAGE.main;
    const edgeX = side < 0 ? S.left : S.right;
    this.move = null;
    this.zip = null;
    this.ledge = side;
    this.setState('ledge');
    this.vel.x = this.vel.y = 0;
    this.pos.x = edgeX + side * (this.w / 2);
    this.pos.y = S.top - this.h * 0.85;
    this.facing = -side;
    this.airJumps = this.st.airJumps;
    this.airDodgeReady = true;
    this.fastFall = false;
    this.tumble = false;
    const R = LEDGE.regrabInvuln;
    this.ledgeInvuln = R[Math.min(R.length - 1, this.ledgeGrabs || 0)];
    this.ledgeGrabs = (this.ledgeGrabs || 0) + 1;
    this.game.audio.ledge(this.pos.x);
  }

  ledgeTrumped() {
    const side = this.ledge;
    this.ledge = null;
    this.pos.x += side * 0.3;
    this.vel.x = side * 3.5;
    this.vel.y = 5;
    this.ledgeCooldown = LEDGE.trumpFrames + 10;
    this.setState('trumped');
    this.game.effects.sparks(this.pos.x, this.pos.y + this.h * 0.8, side, 0.6, 0xffffff, 6, 6);
  }

  ledgeControl() {
    this.ledgeInvuln--;
    if (this.sf < LEDGE.actionableAfter) return;
    const inp = this.inp;
    const toward = -this.ledge;
    if (this.sf > LEDGE.maxHangFrames) { this.dropLedge(); return; }
    if (inp.pressed.jump) {
      this.consume('jump');
      const S = STAGE.main;
      this.ledge = null;
      this.pos.y = S.top + 0.05;
      this.pos.x += toward * 0.2;
      this.vel.y = this.st.jump * 1.05;
      this.vel.x = toward * 2;
      this.setState('air');
      this.ledgeCooldown = LEDGE.regrabCooldown;
      this.game.audio.jump(this.pos.x, false);
      return;
    }
    if (inp.pressed.attack || inp.pressed.special) { this.consume('attack', 'special'); this.startGetup('attack'); return; }
    if (inp.pressed.shield) { this.consume('shield'); this.startGetup('roll'); return; }
    if (this.sy > 0.6 || this.sx * toward > 0.6) { this.startGetup('climb'); return; }
    if (this.sy < -0.6 || this.sx * toward < -0.6) this.dropLedge();
  }

  dropLedge() {
    this.pos.x += this.ledge * 0.15;
    this.ledge = null;
    this.ledgeCooldown = LEDGE.regrabCooldown;
    this.setState('air');
  }

  startGetup(kind) {
    const S = STAGE.main;
    const side = this.ledge;
    const toward = -side;
    const edgeX = side < 0 ? S.left : S.right;
    this.ledge = null;
    if (kind === 'attack') {
      this.pos.x = edgeX + toward * (this.w / 2 + 0.05);
      this.pos.y = S.top;
      this.grounded = true;
      this.platform = 'main';
      this.facing = toward;
      this.startMove(this.moveset.normals.ledgeAttack);
      return;
    }
    const dist = kind === 'roll' ? 2.4 : this.w / 2 + 0.1;
    this.getupKind = kind;
    this.getupFrom = { x: this.pos.x, y: this.pos.y };
    this.getupTo = { x: edgeX + toward * dist, y: S.top };
    this.getupTotal = kind === 'roll' ? 30 : 22;
    this.setState('getup');
  }

  runGetup() {
    const p = Math.min(1, this.sf / this.getupTotal);
    const a = this.getupFrom;
    const b = this.getupTo;
    const rise = Math.min(1, p * 2);
    this.pos.y = a.y + (b.y - a.y) * rise;
    this.pos.x = a.x + (b.x - a.x) * (this.getupKind === 'roll' ? p : Math.max(0, p * 2 - 1));
    if (this.sf >= this.getupTotal) {
      this.pos.x = b.x;
      this.pos.y = b.y;
      this.grounded = true;
      this.platform = 'main';
      this.vel.x = this.vel.y = 0;
      this.setState('ground');
    }
  }

  // ------------------------------------------------------------------ physics

  physics() {
    const st = this.st;
    const S = STAGE.main;
    const airDodging = this.state === 'dodge' && this.dodge.kind === 'air' && this.sf < this.dodge.cfg.moveFrames;
    const noGrav = !!this.zip || airDodging;

    if (!this.grounded && !noGrav) {
      const launched = this.state === 'hitstun';
      this.vel.y -= PHYS.gravity * st.gravity * (launched ? PHYS.hitstunGravity : 1) * DT;
      const maxFall = st.maxFall * (this.fastFall ? PHYS.fastFallMult : 1);
      if (this.fastFall && this.vel.y < 0) this.vel.y = Math.min(this.vel.y, -maxFall);
      else if (this.vel.y < -maxFall) this.vel.y = approach(this.vel.y, -maxFall, 60 * DT);
      if (Math.abs(this.vel.x) > st.airSpeed) {
        this.vel.x = approach(this.vel.x, Math.sign(this.vel.x) * st.airSpeed, PHYS.kbDecay * DT);
      } else if (!this.sx || launched) {
        this.vel.x = approach(this.vel.x, 0, PHYS.airFriction * DT);
      }
    } else if (this.grounded && !['ground', 'attack', 'dodge', 'shield', 'holding'].includes(this.state)) {
      this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * DT);
    }

    const prevX = this.pos.x;
    const prevY = this.pos.y;
    let nx = prevX + this.vel.x * DT;
    let ny = prevY + this.vel.y * DT;
    const hw = this.w / 2;

    if (this.grounded) {
      const sup = this.supportRange();
      // Rolls, shields and grounded attacks stop at the edge instead of sliding off it
      // (zips like Quick Attack can still leave the ground).
      const stopsAtEdge = ['dodge', 'shield', 'shieldbreak', 'holding', 'landlag', 'taunt'].includes(this.state) || (this.state === 'attack' && !this.zip);
      if (sup && stopsAtEdge) nx = clamp(nx, sup[0], sup[1]);
      if (!sup || nx < sup[0] || nx > sup[1] || this.vel.y > 0) {
        // Walked or ran off an edge: a few frames of "coyote time" to still jump from the ground.
        if (this.state === 'ground' && this.vel.y <= 0) this.coyoteF = PHYS.coyoteFrames;
        this.leaveGround();
      } else {
        ny = sup[2];
        this.vel.y = 0;
      }
    }

    if (!this.grounded) {
      if (this.vel.y <= 0) {
        if (prevY >= S.top - 0.001 && ny <= S.top && nx + hw * 0.6 > S.left && nx - hw * 0.6 < S.right) {
          ny = this.land('main', S.top);
        } else if (this.dropTimer <= 0 && !(this.sy < -0.6 && this.state === 'air')) {
          STAGE.platforms.forEach((p, i) => {
            if (!this.grounded && prevY >= p.y - 0.001 && ny <= p.y && Math.abs(nx - p.x) <= p.w / 2 + hw * 0.3) {
              ny = this.land(i, p.y);
            }
          });
        }
      } else if (prevY + this.h <= S.bottom + 0.001 && ny + this.h > S.bottom && nx + hw > S.left && nx - hw < S.right) {
        ny = S.bottom - this.h;
        this.vel.y = this.state === 'hitstun' ? -this.vel.y * 0.4 : 0;
      }
    }

    // Side walls of the main stage (bounce off them when launched).
    if (ny < S.top - 0.001 && ny + this.h > S.bottom && nx + hw > S.left && nx - hw < S.right) {
      const fromLeft = prevX + hw <= S.left + 0.05;
      const fromRight = prevX - hw >= S.right - 0.05;
      if (fromLeft || fromRight) {
        nx = fromLeft ? S.left - hw : S.right + hw;
        if (this.state === 'hitstun' && Math.abs(this.vel.x) > 8) {
          this.vel.x = -this.vel.x * 0.5;
          this.game.effects.dust(nx, ny + this.h / 2, 8);
        } else {
          this.vel.x = 0;
        }
      }
    }

    this.pos.x = nx;
    this.pos.y = ny;
  }

  // [minX, maxX, top] of whatever the fighter is standing on.
  supportRange() {
    const hw = this.w / 2;
    if (this.platform === 'main') {
      const S = STAGE.main;
      return [S.left - hw * 0.6, S.right + hw * 0.6, S.top];
    }
    const p = STAGE.platforms[this.platform];
    if (!p) return null;
    return [p.x - p.w / 2 - hw * 0.3, p.x + p.w / 2 + hw * 0.3, p.y];
  }

  land(platform, top) {
    const g = this.game;
    const impact = -this.vel.y;
    const launched = this.state === 'hitstun' || (this.state === 'air' && this.tumble);
    if (launched && impact > 8) {
      if (this.t - this.shieldPressedAt < COMBAT.techWindow / 60) {
        this.hitstun = 0;
        this.tumble = false;
        this.invuln = 20;
        this.touchDown(platform, impact);
        this.landLag(4);
        g.effects.ring(this.pos.x, top + 0.1, 0x9ff7ff, 2, 0.3);
        g.popup(this.slot, 'TECH!');
        return top;
      }
      if (this.state === 'hitstun' && impact > 12) {
        this.vel.y = impact * 0.45;
        this.hitstun *= 0.8;
        g.effects.dust(this.pos.x, top, 10);
        g.audio.land(this.pos.x, true);
        return top;
      }
      this.touchDown(platform, impact);
      this.hitstun = 0;
      this.landLag(24); // knocked down: roll, get up or getup-attack out of it
      this.knockdown = true;
      return top;
    }
    const st = this.state;
    const m = this.move;
    this.touchDown(platform, impact);
    if (st === 'attack' && m && (this.moveAir || this.moveLeftGround)) {
      // Auto-cancel: landing before an aerial's hitboxes come out, or after they finish,
      // only costs a short landing, so short-hop aerials flow.
      let lag = m.landLag ?? 8;
      if (m.aerial && m.hitboxes && m.hitboxes.length) {
        const first = Math.min(...m.hitboxes.map((h) => h.f[0]));
        const last = Math.max(...m.hitboxes.map((h) => h.f[1]));
        if (this.moveF < first || this.moveF > last + 4) lag = Math.min(lag, PHYS.autoCancelLag);
      }
      this.landLag(lag);
    }
    else if (st === 'helpless') this.landLag(20);
    else if (st === 'dodge' && this.dodge && this.dodge.kind === 'air') { this.dodge = null; this.landLag(DODGE.air.landLag); }
    else if (st === 'air') {
      if (impact > 6) {
        this.landLag(PHYS.emptyLanding);
        this.softLand = true;
      } else this.setState('ground');
    }
    else if (st === 'hitstun') this.hitstun = Math.min(this.hitstun, 0.1);
    return top;
  }

  touchDown(platform, impact) {
    this.grounded = true;
    this.ledgeGrabs = 0;
    this.platform = platform;
    this.vel.y = 0;
    this.airJumps = this.st.airJumps;
    this.airDodgeReady = true;
    this.fastFall = false;
    this.tumble = false;
    this.landSquash = clamp(impact / 22, 0.15, 1);
    if (impact > 12) this.game.effects.dust(this.pos.x, this.pos.y, 6);
    else if (impact > 5) {
      this.game.effects.puff(this.pos.x - 0.15, this.pos.y, -1, 2);
      this.game.effects.puff(this.pos.x + 0.15, this.pos.y, 1, 2);
    }
    this.game.audio.land(this.pos.x, impact > 20);
  }

  checkBlast() {
    const B = STAGE.blast;
    const { x, y } = this.pos;
    if (x < B.left || x > B.right || y < B.bottom || y > B.top) this.game.onKO(this);
  }

  // ------------------------------------------------------------------ switching (team mode)

  // SWAP + ◀ / ▲ / ▶ picks team member 1 / 2 / 3; SWAP alone picks the next one on the bench.
  swapIndex() {
    if (this.sx < -0.5) return 0;
    if (this.sy > 0.5) return 1;
    if (this.sx > 0.5) return 2;
    return -1;
  }

  tryStartSwitch() {
    const target = this.game.switchTargetFor(this.slot, this.swapIndex());
    if (target < 0) return false;
    this.switchTarget = target;
    this.setState('switching');
    this.game.audio.dodge(this.pos.x);
    return true;
  }

  // Leaving the field: Showdown clears stat stages, Leech Seed and Destiny Bond on switch-out.
  onSwitchOut() {
    if (this.holding) this.releaseGrab(false);
    Object.assign(this, {
      move: null, zip: null, dodge: null, ledge: null, heldBy: null, charging: false,
      hitstun: 0, tumble: false, seed: null, destinyBond: 0, pivotPending: false, sleepFrames: 0,
      boosts: {}, shieldStun: 0, flash: 0, invuln: 0, confusion: 0,
    });
    // Showdown: a major status stays through switching (its timer pauses on the bench);
    // confusion is cured, and switching out thaws a frozen Pokémon.
    if (this.status && this.status.id === 'frz') this.status = null;
    this.refreshStats();
    this.state = 'ground';
    this.benched = true;
  }

  // Coming in where the previous Pokémon was standing.
  onSwitchIn(from) {
    this.benched = false;
    this.pos.x = from.pos.x;
    this.pos.y = from.pos.y;
    this.vel.x = from.vel.x * 0.3;
    this.vel.y = Math.max(0, from.vel.y);
    this.facing = from.facing;
    this.grounded = from.grounded;
    this.platform = from.platform;
    this.airJumps = from.grounded ? this.st.airJumps : Math.min(from.airJumps, this.st.airJumps);
    this.airDodgeReady = true;
    this.fastFall = false;
    this.setState(this.grounded ? 'ground' : 'air');
  }

  // ------------------------------------------------------------------ stats & status

  // Showdown stat stages (-6..+6). They last until this Pokémon is KO'd (or switched, phase 3).
  applyBoosts(boosts) {
    const parts = [];
    for (const [k, v] of Object.entries(boosts)) {
      this.boosts[k] = clamp((this.boosts[k] || 0) + v, -6, 6);
      parts.push(`${v > 0 ? '+' : ''}${v} ${k.toUpperCase()}`);
    }
    this.refreshStats();
    this.game.onBoost(this, parts.join(' '));
  }

  // Stats from species + stat stages, slowed while paralyzed.
  refreshStats() {
    this.st = fighterStats(this.sp, this.boosts);
    if (this.status && this.status.id === 'par') {
      this.st.runSpeed *= PAR_SPEED;
      this.st.airSpeed *= PAR_SPEED;
    }
  }

  // Inflict a Showdown status: 'brn' | 'par' | 'psn' | 'tox' | 'frz' | 'confusion'.
  // One major status at a time, with Showdown's type immunities. Returns true if it took hold.
  inflict(id, by = null) {
    if (this.dead || this.onRevival || this.eliminated) return false;
    if (id === 'confusion') {
      if (this.confusion > 0) return false;
      this.confusion = CONFUSION_FRAMES;
      this.game.onStatus(this, id);
      return true;
    }
    const def = STATUS[id];
    if (!def || this.status || this.state === 'sleep' || statusImmune(id, this.sp.types)) return false;
    if (id === 'frz') {
      if (['held', 'ledge'].includes(this.state)) return false;
      this.interrupt();
      this.status = { id, by };
      this.frozenF = freezeFrames(this.percent);
      this.setState('frozen');
    } else {
      this.status = { id, by, frames: def.frames, t: 0, n: 0 };
      if (id === 'par') this.refreshStats();
    }
    this.game.onStatus(this, id);
    return true;
  }

  // Cancel whatever we were doing (moves, grabs, dodges), e.g. when frozen or fully paralyzed.
  interrupt() {
    if (this.holding) this.releaseGrab(false);
    this.move = null;
    this.zip = null;
    this.dodge = null;
    this.charging = false;
  }

  cureStatus(msg) {
    const id = this.status && this.status.id;
    this.status = null;
    if (id === 'par') this.refreshStats();
    if (msg) this.game.popup(this.slot, msg);
  }

  tickStatus() {
    if (this.confusion > 0 && --this.confusion === 0) this.game.popup(this.slot, 'SNAPPED OUT OF CONFUSION');
    const s = this.status;
    if (!s || s.id === 'frz') return;
    const def = STATUS[s.id];
    s.t++;
    if (def.tick && s.t % def.tick === 0) {
      s.n++;
      const dmg = s.id === 'tox' ? def.dmg * s.n : def.dmg;
      this.percent = Math.min(999, this.percent + dmg);
      this.stats.damageTaken += dmg;
      if (s.by && s.by !== this) s.by.stats.damageDealt += dmg;
      this.game.onStatusTick(this, s.id, dmg);
    }
    if (s.id === 'par' && s.t % PAR_CHECK === 0 && Math.random() < PAR_CHANCE
      && ['ground', 'air', 'attack', 'shield', 'jumpsquat', 'landlag'].includes(this.state)) {
      // Fully paralyzed: can't move for a moment.
      this.interrupt();
      this.setState('paralyzed');
      this.game.onFullPara(this);
    }
    if (--s.frames <= 0) this.cureStatus(`${def.name} WORE OFF`);
  }

  runFrozen() {
    this.vel.x *= 0.92;
    this.frozenF--;
    const raw = this.rawPressed || {};
    if (raw.attack || raw.special || raw.jump || raw.shield || this.flickT === 0) this.frozenF -= 4; // mash out
    if (this.frozenF <= 0) this.thaw();
  }

  thaw() {
    this.cureStatus();
    this.game.onThaw(this);
    if (this.state === 'frozen') this.toNeutral();
  }

  // Multi-hit bookkeeping: a hitbox can hit a target once per `group`, or every `rehit` frames.
  canHit(target, hb) {
    const key = `${target.slot}:${hb.group || 0}`;
    const last = this.hitTimes.get(key);
    return last === undefined || (hb.rehit && this.curF - last >= hb.rehit);
  }

  markHit(target, hb) {
    this.hitTimes.set(`${target.slot}:${hb.group || 0}`, this.curF);
  }

  // effect: 'sleep' | 'seed'. Returns true if it took hold.
  applyStatus(effect, by) {
    if (this.dead || this.intangible) return false;
    if (effect === 'sleep') {
      if (this.status || this.state === 'sleep' || this.state === 'held' || this.state === 'ledge') return false;
      if (this.holding) this.releaseGrab(false);
      this.move = null;
      this.zip = null;
      this.dodge = null;
      this.sleepFrames = Math.min(200, 70 + this.percent * 0.6);
      this.setState('sleep');
      return true;
    }
    if (effect === 'seed') {
      this.seed = { frames: 360, by, tick: 0 };
      return true;
    }
    return false;
  }

  runSleep() {
    this.vel.x *= 0.9;
    this.sleepFrames--;
    const inp = this.inp;
    const raw = this.rawPressed;
    if (raw.attack || raw.special || raw.jump || raw.shield || this.flickT === 0) this.sleepFrames -= 6;
    if (this.sleepFrames <= 0) {
      this.toNeutral();
      this.game.popup(this.slot, 'WOKE UP');
    }
  }

  // Leech Seed: every half second, drain a little % from this fighter into the seeder.
  tickSeed() {
    const s = this.seed;
    s.frames--;
    if (s.frames <= 0 || !s.by.active) { this.seed = null; return; }
    if (++s.tick % 30 === 0) {
      this.percent = Math.min(999, this.percent + 1.2);
      this.stats.damageTaken += 1.2;
      s.by.percent = Math.max(0, s.by.percent - 1.2);
      s.by.stats.damageDealt += 1.2;
      this.game.onSeedTick(this, s.by);
    }
  }

  // ------------------------------------------------------------------ getting hit

  // hit: { damage, kb, grow, ang, dirSign, attacker, source, throw }
  // Returns { result: 'hit' | 'blocked' | 'miss', launch }.
  // Missed tech: from the ground, roll either way, get up attacking, or just stand up.
  knockdownOptions() {
    const inp = this.inp;
    if (this.flickT === 0 && Math.abs(this.flickX) > 0.7) {
      this.knockdown = false;
      this.startDodge('roll', Math.sign(this.flickX));
      return true;
    }
    if (inp.pressed.attack || inp.pressed.special) {
      this.knockdown = false;
      this.startMove(this.moveset.normals.ledgeAttack);
      return true;
    }
    if (this.sy > 0.5 || inp.pressed.jump || inp.pressed.shield) {
      this.consume('jump', 'shield');
      this.knockdown = false;
      this.toNeutral();
      return true;
    }
    return false;
  }

  // Stale-move negation (normals only; PP already rations specials): a move repeated in your
  // last 9 hits does less damage and knockback; a fresh one gets a small bonus.
  staleMult(move) {
    if (!move || 'pp' in move || !move.id) return 1;
    const q = this.staleQ || [];
    let m = 1;
    let found = false;
    q.forEach((id, i) => { if (id === move.id) { m -= COMBAT.staleFactors[i]; found = true; } });
    return found ? m : COMBAT.freshBonus;
  }

  pushStale(move) {
    if (!move || 'pp' in move || !move.id || this.staledSerial === this.moveSerial) return;
    this.staledSerial = this.moveSerial; // once per use, however many hitboxes connect
    this.staleQ = [move.id, ...(this.staleQ || [])].slice(0, 9);
  }

  takeHit(hit) {
    if (this.dead || this.eliminated) return { result: 'miss', launch: 0 };
    if (!hit.throw && this.intangible) return { result: 'miss', launch: 0 };
    const g = this.game;
    if (!hit.throw && this.state === 'shield') {
      this.shieldHP -= hit.damage * SHIELD.damageMult;
      this.shieldStun = Math.floor(hit.damage * 0.8 * (SHIELD.stunMult[hit.kind] ?? 1)) + 2;
      this.vel.x = hit.dirSign * (1 + hit.damage * 0.25);
      if (this.shieldHP <= 0) this.breakShield();
      return { result: 'blocked', launch: 0 };
    }
    if (this.state === 'frozen') this.thaw(); // any hit shatters the ice
    if (this.holding) this.releaseGrab(false);
    if (this.state === 'held' && !hit.throw && this.heldBy) this.heldBy.releaseGrab(false);

    const attacker = hit.attacker;
    this.percent = Math.min(999, this.percent + hit.damage);
    this.stats.damageTaken += hit.damage;
    if (attacker && attacker !== this) {
      attacker.stats.damageDealt += hit.damage;
      this.lastHitBy = attacker;
      this.lastHitTime = g.time;
      this.lastHitMove = hit.source;
    }

    // Smash-style: weight only resists the part of knockback that grows with damage, so light
    // Pokémon aren't flung further by weak hits at low percent.
    const launch = hit.kb * COMBAT.baseKbMult + (this.percent * hit.grow * (0.5 + hit.damage / 20)) / this.st.weight;
    const a = (hit.ang * Math.PI) / 180;
    let dx = Math.cos(a) * hit.dirSign;
    let dy = Math.sin(a);
    if (this.grounded && dy < 0) dy = -dy * 0.6; // spikes on the ground pop up instead
    if (this.grounded && dy < 0.2 && launch > 6) {
      dy = 0.2;
      const m = Math.hypot(dx, dy);
      dx /= m;
      dy /= m;
    }
    this.move = null;
    this.zip = null;
    this.dodge = null;
    this.ledge = null;
    this.charging = false;
    this.heldBy = null;
    this.pivotPending = false;
    this.vel.x = dx * launch;
    this.vel.y = dy * launch;
    this.hitstun = launch * COMBAT.hitstunPerLaunch + 0.05;
    this.tumble = launch > COMBAT.tumbleAt;
    this.launchedHard = this.tumble;
    this.hsCancelShown = false;
    this.flash = 1;
    this.fastFall = false;
    this.setState('hitstun');
    this.diPending = true; // directional influence is read on the first frame after hitlag
    if (dy > 0 || launch > 4) {
      this.grounded = false;
      this.platform = null;
    }
    return { result: 'hit', launch };
  }
}

