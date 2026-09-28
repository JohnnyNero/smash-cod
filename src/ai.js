// CPU opponent. Produces the same input state a gamepad would, so it plays by the same rules.

import { STAGE } from './config.js';
import { neutralState, BUTTONS } from './input.js';

const LEVELS = {
  1: { react: 0.38, aimErr: 0.32, aggression: 0.45, recover: 0.7 },
  2: { react: 0.22, aimErr: 0.16, aggression: 0.7, recover: 0.9 },
  3: { react: 0.1, aimErr: 0.06, aggression: 0.9, recover: 1 },
};
const RANGE = { smg: 5.5, shotgun: 2.4, sniper: 10 };

export class CpuBrain {
  constructor(level = 2) {
    this.cfg = LEVELS[level] || LEVELS[2];
    this.state = neutralState('cpu');
    this.want = {};
    this.think = 0;
    this.moveIntent = 0;
    this.errPhase = Math.random() * 10;
    this.adsHold = 0;
    this.shieldHold = 0;
    this.nadeTimer = 3 + Math.random() * 4;
    this.giveUp = Math.random() > this.cfg.recover;
  }

  tap(b) { this.want[b] = !this.state.held[b]; }

  update(me, foe, dt) {
    const s = this.state;
    const c = this.cfg;
    const want = (this.want = {});
    let mx = 0;
    let my = 0;
    let ax = 0;
    let ay = 0;
    let aimActive = false;
    this.errPhase += dt;
    this.think -= dt;
    this.nadeTimer -= dt;
    const S = STAGE.main;

    if (!me.active || me.onRevival) {
      if (me.onRevival && me.revivalTimer > 1 + Math.random()) mx = -Math.sign(me.pos.x) || 1;
    } else {
      const offstage = !me.grounded && (me.pos.x < S.left - 0.1 || me.pos.x > S.right + 0.1 || me.pos.y < S.top - 0.2);
      const toCenter = -Math.sign(me.pos.x) || 1;
      if (me.hitstun > 0) {
        mx = toCenter;
        if (me.pos.y < -2 && Math.random() < 0.3) this.tap('exo'); // try to tech / buffer
      } else if (offstage) {
        if (me.grounded === false && me.pos.y > 0.5 && Math.abs(me.pos.x) < S.right + 3 && Math.random() < 0.9) {
          mx = toCenter;
        } else if (!this.giveUp) {
          mx = toCenter;
          if (me.vel.y < 2 && me.airJumps > 0) this.tap('jump');
          else if (me.vel.y < 0 && me.exoReady) { my = 0.75; this.tap('exo'); }
          else if (me.op.ability.id === 'dash' && me.dashCooldown <= 0 && me.vel.y < 0) { my = 0.8; this.tap('ability'); }
          else if (me.weapon.id === 'shotgun' && me.ammo > 0 && me.vel.y < 0) {
            aimActive = true;
            ax = -toCenter * 0.35;
            ay = -1;
            this.tap('fire');
          }
        }
      } else if (foe && foe.active && !foe.onRevival) {
        const fc = foe.center;
        const dx = fc.x - me.pos.x;
        const dy = fc.y - (me.pos.y + me.h * 0.77);
        const dist = Math.hypot(dx, dy);
        const range = RANGE[me.weapon.id];

        if (this.think <= 0) {
          this.think = c.react * (0.7 + Math.random() * 0.6);
          const adx = Math.abs(dx);
          if (adx > range + 1) this.moveIntent = Math.sign(dx);
          else if (adx < range - 2 && me.weapon.id !== 'shotgun') this.moveIntent = -Math.sign(dx);
          else this.moveIntent = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
          if (me.grounded && dy > 2.2 && Math.random() < 0.6) this.tap('jump');
          if (me.grounded && me.platform !== 'main' && dy < -1.5 && Math.random() < 0.5) this.dropNext = true;
          if (Math.random() < 0.05 * c.aggression) this.tap('jump');
          if (me.op.ability.id === 'shield' && foe.muzzle > -0.2 && adx > 3 && Math.random() < 0.4) this.shieldHold = 0.7;
          if (me.op.ability.id === 'dash' && me.dashCooldown <= 0 && foe.muzzle > -0.1 && Math.random() < 0.25 * c.aggression) {
            this.tap('ability');
          }
        }
        mx = this.moveIntent;
        // Don't run off the edge on purpose.
        if (me.grounded && ((mx < 0 && me.pos.x < S.left + 1.2) || (mx > 0 && me.pos.x > S.right - 1.2))) mx = 0;
        if (this.dropNext) { my = -1; this.dropNext = false; }

        const err = Math.sin(this.errPhase * 2.3) * c.aimErr + Math.sin(this.errPhase * 5.1) * c.aimErr * 0.5;
        const ang = Math.atan2(dy, dx) + err;
        aimActive = true;
        ax = Math.cos(ang);
        ay = Math.sin(ang);

        if (this.shieldHold > 0) {
          this.shieldHold -= dt;
          want.ability = true;
        } else if (dist < 1.6 && Math.random() < 0.12 * c.aggression) {
          this.tap('knife');
        } else if (me.weapon.id === 'smg') {
          if (dist < 9) want.fire = true;
        } else if (me.weapon.id === 'shotgun') {
          if (dist < 4.2 && me.fireCooldown <= 0) this.tap('fire');
        } else if (dist < 22) {
          want.ads = true;
          this.adsHold += dt;
          if (me.adsTime >= me.weapon.adsTime && Math.random() < 0.25) this.tap('fire');
        }
        if (this.nadeTimer <= 0 && dist > 3 && dist < 11) {
          this.nadeTimer = 5 + Math.random() * 5;
          ay += 0.5;
          this.tap('grenade');
        }
        if (me.ammo === 0 && me.reloadTimer <= 0) this.tap('reload');
      }
      if (me.grounded) this.giveUp = Math.random() > c.recover;
    }

    s.moveX = mx;
    s.moveY = my;
    s.aimX = ax;
    s.aimY = ay;
    s.aimActive = aimActive;
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
