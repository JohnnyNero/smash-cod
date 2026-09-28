// Move data. Frame numbers are at 60 fps. Hitbox positions are relative to the fighter's feet,
// with +x = the direction the fighter faces, in "template units" for a fighter 1.2 tall; they are
// scaled by each species' size. ang is the launch angle in degrees relative to facing
// (0 = forward, 90 = up, 180 = back, 270 = straight down / spike).
//
// Hitbox fields: f: [firstActive, lastActive], x, y, r, dmg (%), kb (base knockback),
// grow (knockback growth per %), ang.

const hb = (f, x, y, r, dmg, kb, grow, ang, extra = {}) => ({ f, x, y, r, dmg, kb, grow, ang, ...extra });

export const NORMALS = {
  jab: { anim: 'jab', total: 16, recycle: 10, hitboxes: [hb([3, 5], 0.55, 0.55, 0.35, 3, 3, 0.03, 50)] },
  ftilt: { anim: 'ftilt', total: 26, hitboxes: [hb([6, 9], 0.75, 0.45, 0.4, 8, 4.5, 0.09, 35)] },
  utilt: { anim: 'utilt', total: 24, hitboxes: [hb([5, 10], 0.15, 1.05, 0.5, 6, 4.5, 0.08, 95)] },
  dtilt: { anim: 'dtilt', total: 20, hitboxes: [hb([5, 7], 0.7, 0.12, 0.35, 5, 3.5, 0.06, 80)] },
  dash: {
    anim: 'dash', total: 36,
    events: [{ f: 5, do: 'vel', x: 9 }],
    hitboxes: [hb([6, 14], 0.4, 0.45, 0.5, 9, 5, 0.08, 50)],
  },
  fsmash: {
    anim: 'fsmash', total: 48, chargeF: 10, smash: true,
    events: [{ f: 14, do: 'vel', x: 3 }],
    hitboxes: [hb([14, 17], 0.9, 0.5, 0.5, 15, 6, 0.15, 38)],
  },
  usmash: { anim: 'usmash', total: 44, chargeF: 7, smash: true, hitboxes: [hb([10, 15], 0.05, 1.2, 0.55, 14, 5.5, 0.13, 88)] },
  dsmash: {
    anim: 'dsmash', total: 46, chargeF: 6, smash: true,
    hitboxes: [hb([9, 13], 0.75, 0.15, 0.45, 13, 5.5, 0.14, 28), hb([9, 13], -0.75, 0.15, 0.45, 13, 5.5, 0.14, 152)],
  },
  nair: {
    anim: 'nair', total: 36, landLag: 7, aerial: true,
    hitboxes: [hb([4, 8], 0, 0.55, 0.6, 9, 4, 0.09, 45), hb([9, 20], 0, 0.55, 0.55, 5, 3, 0.06, 45)],
  },
  fair: { anim: 'fair', total: 38, landLag: 10, aerial: true, hitboxes: [hb([8, 12], 0.65, 0.5, 0.45, 10, 4.5, 0.11, 40)] },
  bair: { anim: 'bair', total: 32, landLag: 9, aerial: true, hitboxes: [hb([6, 10], -0.65, 0.55, 0.45, 11, 5, 0.12, 145)] },
  uair: { anim: 'uair', total: 30, landLag: 7, aerial: true, hitboxes: [hb([5, 9], 0.05, 1.15, 0.5, 8, 4, 0.1, 85)] },
  dair: { anim: 'dair', total: 42, landLag: 16, aerial: true, hitboxes: [hb([10, 16], 0, -0.05, 0.45, 12, 4, 0.1, 270)] },
  grab: { anim: 'grab', total: 30, grab: true, hitboxes: [hb([7, 8], 0.7, 0.5, 0.4, 0, 0, 0, 0, { grab: true })] },
  ledgeAttack: {
    anim: 'ledgeAttack', total: 34, intangible: [1, 16],
    hitboxes: [hb([16, 20], 0.7, 0.35, 0.5, 8, 5, 0.05, 30)],
  },
};

export const THROWS = {
  forward: { anim: 'throwF', total: 24, release: 12, dmg: 8, kb: 6, grow: 0.09, ang: 40 },
  back: { anim: 'throwB', total: 30, release: 16, dmg: 10, kb: 6.5, grow: 0.11, ang: 140 },
  up: { anim: 'throwU', total: 28, release: 14, dmg: 8, kb: 7, grow: 0.09, ang: 90 },
  down: { anim: 'throwD', total: 26, release: 12, dmg: 6, kb: 5, grow: 0.06, ang: 80 },
};
export const PUMMEL = { dmg: 1.5, every: 18 };

