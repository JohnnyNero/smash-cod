// SHOWDOWN mode: Pokémon Showdown's turn layer on top of the real-time fight.
//
// The battle runs in turns of TURN_SECONDS of real-time fighting. At the start of each turn the
// action freezes and both players secretly pick a command, like a Showdown turn:
//   - one of their 4 moves:
//       self / field moves (Swords Dance, Shell Smash, Sunny Day, Rain Dance, Destiny Bond) take
//       effect right away, in turn order;
//       attacking and targeted status moves become the "called" move for the turn: that
//       special hits 1.25x harder, its secondary effect always lands, and it costs no PP
//       for the rest of the turn;
//   - or a switch to a benched teammate (the only way to switch in this mode, besides pivots).
// Commands resolve in Showdown order (switches first, then priority, then Speed, ties random)
// and a Showdown-style battle log narrates them. Weather lasts WEATHER_TURNS turns here.
// Percent and ring-out KOs stay as they are: no HP bar.

import { stageMult } from './data/pokemon.js';
import { moveEffect } from './damage.js';
import { matchupScore } from './team.js';

export const TURN_SECONDS = 15;
export const PICK_SECONDS = 8;
const RESOLVE_STEP = 0.75; // seconds between resolved commands, so the log can be read
const SETTLE_MAX = 1.5; // wait up to this long after the clock runs out for the action to calm

const SELF_EVENTS = new Set(['boost', 'weather', 'destinybond']);
// A move that only affects its user or the field resolves at the start of the turn.
export const isFieldMove = (m) => !m.hitboxes && (m.events || []).length > 0
  && (m.events || []).every((e) => SELF_EVENTS.has(e.do) || e.do === 'fx' || e.do === 'vel');

const CALM = new Set(['ground', 'air', 'shield', 'landlag', 'taunt', 'helpless']);

export class ShowdownTurns {
  constructor(game) {
    this.g = game;
    this.n = 0;
    this.t = 0;
    this.pick = null;
    this.queue = null;
  }

  // Match start (after team preview): straight into turn 1's command pick.
  begin() {
    this.n = 0;
    this.startPick();
  }

  // Each sim step while playing: run the turn clock.
  step(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    const g = this.g;
    const calm = g.fighters.every((f) => !f.active || f.dead || f.onRevival || CALM.has(f.state));
    const projectiles = g.projectiles.length > 0;
    if ((calm && !projectiles) || this.t < -SETTLE_MAX) this.startPick();
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
    // End of the previous turn: called moves expire, weather counts down.
    for (const p of g.players) for (const f of p.team) f.called = null;
    if (g.weather && this.n > 1 && --g.weather.turns <= 0) g.endWeather();
    const opts = [0, 1].map((i) => this.options(i));
    this.pick = { picks: [null, null], cursor: [0, 0], timer: PICK_SECONDS, opts };
    g.players.forEach((p, i) => { if (p.isCpu) this.pick.picks[i] = this.cpuCommand(i, opts[i]); });
    g.state = 'turnpick';
    g.canAct = false;
    g.touch.setVisible(false);
    g.ui.showTurnPick(g.players, this.pick, this.n, g.weather);
    g.ui.log(`— Turn ${this.n} —`, 'turn');
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
      if (!o) { acts.push({ i, kind: 'none' }); return; }
      const f = p.team[p.active];
      acts.push({ i, ...o, prio: o.kind === 'switch' ? 99 : (o.move.priority || 0), spe: this.speedOf(f), tie: Math.random() });
    });
    acts.sort((a, b) => (b.prio ?? -99) - (a.prio ?? -99) || (b.spe ?? 0) - (a.spe ?? 0) || a.tie - b.tie);
    this.pick = null;
    g.ui.hidePicks();
    this.queue = acts;
    this.wait = 0.3;
    g.state = 'turnresolve';
  }

  updateResolve(dt) {
    this.wait -= dt;
    if (this.wait > 0) return;
    const g = this.g;
    const a = this.queue.shift();
    if (!a) { this.startFight(); return; }
    this.wait = RESOLVE_STEP;
    const p = g.players[a.i];
    const f = p.team[p.active];
    if (a.kind === 'none') {
      g.ui.log(`${g.who(f)} is waiting to act.`);
      this.wait = 0.2;
    } else if (a.kind === 'switch') {
      g.ui.log(`${g.who(f)} came back! Go! ${a.mon.sp.name}!`);
      g.performSwitch(a.i, a.idx, true);
    } else if (a.field) {
      // Self / field moves happen now.
      f.pp[a.slot]--;
      f.revealed.add(a.slot);
      g.ui.log(`${g.who(f)} used ${a.move.name}!`);
      for (const ev of a.move.events) if (SELF_EVENTS.has(ev.do)) f.doEvent(ev);
      g.effects.ring(f.center.x, f.center.y, 0xffd23a, 2.2, 0.4);
    } else {
      f.pp[a.slot]--;
      f.revealed.add(a.slot);
      f.called = a.slot;
      g.ui.log(`${g.who(f)} readies ${a.move.name}!`);
      g.effects.ring(f.center.x, f.center.y, 0xffd23a, 1.6, 0.3);
      g.popup(a.i, `CALLED: ${a.move.name.toUpperCase()}`, 'good');
    }
  }

  startFight() {
    const g = this.g;
    this.queue = null;
    this.t = TURN_SECONDS;
    g.state = 'playing';
    g.canAct = true;
    g.ui.announce(`TURN ${this.n}`, 'go', 700);
    g.audio.beep(true);
    g.touch.setVisible(g.players.some((p) => p.device === 'touch'));
  }

  // CPU command: set up / set weather when it helps, switch out of a bad matchup, call a status
  // move on an unstatused foe, otherwise call its best attacking move.
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
        if (o.move.recovery || o.slot === 'up') s -= 0.8; // it's the recovery: rarely the best move to call
      }
      if (s > bestScore) { bestScore = s; best = k; }
    });
    return best >= 0 ? best : null;
  }
}
