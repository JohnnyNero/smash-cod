# SHOWDOWN SMASH

A 1v1 couch platform fighter: **Pokémon Showdown strategy decides who is favoured, Super Smash Bros.
execution decides who wins.** It's 3D and runs in the browser, with gamepads, keyboard or touch.

The full design and roadmap live in [`docs/DESIGN.md`](docs/DESIGN.md).

**Status: phase 1 of 4 (moveset engine).** Pikachu is playable end to end: Smash normals, 4 specials
with real Showdown PP, shield, dodges, grabs and throws, ledges, a CPU and touch controls.
All 6 Pokémon, the type chart, the team builder, switching and the KO picks come in the next phases.

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
| `src/data/pokemon.js` | Species: Showdown base stats and types, and how they map to fighter stats |
| `src/data/moves.js` | Normals, specials (type/power/PP), throws; frame data and hitboxes |
| `src/damage.js` | Showdown-style damage: Atk/SpA vs Def/SpD, STAB (type chart in phase 2) |
| `src/fighter.js` | Fighter state machine (no rendering) |
| `src/game.js` | Match flow, hit resolution, projectiles, grabs, KOs, camera, menus |
| `src/models/creature.js` | Creature rig and code-driven animation |
| `src/models/species.js` | Per-species low-poly model builders (Pikachu so far) |
| `src/ai.js` | CPU opponent |
| `src/input.js`, `src/touch.js` | Gamepads, keyboard, touch |
| `src/audio.js` | Synthesized sounds |
| `src/ui.js`, `src/style.css` | Menus and HUD |
| `src/stage.js`, `src/effects.js` | Stage visuals, particles, KO blasts |
