// DOM overlay: title, Pokémon select, HUD, killfeed, announcer, pause, results.
// Every menu element is also clickable/tappable and reports through `onAction`.

import { TYPE_COLORS } from './config.js';
import { moveInfo } from './data/moveset.js';
import { SPECIES } from './data/pokemon.js';

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  return e;
};

const typeChip = (t) => `<span class="type" style="--tc:${TYPE_COLORS[t] || '#888'}">${t.toUpperCase()}</span>`;
const SLOT_LABEL = { neutral: 'B', side: '→B', up: '↑B', down: '↓B' };

function percentColor(p) {
  const stops = [[0, [255, 255, 255]], [50, [255, 236, 120]], [100, [255, 150, 60]], [150, [255, 60, 50]], [220, [150, 10, 20]]];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i][0] && p <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  }
  if (p > b[0]) a = b;
  const k = b[0] === a[0] ? 0 : (p - a[0]) / (b[0] - a[0]);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * k));
  return `rgb(${c.join(',')})`;
}

const CONTROLS = `
  <div class="controls">
    <div><h4>GAMEPAD</h4>
      <p><b>L-stick</b> move · <b>X</b> jump</p>
      <p><b>A</b> attack (+ direction) · <b>R-stick</b> smash</p>
      <p><b>B</b> special (+ direction = 4 moves)</p>
      <p><b>RB/LT/RT</b> shield · <b>LB</b> grab · <b>Y</b> + ◀▲▶ switch</p></div>
    <div><h4>KEYBOARD P1</h4>
      <p><b>WASD</b> move · <b>Space</b> jump</p>
      <p><b>F</b> attack · tap dir + <b>F</b> = smash</p>
      <p><b>G</b> special · <b>H</b> shield · <b>R</b> grab · <b>T</b> switch</p></div>
    <div><h4>KEYBOARD P2</h4>
      <p><b>Arrows</b> move · <b>'</b> jump</p>
      <p><b>/</b> attack · <b>.</b> special</p>
      <p><b>,</b> shield · <b>;</b> grab · <b>L</b> switch</p></div>
    <div><h4>TOUCH</h4>
      <p><b>Left thumb</b> move</p>
      <p><b>ATTACK / SPECIAL</b> + stick direction</p>
      <p>Flick + ATTACK = smash · SWAP + stick = switch</p></div>
  </div>`;

