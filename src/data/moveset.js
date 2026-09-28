// Builds a fighter's move list: shared normals scaled to its size, plus its 4 specials with
// Showdown data (type, category, power, PP, priority) merged into the behaviour from moves.js.

import { NORMALS, SPECIALS, STRUGGLE } from './moves.js';
import { DEX } from './dex.js';

const RISE = { f: 2, do: 'rise' };
export const SLOTS = ['neutral', 'side', 'up', 'down'];

function scaleMove(move, s) {
  const m = { ...move };
  if (move.hitboxes) m.hitboxes = move.hitboxes.map((h) => ({ ...h, x: h.x * s, y: h.y * s, r: h.r * s }));
  if (move.events) m.events = move.events.map((e) => ({ ...e }));
  if (move.air) m.air = scaleMove(move.air, s);
  return m;
}

// Whatever move sits on up-special also gets a rising boost and ends helpless, so every
// Pokémon can recover no matter which 4 moves were picked.
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

export function moveInfo(id) {
  return DEX.moves[id];
}

export function buildMoveset(species, moves = species.moves) {
  const s = species.size.h / 1.2;
  const normals = {};
  for (const [k, m] of Object.entries(NORMALS)) normals[k] = { id: k, ...scaleMove(m, s) };
  const specials = {};
  for (const slot of SLOTS) {
    const id = moves[slot];
    specials[slot] = prepareSpecial(id, { ...SPECIALS[id], ...DEX.moves[id] }, slot, s);
  }
  return {
    normals,
    specials,
    struggle: { up: prepareSpecial('struggle', STRUGGLE, 'up', s), other: prepareSpecial('struggle', STRUGGLE, 'neutral', s) },
  };
}