// Specials carry Showdown fields (type, cat, power, pp). Behaviour comes from events:
//   vel: set velocity (x is along facing). `air` overrides when airborne.
//   zip: dash in the stick direction (Quick Attack style recovery).
//   projectile: spawn a projectile (see Game.spawnProjectile).
//   rise: the generic up-special recovery boost (added automatically, see buildMoveset).
export const SPECIALS = {
  thunderbolt: {
    name: 'Thunderbolt', type: 'Electric', cat: 'special', power: 90, pp: 15,
    anim: 'cast', total: 36, landLag: 10,
    events: [{
      f: 12, do: 'projectile',
      proj: { speed: 13, ang: 0, gravity: 0, life: 1.1, r: 0.3, dmg: 7, kb: 3, grow: 0.06, kbAng: 40, visual: 'bolt', color: 0xffe040 },
    }],
  },
  voltswitch: {
    name: 'Volt Switch', type: 'Electric', cat: 'special', power: 70, pp: 20,
    anim: 'ball', total: 40, landLag: 12,
    events: [{ f: 5, do: 'vel', x: 15, y: 0, air: { x: 13, y: 5 } }],
    hitboxes: [hb([6, 18], 0.2, 0.5, 0.55, 9, 5, 0.08, 45)],
  },
  quickattack: {
    name: 'Quick Attack', type: 'Normal', cat: 'physical', power: 40, pp: 30, priority: 1,
    anim: 'zip', total: 32, recovery: true, helpless: true,
    events: [{ f: 3, do: 'zip', speed: 24, frames: 9 }],
    hitboxes: [hb([3, 12], 0, 0.5, 0.5, 4, 3.5, 0.05, 60)],
  },
  irontail: {
    name: 'Iron Tail', type: 'Steel', cat: 'physical', power: 100, pp: 15,
    anim: 'tailslam', total: 46,
    hitboxes: [hb([14, 18], 0.7, 0.45, 0.55, 13, 6, 0.14, 35)],
    air: {
      anim: 'tailspike', total: 44, landLag: 18,
      events: [{ f: 10, do: 'vel', x: 0, y: -20 }],
      hitboxes: [hb([10, 24], 0, 0, 0.5, 11, 4, 0.1, 270)],
    },
  },
};

// What a special slot turns into when its PP runs out (just like Showdown).
export const STRUGGLE = {
  name: 'Struggle', type: '???', cat: 'physical', power: 50, pp: Infinity,
  anim: 'jab', total: 30, recoil: 2,
  hitboxes: [hb([7, 10], 0.55, 0.5, 0.4, 5, 3, 0.06, 45)],
};

const RISE = { f: 2, do: 'rise' };

function scaleMove(move, s) {
  const m = { ...move };
  if (move.hitboxes) m.hitboxes = move.hitboxes.map((h) => ({ ...h, x: h.x * s, y: h.y * s, r: h.r * s }));
  if (move.events) m.events = move.events.map((e) => ({ ...e }));
  if (move.air) m.air = scaleMove(move.air, s);
  return m;
}

// Build a fighter's full move list: shared normals scaled to size, plus its 4 specials.
// Whatever move sits on up-special also gets a rising boost and ends helpless, so every
// Pokémon can recover no matter which 4 moves were picked.
export function buildMoveset(species) {
  const s = species.size.h / 1.2;
  const normals = {};
  for (const [k, m] of Object.entries(NORMALS)) normals[k] = { id: k, ...scaleMove(m, s) };
  const specials = {};
  for (const slot of ['neutral', 'side', 'up', 'down']) {
    const id = species.moves[slot];
    specials[slot] = prepareSpecial(id, SPECIALS[id], slot, s);
  }
  return { normals, specials, struggle: { up: prepareSpecial('struggle', STRUGGLE, 'up', s), other: prepareSpecial('struggle', STRUGGLE, 'neutral', s) } };
}

function prepareSpecial(id, def, slot, s) {
  const m = { id, special: true, slot, ...scaleMove(def, s) };
  if (slot === 'up' && !m.recovery) {
    m.events = [RISE, ...(m.events || [])];
    m.helpless = true;
    if (m.air) {
      m.air.events = [RISE, ...(m.air.events || []).filter((e) => e.do !== 'vel' || e.y > 0)];
      m.air.helpless = true;
    }
  }
  return m;
}
