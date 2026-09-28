// On-screen controls for phones/tablets. Registers as the input device 'touch'.
// Left thumb: floating move stick. Right thumb: aim stick (a light pull aims down
// sights, pushing to the rim fires). Buttons: jump, exo, knife, frag, ability.

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) &&
  window.matchMedia('(pointer: coarse)').matches;

const STICK_R = 56;
const FIRE_AT = 0.62;

export class TouchControls {
  constructor(root) {
    this.raw = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimActive: false, autoFire: true, held: {} };
    this.el = document.createElement('div');
    this.el.className = 'touch-controls hidden';
    this.el.innerHTML = `
      <div class="t-zone t-left"></div>
      <div class="t-zone t-right"></div>
      <div class="t-stick" data-stick="move"><div class="t-knob"></div></div>
      <div class="t-stick t-aim" data-stick="aim"><div class="t-knob"></div><div class="t-ring"></div></div>
      <div class="t-buttons">
        <button data-b="jump" class="t-btn t-big">JUMP</button>
        <button data-b="exo" class="t-btn">EXO</button>
        <button data-b="knife" class="t-btn">KNIFE</button>
        <button data-b="grenade" class="t-btn">FRAG</button>
        <button data-b="ability" class="t-btn t-ability">SKILL</button>
      </div>
      <button data-b="start" class="t-btn t-pause">II</button>`;
    root.appendChild(this.el);
    this.sticks = {
      move: { el: this.el.querySelector('[data-stick="move"]'), id: null, ox: 0, oy: 0, x: 0, y: 0 },
      aim: { el: this.el.querySelector('[data-stick="aim"]'), id: null, ox: 0, oy: 0, x: 0, y: 0 },
    };
    this.buttons = new Map(); // touch id -> button name

    const zoneFor = (e) => (e.target.closest('.t-left') ? 'move' : e.target.closest('.t-right') ? 'aim' : null);
    this.el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-b]');
        if (btn) {
          this.buttons.set(t.identifier, btn.dataset.b);
          btn.classList.add('down');
          continue;
        }
        const which = zoneFor(t);
        const st = this.sticks[which];
        if (st && st.id === null) {
          st.id = t.identifier;
          st.ox = t.clientX;
          st.oy = t.clientY;
          st.x = st.y = 0;
          st.el.style.left = t.clientX + 'px';
          st.el.style.top = t.clientY + 'px';
          st.el.classList.add('on');
          this.moveKnob(st);
        }
      }
      this.sync();
    }, { passive: false });
    const move = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        for (const st of Object.values(this.sticks)) {
          if (st.id !== t.identifier) continue;
          let dx = (t.clientX - st.ox) / STICK_R;
          let dy = -(t.clientY - st.oy) / STICK_R;
          const m = Math.hypot(dx, dy);
          if (m > 1) { dx /= m; dy /= m; }
          st.x = dx;
          st.y = dy;
          this.moveKnob(st);
        }
      }
      this.sync();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        const b = this.buttons.get(t.identifier);
        if (b) {
          this.buttons.delete(t.identifier);
          if (![...this.buttons.values()].includes(b)) this.el.querySelector(`[data-b="${b}"]`).classList.remove('down');
        }
        for (const st of Object.values(this.sticks)) {
          if (st.id === t.identifier) {
            st.id = null;
            st.x = st.y = 0;
            st.el.classList.remove('on');
          }
        }
      }
      this.sync();
    };
    this.el.addEventListener('touchmove', move, { passive: false });
    this.el.addEventListener('touchend', end);
    this.el.addEventListener('touchcancel', end);
  }

  moveKnob(st) {
    st.el.firstElementChild.style.transform = `translate(${st.x * STICK_R}px, ${-st.y * STICK_R}px)`;
    if (st === this.sticks.aim) st.el.classList.toggle('firing', Math.hypot(st.x, st.y) >= FIRE_AT);
  }

  sync() {
    const r = this.raw;
    const mv = this.sticks.move;
    const am = this.sticks.aim;
    r.moveX = Math.abs(mv.x) > 0.2 ? mv.x : 0;
    r.moveY = Math.abs(mv.y) > 0.35 ? mv.y : 0;
    const aimMag = Math.hypot(am.x, am.y);
    r.aimActive = am.id !== null && aimMag > 0.2;
    r.aimX = am.x;
    r.aimY = am.y;
    const held = {};
    for (const b of this.buttons.values()) held[b] = true;
    held.fire = r.aimActive && aimMag >= FIRE_AT;
    held.ads = r.aimActive; // stays on while firing so a sniper charge carries into the shot
    held.down = r.moveY < -0.6;
    held.confirm = held.jump;
    held.back = false;
    r.held = held;
  }

  setVisible(v) {
    this.el.classList.toggle('hidden', !v);
    if (!v) {
      for (const st of Object.values(this.sticks)) { st.id = null; st.x = st.y = 0; st.el.classList.remove('on'); }
      this.buttons.clear();
      this.sync();
    }
  }

  setAbilityLabel(text) {
    this.el.querySelector('.t-ability').textContent = text;
  }
}
