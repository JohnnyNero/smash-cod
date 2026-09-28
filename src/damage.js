// Showdown-flavoured damage: attacker's Atk/SpA vs defender's Def/SpD, STAB, and (phase 2)
// type effectiveness. The result is the % added to the defender.

import { COMBAT } from './config.js';

// Phase 2 replaces this with the real type chart from @pkmn/dex.
export function typeEffectiveness() {
  return 1;
}

export function damageFor(attacker, defender, base, move) {
  const cat = (move && move.cat) || 'physical';
  const a = attacker.sp.baseStats;
  const d = defender.sp.baseStats;
  const A = cat === 'special' ? a.spa : a.atk;
  const D = cat === 'special' ? d.spd : d.def;
  const statMult = Math.sqrt((A + 60) / (D + 60));
  const type = move && move.type;
  const stab = type && attacker.sp.types.includes(type) ? COMBAT.stab : 1;
  const eff = type ? typeEffectiveness(type, defender.sp.types) : 1;
  return { damage: base * statMult * stab * eff, eff, stab: stab > 1 };
}
