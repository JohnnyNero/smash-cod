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

// Per-species attack tempo: scale a move's frame data (startup, active frames, end lag,
// landing lag) by k. Movement lengths (dash/zip frames) and durations like Destiny Bond keep
// their values so recoveries and effects don't change; only when things happen does.
function retime(move, k) {
  if (!k || k === 1) return move;
  const m = { ...move };
  const r = (f) => Math.max(1, Math.round(f * k));
  m.total = r(m.total);
  if (m.hitboxes) {
    m.hitboxes = m.hitboxes.map((h) => {
      const a = r(h.f[0]);
      return { ...h, f: [a, Math.max(a, r(h.f[1]))], ...(h.rehit ? { rehit: Math.max(2, r(h.rehit)) } : {}) };
    });
  }
  if (m.events) m.events = m.events.map((e) => ({ ...e, f: r(e.f) }));
  for (const key of ['landLag', 'recycle', 'chargeF']) if (m[key]) m[key] = r(m[key]);
  if (m.intangible) m.intangible = m.intangible.map(r);
  if (m.air) m.air = retime(m.air, k);
  m.total = Math.max(m.total, ...(m.hitboxes || []).map((h) => h.f[1] + 2), ...(m.events || []).map((e) => e.f + 2));
  return m;
}

// Heavier hitters launch harder with their normals (knockback only; damage already follows Atk).
function empower(move, p) {
  if (!p || p === 1 || !move.hitboxes) return move;
  return { ...move, hitboxes: move.hitboxes.map((h) => ({ ...h, kb: h.kb * p, grow: h.grow * p })) };
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

const NORMAL_NAMES = {
  jab: 'Jab', ftilt: 'Forward Tilt', utilt: 'Up Tilt', dtilt: 'Down Tilt', dash: 'Dash Attack',
  fsmash: 'Forward Smash', usmash: 'Up Smash', dsmash: 'Down Smash', nair: 'Neutral Air',
  fair: 'Forward Air', bair: 'Back Air', uair: 'Up Air', dair: 'Down Air', grab: 'Grab', ledgeAttack: 'Ledge Attack',
};

export function buildMoveset(species, moves = species.moves) {
  const s = species.size.h / 1.2;
  const normals = {};
  const tempo = species.tempo ?? 1;
  const tempoSp = 1 + (tempo - 1) * 0.5; // specials follow at half strength (they're the moves' identity)
  for (const [k, m] of Object.entries(NORMALS)) normals[k] = { id: k, name: NORMAL_NAMES[k], ...empower(retime(scaleMove(m, s), tempo), species.power) };
  const specials = {};
  for (const slot of SLOTS) {
    const id = moves[slot];
    specials[slot] = prepareSpecial(id, retime({ ...SPECIALS[id], ...DEX.moves[id] }, tempoSp), slot, s);
  }
  return {
    normals,
    specials,
    struggle: { up: prepareSpecial('struggle', STRUGGLE, 'up', s), other: prepareSpecial('struggle', STRUGGLE, 'neutral', s) },
  };
}
