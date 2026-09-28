// Species = Showdown data (base stats, types, weight) + platform-fighter tuning from roster.js.

import { ROSTER } from './roster.js';
import { DEX } from './dex.js';

export const SPECIES = {};
for (const [id, r] of Object.entries(ROSTER)) SPECIES[id] = { id, ...DEX.species[id], ...r };
export const SPECIES_LIST = Object.values(SPECIES);

// Showdown stat stages: +1 = 1.5x, +2 = 2x, -1 = 0.67x ...
export const stageMult = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));

// Turn Showdown base stats into fighter stats (see "Mapping Showdown → Smash" in docs/DESIGN.md).
export function fighterStats(sp, boosts = {}) {
  const b = sp.baseStats;
  const p = sp.physique;
  const spe = Math.sqrt(stageMult(boosts.spe || 0)); // speed boosts help, but don't double your run speed
  return {
    weight: 0.7 + b.hp / 250 + Math.sqrt(sp.weightkg) / 55, // bulk + body weight = launch resistance
    runSpeed: (2.5 + b.spe / 12) * spe,
    airSpeed: (2.2 + b.spe / 25) * spe,
    jump: p.jump,
    doubleJump: p.doubleJump,
    airJumps: p.airJumps,
    maxFall: p.maxFall,
    gravity: p.gravity ?? 1,
  };
}
