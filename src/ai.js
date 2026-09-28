// CPU opponent. Produces the same input state a gamepad would, so it plays by the same rules.

import { STAGE } from './config.js';
import { neutralState, BUTTONS } from './input.js';

const LEVELS = {
  1: { react: 0.4, aggression: 0.35, shield: 0.15, recover: 0.75, precision: 0.5 },
  2: { react: 0.24, aggression: 0.6, shield: 0.3, recover: 0.92, precision: 0.75 },
  3: { react: 0.12, aggression: 0.85, shield: 0.45, recover: 1, precision: 0.95 },
};

export class CpuBrain {
  constructor(level = 2) {
    this.cfg = LEVELS[level] || LEVELS[2];
    this.state = neutralState('cpu');
    this.think = 0;
    this.intent = 0;
    this.shieldHold = 0;
    this.ledgeWait = 0;
    this.giveUp = false;
    this.projTimer = 1 + Math.random() * 2;
  }

  update(me, foe, dt) {
    const c = this.cfg;
    const want = {};
    let mx = 0;
    let my = 0;
    let smash = null;
    const tap = (b) => { want[b] = !this.state.held[b]; };
    this.think -= dt;
    this.projTimer -= dt;
    const S = STAGE.main;
    const toCenter = -Math.sign(me.pos.x) || 1;

    if (!me.active || me.onRevival) {
      if (me.onRevival && me.revivalTimer > 1 + Math.random()) mx = toCenter;
    } else if (me.state === 'hitstun') {
      // Survival DI: hold perpendicular to the launch, on the side that bends it up and inwards.
      const vx = me.vel.x;
      const vy = me.vel.y;
      const sp = Math.hypot(vx, vy) || 1;
      let px = -vy / sp;
      let py = vx / sp;
      if (px * toCenter + py < 0) { px = -px; py = -py; }
      const good = Math.random() < c.precision;
      mx = good ? px : toCenter;
      my = good ? py : 0;
      if (me.vel.y < -8 && me.pos.y < 1.5 && Math.random() < c.precision * 0.3) tap('shield'); // tech attempt
    } else if (me.state === 'held') {
      if (Math.random() < 0.5) tap(['attack', 'jump', 'special'][Math.floor(Math.random() * 3)]);
      mx = Math.random() < 0.5 ? 1 : -1;
    } else if (me.state === 'holding') {
      // Throw toward the nearer blast zone.
      const out = Math.sign(me.pos.x) || 1;
      mx = Math.abs(me.pos.x) > 3 ? out : me.facing;
      if (foe && foe.percent > 90 && Math.random() < 0.5) { mx = 0; my = 1; }
    } else if (me.state === 'ledge') {
      this.ledgeWait -= dt;
      if (this.ledgeWait <= 0) {
        this.ledgeWait = 0.3 + Math.random() * 0.6;
        const r = Math.random();
        if (r < 0.4) my = 1;
        else if (r < 0.65) tap('jump');
        else if (r < 0.85) tap('attack');
        else tap('shield');
      }
    } else if (!me.grounded && (me.pos.x < S.left - 0.2 || me.pos.x > S.right + 0.2 || me.pos.y < S.top - 0.3)) {
      // Recovery: aim for the ledge. From under the stage, drift out first so we don't
      // zip into its underside.
      this.shieldHold = 0;
      if (!this.giveUp) {
        const side = Math.sign(me.pos.x) || 1;
        const edgeX = side * S.right;
        // Overlapping the stage horizontally while below it = going up would bonk the underside.
        const under = Math.abs(me.pos.x) - me.w / 2 < S.right - 0.02 && me.pos.y < S.top - 0.3;
        const tx = under ? edgeX + side * 1.4 : edgeX - side * 0.4;
        const ty = S.top + 0.6;
        const vx = tx - me.pos.x;
        const vy = ty - me.pos.y;
        mx = under ? side : Math.sign(vx);
        if (me.state === 'attack' && this.recoverStick) {
          ({ mx, my } = this.recoverStick); // keep holding the up-special direction
        } else if (me.state === 'air' && me.vel.y < 1) {
          if (under) {
            // Below the lip: drift out first; only cut it close with a diagonal up-special if
            // we're about to run out of height.
            if (me.pos.y < -7) {
              mx = side * 0.6;
              my = 0.8;
              this.recoverStick = { mx, my };
              tap('special');
            }
          } else if (me.airJumps > 0 && me.pos.y < 1.5) {
            tap('jump');
          } else if (me.pos.y < 0.3) {
            // Up-special steeply upward, leaning toward the ledge.
            mx = Math.sign(vx) * Math.min(0.8, Math.abs(vx) / 4);
            my = 1;
            this.recoverStick = { mx, my };
            tap('special');
          }
        }
      }
    } else if (foe && foe.active && !foe.onRevival) {
      const dx = foe.pos.x - me.pos.x;
      const dy = foe.pos.y - me.pos.y;
      const adx = Math.abs(dx);
      const dist = Math.hypot(dx, dy);
      const facingFoe = Math.sign(dx) === me.facing;
      const foeAttacking = foe.state === 'attack' && foe.move && foe.move.hitboxes;

      // Showdown sense: avoid moves the target resists or is immune to, favour super-effective ones.
      const eff = (slot) => (me.game.moveEff ? me.game.moveEff(me, slot, foe) : 1);
      const usable = (slot) => me.pp[slot] > 0 && eff(slot) !== 0 && (eff(slot) >= 1 || Math.random() < 0.25);
      const boostMove = (slot) => (me.moveset.specials[slot].events || []).some((e) => e.do === 'boost' && Object.values(e.boosts).some((v) => v > 0));
      const downOk = () => {
        const m = me.moveset.specials.down;
        if (!usable('down')) return false;
        if (boostMove('down')) return ((me.boosts.atk || 0) + (me.boosts.spa || 0)) < 4; // don't over-set-up
        if (m.id === 'leechseed') return !foe.seed;
        if (m.id === 'destinybond') return me.percent > 80;
        return true;
      };
      if (!me.grounded) this.shieldHold = 0; // shield in the air is an air dodge; don't do it by accident
      if (this.shieldHold > 0) {
        this.shieldHold -= dt;
        want.shield = true;
        if (foe.state !== 'attack' && Math.random() < 0.3) tap('grab'); // shield grab
      } else if (this.think <= 0) {
        this.think = c.react * (0.7 + Math.random() * 0.6);
        if (foeAttacking && dist < 2.4 && me.grounded && Math.random() < c.shield) {
          this.shieldHold = 0.25 + Math.random() * 0.3;
        } else if (me.grounded && adx < 1.2 && Math.abs(dy) < 0.8 && Math.random() < 0.25 * c.aggression) {
          tap('grab');
        } else if (adx < 1.7 && Math.abs(dy) < 1.4 && Math.random() < c.aggression) {
          // Close range: pick an attack based on where the opponent is.
          if (!facingFoe) mx = Math.sign(dx);
          if (dy > 0.9) {
            my = 1;
            if (me.grounded && foe.percent > 80 && Math.random() < 0.5) smash = { x: 0, y: 1 };
            else if (me.grounded) tap('attack');
            else tap('attack');
          } else if (me.grounded && foe.percent > 85 && Math.random() < 0.55) {
            smash = { x: Math.sign(dx), y: 0 };
          } else if (me.grounded) {
            if (Math.random() < 0.4) mx = Math.sign(dx);
            tap('attack');
          } else {
            mx = Math.sign(dx);
            tap('attack');
          }
        } else if (me.grounded && adx > 5 && Math.random() < 0.08 && me.game.cpuSwitchChoice) {
          // Bad matchup? Switch to a better answer from a safe distance (Showdown-style).
          const pick = me.game.cpuSwitchChoice(me.slot);
          if (pick >= 0) {
            mx = pick === 0 ? -1 : pick === 2 ? 1 : 0;
            my = pick === 1 ? 1 : 0;
            tap('swap');
          }
        } else if (me.grounded && dy > 2.2 && adx < 3 && Math.random() < 0.5) {
          tap('jump');
        } else if (me.grounded && me.platform !== 'main' && dy < -1.5 && Math.random() < 0.5) {
          my = -1;
        } else if (this.projTimer <= 0 && adx > 4 && Math.abs(dy) < 1.5 && usable('neutral')) {
          this.projTimer = 2 + Math.random() * 3;
          if (!facingFoe) mx = Math.sign(dx);
          tap('special');
        } else if (me.grounded && adx > 1.5 && adx < 5 && Math.abs(dy) < 1 && usable('side') && Math.random() < 0.12 * c.aggression * (eff('side') > 1 ? 2.5 : 1)) {
          mx = Math.sign(dx); // side special toward them
          tap('special');
        } else if (me.grounded && adx > 5 && downOk() && Math.random() < 0.08) {
          my = -1; // down special: setup moves / Leech Seed / Destiny Bond from a safe distance
          tap('special');
        } else {
          this.intent = adx > 1.4 ? Math.sign(dx) : Math.random() < 0.3 ? -Math.sign(dx) : 0;
          if (Math.random() < 0.08 * c.aggression && me.grounded) tap('jump');
        }
      }
      if (mx === 0 && !smash && !want.special) mx = this.intent;
      // Don't run off the edge on purpose.
      if (me.grounded && ((mx < 0 && me.pos.x < S.left + 1) || (mx > 0 && me.pos.x > S.right - 1))) mx = 0;
      // Near the edge in the air, drift back in rather than chasing aerials off stage.
      if (!me.grounded && me.pos.y < 3 && Math.abs(me.pos.x) > S.right - 2 && Math.sign(me.pos.x) === Math.sign(mx)) mx = -Math.sign(me.pos.x);
    }
    if (me.grounded) this.giveUp = Math.random() > c.recover;

    const s = this.state;
    s.moveX = mx;
    s.moveY = my;
    if (smash) {
      want.smash = !s.held.smash;
      s.smashX = smash.x;
      s.smashY = smash.y;
    }
    for (const b of BUTTONS) {
      const h = !!want[b];
      s.pressed[b] = h && !s.held[b];
      s.held[b] = h;
    }
    s.pressed.down = my < -0.6 && !this.wasDown;
    this.wasDown = my < -0.6;
    return s;
  }
}
