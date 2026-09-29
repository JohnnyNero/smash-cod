// Move behaviour data. Frame numbers are at 60 fps. Hitbox positions are relative to the fighter's feet,
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

// Specials: behaviour only. Name, type, category (physical/special/status), base power, PP
// and priority come from Showdown (src/data/dex.js) and are merged in src/data/moveset.js.
// Events:
//   vel         set velocity (x along facing); `air` overrides when airborne
//   zip         dash in the stick direction (recoveries like Quick Attack / Fly)
//   dash        dash straight forward (Flare Blitz, Volt Switch)
//   projectile  spawn a projectile (see Game.spawnProjectile)
//   boost       Showdown stat stages on yourself (Swords Dance, Shell Smash)
//   destinybond arm Destiny Bond for `frames`
//   fx          purely visual effect
//   rise        the generic up-special recovery boost (added automatically, see moveset.js)
// Extra hitbox fields: rehit (frames between repeat hits), group (separate hit set),
// radial (launch away from the user on both sides), effect ('sleep').
// Move fields: recoilFrac (share of damage dealt taken as recoil), drain (share healed).

// Repeating projectile events, for streams like Flamethrower and Hydro Pump.
const stream = (from, to, every, proj) => {
  const evs = [];
  for (let f = from; f <= to; f += every) evs.push({ f, do: 'projectile', proj });
  return evs;
};

export const SPECIALS = {
  // --- Pikachu
  thunderbolt: {
    anim: 'cast', total: 36, landLag: 10,
    events: [{ f: 12, do: 'projectile', proj: { speed: 13, life: 1.1, r: 0.3, dmg: 7, kb: 3, grow: 0.06, kbAng: 40, visual: 'bolt', color: 0xffe040 } }],
  },
  voltswitch: {
    anim: 'ball', total: 40, landLag: 12, pivot: true, // switches you out after it hits (team mode)
    events: [{ f: 5, do: 'dash', speed: 15, frames: 14, air: { y: 3 } }],
    hitboxes: [hb([6, 18], 0.2, 0.5, 0.55, 9, 5, 0.08, 45)],
  },
  quickattack: {
    anim: 'zip', total: 32, recovery: true, helpless: true,
    events: [{ f: 3, do: 'zip', speed: 24, frames: 9 }],
    hitboxes: [hb([3, 12], 0, 0.5, 0.5, 4, 3.5, 0.05, 60)],
  },
  irontail: {
    anim: 'tailslam', total: 46,
    hitboxes: [hb([14, 18], 0.7, 0.45, 0.55, 13, 6, 0.14, 35)],
    air: {
      anim: 'tailspike', total: 44, landLag: 18,
      events: [{ f: 10, do: 'vel', x: 0, y: -20 }],
      hitboxes: [hb([10, 24], 0, 0, 0.5, 11, 4, 0.1, 270)],
    },
  },

  // --- Charizard
  flamethrower: {
    anim: 'breath', total: 44, landLag: 12,
    events: stream(10, 34, 3, { y: 0.8, speed: 12, ang: -4, life: 0.3, r: 0.35, dmg: 1.6, kb: 1.5, grow: 0.02, kbAng: 30, visual: 'flame', color: 0xff7a20 }),
  },
  flareblitz: {
    anim: 'blitz', total: 50, landLag: 16, recoilFrac: 0.33,
    events: [{ f: 10, do: 'dash', speed: 17, frames: 14, air: { y: 2 } }],
    hitboxes: [hb([10, 24], 0.3, 0.55, 0.6, 16, 7, 0.14, 38)],
  },
  fly: {
    anim: 'fly', total: 40, recovery: true, helpless: true,
    events: [{ f: 6, do: 'zip', speed: 20, frames: 14 }],
    hitboxes: [hb([6, 20], 0.1, 0.8, 0.65, 10, 6, 0.1, 80)],
  },
  dragonclaw: {
    anim: 'claw', total: 36, landLag: 12,
    hitboxes: [hb([8, 11], 0.7, 0.7, 0.55, 6, 3, 0.03, 70), hb([16, 19], 0.75, 0.65, 0.6, 8, 6, 0.12, 40, { group: 1 })],
  },

  // --- Blastoise
  hydropump: {
    anim: 'cannon', total: 50, landLag: 14,
    events: [
      { f: 12, do: 'vel', x: -3, air: { x: -6, y: 4 } },
      ...stream(12, 30, 3, { y: 0.8, speed: 16, life: 0.45, r: 0.4, dmg: 2.2, kb: 4, grow: 0.035, kbAng: 20, visual: 'water', color: 0x4aa0ff }),
    ],
  },
  icebeam: {
    anim: 'cannon', total: 42, landLag: 12,
    events: [{ f: 14, do: 'projectile', proj: { y: 0.8, speed: 28, life: 0.6, r: 0.3, dmg: 9, kb: 4, grow: 0.09, kbAng: 35, visual: 'beam', color: 0x9ff0ff } }],
  },
  rapidspin: {
    anim: 'shellspin', total: 46, recovery: true, helpless: true,
    events: [{ f: 5, do: 'zip', speed: 12, frames: 24 }],
    hitboxes: [hb([5, 29], 0, 0.8, 0.85, 2, 2, 0.02, 60, { rehit: 6 }), hb([30, 33], 0, 0.9, 0.9, 5, 6, 0.1, 80, { group: 1 })],
  },
  shellsmash: {
    anim: 'setup', total: 50,
    events: [{ f: 30, do: 'boost', boosts: { atk: 2, spa: 2, spe: 2, def: -1, spd: -1 } }],
  },

  // --- Venusaur
  sludgebomb: {
    anim: 'cast', total: 40, landLag: 12,
    events: [{ f: 14, do: 'projectile', proj: { speed: 11, ang: 35, gravity: 18, life: 1.6, r: 0.4, dmg: 11, kb: 5, grow: 0.1, kbAng: 45, visual: 'sludge', color: 0xb04ad0 } }],
  },
  gigadrain: {
    anim: 'beam', total: 44, landLag: 12, drain: 0.5,
    hitboxes: [hb([14, 22], 1.05, 0.6, 0.7, 10, 4, 0.08, 45)],
  },
  sleeppowder: {
    anim: 'powder', total: 44,
    events: [{ f: 10, do: 'fx', fx: 'powder' }],
    hitboxes: [hb([10, 30], 0, 1.1, 1.15, 0, 0, 0, 90, { effect: 'sleep' })],
  },
  leechseed: {
    anim: 'cast', total: 36,
    events: [{ f: 12, do: 'projectile', proj: { speed: 10, ang: 20, gravity: 14, life: 1.4, r: 0.3, dmg: 0, kb: 0, grow: 0, kbAng: 0, visual: 'seed', color: 0x7acc4a, effect: 'seed' } }],
  },

  // --- Gengar
  shadowball: {
    anim: 'cast', total: 40, landLag: 12,
    events: [{ f: 16, do: 'projectile', proj: { speed: 9, life: 1.5, r: 0.45, dmg: 11, kb: 5, grow: 0.09, kbAng: 40, visual: 'shadow', color: 0x8a4ad0 } }],
  },
  hypnosis: {
    anim: 'hypno', total: 44,
    events: [{ f: 14, do: 'fx', fx: 'hypno' }],
    hitboxes: [hb([14, 22], 1.25, 0.7, 0.75, 0, 0, 0, 0, { effect: 'sleep' })],
  },
  sludgewave: {
    anim: 'burst', total: 40,
    events: [{ f: 6, do: 'fx', fx: 'wave' }],
    hitboxes: [hb([6, 14], 0, 0.7, 1.45, 11, 5.5, 0.1, 70, { radial: true })],
  },
  destinybond: {
    anim: 'setup', total: 36,
    events: [{ f: 18, do: 'destinybond', frames: 240 }],
  },

  // --- Lucario
  aurasphere: {
    anim: 'cast', total: 38, landLag: 12,
    events: [{ f: 14, do: 'projectile', proj: { speed: 15, life: 1.0, r: 0.4, dmg: 9, kb: 4.5, grow: 0.08, kbAng: 38, visual: 'aura', color: 0x4a8aff } }],
  },
  closecombat: {
    anim: 'flurry', total: 50,
    events: [{ f: 6, do: 'vel', x: 6 }, { f: 36, do: 'boost', boosts: { def: -1, spd: -1 } }],
    hitboxes: [hb([8, 26], 0.75, 0.75, 0.6, 2, 1.5, 0.01, 60, { rehit: 4 }), hb([28, 31], 0.85, 0.75, 0.7, 7, 6.5, 0.15, 38, { group: 1 })],
  },
  extremespeed: {
    anim: 'zip', total: 36, recovery: true, helpless: true,
    events: [{ f: 4, do: 'zip', speed: 30, frames: 10 }],
    hitboxes: [hb([4, 14], 0, 0.8, 0.6, 7, 5, 0.08, 50)],
  },
  swordsdance: {
    anim: 'setup', total: 40,
    events: [{ f: 24, do: 'boost', boosts: { atk: 2 } }],
  },
};

