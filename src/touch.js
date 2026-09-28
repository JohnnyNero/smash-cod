// On-screen controls for phones/tablets. Registers as the input device 'touch'.
// Left thumb: floating move stick. Right thumb: ATTACK / SPECIAL / JUMP / SHIELD / GRAB.
// Flick the stick and tap ATTACK together for a smash attack, just like on a controller.

export const isTouchDevice = () =>
  typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) &&
  window.matchMedia('(pointer: coarse)').matches;

const STICK_R = 56;

export class TouchControls {
  constructor(root) {
    this.raw = { moveX: 0, moveY: 0, held: {} };
    this.el = document.createElement('div');
    this.el.className = 'touch-controls hidden';
    this.el.innerHTML = `
      <div class="t-zone t-left"></div>
      <div class="t-stick" data-stick="move"><div class="t-knob"></div></div>
      <div class="t-buttons">
        <button data-b="grab" class="t-btn t-grab">GRAB</button>
        <button data-b="shield" class="t-btn t-shield">SHIELD</button>
        <button data-b="special" class="t-btn t-special">SPECIAL</button>
        <button data-b="jump" class="t-btn t-jump">JUMP</button>
        <button data-b="attack" class="t-btn t-attack">ATTACK</button>
      </div>
      <button data-b="swap" class="t-btn t-swap">SWAP</button>
      <button data-b="start" class="t-btn t-pause">II</button>`;
    root.appendChild(this.el);
    this.stick = { el: this.el.querySelector('[data-stick="move"]'), id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.buttons = new Map(); // touch id -> button name

    this.el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const btn = t.target.closest && t.target.closest('[data-b]');
        if (btn) {
          this.buttons.set(t.identifier, btn.dataset.b);
          btn.classList.add('down');
          continue;
        }
        const st = this.stick;
        if (t.target.closest('.t-left') && st.id === null) {
          st.id = t.identifier;
          st.ox = t.clientX;
          st.oy = t.clientY;
          st.x = st.y = 0;
          st.el.style.left = t.clientX + 'px';
          st.el.style.top = t.clientY + 'px';
          st.el.classList.add('on');
          this.moveKnob();
        }
      }
      this.sync();
    }, { passive: false });
    const move = (e) => {
      e.preventDefault();
      const st = this.stick;
      for (const t of e.changedTouches) {
        if (st.id !== t.identifier) continue;
        let dx = (t.clientX - st.ox) / STICK_R;
        let dy = -(t.clientY - st.oy) / STICK_R;
        const m = Math.hypot(dx, dy);
        if (m > 1) { dx /= m; dy /= m; }
        st.x = dx;
        st.y = dy;
        this.moveKnob();
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
        if (this.stick.id === t.identifier) {
          this.stick.id = null;
          this.stick.x = this.stick.y = 0;
          this.stick.el.classList.remove('on');
        }
      }
      this.sync();
    };
    this.el.addEventListener('touchmove', move, { passive: false });
    this.el.addEventListener('touchend', end);
    this.el.addEventListener('touchcancel', end);
  }

  moveKnob() {
    const st = this.stick;
    st.el.firstElementChild.style.transform = `translate(${st.x * STICK_R}px, ${-st.y * STICK_R}px)`;
  }

  sync() {
    const r = this.raw;
    const st = this.stick;
    r.moveX = Math.abs(st.x) > 0.2 ? st.x : 0;
    r.moveY = Math.abs(st.y) > 0.3 ? st.y : 0;
    const held = {};
    for (const b of this.buttons.values()) held[b] = true;
    held.down = r.moveY < -0.6;
    held.confirm = held.attack;
    r.held = held;
  }

  setVisible(v) {
    this.el.classList.toggle('hidden', !v);
    if (!v) {
      this.stick.id = null;
      this.stick.x = this.stick.y = 0;
      this.stick.el.classList.remove('on');
      this.buttons.clear();
      for (const b of this.el.querySelectorAll('.down')) b.classList.remove('down');
      this.sync();
    }
  }
}
