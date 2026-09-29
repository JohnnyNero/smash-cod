// SHOWDOWN mode: rounds of Pokémon Showdown turns, then a Smash fight carrying their results.
//
// Each round:
//   1. SHOWDOWN_TURNS Showdown turns, played out on the platform with the camera behind P1's
//      Pokémon (Showdown's angle). Both players secretly pick a move or a switch; commands resolve
//      in Showdown order (switches first, then priority, then Speed, ties random) and each move
//      actually happens: the attacker animates, the attack flies across, and
//        - damaging moves add % (Showdown's damage formula: Atk vs Def, STAB, type chart,
//          weather, burn, abilities), with accuracy, secondary effects, drain and recoil;
//        - status moves inflict their status (sleep, paralysis, burn, bad poison, Leech Seed);
//        - self / field moves boost stats or set the weather;
//      Sleep, freeze, paralysis and confusion can stop a Pokémon acting, as in Showdown.
//      Nobody can be KO'd here: the % just piles up.
//   2. A SMASH_SECONDS real-time fight starting from those %, statuses, boosts and weather. The
//      move each player used last is "charged": 1.25x, its effect always lands, no PP cost.
//      KOs (ring-outs) happen here; a faint leads to the hidden replacement pick, then a new round.
// Percent only: no HP bar.

import { stageMult } from './data/pokemon.js';
import { moveEffect, damageFor } from './damage.js';
import { matchupScore } from './team.js';
import { TYPE_COLORS } from './config.js';

export const SHOWDOWN_TURNS = 3;
export const SMASH_SECONDS = 30;
export const PICK_SECONDS = 10;
const SD_DAMAGE = 0.075; // % per point of base power, before stats / STAB / type
const MOVE_TIME = 1.35; // seconds a move takes to play out
const HIT_AT = 0.5; // ...and when it lands
const SETTLE_MAX = 1.5; // wait up to this long after the Smash clock runs out for the action to calm

const SELF_EVENTS = new Set(['boost', 'weather', 'destinybond']);
// A move that only affects its user or the field.
export const isFieldMove = (m) => !m.hitboxes && (m.events || []).length > 0
  && (m.events || []).every((e) => SELF_EVENTS.has(e.do) || e.do === 'fx' || e.do === 'vel');

// The status a status move inflicts (Showdown's `status` / `volatileStatus`, or the effect on its
// projectile / hitbox).
function statusOf(m) {
  if (m.status) return { slp: 'sleep', par: 'par', brn: 'brn', tox: 'tox', psn: 'psn', frz: 'frz' }[m.status] || null;
  if (m.volatile === 'leechseed') return 'seed';
  for (const e of m.events || []) if (e.proj && e.proj.effect) return e.proj.effect;
  for (const h of m.hitboxes || []) if (h.effect) return h.effect;
  return null;
}

const CALM = new Set(['ground', 'air', 'shield', 'landlag', 'taunt', 'helpless']);

export class ShowdownTurns {
  constructor(game) {
    this.g = game;
    this.n = 0; // Showdown turns so far
    this.round = 0;
    this.turn = 0; // turn within the round
    this.t = 0; // Smash clock
    this.pick = null;
    this.queue = null;
    this.cur = null;
    this.lastUsed = [null, null];
  }

  get label() { return `Round ${this.round} · Turn ${this.turn}/${SHOWDOWN_TURNS}`; }

  begin() {
    this.n = 0;
    this.round = 0;
    this.startRound();
  }

  startRound() {
    const g = this.g;
    this.round++;
    this.turn = 0;
    this.lastUsed = [null, null];
    for (const p of g.players) for (const f of p.team) f.called = null; // last round's charge is spent
    this.startPick();
  }

  // Each sim step during the Smash phase: its clock.
  step(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    const g = this.g;
    const calm = g.fighters.every((f) => !f.active || f.dead || f.onRevival || CALM.has(f.state));
    if ((calm && g.projectiles.length === 0) || this.t < -SETTLE_MAX) this.startRound();
  }

  options(i) {
    const g = this.g;
    const p = g.players[i];
    const f = p.team[p.active];
    const foePl = g.players[1 - i];
    const foe = foePl.team[foePl.active];
    const opts = [];
    for (const [slot, m] of Object.entries(f.moveset.specials)) {
      const pp = f.pp[slot];
      const eff = m.cat === 'status' ? (moveEffect(m, foe.sp) === 0 ? 0 : 1) : moveEffect(m, foe.sp);
      opts.push({ kind: 'move', slot, move: m, pp, ok: pp > 0 && !(f.disabled && f.disabled.slot === slot), eff, field: isFieldMove(m) });
    }
    for (const k of g.aliveIndexes(p)) {
      if (k === p.active) continue;
      opts.push({ kind: 'switch', idx: k, mon: p.team[k], ok: true });
    }
    return opts;
  }

