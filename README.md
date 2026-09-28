# SHOWDOWN SMASH

A 1v1 couch platform fighter: **Pokémon Showdown strategy decides who is favoured, Super Smash Bros.
execution decides who wins.** It's 3D and runs in the browser, with gamepads, keyboard or touch.

The full design and roadmap live in [`docs/DESIGN.md`](docs/DESIGN.md).

**Status: phase 2 of 4.** All 6 Pokémon are playable (Pikachu, Charizard, Blastoise, Venusaur,
Gengar, Lucario) with real Showdown stats, types, the full type chart ("SUPER EFFECTIVE!"), 4 specials
each with real PP, stat boosts, sleep, Leech Seed and Destiny Bond. The team builder, team of 3,
switching and hidden KO picks come in phase 3.

## Play

```bash
npm install
npm run dev
```

Open the URL it prints. Phones on the same Wi-Fi can open the `Network:` URL. Every push to the
working branch also deploys to GitHub Pages.

- **Couch 1v1:** plug in two controllers and press **A** on each to join.
- **Solo / phone:** set **CPU** in P1's rules (it's on by default on phones). Phones play in landscape.

## Controls

| Action | Gamepad | Keyboard P1 | Keyboard P2 | Touch |
|---|---|---|---|---|
| Move | L-stick / D-pad | WASD | Arrows | left thumb |
| Jump (tap for short hop) | X / Y | Space | ' | JUMP |
| Attack (+ direction = tilts / aerials) | A | F | / | ATTACK |
| Smash attack (hold to charge) | R-stick, or tap direction + A | tap direction + F | tap direction + / | flick + ATTACK |
| Special (+ direction = your 4 moves) | B | G | . | SPECIAL |
| Shield (+ flick = roll / spot dodge; air = air dodge) | RB / LT / RT | H | , | SHIELD |
| Grab (then direction = throw, attack = pummel) | LB, or shield + A | R | ; | GRAB |
| Drop through platform / fast fall | flick down | S | ↓ | flick down |
| Pause | Start | Esc | Enter | II |

- **Ledges:** fall near the edge to grab it. Then **up** climbs, **jump** jumps, **attack** does a
  getup attack, **shield** rolls in, and **down** lets go.
- **Tech:** tap shield just before you slam into the ground to recover instantly.
- **PP:** each special has limited uses per stock, shown on both players' HUD. At 0 PP the move
  becomes **Struggle**: weak, typeless, and a little self-damage. Up-special still gets you back to
  the stage.

Add `?quality=low` to the URL on a slow machine. Phones use it automatically.

## Code map

| File | What it does |
|---|---|
| `docs/DESIGN.md` | Design doc: decisions, pillars, roadmap |
| `src/config.js` | Engine tunables: physics, combat, shield, dodges, ledges, stage |
| `src/data/roster.js` | Playable Pokémon: size, jumps, default moves, model |
| `src/data/dex.js` | Generated Showdown data (run `npm run gen:dex` after changing the roster or moves) |
| `scripts/gen-dex.mjs` | Extracts stats, types, moves, type chart and learnsets from `@pkmn/dex` |
| `src/data/pokemon.js` | Merges roster + Showdown data; maps stats to fighter stats |
| `src/data/moves.js` | Move behaviour: frame data, hitboxes, projectiles, effects |
| `src/data/moveset.js` | Builds a fighter's moves (behaviour + Showdown type/power/PP) |
| `src/damage.js` | Showdown-style damage: Atk/SpA vs Def/SpD, stat stages, STAB, type chart |
| `src/fighter.js` | Fighter state machine (no rendering) |
| `src/game.js` | Match flow, hit resolution, projectiles, grabs, KOs, camera, menus |
| `src/models/creature.js` | Creature rig and code-driven animation |
| `src/models/species.js` | Per-species low-poly model builders |
| `src/ai.js` | CPU opponent |
| `src/input.js`, `src/touch.js` | Gamepads, keyboard, touch |
| `src/audio.js` | Synthesized sounds |
| `src/ui.js`, `src/style.css` | Menus and HUD |
| `src/stage.js`, `src/effects.js` | Stage visuals, particles, KO blasts |
