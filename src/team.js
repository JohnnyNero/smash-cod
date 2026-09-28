// Teams: building, validation (Species Clause, legal moves), local storage, and a simple
// Showdown-style matchup score the CPU uses to pick leads and replacements.

import { SPECIES, SPECIES_LIST } from './data/pokemon.js';
import { DEX } from './data/dex.js';
import { SLOTS } from './data/moveset.js';
import { typeEffectiveness } from './damage.js';

export const TEAM_SIZE = 3;
const STORAGE_KEY = 'showdownSmash.teams';

export const member = (species, moves) => ({ species, moves: { ...(moves || SPECIES[species].moves) } });

export function defaultTeam(slot) {
  const ids = slot === 0 ? ['pikachu', 'charizard', 'lucario'] : ['blastoise', 'venusaur', 'gengar'];
  return ids.map((id) => member(id));
}

export function randomTeam() {
  const ids = SPECIES_LIST.map((s) => s.id).sort(() => Math.random() - 0.5).slice(0, TEAM_SIZE);
  return ids.map((id) => member(id));
}

// Moves a species can use: its legal learnset, limited to moves the game implements.
export const movePool = (species) => DEX.learnsets[species] || [];

function validMember(m) {
  if (!m || !SPECIES[m.species] || !m.moves) return false;
  const pool = movePool(m.species);
  const ids = SLOTS.map((s) => m.moves[s]);
  return ids.every((id) => pool.includes(id)) && new Set(ids).size === ids.length;
}

export function validTeam(team) {
  return Array.isArray(team) && team.length === TEAM_SIZE && team.every(validMember)
    && new Set(team.map((m) => m.species)).size === TEAM_SIZE; // Species Clause
}

export function loadTeam(slot) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const t = all[`P${slot + 1}`];
    if (validTeam(t)) return t.map((m) => member(m.species, m.moves));
  } catch {
    // Storage can be blocked or corrupt; fall back to the default team.
  }
  return defaultTeam(slot);
}

export function saveTeam(slot, team) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[`P${slot + 1}`] = team;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Not saving is fine; the team still works for this session.
  }
}

// Cycle a team member's species, skipping species already on the team (Species Clause).
export function cycleSpecies(team, index, dir) {
  const ids = SPECIES_LIST.map((s) => s.id);
  const taken = new Set(team.filter((_, i) => i !== index).map((m) => m.species));
  let k = ids.indexOf(team[index].species);
  for (let n = 0; n < ids.length; n++) {
    k = (k + dir + ids.length) % ids.length;
    if (!taken.has(ids[k])) break;
  }
  team[index] = member(ids[k]);
}

// Cycle one move slot through the legal pool, skipping moves already in the other slots.
export function cycleMove(m, slot, dir) {
  const pool = movePool(m.species);
  const others = new Set(SLOTS.filter((s) => s !== slot).map((s) => m.moves[s]));
  let k = pool.indexOf(m.moves[slot]);
  for (let n = 0; n < pool.length; n++) {
    k = (k + dir + pool.length) % pool.length;
    if (!others.has(pool[k])) break;
  }
  m.moves[slot] = pool[k];
}

// How good is `me` into `foe`? Best super-effective STAB-ish coverage we have, minus how hard
// their STAB types hit us. Plenty for a CPU to make Showdown-flavoured choices.
export function matchupScore(meSp, meMoves, foeSp) {
  let offense = 0;
  for (const id of Object.values(meMoves)) {
    const mv = DEX.moves[id];
    if (!mv || mv.cat === 'status') continue;
    const stab = meSp.types.includes(mv.type) ? 1.3 : 1;
    offense = Math.max(offense, typeEffectiveness(mv.type, foeSp.types) * stab);
  }
  let threat = 0;
  for (const t of foeSp.types) threat = Math.max(threat, typeEffectiveness(t, meSp.types));
  return offense - threat * 0.8;
}