  startPick() {
    const g = this.g;
    this.n++;
    this.turn++;
    if (g.weather && this.n > 1 && --g.weather.turns <= 0) g.endWeather();
    const opts = [0, 1].map((i) => this.options(i));
    this.pick = { picks: [null, null], cursor: [0, 0], timer: PICK_SECONDS, opts };
    g.players.forEach((p, i) => { if (p.isCpu) this.pick.picks[i] = this.cpuCommand(i, opts[i]); });
    g.state = 'turnpick';
    g.canAct = false;
    g.touch.setVisible(false);
    g.ui.showTurnPick(g.players, this.pick, this.label, g.weather);
    g.ui.log(`— ${this.label} —`, 'turn');
    g.audio.beep(false);
  }

  updatePick(dt) {
    const g = this.g;
    const k = this.pick;
    k.timer -= dt;
    g.players.forEach((p, i) => {
      if (p.isCpu || k.picks[i] !== null) return;
      const d = g.input.get(p.device);
      // The 4 moves sit in a 2x2 grid (0 1 / 2 3) with the switches in a row below.
      const n = k.opts[i].length;
      const c = k.cursor[i];
      let nc = c;
      if (d.nav.right) nc = Math.min(n - 1, c + 1);
      if (d.nav.left) nc = Math.max(0, c - 1);
      if (d.nav.down) nc = c < 2 ? c + 2 : c < 4 ? Math.min(n - 1, 4) : Math.min(n - 1, c + 1);
      if (d.nav.up) nc = c >= 4 ? 2 : c >= 2 ? c - 2 : c;
      if (nc !== c) { k.cursor[i] = nc; g.audio.ui(); }
      if (d.pressed.confirm || d.pressed.attack) this.choose(i, k.cursor[i]);
    });
    g.ui.updateTurnPick(k);
    if (k.picks.every((x) => x !== null) || k.timer <= 0) this.resolve();
  }

  // Tapped / clicked or confirmed option `row` for player i.
  choose(i, row) {
    const k = this.pick;
    if (!k || k.picks[i] !== null) return;
    const o = k.opts[i][row];
    if (!o || !o.ok) { this.g.audio.uiBack(); return; }
    k.cursor[i] = row;
    k.picks[i] = row;
    this.g.audio.uiConfirm();
    this.g.ui.updateTurnPick(k);
  }

  // Showdown's effective Speed: base Speed x stat stage, halved by paralysis (Chlorophyll 2x in sun).
  speedOf(f) {
    let s = f.sp.baseStats.spe * stageMult(f.boosts.spe || 0);
    if (f.status && f.status.id === 'par') s *= 0.5;
    if (f.ability === 'chlorophyll' && this.g.weather && this.g.weather.id === 'sun') s *= 2;
    return s;
  }

  resolve() {
    const g = this.g;
    const k = this.pick;
    const acts = [];
    g.players.forEach((p, i) => {
      const o = k.picks[i] === null ? null : k.opts[i][k.picks[i]];
      if (!o) { acts.push({ i, kind: 'none', prio: -99, spe: 0, tie: 0 }); return; }
      const f = p.team[p.active];
      acts.push({ i, ...o, prio: o.kind === 'switch' ? 99 : (o.move.priority || 0), spe: this.speedOf(f), tie: Math.random() });
    });
    acts.sort((a, b) => b.prio - a.prio || b.spe - a.spe || a.tie - b.tie);
    this.pick = null;
    g.ui.hidePicks();
    this.queue = acts;
    this.cur = null;
    this.wait = 0.35;
    g.state = 'turnresolve';
  }

  updateResolve(dt) {
    const g = this.g;
    if (this.cur) {
      const c = this.cur;
      c.t += dt;
      if (!c.hit && c.t >= HIT_AT) { c.hit = true; c.onHit(); }
      if (c.t < c.dur) return;
      this.cur = null;
      this.wait = 0.15;
    }
    this.wait -= dt;
    if (this.wait > 0) return;
    const a = this.queue.shift();
    if (!a) { this.endTurn(); return; }
    this.wait = 0.2;
    const p = g.players[a.i];
    const f = p.team[p.active];
    const foePl = g.players[1 - a.i];
    const foe = foePl.team[foePl.active];
    if (a.kind === 'none') {
      g.ui.log(`${g.who(f)} is waiting to act.`);
    } else if (a.kind === 'switch') {
      g.ui.log(`${g.who(f)}, come back! Go! ${a.mon.sp.name}!`);
      g.performSwitch(a.i, a.idx, true);
      this.wait = 0.9;
    } else if (this.canAct(f)) {
      this.useMove(a, f, foe);
    } else {
      this.wait = 0.8;
    }
  }

