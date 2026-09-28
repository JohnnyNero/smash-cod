// DOM overlay: title, character/loadout select, HUD, killfeed, announcer, pause, results.
// Every menu element is also clickable/tappable and reports through `onAction`.

import { OPERATORS, WEAPONS, GRENADE, SHIELD, DASH } from './config.js';

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  return e;
};

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
      <p><b>L-stick</b> move · <b>R-stick</b> aim</p>
      <p><b>A</b> jump · <b>RT</b> fire · <b>LT</b> aim down sights</p>
      <p><b>X</b> knife · <b>RB</b> frag · <b>B</b> exo boost</p>
      <p><b>LB</b> ability · <b>Y</b> reload · <b>↓</b> drop / fast fall</p></div>
    <div><h4>KEYBOARD P1</h4>
      <p><b>A/D</b> move · <b>W</b> jump + aim up · <b>S</b> drop</p>
      <p><b>F</b> fire · <b>V</b> ADS · <b>G</b> knife · <b>H</b> frag</p>
      <p><b>C</b> exo · <b>T</b> ability · <b>R</b> reload</p></div>
    <div><h4>KEYBOARD P2</h4>
      <p><b>Arrows</b> move / jump / drop</p>
      <p><b>/</b> fire · <b>R-Shift</b> ADS · <b>.</b> knife · <b>,</b> frag</p>
      <p><b>;</b> exo · <b>'</b> ability · <b>P</b> reload</p></div>
    <div><h4>TOUCH</h4>
      <p><b>Left thumb</b> move · <b>Right thumb</b> aim</p>
      <p>Light pull = aim down sights</p>
      <p>Push to the rim = fire</p></div>
  </div>`;

export class UI {
  constructor(root) {
    this.root = root;
    this.onAction = () => {};
    this.screens = {};
    for (const name of ['title', 'select', 'hud', 'pause', 'results']) {
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
      this.onAction({ type: d.action, slot: d.slot !== undefined ? +d.slot : undefined, dir: d.dir ? +d.dir : 0, row: d.row });
    });

    this.buildTitle();
  }

  show(...names) {
    for (const [n, s] of Object.entries(this.screens)) s.classList.toggle('hidden', !names.includes(n));
  }

  buildTitle() {
    this.screens.title.innerHTML = `
      <div class="title-card" data-action="title">
        <div class="logo"><span class="l1">SMASH</span><span class="l2">OPS</span></div>
        <div class="subtitle">1v1 COUCH COMBAT · KNOCK THEM OFF THE MAP</div>
        <div class="press">PRESS <b>A</b> · <b>SPACE</b> · <b>ENTER</b> · OR TAP TO DEPLOY</div>
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
      const op = OPERATORS[s.op];
      const wp = WEAPONS[s.weapon];
      const rows = s.rows.map((r, ri) => `
        <div class="row ${s.row === ri && !s.ready ? 'sel' : ''} ${r.key === 'ready' ? 'ready-row' : ''}">
          ${r.key === 'ready'
            ? `<button class="ready-btn" data-action="ready" data-slot="${i}">${s.ready ? '✔ READY' : 'READY UP'}</button>`
            : `<span class="lbl">${r.label}</span>
               <button class="arrow" data-action="change" data-slot="${i}" data-row="${r.key}" data-dir="-1">◀</button>
               <span class="val">${r.value}</span>
               <button class="arrow" data-action="change" data-slot="${i}" data-row="${r.key}" data-dir="1">▶</button>`}
        </div>`).join('');
      return `<div class="card ${s.ready ? 'is-ready' : ''}" style="--pc:${color}">
        <div class="card-head"><span class="pn">P${i + 1}</span><span class="dev">${s.deviceLabel}</span>
          ${s.cpu ? '' : `<button class="leave" data-action="leave" data-slot="${i}">✕</button>`}</div>
        <div class="op-name">${op.name}<small>${op.role}</small></div>
        <div class="op-blurb">${op.blurb}</div>
        <div class="stats">
          ${this.statBar('WEIGHT', (op.weight - 0.7) / 0.6)}
          ${this.statBar('SPEED', (op.runSpeed - 5) / 5)}
          ${this.statBar('JUMPS', (op.airJumps + 1) / 3)}
        </div>
        <div class="wp-name">${wp.type} · ${wp.name}</div>
        <div class="wp-blurb">${wp.blurb}</div>
        ${s.cpu ? `<div class="cpu-badge">CPU · ${m.cpuName}</div>` : rows}
      </div>`;
    }).join('');
    this.screens.select.innerHTML = `
      <div class="select-top"><h2>CREATE-A-CLASS</h2><div class="rules">${m.rulesText}</div></div>
      <div class="cards">${cards}</div>
      <div class="select-hint">${m.hint}</div>
      ${m.canStart ? '<button class="start-btn" data-action="start">DEPLOY ▶</button>' : ''}`;
  }

  statBar(label, v) {
    const pct = Math.max(0.08, Math.min(1, v)) * 100;
    return `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }

  // --- HUD -----------------------------------------------------------------

  buildHUD(fighters, settings) {
    const h = this.screens.hud;
    h.innerHTML = `<div class="timer hidden"></div><div class="hud-cards"></div>`;
    this.timerEl = h.querySelector('.timer');
    this.timerEl.classList.toggle('hidden', settings.mode !== 1);
    const wrap = h.querySelector('.hud-cards');
    this.hudCards = fighters.map((f) => {
      const c = el('div', 'hud-card', `
        <div class="portrait" style="background:${f.colors.css}">${f.op.name[0]}</div>
        <div class="info">
          <div class="name">${f.op.name} <small>P${f.slot + 1}${f.isCpu ? ' · CPU' : ''}</small></div>
          <div class="pct"><span class="num">0</span><span class="sign">%</span></div>
          <div class="stocks"></div>
        </div>
        <div class="loadout">
          <div class="ammo"><span class="wn">${f.weapon.type}</span><span class="count"></span></div>
          <div class="reload-bar"><i></i></div>
          <div class="gear"><span class="nades"></span><span class="ability">${f.op.ability.name}<i></i></span></div>
        </div>
        <div class="popups"></div>`);
      c.style.setProperty('--pc', f.colors.css);
      wrap.appendChild(c);
      return {
        root: c,
        num: c.querySelector('.num'),
        pct: c.querySelector('.pct'),
        stocks: c.querySelector('.stocks'),
        count: c.querySelector('.count'),
        reload: c.querySelector('.reload-bar'),
        reloadFill: c.querySelector('.reload-bar i'),
        nades: c.querySelector('.nades'),
        abilityFill: c.querySelector('.ability i'),
        popups: c.querySelector('.popups'),
        last: {},
      };
    });
    this.killfeed.innerHTML = '';
  }

  updateHUD(fighters, settings, timeLeft) {
    fighters.forEach((f, i) => {
      const c = this.hudCards[i];
      if (!c) return;
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
      const stocksKey = settings.mode === 0 ? f.stocks : `S${f.stats.kos - f.stats.falls}`;
      set('stocks', stocksKey, () => {
        c.stocks.innerHTML = settings.mode === 0
          ? Array.from({ length: Math.max(0, f.stocks) }, () => '<i></i>').join('')
          : `<span class="score">SCORE ${f.stats.kos - f.stats.falls >= 0 ? '+' : ''}${f.stats.kos - f.stats.falls}</span>`;
      });
      const reloading = f.reloadTimer > 0;
      set('ammo', reloading ? 'R' : f.ammo, () => {
        c.count.textContent = reloading ? 'RELOADING' : `${f.ammo}/${f.weapon.mag}`;
        c.count.classList.toggle('low', !reloading && f.ammo <= Math.ceil(f.weapon.mag * 0.25));
      });
      c.reload.style.visibility = reloading ? 'visible' : 'hidden';
      if (reloading) c.reloadFill.style.width = `${(1 - f.reloadTimer / f.weapon.reload) * 100}%`;
      set('nades', f.grenades, (v) => {
        c.nades.innerHTML = Array.from({ length: GRENADE.max }, (_, k) => `<i class="${k < v ? 'on' : ''}"></i>`).join('');
      });
      let ab;
      if (f.op.ability.id === 'shield') ab = f.shieldBroken > 0 ? 0 : f.shieldHP / SHIELD.hp;
      else ab = f.dashCooldown > 0 ? 1 - f.dashCooldown / DASH.cooldown : 1;
      c.abilityFill.style.width = `${Math.max(0, Math.min(1, ab)) * 100}%`;
    });
    if (settings.mode === 1 && this.timerEl) {
      const t = Math.max(0, Math.ceil(timeLeft));
      const txt = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      if (this.timerEl.textContent !== txt) {
        this.timerEl.textContent = txt;
        this.timerEl.classList.toggle('urgent', t <= 10);
      }
    }
  }

  popup(slot, text, cls = '') {
    const c = this.hudCards && this.hudCards[slot];
    if (!c) return;
    const p = el('div', `popup ${cls}`, text);
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

  feed(killer, weaponName, victim) {
    const item = el('div', 'feed-item', killer
      ? `<b style="color:${killer.colors.css}">${killer.op.name}</b><span class="w">[${weaponName}]</span><b style="color:${victim.colors.css}">${victim.op.name}</b>`
      : `<b style="color:${victim.colors.css}">${victim.op.name}</b><span class="w">SELF-DESTRUCTED</span>`);
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
        <button data-action="quit">QUIT TO LOADOUT <small>B / BACKSPACE</small></button></div>${CONTROLS}`;
    }
  }

  showResults(winner, fighters) {
    const s = this.screens.results;
    const rows = [
      ['KOs', (f) => f.stats.kos],
      ['FALLS', (f) => f.stats.falls],
      ['SELF-DESTRUCTS', (f) => f.stats.sds],
      ['DAMAGE DEALT', (f) => Math.round(f.stats.damageDealt) + '%'],
      ['ACCURACY', (f) => (f.stats.shots ? Math.round((f.stats.hits / f.stats.shots) * 100) : 0) + '%'],
    ];
    s.innerHTML = `<div class="panel">
      <div class="winner" style="--pc:${winner ? winner.colors.css : '#fff'}">${winner ? `${winner.op.name} <small>P${winner.slot + 1}</small> WINS` : 'DRAW'}</div>
      <table><tr><th></th>${fighters.map((f) => `<th style="color:${f.colors.css}">P${f.slot + 1} ${f.op.name}</th>`).join('')}</tr>
      ${rows.map(([k, fn]) => `<tr><td>${k}</td>${fighters.map((f) => `<td>${fn(f)}</td>`).join('')}</tr>`).join('')}
      </table>
      <div class="result-btns">
        <button data-action="rematch">REMATCH <small>A / SPACE / ENTER</small></button>
        <button data-action="toSelect">CHANGE LOADOUT <small>B / G / BACKSPACE</small></button>
      </div></div>`;
    this.show('results');
  }
}
