// Showdown abilities, translated to real time. Each Pokémon gets one (chosen in the team
// builder from the abilities its species really has, where we have a real-time version).
//
//   static        touching Pikachu with a contact move: 30% chance the attacker is paralyzed
//   lightningrod  Electric moves aimed at it do nothing and raise its Sp. Atk instead
//   blaze/torrent/overgrow  that type's moves hit 1.5x once it's at 100% or more ("in a pinch")
//   cursedbody    hit by a special: 30% chance that special is disabled for 4 s
//   steadfast     launched hard (tumble): +1 Speed
//   innerfocus    weak hits (under 6%) don't interrupt its attacks (it still takes the %)
//
//   solarpower    in sun: specials 1.3x, loses 0.6% a second
//   raindish      in rain: heals 0.6% a second
//   chlorophyll   in sun: 1.5x run/air speed

export const ABILITIES = {
  static: { name: 'Static', desc: 'Contact may paralyze the attacker (30%).' },
  lightningrod: { name: 'Lightning Rod', desc: 'Absorbs Electric moves: +1 Sp. Atk instead.' },
  blaze: { name: 'Blaze', desc: 'Fire moves 1.5x at 100% or more.', pinch: 'Fire' },
  torrent: { name: 'Torrent', desc: 'Water moves 1.5x at 100% or more.', pinch: 'Water' },
  overgrow: { name: 'Overgrow', desc: 'Grass moves 1.5x at 100% or more.', pinch: 'Grass' },
  cursedbody: { name: 'Cursed Body', desc: 'Specials that hit it may be disabled (30%, 4 s).' },
  steadfast: { name: 'Steadfast', desc: '+1 Speed each time it is launched.' },
  innerfocus: { name: 'Inner Focus', desc: 'Weak hits (under 6%) do not interrupt its attacks.' },
  solarpower: { name: 'Solar Power', desc: 'In sun: special moves 1.3x, but it takes 0.6% a second.' },
  raindish: { name: 'Rain Dish', desc: 'In rain: heals 0.6% a second.' },
  chlorophyll: { name: 'Chlorophyll', desc: 'In sun: 1.5x speed.' },
};

export const PINCH_AT = 100; // % from which Blaze/Torrent/Overgrow kick in (Showdown: 1/3 HP)
export const PINCH_MULT = 1.5;
export const DISABLE_FRAMES = 240;

const toId = (name) => name.toLowerCase().replace(/[^a-z]/g, '');

// Implemented abilities this species can have (Showdown's list, in its order).
export const abilityPool = (sp) => (sp.abilities || []).map(toId).filter((id) => ABILITIES[id]);
export const defaultAbility = (sp) => abilityPool(sp)[0] || null;
