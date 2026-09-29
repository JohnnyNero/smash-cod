// Showdown status conditions, played out in real time.
//
// One major status at a time (Showdown rule), each timed rather than permanent so fights keep
// moving: burn, paralysis, poison, bad poison (toxic), freeze. Confusion is a volatile status
// that can stack on top. Sleep keeps its own state in fighter.js. Type immunities as in Showdown.
//
//   brn  % ticks up; the burned Pokémon's physical hits are weaker (Showdown halves Attack)
//   par  slower run/air speed; now and then "fully paralyzed": frozen in place for a moment
//   psn  % ticks up
//   tox  % ticks up, more every tick
//   frz  encased in ice: can't act; mash to break out sooner; any hit (or Fire) shatters it
//   confusion  left and right are swapped

export const STATUS = {
  brn: { name: 'BRN', color: '#ee5533', text: 'was burned!', frames: 720, tick: 60, dmg: 1.2 },
  par: { name: 'PAR', color: '#f8d030', text: 'is paralyzed! It may be unable to move!', frames: 600 },
  psn: { name: 'PSN', color: '#a040a0', text: 'was poisoned!', frames: 600, tick: 60, dmg: 1 },
  tox: { name: 'TOX', color: '#a040a0', text: 'was badly poisoned!', frames: 600, tick: 60, dmg: 0.35 }, // x ticks so far
  frz: { name: 'FRZ', color: '#98d8d8', text: 'was frozen solid!' },
};

export const CONFUSION_FRAMES = 300;
export const PAR_SPEED = 0.75; // run/air speed while paralyzed
export const PAR_CHECK = 90; // frames between full-paralysis checks
export const PAR_CHANCE = 0.25; // Showdown: 25% to be fully paralyzed
export const PAR_STUN = 26;
export const BRN_PHYSICAL = 0.75; // a burned attacker's physical damage (Showdown 0.5x, softened)

// Showdown immunities: Fire can't burn, Electric can't be paralyzed, Poison/Steel can't be
// poisoned, Ice can't freeze.
const IMMUNE = { brn: ['Fire'], par: ['Electric'], psn: ['Poison', 'Steel'], tox: ['Poison', 'Steel'], frz: ['Ice'] };

export function statusImmune(id, types) {
  return (IMMUNE[id] || []).some((t) => types.includes(t));
}

export function freezeFrames(percent) {
  return Math.min(170, 80 + percent * 0.35);
}
