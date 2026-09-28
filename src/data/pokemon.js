// Species data. Base stats and types match Pokémon Showdown (phase 2 will load them from
// @pkmn/dex); `physique` holds platform-fighter tuning that Showdown has no equivalent for.

export const SPECIES = {
  pikachu: {
    id: 'pikachu',
    name: 'Pikachu',
    types: ['Electric'],
    baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
    size: { w: 0.8, h: 1.15 },
    physique: { jump: 16, doubleJump: 14, airJumps: 1, maxFall: 14 },
    moves: { neutral: 'thunderbolt', side: 'voltswitch', up: 'quickattack', down: 'irontail' },
    model: 'pikachu',
    blurb: 'Tiny and fast, launches early. Zips back with Quick Attack.',
  },
};

// Turn Showdown base stats into fighter stats (see "Mapping Showdown → Smash" in docs/DESIGN.md).
export function fighterStats(sp) {
  const b = sp.baseStats;
  const p = sp.physique;
  return {
    weight: 0.7 + b.hp / 150, // HP = how hard you are to launch
    runSpeed: 4 + b.spe / 15,
    airSpeed: 3 + b.spe / 25,
    jump: p.jump,
    doubleJump: p.doubleJump,
    airJumps: p.airJumps,
    maxFall: p.maxFall,
  };
}

export const SPECIES_LIST = Object.values(SPECIES);
