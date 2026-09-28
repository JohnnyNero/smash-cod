# Showdown Smash: Design Doc

Working title. A 1v1 couch platform fighter: **Pokémon Showdown strategy decides who is favoured,
Super Smash Bros. execution decides who wins.** Built on the Smash Ops v0.1 engine (Three.js, browser,
gamepads + keyboard + touch), keeping its dusk low-poly look.

This is the source of truth for decisions. Update it when a decision changes.

---

## Decisions log

| Topic | Decision |
|---|---|
| Guns / soldiers | Removed. Replaced with a Smash moveset. |
| Pokémon | Real Pokémon, real Showdown data (stats, types, moves, PP). |
| Data source | `@pkmn/dex` (MIT-licensed Pokémon Showdown data) from phase 2. |
| 3D models | Built procedurally in code, low-poly, to match the existing look. No ripped assets. |
| Mode (first version) | **Showdown mode**: fully evolved teams. Journey (evolve mid-fight) mode later. |
| Team | Build a team of **3**. Each Pokémon is one stock. Lose all 3 = lose. |
| Team builder | **Full builder**: 4 moves per Pokémon from its learnset (ability, item, Tera come later). Saved locally. |
| Switching | **Any time.** Short wind-up and cooldown. Each Pokémon keeps its own damage %. Benched Pokémon slowly heal. |
| KO flow | **Hidden simultaneous picks** at each KO (see below). |
| PP | **Yes.** Specials have Showdown PP per stock, visible to both players. At 0 PP a slot becomes Struggle. |
| Pace | **Slightly slower than Smash Ultimate**: floatier, roomier, readable. |
| Hosting | Deployed to the public GitHub Pages link (owner accepted the takedown risk). |
| Roster v1 | Charizard, Blastoise, Venusaur, Pikachu, Gengar, Lucario. |

## Why both halves matter (design pillars)

1. **Strategy multiplies, execution adds.** Type effectiveness swings hard enough that a good read
   beats slightly better thumbs. Super effective ≈ 1.6× damage and knockback plus big hitstop and a
   callout. Resisted ≈ 0.6×. Immune = the hit passes through. STAB = 1.5× (tuned for real time).
2. **Execution is simple on purpose.** One attack button + direction, one special button + direction.
   No wavedash or L-cancel tech. Slower pace, roomier stage. Leaves headspace for decisions.
3. **Resources over reflexes.** PP makes each special a decision. Spam is self-limiting.
4. **Information like Showdown.** Types on the HUD, opponent moves revealed as used, bench %
   visible, attack effectiveness shown against the current target.
5. **Layer complexity.** Ship the core loop first; abilities, items, hazards, status and Tera come
   later once the core feels good.

## Match flow

1. **Team builder**: pick 3 Pokémon, 4 moves each (from a curated, fighter-ready move pool drawn
   from the real learnset).
2. **Team preview**: both teams shown; each player secretly picks a lead.
3. **Fight**: Smash rules (damage %, knockback, ring-outs, ledges).
4. **KO pause**: on a KO the action pauses ~5 s and both players pick **simultaneously and secretly**:
   - The KO'd player picks their next Pokémon.
   - The other player may stay in or switch for free.
   - Both reveal together, then the fight resumes.
   - Shared-screen secrecy: each benched Pokémon is bound to a face button shown on your own HUD card.
     You press a button; the screen only shows "P1 ✓". On phones the pick is on your own screen.
5. **Win**: KO all 3 of the opponent's Pokémon.

## Mapping Showdown → Smash

| Showdown | In the fight |
|---|---|
| Speed | Run / air speed, dash |
| Attack / Sp. Atk | Power of physical / special moves |
| Defense / Sp. Def | Resistance to knockback from physical / special moves |
| HP | Weight (launch resistance) |
| Types | Damage + knockback multipliers, immunities pass through |
| STAB | Bonus on same-type moves |
| 4 moves | 4 specials: B + neutral / side / up / down |
| PP | Uses per stock, visible to both |
| Priority | Faster startup (Quick Attack, Extreme Speed) |
| Switching | Hold switch: wind-up, cooldown, each mon keeps its % |
| U-turn / Volt Switch | Hit, then auto-switch (phase 3) |
| Setup moves | Risky stand-still, visible aura boost until switched out (phase 3+) |

## Phase 1 notes

- KO percentages (Pikachu vs Pikachu, from center): forward smash ≈110%, up smash ≈100%,
  Iron Tail ≈130%, back air ≈180%. Measured with a headless sim; tune in `src/data/moves.js`.