  // Showdown's "can't move" checks: sleep, freeze, full paralysis, confusion.
  canAct(f) {
    const g = this.g;
    if (f.state === 'sleep') {
      if (Math.random() < 1 / 3) { f.toNeutral(); g.ui.log(`${g.who(f)} woke up!`); return true; }
      g.ui.log(`${g.who(f)} is fast asleep.`);
      return false;
    }
    if (f.state === 'frozen') {
      if (Math.random() < 0.2) { f.thaw(); return true; }
      g.ui.log(`${g.who(f)} is frozen solid!`);
      return false;
    }
    if (f.status && f.status.id === 'par' && Math.random() < 0.25) {
      g.ui.log(`${g.who(f)} is paralyzed! It can't move!`);
      g.onFullPara(f);
      return false;
    }
    if (f.confusion > 0) {
      g.ui.log(`${g.who(f)} is confused!`);
      if (Math.random() < 1 / 3) {
        f.percent = Math.min(999, f.percent + 4);
        f.flash = 1;
        g.ui.log('It hurt itself in its confusion!');
        return false;
      }
    }
    return true;
  }

  useMove(a, f, foe) {
    const g = this.g;
    const m = a.move;
    f.pp[a.slot] = Math.max(0, f.pp[a.slot] - 1);
    f.revealed.add(a.slot);
    g.ui.log(`${g.who(f)} used <b>${m.name}</b>!`);
    if (!a.field) this.lastUsed[a.i] = a.slot;
    // The attacker animates in place (contact moves lunge across); the attack flies over.
    f.sdAnim = { move: m, t0: g.realTime, dur: MOVE_TIME * 0.8, lunge: m.contact && m.cat !== 'status' };
    const color = parseInt((TYPE_COLORS[m.type] || '#ffffff').slice(1), 16);
    if (!a.field && !(m.contact && m.cat !== 'status')) g.effects.shot(g.sdSpotCenter(f), g.sdSpotCenter(foe), color, HIT_AT);
    this.cur = {
      t: 0, dur: MOVE_TIME, hit: false,
      onHit: () => (a.field ? this.fieldMove(f, m) : this.landMove(f, foe, m, color)),
    };
  }

  fieldMove(f, m) {
    const g = this.g;
    for (const ev of m.events) if (SELF_EVENTS.has(ev.do)) f.doEvent(ev);
    g.effects.ring(f.center.x, f.center.y, 0xffd23a, 2.2, 0.4);
  }

  landMove(f, foe, m, color) {
    const g = this.g;
    if ((m.accuracy ?? 100) < 100 && Math.random() * 100 >= m.accuracy) {
      g.ui.log(`${g.who(foe)} avoided the attack!`);
      g.audio.dodge(foe.pos.x);
      return;
    }
    const eff = moveEffect(m, foe.sp);
    if (eff === 0) {
      g.ui.log(`It doesn't affect ${g.who(foe)}…`);
      return;
    }
    f.moveSerial = (f.moveSerial || 0) + 1; // a fresh "use" for secondary / ability rolls
    if (m.cat === 'status') {
      const st = statusOf(m);
      const ok = st && foe.applyStatus(st, f);
      if (!ok) g.ui.log('But it failed!');
      else if (st === 'sleep') g.ui.log(`${g.who(foe)} fell asleep!`);
      else if (st === 'seed') g.ui.log(`${g.who(foe)} was seeded!`);
      this.hurt(foe, color, 0.4);
      return;
    }
    // Damage in % via Showdown's formula.
    if (foe.ability === 'lightningrod' && m.type === 'Electric') {
      g.onAbility(foe);
      if ((foe.boosts.spa || 0) < 6) foe.applyBoosts({ spa: 1 });
      return;
    }
    const d = damageFor(f, foe, (m.power || 40) * SD_DAMAGE, m);
    const dmg = Math.max(1, Math.round(d.damage));
    foe.percent = Math.min(999, foe.percent + dmg);
    foe.stats.damageTaken += dmg;
    f.stats.damageDealt += dmg;
    f.stats.hits++;
    foe.lastHitBy = f;
    foe.lastHitTime = g.time;
    foe.lastHitMove = m.name;
    if (d.eff > 1) g.ui.log("It's super effective!");
    else if (d.eff < 1) g.ui.log("It's not very effective…");
    g.ui.log(`${g.who(foe)} took ${dmg}%!`);
    this.hurt(foe, color, Math.min(1, 0.4 + dmg / 25));
    g.audio.hit(foe.pos.x, dmg, m.type, { sharp: /claw|tail|bite/i.test(m.anim || '') });
    if (d.eff > 1) g.audio.superEffective(foe.pos.x);
    // Secondary effects, contact abilities, drain, recoil, self stat changes (Close Combat).
    g.rollSecondary(f, foe, m, {});
    g.contactAbilities(f, foe, m, {});
    if (m.drain) {
      const heal = Math.round(dmg * m.drain);
      f.percent = Math.max(0, f.percent - heal);
      g.ui.log(`${g.who(foe)} had its energy drained!`);
    }
    if (m.recoilFrac) {
      f.percent = Math.min(999, f.percent + Math.round(dmg * m.recoilFrac));
      g.ui.log(`${g.who(f)} is damaged by the recoil!`);
    }
    for (const ev of m.events || []) if (ev.do === 'boost') f.doEvent(ev);
  }

