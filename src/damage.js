// Showdown-flavoured damage: attacker's Atk/SpA vs defender's Def/SpD (with stat stages), STAB,
// and the real type chart. The result is the % added to the defender, plus the effectiveness
// so the game can call out "super effective" hits.

import { COMBAT } from './config.js';
import { DEX } from './data/dex.js';
import { stageMult } from './data/pokemon.js';
import { BRN_PHYSICAL } from './status.js';
import { ABILITIES, PINCH_AT, PINCH_MULT } from './abilities.js';

// Showdown multiplier (4, 2, 1, 0.5, 0.25 or 0) for a move type against a defender's types.
export function typeEffectiveness(type, defTypes) {
  const row = DEX.typechart[type];
  if (!row) return 1;
  return defTypes.reduce((m, t) => m * (row[t] ?? 1), 1);
}

// Softened for real time: 2x -> 1.6x, 0.5x -> 0.6x, per the design doc.
export function effMultiplier(eff) {
  if (eff === 0) return 0;
  if (eff > 1) return COMBAT.superEffective ** Math.log2(eff);
  if (eff < 1) return COMBAT.resisted ** -Math.log2(eff);
  return 1;
}

// Raw Showdown effectiveness of a move against a species, including the Grass immunity to
// powder moves and Leech Seed. Used for HUD hints and the CPU.
export function moveEffect(move, defSp) {
  if (!move || !move.type || move.type === '???') return 1;
  if (defSp.types.includes('Grass') && (move.powder || move.id === 'leechseed')) return 0;
  return typeEffectiveness(move.type, defSp.types);
}

export function damageFor(attacker, defender, base, move) {
  const cat = (move && move.cat) || 'physical';
  const a = attacker.sp.baseStats;
  const d = defender.sp.baseStats;
  const special = cat === 'special';
  const A = (special ? a.spa : a.atk) * stageMult(attacker.boosts[special ? 'spa' : 'atk'] || 0);
  const D = (special ? d.spd : d.def) * stageMult(defender.boosts[special ? 'spd' : 'def'] || 0);
  const statMult = Math.sqrt((A + 60) / (D + 60));
  const type = move && move.type;
  const stab = type && attacker.sp.types.includes(type) ? COMBAT.stab : 1;
  const eff = type ? typeEffectiveness(type, defender.sp.types) : 1;
  // Blaze / Torrent / Overgrow: that type hits harder once the user is "in a pinch".
  const ab = ABILITIES[attacker.ability];
  const pinch = ab && ab.pinch && type === ab.pinch && attacker.percent >= PINCH_AT ? PINCH_MULT : 1;
  // Burned attackers hit weaker with physical moves (Showdown halves Attack; softened).
  const burn = !special && attacker.status && attacker.status.id === 'brn' ? BRN_PHYSICAL : 1;
  const aura = attacker.sp.aura ? 1 + Math.min(0.25, attacker.percent / 480) : 1; // Lucario: up to +25% at 120%
  return { damage: base * statMult * stab * effMultiplier(eff) * aura * burn * pinch, eff, stab: stab > 1, pinch: pinch > 1 };
}