- Grounded attacks stop at ledges (Smash behaviour); Quick Attack's zip can still leave the stage.
- A special's zip direction is the stick at the zip frame, falling back to the stick held when the
  move started.
- The CPU was tuned until hard-vs-hard matches produced no self-destructs.

## Controls (all devices)

| Action | Gamepad | Keyboard P1 | Keyboard P2 | Touch |
|---|---|---|---|---|
| Move | L-stick | A/D (W/S up/down) | Arrows | left stick |
| Jump | X / Y | Space | ' | JUMP |
| Attack (jab/tilts/aerials) | A | F | / | ATTACK |
| Smash attack | R-stick flick, or tap direction + Attack together, hold to charge | tap dir + F | tap dir + / | flick stick + ATK |
| Special (4 moves) | B + direction | G + direction | . + direction | SPECIAL |
| Shield / dodge / air dodge | RB / LT / RT | H | , | SHIELD |
| Grab | LB, or Shield + Attack | R | ; | GRAB |
| Switch Pokémon (phase 3) | Select | T | L | SWAP |

Exact bindings live in `src/input.js` and the README.

## Moveset engine (phase 1)

- **Frame data per move** (60 fps): startup, active window, total duration, landing lag for aerials.
- **Hitboxes**: circles relative to the fighter (mirrored by facing) with damage, base knockback,
  growth, angle, hitstop, type and category. One hit per target per move unless a multi-hit move.
- **Normals**: jab, forward/up/down tilt, forward/up/down smash (chargeable, up to 1.5×),
  neutral/forward/back/up/down aerial, dash attack, ledge attack, getup.
- **Specials**: data-driven. Each move has a behaviour (projectile, dash, rising recovery, spin,
  area burst, stream) plus Showdown type/category/power/PP.
- **Up-special rule**: whatever move is bound to up-B also gives a once-per-airtime rising boost,
  so every Pokémon can recover. Afterwards you are helpless (free fall) until landing or ledge.
- **Out of PP**: the slot becomes **Struggle**: weak, typeless, a little self-damage. Up-B still
  rises, so recovery is never taken away.
- **Defence**: shield (shrinks as it takes damage, breaks = stun), spot dodge, roll, air dodge.
- **Grab & throws**: grab, pummel, forward/back/up/down throws.
- **Ledges**: auto-grab when falling near an edge; brief invincibility; climb, jump, roll, attack
  or drop.
- **Knockback**: Smash-style, scaled by damage %, move power, attacker's Atk/SpA vs defender's
  Def/SpD, weight from HP, and (phase 2) type multipliers.

## Roster v1

| Pokémon | Type | Archetype | Showcase moves |
|---|---|---|---|
| Charizard | Fire/Flying | Heavy flier, big recovery | Flamethrower, Air Slash, Dragon Claw, Flare Blitz |
| Blastoise | Water | Tank, slow, hard to launch | Hydro Pump, Ice Beam, Rapid Spin, Shell Smash |
| Venusaur | Grass/Poison | Zoner, space control | Sludge Bomb, Giga Drain, Sleep Powder, Leech Seed |
| Pikachu | Electric | Tiny, fast, light | Thunderbolt, Volt Switch, Quick Attack, Iron Tail |
| Gengar | Ghost/Poison | Glass cannon, floaty | Shadow Ball, Sludge Wave, Hypnosis, Destiny Bond |
| Lucario | Fighting/Steel | Close-range fighter, counters | Aura Sphere, Close Combat, Extreme Speed, Swords Dance |

## Build phases

1. **Moveset engine** ✅ done: normals, specials with PP, shield/dodge, grab/throws, ledges; one
   Pokémon (Pikachu) end to end, with CPU and touch controls. Guns and soldiers removed.
2. **Showdown data + all 6 fighters**: `@pkmn/dex` stats, types, type chart, STAB, moves; 3D models
   and animations for the roster; effectiveness callouts.
3. **Strategy layer**: team builder, team preview, switching, KO hidden picks, bench healing,
   HUD info (revealed moves, bench %, effectiveness hints).
4. **Battle arena stage, CPU that switches sensibly, polish**.

Later: Tera (once per match), switch-in resist rewards, abilities, items (Choice Band, Leftovers,
Life Orb, Focus Sash), hazards (Stealth Rock, Spikes), status (burn, paralysis, sleep, toxic),
weather, Journey mode (evolution), more Pokémon.

## Open questions

- Final name (working title: Showdown Smash).
- Exact PP numbers per stock (start with Showdown base PP and tune).
- Does Volt Switch/U-turn force a switch, or is it optional (hold to switch)?
