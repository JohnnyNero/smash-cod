// Fighter simulation: movement, Smash-style damage % and knockback, and the CoD loadout
// (gun, knife, frag, exo boost, operator ability). No rendering in here; the game reads
// this state to drive the 3D model, and effects/audio go through `game` hooks.

import { PHYS, STAGE, KNIFE, GRENADE, EXO, SHIELD, DASH } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

export class Fighter {
  constructor(game, slot, operator, weapon, colors) {
    this.game = game;
    this.slot = slot;
    this.op = operator;
    this.weapon = weapon;
    this.colors = colors;
    this.w = operator.width;
    this.h = operator.height;
    this.stocks = 3;
    this.eliminated = false;
    this.streak = 0;
    this.stats = { kos: 0, falls: 0, sds: 0, damageDealt: 0, damageTaken: 0, shots: 0, hits: 0 };
    this.pos = { x: 0, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.aim = { x: 1, y: 0 };
    this.facing = 1;
    this.spawn(STAGE.spawns[slot] ?? 0, 0);
    this.facing = this.pos.x > 0 ? -1 : 1;
    this.aim.x = this.facing;
  }

  spawn(x, y) {
    Object.assign(this, {
      dead: false, onRevival: false, revivalTimer: 0, respawnTimer: 0,
      grounded: true, platform: 'main', dropTimer: 0, fastFall: false,
      airJumps: this.op.airJumps, exoReady: true, exoTimer: 0, exoCooldown: 0, exoPressedAt: -9,
      hitstun: 0, tumble: false, percent: 0, invuln: 0, flash: 0,
      lastHitBy: null, lastHitTime: -99, lastHitWeapon: null,
      ammo: this.weapon.mag, reloadTimer: 0, fireCooldown: 0, fireBuffer: 0, adsTime: 0,
      knifeTimer: 0, knifeHits: new Set(),
      grenades: GRENADE.max, grenadeTimer: 0,
      shieldHP: SHIELD.hp, shieldUp: false, shieldBroken: 0,
      dashTimer: 0, dashCooldown: 0,
      recoilKick: 0, muzzle: 0, landSquash: 0, t: 0,
    });
    this.pos.x = x;
    this.pos.y = y;
    this.vel.x = 0;
    this.vel.y = 0;
  }

  respawn() {
    this.spawn(0, STAGE.revivalY);
    this.grounded = false;
    this.platform = null;
    this.onRevival = true;
    this.facing = this.slot === 0 ? 1 : -1;
    this.aim = { x: this.facing, y: 0 };
  }

  get center() { return { x: this.pos.x, y: this.pos.y + this.h * 0.5 }; }
  get active() { return !this.dead && !this.eliminated; }

  muzzlePos() {
    const reach = 0.35 + this.weapon.len;
    return [this.pos.x + this.aim.x * reach, this.pos.y + this.h * 0.77 + this.aim.y * reach];
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
    this.flash = Math.max(0, this.flash - dt * 5);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 7);
    this.landSquash = Math.max(0, this.landSquash - dt * 5);
    this.muzzle -= dt;
    this.fireCooldown -= dt;
    this.fireBuffer -= dt;
    this.exoCooldown -= dt;
    this.dashCooldown -= dt;
    this.dropTimer -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.grenades < GRENADE.max && (this.grenadeTimer += dt) >= GRENADE.recharge) {
      this.grenades++;
      this.grenadeTimer = 0;
    }
    if (this.shieldBroken > 0) {
      this.shieldBroken -= dt;
      if (this.shieldBroken <= 0) this.shieldHP = SHIELD.hp;
    } else if (!this.shieldUp) {
      this.shieldHP = Math.min(SHIELD.hp, this.shieldHP + SHIELD.regen * dt);
    }

    if (this.onRevival) {
      this.revivalTimer += dt;
      this.updateAim(inp);
      const moved = Math.abs(inp.moveX) > 0.5 || inp.moveY < -0.5 || inp.pressed.jump || inp.pressed.fire || inp.pressed.exo;
      if (g.canAct && this.revivalTimer > 0.5 && (moved || this.revivalTimer > 4)) {
        this.onRevival = false;
        this.invuln = 1.5;
        if (inp.pressed.jump) this.vel.y = this.op.doubleJump;
      }
      return;
    }

