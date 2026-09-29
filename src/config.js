// Engine-wide tunables. Units: 1 unit ~ half a meter. Frame data is in 60 fps frames.
// Species and move numbers live in src/data/.

export const SIM_DT = 1 / 60;

export const PHYS = {
  gravity: 40, // a little floatier than Smash Ultimate, per the design doc
  hitstunGravity: 0.45, // launched fighters travel far, like Smash
  kbDecay: 10, // how fast horizontal speed above normal air speed bleeds off
  fastFallMult: 1.75,
  fastFallBuffer: 6, // frames a down-flick before the peak is remembered
  coyoteFrames: 5, // frames after walking off an edge that a jump still counts as a ground jump
  groundAccel: 60,
  groundFriction: 40,
  airAccel: 26,
  airFriction: 4,
  // Dashing (Smash-style): a flick starts an initial dash faster than the run; flick back during
  // it to dash-dance, reverse in its last frames to pivot. Letting go of a run skids to a stop.
  dashFrames: 11,
  dashSpeed: 1.1, // x run speed
  skidFrames: 10,
  emptyLanding: 3, // frames of landing lag after a normal jump (so landings have weight)
  autoCancelLag: 3, // aerials landed before or after their hitboxes
};

export const INPUT = {
  buffer: 7, // frames a press is remembered and used on the first frame you can act (Ultimate: 9)
  holdSmash: 10, // direction + attack held this long becomes a (charging) smash attack instead of a tilt
};

export const COMBAT = {
  stab: 1.3, // same-type attack bonus, tuned down from 1.5 for real time
  superEffective: 1.6, // Showdown 2x; 4x becomes 1.6^2
  resisted: 0.6, // Showdown 0.5x
  hitstunPerLaunch: 0.03, // seconds of hitstun per unit of launch speed
  tumbleAt: 11, // launch speeds above this make you tumble
  baseKbMult: 1, // base knockback is not reduced by weight (only the % growth is)
  pushWidth: 0.75, // fighters overlap less than this fraction of their combined half-widths before pushing
  pushMax: 0.07, // max push per frame each (~4 m/s)
  pushResist: 0.35, // share of inward speed lost per frame while overlapping (ground)
  pushResistAir: 0.12, // ...in the air (aerial cross-ups stay possible)
  diMaxDeg: 12, // DI: how far the stick can bend a launch (Ultimate ~9.7, Melee 18)
  asdi: 0.15, // ASDI: position nudge in the stick direction when hitlag ends
  hitstopBase: 3,
  hitstopPerDamage: 0.6,
  hitstopMax: 20,
  // Type flavour on hit freeze (Ultimate: electric hitlag x1.5). Capped at hitstopMax + 10.
  typeHitlag: { Electric: 1.5, Ice: 1.25 },
  smashChargeFrames: 60,
  smashChargeBonus: 0.4, // fully charged smash = 1.4x damage
  flickFrames: 5, // tap direction + attack within this many frames = smash attack
  techWindow: 14, // press shield this many frames before landing to tech
  techLockout: 30, // ...but a press within this many frames of the previous one doesn't count
  staleFactors: [0.08, 0.076, 0.068, 0.06, 0.053, 0.045, 0.038, 0.03, 0.022], // Ultimate's queue
  freshBonus: 1.05,
  // Hitstun cancel (Ultimate: air dodge after 40 f below launch speed 2.5, aerial after 45 f
  // below 2.0), converted to our shorter hitstun and speed units.
  hsCancelDodgeF: 25,
  hsCancelDodgeSpeed: 11.5,
  hsCancelActF: 28,
  hsCancelActSpeed: 9.2,
  clankRange: 9, // grounded attacks whose hitboxes meet clank if their damage is within this (Smash: 9%)
};

export const SHIELD = {
  hp: 50,
  drain: 0.12, // per frame while held
  regen: 0.08, // per frame while not held
  damageMult: 1.2,
  breakFrames: 180,
  dropFrames: 8, // letting go of shield (Ultimate: 11); jump is still allowed
  // Shieldstun = floor(0.8 x damage x mult + 2) by move kind (Ultimate's multipliers).
  stunMult: { ground: 1, smash: 0.725, aerial: 0.33, projectile: 0.29 },
};

export const DODGE = {
  spot: { total: 26, intangible: [3, 18] },
  roll: { total: 32, intangible: [4, 18], dist: 3 },
  air: { total: 40, intangible: [3, 26], speed: 13, moveFrames: 10, landLag: 10 },
};

export const LEDGE = {
  reachX: 1.0, // how far out from the edge you can grab
  reachUp: 0.5,
  reachDown: 1.0,
  invulnFrames: 30,
  // Ultimate-style: each regrab without touching the ground gives less intangibility.
  regrabInvuln: [30, 22, 15, 9, 4, 0],
  trumpFrames: 24, // popped off the ledge by someone taking it: no actions for this long
  actionableAfter: 8,
  maxHangFrames: 300,
  regrabCooldown: 30,
};

export const STAGE = {
  main: { left: -8.5, right: 8.5, top: 0, bottom: -2.2 },
  platforms: [
    { x: -4.6, y: 3.1, w: 4.2 },
    { x: 4.6, y: 3.1, w: 4.2 },
    { x: 0, y: 6.2, w: 4.2 },
  ],
  blast: { left: -21.5, right: 21.5, top: 19, bottom: -12 }, // widened: fewer early KOs
  spawns: [-4.5, 4.5],
  revivalY: 9.5,
};

export const PLAYER_COLORS = [
  { name: 'P1', main: 0xe8453c, accent: 0xffc23a, css: '#ff4b3e' },
  { name: 'P2', main: 0x2d7ff0, accent: 0x55f2ff, css: '#3a8dff' },
];

export const RULES = {
  modes: ['TEAM', 'STOCK', 'TIME'],
  stocks: [1, 2, 3, 4, 5],
  minutes: [1, 2, 3, 4, 5],
  cpu: ['OFF', 'EASY', 'NORMAL', 'HARD'],
};

// Showdown type colours, used for move chips and hit sparks.
export const TYPE_COLORS = {
  Normal: '#a8a878', Fire: '#f08030', Water: '#6890f0', Electric: '#f8d030', Grass: '#78c850',
  Ice: '#98d8d8', Fighting: '#c03028', Poison: '#a040a0', Ground: '#e0c068', Flying: '#a890f0',
  Psychic: '#f85888', Bug: '#a8b820', Rock: '#b8a038', Ghost: '#705898', Dragon: '#7038f8',
  Dark: '#705848', Steel: '#b8b8d0', Fairy: '#ee99ac', '???': '#68a090',
};
