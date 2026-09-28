// All the tunable numbers live here. Units: 1 unit ~ half a meter, a fighter is ~1.8 tall.

export const SIM_DT = 1 / 60;

export const PHYS = {
  gravity: 48,
  hitstunGravity: 0.4, // gravity multiplier while launched, so launches travel far like Smash
  kbDecay: 11, // how fast horizontal speed above normal air speed bleeds off
  fastFallMult: 1.6,
  groundAccel: 70,
  groundFriction: 45,
  airAccel: 32,
  airFriction: 5,
  lightHitCap: 11, // max speed that stacked light hits (SMG) can push you to
};

export const STAGE = {
  main: { left: -8.5, right: 8.5, top: 0, bottom: -2.2 },
  platforms: [
    { x: -4.6, y: 3.1, w: 4.2 },
    { x: 4.6, y: 3.1, w: 4.2 },
    { x: 0, y: 6.2, w: 4.2 },
  ],
  blast: { left: -21, right: 21, top: 16, bottom: -11 },
  spawns: [-4.5, 4.5],
  revivalY: 9.5,
};

export const OPERATORS = [
  {
    id: 'brick',
    name: 'BRICK',
    role: 'HEAVY ASSAULT',
    blurb: 'Hard to launch. Hold ABILITY for a riot shield that blocks shots from the front.',
    weight: 1.15,
    runSpeed: 6.6,
    airSpeed: 5.6,
    jump: 17,
    doubleJump: 15.5,
    airJumps: 1,
    maxFall: 18,
    width: 1.0,
    height: 1.95,
    ability: { id: 'shield', name: 'RIOT SHIELD' },
    model: { bulk: 1.22, headgear: 'helmet', face: 'mask' },
  },
  {
    id: 'vex',
    name: 'VEX',
    role: 'RECON',
    blurb: 'Light and fast. Triple jump, and a phase dash that bullets pass through.',
    weight: 0.9,
    runSpeed: 9.2,
    airSpeed: 7.6,
    jump: 18,
    doubleJump: 16,
    airJumps: 2,
    maxFall: 15.5,
    width: 0.8,
    height: 1.78,
    ability: { id: 'dash', name: 'PHASE DASH' },
    model: { bulk: 0.92, headgear: 'hood', face: 'goggles' },
  },
];

// damage = % added per hit. launch speed = (baseKB + percent * growth) * kbMult / weight
export const WEAPONS = [
  {
    id: 'smg',
    name: 'VECTOR-9',
    type: 'SMG',
    blurb: 'Bullet hose. Each hit pushes a little: pin them and shove them off the edge.',
    mag: 32,
    auto: true,
    interval: 0.07,
    reload: 1.25,
    pellets: 1,
    spread: 0.07,
    speed: 48,
    life: 0.42,
    damage: 1.4,
    baseKB: 2.2,
    growth: 0.028,
    light: true,
    lift: 0.15,
    recoil: 0.55,
    adsMult: 1.2,
    adsTime: 0.25,
    tracer: 0xffe28a,
    tracerLen: 0.9,
    tracerWidth: 0.05,
    shake: 0.04,
    hitstop: 0,
    len: 0.45,
  },
  {
    id: 'shotgun',
    name: 'BREACHER',
    type: 'SHOTGUN',
    blurb: 'Huge close-range launch. Shoot the floor to rocket-jump back to the stage.',
    mag: 4,
    auto: false,
    interval: 0.5,
    reload: 1.6,
    pellets: 7,
    spread: 0.26,
    speed: 40,
    life: 0.2,
    damage: 2.4,
    baseKB: 7.5,
    growth: 0.1,
    light: false,
    lift: 0.45,
    recoil: 13,
    adsMult: 1.15,
    adsTime: 0.3,
    tracer: 0xffb35c,
    tracerLen: 0.55,
    tracerWidth: 0.06,
    shake: 0.35,
    hitstop: 4,
    len: 0.8,
  },
  {
    id: 'sniper',
    name: 'LONGSHOT .50',
    type: 'SNIPER',
    blurb: 'One heavy round. Hold ADS until the laser locks to charge a KO shot.',
    mag: 3,
    auto: false,
    interval: 0.9,
    reload: 2.0,
    pellets: 1,
    spread: 0.012,
    hipSpread: 0.07,
    speed: 130,
    life: 0.4,
    damage: 15,
    baseKB: 8,
    growth: 0.11,
    light: false,
    lift: 0.4,
    recoil: 7,
    adsMult: 1.25,
    adsTime: 0.45,
    tracer: 0xaef6ff,
    tracerLen: 3.5,
    tracerWidth: 0.08,
    shake: 0.4,
    hitstop: 8,
    len: 1.0,
  },
];

export const KNIFE = {
  name: 'KNIFE',
  damage: 7,
  baseKB: 5,
  growth: 0.15,
  duration: 0.32,
  activeStart: 0.07,
  activeEnd: 0.17,
  lunge: 4,
  hitstop: 6,
};

export const GRENADE = {
  name: 'FRAG',
  damage: 13,
  baseKB: 7,
  growth: 0.11,
  radius: 3,
  fuse: 1.5,
  throwSpeed: 14,
  gravity: 32,
  bounce: 0.45,
  max: 2,
  recharge: 6,
  selfDamageMult: 0.5,
  hitstop: 5,
};

export const EXO = { speed: 15, time: 0.16, cooldown: 0.45, keep: 0.55 };
export const SHIELD = { hp: 100, regen: 22, breakTime: 3, moveMult: 0.35 };
export const DASH = { speed: 22, time: 0.18, cooldown: 1.6, keep: 0.35 };

export const PLAYER_COLORS = [
  { name: 'P1', main: 0xe8453c, accent: 0xffc23a, css: '#ff4b3e' },
  { name: 'P2', main: 0x2d7ff0, accent: 0x55f2ff, css: '#3a8dff' },
];

export const RULES = {
  modes: ['STOCK', 'TIME'],
  stocks: [1, 2, 3, 4, 5],
  minutes: [1, 2, 3, 4, 5],
  cpu: ['OFF', 'EASY', 'NORMAL', 'HARD'],
};