  // The target's reaction: impact at its spot, a flinch, a flash.
  hurt(foe, color, k) {
    const g = this.g;
    const c = g.sdSpotCenter(foe);
    g.effects.impact(c.x, c.y, 0xffffff, 0.5 + k * 0.6, 0.16, c.z);
    g.effects.sparks(c.x, c.y, 0, 0, color, Math.round(6 + k * 12), 7, c.z);
    foe.sdHurt = { t0: g.realTime, dur: 0.45 };
    foe.flash = 1;
    g.shake(0.08 + k * 0.2);
  }

  endTurn() {
    this.queue = null;
    if (this.turn < SHOWDOWN_TURNS) this.startPick();
    else this.startSmash();
  }

  // After the last Showdown turn: fight! Each player's last move is charged for the fight.
  startSmash() {
    const g = this.g;
    g.players.forEach((p, i) => {
      const f = p.team[p.active];
      // Each round's fight starts from the start positions, where the Showdown turns played out.
      if (!f.dead && !f.onRevival) {
        f.pos.x = f.px = g.constructor.SD_SPOT[i].x;
        f.pos.y = f.py = 0;
        f.vel.x = f.vel.y = 0;
        f.grounded = true;
        f.platform = 'main';
        f.facing = i === 0 ? 1 : -1;
        if (!['sleep', 'frozen'].includes(f.state)) f.toNeutral();
      }
      const slot = this.lastUsed[i];
      f.called = slot && f.moveset.specials[slot] && f.moveset.specials[slot].slot === slot ? slot : null;
      if (f.called) g.popup(i, `CHARGED: ${f.moveset.specials[f.called].name.toUpperCase()}`, 'good');
    });
    this.t = SMASH_SECONDS;
    g.state = 'playing';
    g.canAct = true;
    g.ui.announce('FIGHT!', 'go', 900);
    g.ui.log(`— Round ${this.round}: FIGHT! —`, 'turn');
    g.audio.beep(true);
    g.touch.setVisible(g.players.some((p) => p.device === 'touch'));
  }

  // CPU command: set up / set weather when it helps, switch out of a bad matchup, status an
  // unstatused foe, otherwise its best attacking move.
  cpuCommand(i, opts) {
    const g = this.g;
    const p = g.players[i];
    const f = p.team[p.active];
    const foePl = g.players[1 - i];
    const foe = foePl.team[foePl.active];
    const here = matchupScore(f.sp, g.slotMoves(f), foe.sp);
    let best = -1;
    let bestScore = -Infinity;
    opts.forEach((o, k) => {
      if (!o.ok) return;
      let s = Math.random() * 0.4;
      if (o.kind === 'switch') {
        s += (matchupScore(o.mon.sp, g.slotMoves(o.mon), foe.sp) - here) * 1.2 - 0.6 - (o.mon.percent / 150);
      } else if (o.field) {
        const ev = o.move.events.find((e) => SELF_EVENTS.has(e.do));
        if (ev.do === 'boost') s += ((f.boosts.atk || 0) + (f.boosts.spa || 0) < 2 && f.percent < 90) ? 1.4 : -1;
        else if (ev.do === 'weather') {
          const mine = ev.weather === 'sun' ? 'Fire' : 'Water';
          const helps = Object.values(f.moveset.specials).some((m) => m.type === mine) || ['solarpower', 'chlorophyll', 'raindish'].includes(f.ability);
          s += g.weather && g.weather.id === ev.weather ? -2 : helps ? 1.3 : -0.5;
        } else if (ev.do === 'destinybond') s += f.percent > 100 ? 1.2 : -1;
      } else if (o.move.cat === 'status') {
        s += o.eff === 0 || foe.status || foe.state === 'sleep' ? -2 : 1.1;
      } else {
        s += (o.eff ?? 1) * (o.move.power || 60) / 80 + (f.sp.types.includes(o.move.type) ? 0.3 : 0);
        if (o.move.recovery) s -= 0.3;
      }
      if (s > bestScore) { bestScore = s; best = k; }
    });
    return best >= 0 ? best : null;
  }
}
