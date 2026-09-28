# SMASH OPS

A 1v1 couch platform fighter: **Super Smash Bros. rules with Call of Duty loadouts**, in 3D, in the browser.

Damage % goes up as you get hit, and the higher it is, the further you fly. You win by knocking the other
player off the map. Your gun is your moveset: recoil moves you (shotgun the floor to rocket-jump back),
reloading leaves you open, and aiming down sights charges a heavier shot.

## Play

```bash
npm install
npm run dev
```

Open the URL it prints. `--host` is on, so a phone or tablet on the same Wi-Fi can open the
`Network:` URL too.

- **Couch 1v1:** plug in two controllers (Xbox/PlayStation) and press **A** on each to join.
- **Solo / phone:** set **CPU** in P1's rules (it's on by default on phones).
- Phones play in landscape with on-screen controls.

To host it for free, enable **Settings → Pages → Source: GitHub Actions** on the repo. Every push to
`main` then deploys it (see `.github/workflows/pages.yml`).

## Controls

| Action | Gamepad | Keyboard P1 | Keyboard P2 | Touch |
|---|---|---|---|---|
| Move | L-stick / D-pad | A / D | ← / → | left thumb stick |
| Aim | R-stick (360°) | W / S tilt aim | ↑ / ↓ tilt aim | right thumb stick |
| Jump (double jump in air) | A | W or Space | ↑ | JUMP |
| Fire | RT | F | / | push aim stick to the rim |
| Aim down sights | LT | V | Right Shift | light pull on aim stick |
| Knife | X | G | . | KNIFE |
| Frag grenade | RB | H | , | FRAG |
| Exo boost (once per jump) | B | C | ; | EXO |
| Operator ability | LB | T | ' | SHIELD / DASH |
| Reload | Y | R | P | automatic |
| Drop through platform / fast fall | ↓ | S | ↓ | pull move stick down |
| Pause | Start | Esc | Enter | II |

**Tech:** tap exo boost just before you slam into the ground while launched to cancel the bounce.

## What's in v0.1

- **Operators:** **Brick**, heavy with a riot shield, and **Vex**, light with a triple jump and a phase dash.
- **Primaries:**
  - **SMG:** pins and pushes.
  - **Shotgun:** big launch, rocket-jumps.
  - **Sniper:** hold ADS for a charged KO shot.
- **Loadout:** knife, 2 frag grenades (they recharge), and an exo boost.
- **Modes:** Stock (1–5 lives) or Time (1–5 minutes, with sudden death on a tie).
- **CPU:** easy, normal or hard. The title screen runs a CPU-vs-CPU attract mode.
- **Feel:** hitmarkers, hitstop, screen shake, controller rumble, KO blasts, a killfeed, and an announcer
  voice (your browser's speech synthesis).
- **No asset files:** every model, animation and sound is generated in code.

Add `?quality=low` to the URL on a slow machine. Phones use it automatically.

## Code map

| File | What it does |
|---|---|
| `src/config.js` | Every tunable number: weapons, operators, physics, stage |
| `src/fighter.js` | Movement, knockback and loadout logic (no rendering) |
| `src/game.js` | Match flow, bullets, grenades, KOs, camera, menus |
| `src/models/soldier.js` | Procedural 3D soldier and its animations |
| `src/stage.js` | The Outpost stage |
| `src/effects.js` | Particles, explosions, KO blasts |
| `src/ai.js` | CPU opponent |
| `src/input.js` | Gamepads and keyboard |
| `src/touch.js` | Touch controls |
| `src/audio.js` | Synthesized sounds |
| `src/ui.js` | Menus and HUD |