// --- Status and field moves (any Pokémon that learns them in Showdown)
Object.assign(SPECIALS, {
  thunderwave: {
    anim: 'cast', total: 34, landLag: 10,
    events: [{ f: 11, do: 'projectile', proj: { speed: 12, life: 0.8, r: 0.35, dmg: 0, kb: 0, grow: 0, kbAng: 0, visual: 'bolt', color: 0xfff27a, effect: 'par' } }],
  },
  willowisp: {
    anim: 'cast', total: 38, landLag: 10,
    events: [{ f: 12, do: 'projectile', proj: { speed: 7, life: 1.5, r: 0.4, dmg: 0, kb: 0, grow: 0, kbAng: 0, visual: 'flame', color: 0x7a6aff, effect: 'brn' } }],
  },
  toxic: {
    anim: 'cast', total: 38, landLag: 10,
    events: [{ f: 12, do: 'projectile', proj: { speed: 10, ang: 25, gravity: 14, life: 1.4, r: 0.35, dmg: 0, kb: 0, grow: 0, kbAng: 0, visual: 'sludge', color: 0x8a2ab0, effect: 'tox' } }],
  },
  sunnyday: { anim: 'setup', total: 40, events: [{ f: 22, do: 'weather', weather: 'sun' }] },
  raindance: { anim: 'setup', total: 40, events: [{ f: 22, do: 'weather', weather: 'rain' }] },
});

// What a special slot turns into when its PP runs out (just like Showdown).
export const STRUGGLE = {
  name: 'Struggle', type: '???', cat: 'physical', power: 50, pp: Infinity,
  anim: 'jab', total: 30, recoil: 2,
  hitboxes: [hb([7, 10], 0.55, 0.5, 0.4, 5, 3, 0.06, 45)],
};