    if (this.hitstun > 0) this.hitstun -= dt;
    const canAct = this.hitstun <= 0 && g.canAct;
    this.updateAim(inp);
    if (canAct) {
      this.control(dt, inp);
    } else {
      this.shieldUp = false;
      this.adsTime = 0;
    }

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = this.weapon.mag;
        g.audio.reloadDone(this.pos.x);
      }
    }
    this.updateKnife(dt);
    this.physics(dt, inp, canAct);
    this.checkBlast();
  }

  updateAim(inp) {
    let ax, ay;
    if (inp.aimActive) {
      const m = Math.hypot(inp.aimX, inp.aimY) || 1;
      ax = inp.aimX / m;
      ay = inp.aimY / m;
      if (Math.abs(ax) > 0.1 && this.knifeTimer <= 0) this.facing = Math.sign(ax);
    } else {
      const tilt = Math.abs(inp.moveY) > 0.35 ? clamp(inp.moveY, -1, 1) : 0;
      ax = this.facing;
      ay = tilt;
      const m = Math.hypot(ax, ay);
      ax /= m;
      ay /= m;
    }
    this.aim.x = ax;
    this.aim.y = ay;
  }

  control(dt, inp) {
    const op = this.op;
    const g = this.game;
    const mx = Math.abs(inp.moveX) > 0.2 ? inp.moveX : 0;

    this.shieldUp = op.ability.id === 'shield' && inp.held.ability && this.shieldBroken <= 0 && this.knifeTimer <= 0;
    if (op.ability.id === 'dash' && inp.pressed.ability && this.dashCooldown <= 0) this.startDash(inp);

    if (!inp.aimActive && mx !== 0 && this.knifeTimer <= 0) this.facing = Math.sign(mx);
    if (mx !== 0 || inp.pressed.jump || inp.pressed.exo) this.tumble = false;

    const speedMult = this.shieldUp ? SHIELD.moveMult : this.adsTime > 0 && !inp.held.fire ? 0.55 : 1;
    if (this.dashTimer > 0 || this.exoTimer > 0) {
      // velocity is locked during boosts
    } else if (this.grounded) {
      const target = mx * op.runSpeed * speedMult;
      const rate = mx !== 0 && Math.sign(mx) === Math.sign(this.vel.x || mx) ? PHYS.groundAccel : PHYS.groundFriction + PHYS.groundAccel * 0.5;
      this.vel.x = approach(this.vel.x, target, rate * dt);
    } else if (mx !== 0) {
      const target = mx * op.airSpeed * speedMult;
      if (Math.abs(this.vel.x) < op.airSpeed || Math.sign(this.vel.x) !== Math.sign(mx)) {
        this.vel.x = approach(this.vel.x, target, PHYS.airAccel * dt);
      }
    }

    if (inp.pressed.jump && this.dashTimer <= 0) {
      if (this.grounded) {
        this.vel.y = op.jump;
        this.leaveGround();
        this.landSquash = 0;
        g.effects.dust(this.pos.x, this.pos.y, 6);
        g.audio.jump(this.pos.x, false);
      } else if (this.airJumps > 0) {
        this.airJumps--;
        this.vel.y = op.doubleJump;
        this.fastFall = false;
        g.effects.ring(this.pos.x, this.pos.y + 0.1, 0xffffff, 1.4, 0.25);
        g.audio.jump(this.pos.x, true);
      }
    }
    if (this.grounded && this.platform !== 'main' && inp.pressed.down) {
      this.dropTimer = 0.22;
      this.leaveGround();
      this.vel.y = -2;
    } else if (!this.grounded && inp.pressed.down && this.vel.y < 4) {
      this.fastFall = true;
    }

    if (inp.pressed.exo) this.exoPressedAt = this.t;
    if (inp.pressed.exo && this.exoReady && this.exoCooldown <= 0 && this.dashTimer <= 0) {
      let dx = inp.moveX;
      let dy = inp.moveY;
      let m = Math.hypot(dx, dy);
      if (m < 0.3) { dx = this.facing; dy = 0; m = 1; }
      dx /= m;
      dy /= m;
      if (this.grounded && dy < 0) {
        dy = 0;
        dx = Math.sign(dx) || this.facing;
      }
      this.vel.x = dx * EXO.speed;
      this.vel.y = dy * EXO.speed;
      this.exoTimer = EXO.time;
      this.exoCooldown = EXO.cooldown;
      this.fastFall = false;
      if (!this.grounded) this.exoReady = false;
      if (dy > 0.2) this.leaveGround();
      g.effects.boost(this.pos.x, this.pos.y + this.h * 0.6, -dx, -dy, this.colors.accent);
      g.audio.exo(this.pos.x);
    }

    const W = this.weapon;
    if (inp.held.ads && !this.shieldUp && this.knifeTimer <= 0) this.adsTime += dt;
    else this.adsTime = 0;
    if (inp.pressed.fire) this.fireBuffer = 0.12;
    if (inp.pressed.reload && this.ammo < W.mag && this.reloadTimer <= 0) this.startReload();
    // Touch sticks hold to fire, so semi-auto guns refire on their own there.
    const trigger = W.auto || inp.autoFire ? inp.held.fire : this.fireBuffer > 0;
    if (trigger && !this.shieldUp && this.knifeTimer <= 0 && this.dashTimer <= 0 && this.reloadTimer <= 0) {
      if (this.ammo <= 0) {
        this.startReload();
      } else if (this.fireCooldown <= 0) {
        this.fire();
        this.fireBuffer = 0;
      }
    }
    if (inp.pressed.knife && this.knifeTimer <= 0 && !this.shieldUp) this.startKnife();
    if (inp.pressed.grenade && this.grenades > 0 && !this.shieldUp && this.knifeTimer <= 0) this.throwGrenade();
  }

  leaveGround() {
    this.grounded = false;
    this.platform = null;
  }

  fire() {
    const W = this.weapon;
    const g = this.game;
    this.ammo--;
    this.fireCooldown = W.interval;
    this.stats.shots++;
    this.tumble = false;
    const charged = this.adsTime >= W.adsTime;
    let spread = W.hipSpread ?? W.spread;
    if (charged) spread = W.spread * 0.4;
    else if (this.adsTime > 0) spread = W.spread * 0.7;
    const base = Math.atan2(this.aim.y, this.aim.x);
    const [mx, my] = this.muzzlePos();
    const shot = { hit: false };
    for (let i = 0; i < W.pellets; i++) {
      const a = W.pellets > 1
        ? base + (i / (W.pellets - 1) - 0.5) * spread * 2 + (Math.random() - 0.5) * 0.05
        : base + (Math.random() - 0.5) * 2 * spread;
      g.spawnBullet(this, mx, my, Math.cos(a), Math.sin(a), W, charged ? W.adsMult : 1, shot);
    }

    const r = W.recoil;
    if (r > 2) {
      this.vel.x -= this.aim.x * r * (this.grounded ? 0.5 : 1);
      if (this.aim.y < -0.3) {
        // Shooting downward is a rocket jump.
        this.vel.y = Math.max(this.vel.y, -this.aim.y * r);
        this.leaveGround();
        this.fastFall = false;
      } else if (!this.grounded) {
        this.vel.y -= this.aim.y * r * 0.5;
      }
    } else {
      this.vel.x -= this.aim.x * r;
    }
    this.recoilKick = 1;
    this.muzzle = 0.05;
    g.onFire(this, mx, my, charged);
    if (this.ammo <= 0) this.startReload();
  }

  startReload() {
    if (this.reloadTimer > 0) return;
    this.reloadTimer = this.weapon.reload;
    this.game.audio.reload(this.pos.x);
  }

  startKnife() {
    this.knifeTimer = KNIFE.duration;
    this.knifeHits.clear();
    this.tumble = false;
    this.vel.x += this.facing * KNIFE.lunge;
    this.game.audio.knife(this.pos.x);
  }

  updateKnife(dt) {
    if (this.knifeTimer <= 0) return;
    this.knifeTimer -= dt;
    const tIn = KNIFE.duration - this.knifeTimer;
    if (tIn >= KNIFE.activeStart && tIn <= KNIFE.activeEnd) {
      this.game.meleeCheck(this, {
        x: this.pos.x + this.facing * 0.85,
        y: this.pos.y + this.h * 0.55,
        hw: 0.8,
        hh: 0.7,
      });
    }
  }

  throwGrenade() {
    this.grenades--;
    const s = GRENADE.throwSpeed;
    const vx = this.aim.x * s + this.vel.x * 0.3;
    const vy = this.aim.y * s + 5;
    this.game.spawnGrenade(this, this.pos.x + this.facing * 0.4, this.pos.y + this.h * 0.8, vx, vy);
    this.game.audio.throw(this.pos.x);
  }

  startDash(inp) {
    let dx = inp.moveX;
    let dy = inp.moveY;
    let m = Math.hypot(dx, dy);
    if (m < 0.3) { dx = this.facing; dy = 0; m = 1; }
    dx /= m;
    dy /= m;
    if (this.grounded && dy < 0) { dy = 0; dx = Math.sign(dx) || this.facing; }
    this.vel.x = dx * DASH.speed;
    this.vel.y = dy * DASH.speed;
    this.dashTimer = DASH.time;
    this.dashCooldown = DASH.cooldown;
    this.fastFall = false;
    if (dy > 0.2) this.leaveGround();
    this.game.effects.boost(this.pos.x, this.pos.y + this.h * 0.5, -dx, -dy, this.colors.accent, true);
    this.game.audio.dash(this.pos.x);
  }

  physics(dt, inp, canAct) {
    const op = this.op;
    const S = STAGE.main;

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) { this.vel.x *= DASH.keep; this.vel.y *= DASH.keep; }
    } else if (this.exoTimer > 0) {
      this.exoTimer -= dt;
      if (this.exoTimer <= 0) { this.vel.x *= EXO.keep; this.vel.y *= EXO.keep; }
    } else if (!this.grounded) {
      this.vel.y -= PHYS.gravity * (this.hitstun > 0 ? PHYS.hitstunGravity : 1) * dt;
      const maxFall = op.maxFall * (this.fastFall ? PHYS.fastFallMult : 1);
      if (this.fastFall && this.vel.y < 0) this.vel.y = Math.min(this.vel.y, -maxFall);
      else if (this.vel.y < -maxFall) this.vel.y = approach(this.vel.y, -maxFall, 60 * dt);
      if (Math.abs(this.vel.x) > op.airSpeed) {
        this.vel.x = approach(this.vel.x, Math.sign(this.vel.x) * op.airSpeed, PHYS.kbDecay * dt);
      } else if (!(canAct && Math.abs(inp.moveX) > 0.2)) {
        this.vel.x = approach(this.vel.x, 0, PHYS.airFriction * dt);
      }
      if (this.hitstun > 0 && Math.abs(inp.moveX) > 0.3) {
        this.vel.x += inp.moveX * 4 * dt; // a little directional influence while launched
      }
    } else if (!canAct) {
      this.vel.x = approach(this.vel.x, 0, PHYS.groundFriction * dt);
    }

    const prevX = this.pos.x;
    const prevY = this.pos.y;
    let nx = prevX + this.vel.x * dt;
    let ny = prevY + this.vel.y * dt;
    const hw = this.w / 2;

    if (this.grounded) {
      const top = this.supportTop(nx);
      if (top === null || this.vel.y > 0) {
        this.leaveGround();
      } else {
        ny = top;
        this.vel.y = 0;
      }
    }

    if (!this.grounded) {
      if (this.vel.y <= 0) {
        if (prevY >= S.top - 0.001 && ny <= S.top && nx + hw * 0.6 > S.left && nx - hw * 0.6 < S.right) {
          ny = this.land('main', S.top, inp);
        } else if (this.dropTimer <= 0) {
          STAGE.platforms.forEach((p, i) => {
            if (!this.grounded && prevY >= p.y - 0.001 && ny <= p.y && Math.abs(nx - p.x) <= p.w / 2 + hw * 0.3) {
              ny = this.land(i, p.y, inp);
            }
          });
        }
      } else if (prevY + this.h <= S.bottom + 0.001 && ny + this.h > S.bottom && nx + hw > S.left && nx - hw < S.right) {
        ny = S.bottom - this.h;
        this.vel.y = this.hitstun > 0 ? -this.vel.y * 0.4 : 0;
      }
    }

    // Side walls of the main stage, with an arcade "ledge hop" so recoveries that
    // reach the lip pop up onto the stage instead of sliding down the wall.
    if (ny < S.top - 0.001 && ny + this.h > S.bottom && nx + hw > S.left && nx - hw < S.right) {
      const fromLeft = prevX + hw <= S.left + 0.05;
      const fromRight = prevX - hw >= S.right - 0.05;
      if (fromLeft || fromRight) {
        const edgeX = fromLeft ? S.left - hw : S.right + hw;
        if (this.hitstun <= 0 && ny > S.top - 1.1 && this.vel.y < 6) {
          nx = fromLeft ? S.left + hw * 0.5 : S.right - hw * 0.5;
          ny = this.land('main', S.top, inp);
          this.vel.x = 0;
          this.game.effects.dust(nx, ny, 5);
        } else {
          nx = edgeX;
          if (this.hitstun > 0 && Math.abs(this.vel.x) > 8) {
            this.vel.x = -this.vel.x * 0.5;
            this.game.effects.dust(nx, ny + this.h / 2, 8);
          } else {
            this.vel.x = 0;
          }
        }
      }
    }

    this.pos.x = nx;
    this.pos.y = ny;
  }

  supportTop(x) {
    const hw = this.w / 2;
    if (this.platform === 'main') {
      const S = STAGE.main;
      return x + hw * 0.6 > S.left && x - hw * 0.6 < S.right ? S.top : null;
    }
    const p = STAGE.platforms[this.platform];
    return p && Math.abs(x - p.x) <= p.w / 2 + hw * 0.3 ? p.y : null;
  }

  land(platform, top, inp) {
    const g = this.game;
    const impact = -this.vel.y;
    if (this.hitstun > 0 && impact > 9) {
      if (this.t - this.exoPressedAt < 0.25) {
        // Tech: tapping EXO right before hitting the ground cancels the bounce.
        this.hitstun = 0;
        this.tumble = false;
        this.invuln = Math.max(this.invuln, 0.3);
        g.effects.ring(this.pos.x, top + 0.1, 0x9ff7ff, 2, 0.3);
        g.popup(this.slot, 'TECH!');
      } else {
        this.vel.y = impact * 0.5;
        this.hitstun *= 0.8;
        g.effects.dust(this.pos.x, top, 10);
        g.audio.land(this.pos.x, true);
        return top;
      }
    }
    this.grounded = true;
    this.platform = platform;
    this.vel.y = 0;
    this.airJumps = this.op.airJumps;
    this.exoReady = true;
    this.fastFall = false;
    this.tumble = false;
    if (this.hitstun > 0) this.hitstun = Math.min(this.hitstun, 0.12);
    this.landSquash = clamp(impact / 22, 0.15, 1);
    if (impact > 12) g.effects.dust(this.pos.x, top, 6);
    g.audio.land(this.pos.x, impact > 20);
    return top;
  }

  checkBlast() {
    const B = STAGE.blast;
    const { x, y } = this.pos;
    if (x < B.left || x > B.right || y < B.bottom || y > B.top) this.game.onKO(this);
  }

  // Returns { result: 'hit' | 'blocked' | 'miss', launch }.
  takeHit(hit) {
    if (this.dead || this.eliminated || this.invuln > 0 || this.dashTimer > 0 || this.onRevival) {
      return { result: 'miss', launch: 0 };
    }
    const g = this.game;
    if (this.shieldUp && hit.fromX !== undefined && Math.sign(hit.fromX - this.pos.x) === this.facing) {
      this.shieldHP -= hit.damage * (hit.light ? 1.8 : 1.3);
      this.vel.x -= this.facing * (hit.light ? 0.4 : 2.5);
      if (this.shieldHP <= 0) {
        this.shieldHP = 0;
        this.shieldBroken = SHIELD.breakTime;
        this.shieldUp = false;
        this.hitstun = 0.6;
        g.effects.sparks(this.pos.x + this.facing * 0.6, this.pos.y + 1, 0, 1, this.colors.accent, 24, 9);
        g.audio.shieldBreak(this.pos.x);
        g.popup(this.slot, 'SHIELD BROKEN');
      }
      return { result: 'blocked', launch: 0 };
    }

    const attacker = hit.attacker;
    this.percent = Math.min(999, this.percent + hit.damage);
    this.stats.damageTaken += hit.damage;
    if (attacker && attacker !== this) {
      attacker.stats.damageDealt += hit.damage;
      this.lastHitBy = attacker;
      this.lastHitTime = g.time;
      this.lastHitWeapon = hit.source;
    }

    let launch = ((hit.baseKB + this.percent * hit.growth) * (hit.kbMult || 1)) / this.op.weight;
    let dx = hit.dirX;
    let dy = hit.dirY;
    let m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    this.flash = 1;

    if (hit.light) {
      launch *= 0.35;
      this.vel.x += dx * launch;
      if (!this.grounded) this.vel.y += dy * launch * 0.6;
      const sp = Math.hypot(this.vel.x, this.vel.y);
      if (sp > PHYS.lightHitCap) {
        this.vel.x *= PHYS.lightHitCap / sp;
        this.vel.y *= PHYS.lightHitCap / sp;
      }
      this.hitstun = Math.max(this.hitstun, 0.06);
      this.flash = 0.6;
    } else {
      if (this.grounded && dy < 0.25) {
        dy = 0.25;
        m = Math.hypot(dx, dy);
        dx /= m;
        dy /= m;
      }
      this.vel.x = dx * launch;
      this.vel.y = dy * launch;
      if (dy > 0 || launch > 4) this.leaveGround();
      this.hitstun = launch * 0.03 + 0.05;
      this.tumble = launch > 11;
      this.exoReady = true;
      this.knifeTimer = 0;
      this.fastFall = false;
      this.exoTimer = 0;
    }
    return { result: 'hit', launch };
  }
}
