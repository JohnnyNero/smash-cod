// Gamepads (standard mapping) plus two keyboard layouts. Every device produces the same
// state shape, so fighters and the CPU brain don't care where input comes from.

export const BUTTONS = [
  'jump', 'fire', 'ads', 'knife', 'grenade', 'ability', 'exo', 'reload',
  'start', 'confirm', 'back', 'down',
];

const KEYMAPS = {
  kb1: {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    jump: ['KeyW', 'Space'], fire: ['KeyF'], knife: ['KeyG'], grenade: ['KeyH'],
    reload: ['KeyR'], ability: ['KeyT'], exo: ['KeyC'], ads: ['KeyV'],
    start: ['Escape'], confirm: ['KeyF', 'Space'], back: ['KeyG'],
  },
  kb2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['ArrowUp'], fire: ['Slash', 'Numpad0'], knife: ['Period', 'Numpad1'],
    grenade: ['Comma', 'Numpad2'], reload: ['KeyP', 'Numpad6'], ability: ['Quote', 'Numpad4'],
    exo: ['Semicolon', 'Numpad3'], ads: ['ShiftRight', 'Numpad5'],
    start: ['Enter'], confirm: ['Enter', 'Slash'], back: ['Backspace', 'Period'],
  },
};

const DEADZONE = 0.25;
const NAV_DIRS = ['up', 'down', 'left', 'right'];

export function neutralState(id = 'none') {
  const s = {
    id, connected: true, moveX: 0, moveY: 0, aimX: 0, aimY: 0, aimActive: false,
    held: {}, pressed: {}, nav: {}, navTimer: {},
  };
  for (const b of BUTTONS) { s.held[b] = false; s.pressed[b] = false; }
  for (const d of NAV_DIRS) { s.nav[d] = false; s.navTimer[d] = null; }
  return s;
}

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.tapped = new Set(); // keys pressed since the last poll, so quick taps are never missed
    this.devices = new Map();
    this.devices.set('kb1', neutralState('kb1'));
    this.devices.set('kb2', neutralState('kb2'));
    this.anyInput = false;
    this.virtual = new Map();

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'Backspace', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
      this.tapped.add(e.code);
      this.anyInput = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // A virtual device (on-screen touch controls) supplies a raw state object each frame.
  addVirtual(id, source) {
    this.virtual.set(id, source);
    this.devices.set(id, neutralState(id));
  }

  get(id) {
    return this.devices.get(id) || neutralState(id);
  }

  // Device ids that could join the game right now.
  list() {
    return [...this.devices.values()].filter((d) => d.connected).map((d) => d.id);
  }

  update(dt) {
    const k = (code) => this.keys.has(code) || this.tapped.has(code);
    for (const id of ['kb1', 'kb2']) {
      const map = KEYMAPS[id];
      const any = (name) => map[name].some(k);
      const raw = {
        moveX: (any('right') ? 1 : 0) - (any('left') ? 1 : 0),
        moveY: (any('up') ? 1 : 0) - (any('down') ? 1 : 0),
        aimX: 0, aimY: 0, aimActive: false, held: {},
      };
      for (const b of BUTTONS) raw.held[b] = b === 'down' ? any('down') : !!map[b] && any(b);
      this.apply(this.devices.get(id), raw, dt);
    }
    this.tapped.clear();

    for (const [id, src] of this.virtual) {
      const dev = this.devices.get(id);
      this.apply(dev, src.raw, dt);
      dev.autoFire = !!src.raw.autoFire;
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const seen = new Set();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const id = 'pad' + pad.index;
      seen.add(id);
      if (!this.devices.has(id)) this.devices.set(id, neutralState(id));
      const dev = this.devices.get(id);
      dev.connected = true;
      dev.pad = pad;
      const btn = (i) => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
      let mx = pad.axes[0] || 0;
      let my = -(pad.axes[1] || 0);
      if (Math.hypot(mx, my) < DEADZONE) { mx = 0; my = 0; }
      if (btn(14)) mx = -1;
      if (btn(15)) mx = 1;
      if (btn(12)) my = 1;
      if (btn(13)) my = -1;
      const ax = pad.axes[2] || 0;
      const ay = -(pad.axes[3] || 0);
      const aimActive = Math.hypot(ax, ay) > 0.4;
      const raw = {
        moveX: mx, moveY: my, aimX: ax, aimY: ay, aimActive,
        held: {
          jump: btn(0), exo: btn(1), knife: btn(2), reload: btn(3),
          ability: btn(4), grenade: btn(5), ads: btn(6), fire: btn(7),
          start: btn(9), confirm: btn(0), back: btn(1), down: my < -0.6,
        },
      };
      this.apply(dev, raw, dt);
    }
    for (const [id, dev] of this.devices) {
      if (id.startsWith('pad') && !seen.has(id)) {
        dev.connected = false;
        Object.assign(dev, neutralState(id), { connected: false });
      }
    }
  }

  apply(dev, raw, dt) {
    for (const b of BUTTONS) {
      const h = !!raw.held[b];
      dev.pressed[b] = h && !dev.held[b];
      dev.held[b] = h;
      if (dev.pressed[b]) this.anyInput = true;
    }
    dev.moveX = raw.moveX;
    dev.moveY = raw.moveY;
    dev.aimX = raw.aimX;
    dev.aimY = raw.aimY;
    dev.aimActive = raw.aimActive;

    // Menu navigation with key repeat.
    const want = {
      up: raw.moveY > 0.5, down: raw.moveY < -0.5,
      left: raw.moveX < -0.5, right: raw.moveX > 0.5,
    };
    for (const d of NAV_DIRS) {
      dev.nav[d] = false;
      if (!want[d]) {
        dev.navTimer[d] = null;
      } else if (dev.navTimer[d] === null) {
        dev.nav[d] = true;
        dev.navTimer[d] = 0.35;
      } else {
        dev.navTimer[d] -= dt;
        if (dev.navTimer[d] <= 0) {
          dev.nav[d] = true;
          dev.navTimer[d] = 0.11;
        }
      }
    }
  }

  rumble(id, strong = 0.5, weak = 0.5, ms = 120) {
    const dev = this.devices.get(id);
    const act = dev && dev.pad && dev.pad.vibrationActuator;
    if (!act || !act.playEffect) return;
    try {
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
    } catch {
      // Some browsers expose the actuator but reject effects; rumble is optional.
    }
  }
}