export class UI {
  constructor(root) {
    this.root = root;
    this.onAction = () => {};
    this.screens = {};
    for (const name of ['title', 'select', 'hud', 'picks', 'pause', 'results']) {
      const s = el('div', `screen ${name} hidden`);
      root.appendChild(s);
      this.screens[name] = s;
    }
    this.announcer = el('div', 'announcer');
    this.killfeed = el('div', 'killfeed');
    this.rotate = el('div', 'rotate-hint', '<div>↻</div><p>Rotate your phone to landscape</p>');
    root.append(this.announcer, this.killfeed, this.rotate);

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const d = t.dataset;
      e.stopPropagation();
      this.onAction({ type: d.action, slot: d.slot !== undefined ? +d.slot : undefined, dir: d.dir ? +d.dir : 0, row: d.row });
    });

    this.buildTitle();
  }

  show(...names) {
    for (const [n, s] of Object.entries(this.screens)) {
      if (n !== 'picks') s.classList.toggle('hidden', !names.includes(n));
    }
  }

  buildTitle() {
    this.screens.title.innerHTML = `
      <div class="title-card" data-action="title">
        <div class="logo"><span class="l1">SHOWDOWN</span><span class="l2">SMASH</span></div>
        <div class="subtitle">POKÉMON STRATEGY · SMASH BATTLES · 1v1</div>
        <div class="press">PRESS <b>A</b> · <b>SPACE</b> · <b>ENTER</b> · OR TAP TO START</div>
      </div>
      ${CONTROLS}`;
  }

  // --- Select screen -------------------------------------------------------

  renderSelect(m) {
    const cards = m.slots.map((s, i) => {
      const color = s.color;
      if (!s.joined) {
        return `<div class="card empty" style="--pc:${color}">
          <div class="card-head"><span class="pn">P${i + 1}</span></div>
          <div class="join" data-action="join" data-slot="${i}">
            <div class="big">PRESS <b>A</b> TO JOIN</div>
            <div class="small">${i === 1 ? 'or set <b>CPU</b> in P1\'s rules' : 'gamepad · keyboard · tap here'}</div>
          </div></div>`;
      }
      const mem = s.team[s.focus];
      const sp = SPECIES[mem.species];
      const b = sp.baseStats;
      const moves = Object.entries(mem.moves).map(([slot, id]) => {
        const mv = moveInfo(id);
        return `<div class="mv" style="--tc:${TYPE_COLORS[mv.type]}"><i>${SLOT_LABEL[slot]}</i>${mv.name}<small>${mv.pp} PP</small></div>`;
      }).join('');
      const rows = s.rows.map((r, ri) => {
        const sel = s.row === ri && !s.ready ? 'sel' : '';
        if (r.key === 'ready') {
          return `<div class="row ready-row ${sel}"><button class="ready-btn" data-action="ready" data-slot="${i}">${s.ready ? '✔ READY' : 'READY UP'}</button></div>`;
        }
        if (r.key === 'done') {
          return `<div class="row ready-row ${sel}"><button class="ready-btn" data-action="edit" data-slot="${i}" data-row="done">✔ DONE</button></div>`;
        }
        let val = r.value;
        let extra = '';
        if (r.key.startsWith('mon:')) {
          const msp = SPECIES[s.team[+r.key.slice(4)].species];
          val = `<button class="val-btn" data-action="edit" data-slot="${i}" data-row="${r.key}">${r.value}</button>`;
          extra = `<span class="mini-types">${msp.types.map(typeChip).join('')}</span>`;
        } else if (r.key.startsWith('mv:')) {
          const mv = moveInfo(mem.moves[r.key.slice(3)]);
          val = `<span style="color:${TYPE_COLORS[mv.type]}">${r.value}</span>`;
          extra = `<span class="mv-meta">${mv.type.toUpperCase()} · ${mv.cat.toUpperCase()}${mv.power ? ' · ' + mv.power + ' BP' : ''} · ${mv.pp} PP</span>`;
        }
        return `<div class="row ${sel}">
          <span class="lbl">${r.label}</span>
          <button class="arrow" data-action="change" data-slot="${i}" data-row="${r.key}" data-dir="-1">◀</button>
          <span class="val">${val}</span>
          <button class="arrow" data-action="change" data-slot="${i}" data-row="${r.key}" data-dir="1">▶</button>
          ${extra}
        </div>`;
      }).join('');
      const teamLine = m.mode === 'TEAM'
        ? `<div class="team-line">${s.team.map((t, k) => `<span class="${k === s.focus ? 'on' : ''}">${SPECIES[t.species].name}</span>`).join('')}</div>`
        : '';
      const editing = `<div class="editing">EDITING ${sp.name.toUpperCase()}'S MOVES · 4 from its real learnset</div>`;
      return `<div class="card ${s.ready ? 'is-ready' : ''}" style="--pc:${color}">
        <div class="card-head"><span class="pn">P${i + 1}</span><span class="dev">${s.deviceLabel}</span>
          ${s.cpu ? '' : `<button class="leave" data-action="leave" data-slot="${i}">✕</button>`}</div>
        ${teamLine}
        <div class="op-name">${sp.name.toUpperCase()}<small>${sp.types.map(typeChip).join(' ')}</small></div>
        <div class="op-blurb">${sp.blurb}</div>
        <div class="stats">
          ${this.statBar('HP', b.hp / 150)}${this.statBar('ATK', b.atk / 150)}${this.statBar('DEF', b.def / 150)}
          ${this.statBar('SPA', b.spa / 150)}${this.statBar('SPD', b.spd / 150)}${this.statBar('SPE', b.spe / 150)}
        </div>
        ${s.edit >= 0 ? editing : `<div class="moves">${moves}</div>`}
        ${s.cpu ? `<div class="cpu-badge">CPU · ${m.cpuName}</div>` : rows}
      </div>`;
    }).join('');
    this.screens.select.innerHTML = `
      <div class="select-top"><h2>${m.mode === 'TEAM' ? 'BUILD YOUR TEAM' : 'CHOOSE YOUR POKÉMON'}</h2><div class="rules">${m.rulesText}</div></div>
      <div class="cards">${cards}</div>
      <div class="select-hint">${m.hint}</div>
      ${m.canStart ? '<button class="start-btn" data-action="start">BATTLE ▶</button>' : ''}`;
  }

  statBar(label, v) {
    const pct = Math.max(0.05, Math.min(1, v)) * 100;
    return `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }

  // --- HUD -----------------------------------------------------------------

  // players: [{ slot, team: [Fighter], active, isCpu }]. Each card shows the active Pokémon;
  // in team mode it also has a team strip, and moves stay hidden until they've been used.
  buildHUD(players, settings, teamMode) {
    const h = this.screens.hud;
    h.innerHTML = `<div class="timer hidden"></div><div class="hud-cards"></div>`;
    this.timerEl = h.querySelector('.timer');
    this.timerEl.classList.toggle('hidden', settings.mode !== 2);
    this.teamMode = teamMode;
    const wrap = h.querySelector('.hud-cards');
    this.hudCards = players.map((p) => {
      const c = el('div', 'hud-card');
      c.style.setProperty('--pc', p.team[0].colors.css);
      wrap.appendChild(c);
      return { root: c, fighter: null, last: {} };
    });
    this.killfeed.innerHTML = '';
  }

  buildCard(c, f, p) {
    const moves = Object.entries(f.moveset.specials).map(([slot, mv]) =>
      `<div class="pp" data-slot="${slot}" style="--tc:${TYPE_COLORS[mv.type]}"><i>${SLOT_LABEL[slot]}</i><span class="pn2"></span><b></b></div>`).join('');
    const strip = this.teamMode
      ? `<div class="team-strip">${p.team.map((t, k) => `<span data-k="${k}"><i>${['◀', '▲', '▶'][k]}</i>${t.sp.name}<b></b></span>`).join('')}</div>`
      : '';
    c.root.innerHTML = `
      <div class="portrait" style="background:${f.colors.css}">${f.sp.name[0]}</div>
      <div class="info">
        <div class="name">${f.sp.name.toUpperCase()} <small>P${f.slot + 1}${f.isCpu ? ' · CPU' : ''}</small></div>
        <div class="types">${f.sp.types.map(typeChip).join('')}</div>
        <div class="pct"><span class="num">0</span><span class="sign">%</span></div>
        <div class="stocks"></div>
        <div class="status"></div>
      </div>
      <div class="loadout">${moves}</div>
      ${strip}
      <div class="popups"></div>`;
    c.fighter = f;
    c.last = {};
    c.num = c.root.querySelector('.num');
    c.pct = c.root.querySelector('.pct');
    c.stocks = c.root.querySelector('.stocks');
    c.status = c.root.querySelector('.status');
    c.pp = Object.fromEntries([...c.root.querySelectorAll('.pp')].map((e) => [e.dataset.slot, e]));
    c.strip = [...c.root.querySelectorAll('.team-strip span')];
    c.popups = c.root.querySelector('.popups');
  }

  updateHUD(players, settings, timeLeft) {
    players.forEach((pl, i) => {
      const c = this.hudCards[i];
      if (!c) return;
      const f = pl.team[pl.active];
      if (c.fighter !== f) this.buildCard(c, f, pl);
      const L = c.last;
      const p = Math.floor(f.percent);
      const set = (key, val, fn) => { if (L[key] !== val) { L[key] = val; fn(val); } };
      set('pct', p, (v) => {
        c.num.textContent = v;
        c.pct.style.color = percentColor(v);
        c.pct.classList.remove('bump');
        void c.pct.offsetWidth;
        if (v > 0) c.pct.classList.add('bump');
      });
      set('dead', f.dead || f.eliminated, (v) => c.root.classList.toggle('dead', v));
      const stocksKey = this.teamMode ? 'team' : settings.mode === 1 ? f.stocks : `S${f.stats.kos - f.stats.falls}`;
      set('stocks', stocksKey, () => {
        c.stocks.innerHTML = this.teamMode ? ''
          : settings.mode === 1
            ? Array.from({ length: Math.max(0, f.stocks) }, () => '<i></i>').join('')
            : `<span class="score">SCORE ${f.stats.kos - f.stats.falls >= 0 ? '+' : ''}${f.stats.kos - f.stats.falls}</span>`;
      });
      // Stat stages and status, like Showdown's HUD.
      const tags = Object.entries(f.boosts).filter(([, v]) => v)
        .map(([k, v]) => `<span class="${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v} ${k.toUpperCase()}</span>`);
      if (f.state === 'sleep') tags.push('<span class="slp">SLP</span>');
      if (f.seed) tags.push('<span class="seed">SEEDED</span>');
      if (f.destinyBond > 0) tags.push('<span class="bond">BOND</span>');
      set('status', tags.join(''), (v) => { c.status.innerHTML = v; });
      for (const [slot, e] of Object.entries(c.pp)) {
        const pp = f.pp[slot];
        const mv = f.moveset.specials[slot];
        const known = !this.teamMode || f.revealed.has(slot); // Showdown: moves are secret until used
        set('pp' + slot, `${pp}${known}`, () => {
          e.querySelector('.pn2').textContent = known ? mv.name : '???';
          e.querySelector('b').textContent = !known ? '' : pp > 0 ? `${pp}/${mv.pp}` : 'STRUGGLE';
          e.style.setProperty('--tc', known ? TYPE_COLORS[mv.type] : '#555');
          e.classList.toggle('low', pp > 0 && pp <= Math.ceil(mv.pp / 4));
          e.classList.toggle('out', pp <= 0);
        });
      }
      c.strip.forEach((chip, k) => {
        const t = pl.team[k];
        const key = `${Math.floor(t.percent)}${t.eliminated}${k === pl.active}`;
        set('strip' + k, key, () => {
          chip.querySelector('b').textContent = t.eliminated ? '✕' : `${Math.floor(t.percent)}%`;
          chip.classList.toggle('fainted', t.eliminated);
          chip.classList.toggle('active', k === pl.active);
        });
      });
    });
    if (settings.mode === 2 && this.timerEl) {
      const t = Math.max(0, Math.ceil(timeLeft));
      const txt = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      if (this.timerEl.textContent !== txt) {
        this.timerEl.textContent = txt;
        this.timerEl.classList.toggle('urgent', t <= 10);
      }
    }
  }

  // --- Team preview and hidden KO picks ------------------------------------

  // Both use the same overlay: each player's team is shown with its public ◀ ▲ ▶ mapping;
  // choices are hidden until both lock in.
  renderPicks(title, sub, players, k, showPct) {
    const cols = players.map((p, i) => {
      const mons = p.team.map((f, idx) => {
        const cls = f.eliminated ? 'fainted' : (showPct && idx === p.active && !k.needs[i]) ? 'in' : '';
        return `<button class="pick-mon ${cls}" data-action="pick" data-slot="${i}" data-row="${idx}" style="--pc:${f.colors.css}">
          <i>${['◀', '▲', '▶'][idx]}</i><span class="nm">${f.sp.name.toUpperCase()}</span>
          <span class="tp">${f.sp.types.map(typeChip).join('')}</span>
          ${showPct ? `<span class="pc">${f.eliminated ? 'FAINTED' : Math.floor(f.percent) + '%'}${cls === 'in' ? ' · IN' : ''}</span>` : ''}
        </button>`;
      }).join('');
      const role = !showPct ? 'Pick your lead' : k.needs[i] ? 'Pick your next Pokémon' : 'Stay in (▼ / A) or switch';
      return `<div class="pick-col" style="--pc:${p.team[0].colors.css}">
        <div class="pick-head">P${i + 1}${p.isCpu ? ' · CPU' : ''}<small>${role}</small></div>
        <div class="pick-mons">${mons}</div>
        <div class="pick-lock" data-lock="${i}">CHOOSING…</div>
      </div>`;
    }).join('<div class="pick-vs">VS</div>');
    this.screens.picks.innerHTML = `<div class="pick-panel">
      <h2>${title}</h2><div class="pick-sub">${sub}</div>
      <div class="pick-cols">${cols}</div>
      <div class="pick-timer"><i></i></div></div>`;
    this.screens.picks.classList.remove('hidden');
    this.pickMax = k.timer;
    this.updatePicks(k);
  }

  showPreview(players, k) {
    this.show();
    this.renderPicks('TEAM PREVIEW', 'Moves stay secret until used. Press <b>◀ ▲ ▶</b> (or tap) to pick your lead in secret.', players, k, false);
  }

  showKOPick(players, k) {
    this.renderPicks('KO!', 'Both players choose in secret: <b>◀ ▲ ▶</b> picks a Pokémon, <b>▼ / A</b> stays in. Revealed together.', players, k, true);
  }

  updatePicks(k) {
    const root = this.screens.picks;
    k.picks.forEach((v, i) => {
      const e = root.querySelector(`[data-lock="${i}"]`);
      if (e) {
        e.textContent = v === null ? 'CHOOSING…' : '✔ LOCKED IN';
        e.classList.toggle('locked', v !== null);
      }
    });
    const bar = root.querySelector('.pick-timer i');
    if (bar) bar.style.width = `${Math.max(0, k.timer / this.pickMax) * 100}%`;
  }

  hidePicks() {
    this.screens.picks.classList.add('hidden');
    this.screens.picks.innerHTML = '';
  }

  popup(slot, text, cls = '', color = null) {
    const c = this.hudCards && this.hudCards[slot];
    if (!c) return;
    const p = el('div', `popup ${cls}`, text);
    if (color) p.style.color = color;
    c.popups.appendChild(p);
    setTimeout(() => p.remove(), 1600);
  }

  announce(text, cls = '', ms = 1200) {
    const a = el('div', `announce ${cls}`, text);
    this.announcer.innerHTML = '';
    this.announcer.appendChild(a);
    clearTimeout(this.annTimer);
    this.annTimer = setTimeout(() => a.remove(), ms);
  }

  feed(killer, moveName, victim) {
    const item = el('div', 'feed-item', killer
      ? `<b style="color:${killer.colors.css}">${killer.sp.name}</b><span class="w">${moveName}</span><b style="color:${victim.colors.css}">${victim.sp.name}</b>`
      : `<b style="color:${victim.colors.css}">${victim.sp.name}</b><span class="w">SELF-DESTRUCTED</span>`);
    this.killfeed.prepend(item);
    while (this.killfeed.children.length > 4) this.killfeed.lastChild.remove();
    setTimeout(() => item.classList.add('fade'), 4000);
    setTimeout(() => item.remove(), 4600);
  }

  showPause(show) {
    this.screens.pause.classList.toggle('hidden', !show);
    if (show) {
      this.screens.pause.innerHTML = `<div class="panel"><h2>PAUSED</h2>
        <button data-action="resume">RESUME <small>START / ESC</small></button>
        <button data-action="quit">QUIT TO SELECT <small>B / BACKSPACE</small></button></div>${CONTROLS}`;
    }
  }

  // winner: winning player's slot or null; summaries: per-player team totals.
  showResults(winner, summaries) {
    const s = this.screens.results;
    const w = winner === null || winner === undefined ? null : summaries[winner];
    const rows = [
      ['KOs', (f) => f.stats.kos],
      ['FALLS', (f) => f.stats.falls],
      ['SELF-DESTRUCTS', (f) => f.stats.sds],
      ['DAMAGE DEALT', (f) => Math.round(f.stats.damageDealt) + '%'],
      ['HITS LANDED', (f) => f.stats.hits],
    ];
    s.innerHTML = `<div class="panel">
      <div class="winner" style="--pc:${w ? w.colors.css : '#fff'}">${w ? `P${w.slot + 1} WINS` : 'DRAW'}</div>
      <table><tr><th></th>${summaries.map((f) => `<th style="color:${f.colors.css}">P${f.slot + 1}<br><small>${f.label}</small></th>`).join('')}</tr>
      ${rows.map(([k, fn]) => `<tr><td>${k}</td>${summaries.map((f) => `<td>${fn(f)}</td>`).join('')}</tr>`).join('')}
      </table>
      <div class="result-btns">
        <button data-action="rematch">REMATCH <small>A / SPACE / ENTER</small></button>
        <button data-action="toSelect">CHANGE TEAM <small>B / G / BACKSPACE</small></button>
      </div></div>`;
    this.show('results');
  }
}
