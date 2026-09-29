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
| Data source | `@pkmn/dex` (MIT-licensed Pokémon Showdown data), extracted at build time by `npm run gen:dex` into `src/data/dex.js` (13 KB) so the 50 MB package never ships. |
| 3D models | Real rigged Pokémon models (game rips from github.com/Pokemon-3D-api/assets, private hobby use) driven by our procedural animation; the procedural models remain as a fallback (`?models=procedural`). |
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
| HP + body weight (kg) | Weight (launch resistance): `0.7 + HP/250 + sqrt(kg)/55` |
| Types | Real Showdown type chart. 2× → 1.6×, ½× → 0.6×, 4× → 2.56×; immunities (0×) pass straight through |
| Stat stages | Showdown stages (+1 = 1.5×) on Atk/Def/SpA/SpD; Spe stages scale movement by √ |
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

## Phase 2 notes

- Movesets (all legal per Showdown learnsets, checked by the generator):

  | Pokémon | B | Side B | Up B (recovery) | Down B |
  |---|---|---|---|---|
  | Pikachu | Thunderbolt | Volt Switch | Quick Attack | Iron Tail |
  | Charizard | Flamethrower | Flare Blitz (recoil) | Fly | Dragon Claw |
  | Blastoise | Hydro Pump (5 PP) | Ice Beam | Rapid Spin | Shell Smash |
  | Venusaur | Sludge Bomb | Giga Drain (drain) | Sleep Powder | Leech Seed |
  | Gengar | Shadow Ball | Hypnosis | Sludge Wave | Destiny Bond |
  | Lucario | Aura Sphere | Close Combat | Extreme Speed (5 PP) | Swords Dance |

  Changes from the original sketch: Charizard uses Fly (a real recovery) instead of Air Slash;
  Blastoise's recovery is Rapid Spin; Gengar's Sludge Wave sits on up-B with the generic rise.
- Showdown rules kept: Grass types are immune to powder moves and Leech Seed; Ghost is immune to
  Normal and Fighting moves (those projectiles fly straight through Gengar); damage doesn't wake a
  sleeper in Showdown, but here a hit does, so sleep is a setup, not a death sentence.
- Destiny Bond: for 4 s after using it, whoever KOs Gengar is KO'd too (can end in a draw).
- Lucario has Smash-style Aura: its damage grows with its own % (up to +50%).
- Normals (jab/tilts/aerials/throws) are typeless, so only specials interact with the type chart.
- CPU hard-vs-hard KOs land around 100–200% (heavies at the top end); blast zones tightened.

## Phase 3 notes

- **Modes:** TEAM (default, 3v3 Showdown mode), STOCK and TIME (single Pokémon, classic Smash).
- **Team builder** lives on the select screen: ◀▶ on a Pokémon row changes species (Species Clause:
  no duplicates), A opens its move editor (4 moves from its real learnset, no duplicates; type,
  category, power and PP shown). Teams are saved per player slot in the browser (localStorage).
- **Team preview:** species and types only (moves secret). Each player presses ◀ ▲ ▶ for member
  1 / 2 / 3 as their lead; the screen only shows "LOCKED IN". 15 s timer, CPU picks by matchup.
- **Switching:** SWAP + ◀ ▲ ▶ (or SWAP alone for the next one). 14-frame recall you can be hit out
  of, then the new Pokémon appears where the old one stood. 5 s cooldown. Switching out clears stat
  stages, Leech Seed, Destiny Bond and sleep (sleep persisting on the bench is a possible later rule).
- **Bench:** each Pokémon keeps its own %, PP and stats; benched ones heal 1% per second.
- **Volt Switch** pivots: if it hits, you switch to the next healthy teammate for free.
- **KO picks:** the battle pauses (6 s). The KO'd player picks their next Pokémon; the other player
  may stay (▼ / A) or switch for free. Both are revealed together ("PIKACHU vs GENGAR").
- **Information:** in TEAM mode, HUD moves read "???" until used; the team strip shows each member's
  % and fainted status.
- **CPU:** picks leads and replacements by a type-matchup score, and occasionally switches mid-fight
  when a teammate has a clearly better matchup. Smarter switching is phase 4.

## Phase 4 notes

- **Plateau Stadium** replaces the Outpost: a stone battle field with Pokémon-style court markings
  floating above a stadium bowl, with an animated crowd that jumps on KOs and super-effective hits,
  floodlights, team banners, crystals under the rock, torches, birds, and Poké Ball revival platforms.
  Collision geometry is unchanged. The bowl sits below the field so the sky stays behind the
  fighters (readability first).
- **Effectiveness hints:** revealed moves on the HUD show ▲ (super effective), ▼ (resisted) or
  ✕ (no effect) against the opponent's current Pokémon. The KO-pick screen tags options
  "GOOD vs X" / "RISKY vs X" from public type information only.
- **CPU:** avoids immune/resisted specials (uses super-effective ones ~3× as often as resisted ones
  in testing), doesn't over-stack setup moves, only re-seeds when the foe isn't seeded, saves
  Destiny Bond for when it's damaged, switches out of bad matchups or to rest a heavily damaged
  Pokémon, and picks leads/replacements by matchup.
- Polish: crowd roar on KOs, normals have display names in the killfeed ("Forward Smash"),
  dead gun-era effects removed.

## Polish pass: models & animation

- **Look:** characters are cel-shaded (3-band toon ramp) with ink outlines (inverted-hull copies of
  each part) so they pop against the stadium; the stage stays low-poly. `?style=lowpoly` restores
  the faceted look for comparison.
- **Models:** smoother parts; Pikachu's thighs blend into its body and its tail is bigger; Charizard
  has chunkier legs, a mouth, bigger wings with claws; Lucario's mask is two lobes around the eyes,
  with bigger ears and chest spike. All eyes blink.
- **Secondary motion:** springs driven by the body's acceleration make tails, ears, Charizard's
  wings and Lucario's aura appendages lag, swing and bounce.
- **Movement:** livelier run (twist, lean, bob), idle breathing and glancing around, crouch on
  jump/landing, front flip on double jumps, directional hit reactions.
- **Attacks:** smear arcs trace every melee hitbox as it comes out (type-coloured for specials).
- **Poké Balls:** a ball arcs in from the trainer's side and the Pokémon grows out of a white flash
  (match start, switch-in, after a KO); switching out fires a red recall beam and shrinks the
  Pokémon away.
- **Victory pose:** the winner cheers on the results screen, framed by the camera.

## Feel pass: performance & fluid animation

- **Performance:** the stadium's ~450 static stand/tower/banner meshes are baked into one mesh per
  material (draw calls ~520 → ~280); fewer flash point lights; pixel ratio capped at 1.75.
  Dynamic resolution drops the render scale (then bloom) if frames run long, with hysteresis so it
  never see-saws. `?quality=high|low` pins the setting.
- **Smooth motion:** the 60 Hz sim is interpolated at render time (positions and move progress), so
  120/144 Hz screens and uneven frames stay smooth.
- **Joints:** every joint follows its target through an underdamped spring, so poses flow into each
  other with a little overshoot instead of snapping.
- **Locomotion:** stride is tied to distance travelled (no foot skating), gait blends walk → run,
  lean follows acceleration, skid lean on turnarounds, two bounces per stride, a level head, arms
  pumping against legs; a breathing, weight-shifting ready stance at idle; air poses blend
  continuously from rising tuck to falling spread, with squash & stretch.
- **Attacks:** every move is timed to its real hit frames (`hitWindows` in game.js): wind-up
  (anticipation) → a snap in the last few frames before the first active frame → hold → eased
  recovery, plus a body lunge and a follow-through swell. Victims shake during hitstop.

## Ink outlines (screen space)

Per-part inverted-hull outlines were inconsistent (lines doubled where parts overlap and vanished
where one part hid another). `src/ink.js` replaces them: character meshes go on `INK_LAYER`, solid
stage pieces on `OCCLUDER_LAYER`; an `InkPass` renders a 4x-MSAA coverage + depth mask of the
characters and draws ink where a pixel is just outside a silhouette (one continuous line, width
from a world size clamped to 1.8-4.5 px) or next to a clearly nearer surface (inner lines). It is
blended onto the frame and scissored to the characters' screen area. The composer (4x MSAA
target) now always runs: RenderPass -> bloom (high quality only) -> ink -> OutputPass.

## Combat mechanics pass (from SMASH_RESEARCH.md)

- **Knockback:** `launch = kb + % x grow x (0.5 + dmg/20) / weight`: weight resists only the part
  that grows with damage (Smash), so light Pokémon aren't flung by weak hits at low percent.
- **DI + ASDI:** the stick held as hitlag ends bends the launch by up to `COMBAT.diMaxDeg` = 12°
  (most when held perpendicular), and nudges position by `asdi` = 0.15. The old sideways drift is
  gone. The CPU holds survival DI (perpendicular, up-and-in) with its precision.
- **Shields:** shieldstun = floor(0.8 x dmg x mult + 2) with mult ground 1 / smash 0.725 / aerial
  0.33 / projectile 0.29; blocked hits get full hitlag; dropping shield costs
  `SHIELD.dropFrames` = 8 (jump or re-shield allowed); up-special and up-smash come out of shield.
- **Tech:** 14-frame window; a shield press within 30 frames of the previous one doesn't count, so
  mashing no longer techs. Missed tech (knockdown): after 10 frames roll left/right, getup-attack,
  or stand up.
- **Stale moves (normals only):** a 9-hit queue with Ultimate's factors reduces damage (and half as
  much base knockback) of repeated moves; an unused move gets x1.05.
- KO% table and scripts: `ko.mjs` style sims (attacker Lucario, centre stage): forward smash KOs
  Pikachu ~80%, Blastoise ~115% (145% with good DI).

## Audio, secondary motion and CPU pass

- **Cries:** Showdown's MP3 cries for the six species are vendored in `public/audio/cries/`
  (about 7 KB each), preloaded by `Audio.loadCries` and decoded once audio unlocks. They play on
  Poké Ball send-out, (pitched down) on KO, and for the winner at GAME.
- **Hits:** layered synth hits: a highpass crack, a pitch-dropping body thump, a band-passed
  crunch and, from 10 damage, a sub boom with an air tail, all scaled by damage, plus the type layer.
- **Spring wobble:** floppy bone chains (tails, ears, locks, wing feelers) get a per-bone
  underdamped spring on top of the follow-through lag, kicked by the body's acceleration and turn
  rate (farther bones swing more).
- **CPU:** sees the opponent 24/15/9 frames late (easy/normal/hard) so it reacts like a person;
  punishes visible end lag / landing lag / shield breaks (runs in, then jab, grab or smash);
  edgeguards from the ledge (smash high returns, down tilt low ones, projectiles from afar) without
  leaving the stage; each recovery picks random jump/up-special heights and sometimes aims for the
  stage instead of the ledge. CPU-vs-CPU: 0 self-destructs in 24 KOs, average KO 129% (was 142%).

## Body push

Like Smash (and Rivals), fighters aren't solid: overlapping fighters ease apart with a soft push
(`Game.bodyPush`, `COMBAT.pushWidth`/`pushMax`), weak enough that dashes and rolls still cross
through someone, weaker in the air, never shoving anyone off a ledge, and off during dodges,
grabs, hitstun, ledge hangs, switching and respawns. Walking into someone nudges them along.

## Finishing blow & off-screen bubbles

- `Game.predictKO` replays the launch physics (hitstun gravity, knockback decay, landing on the
  stage) over the hitstun and calls it a KO only if it still is with the best DI either way. A KO
  hit then triggers `finishHit`: extra hitlag, slow motion (0.12x for 1.2 s real time on a
  match-ending KO, 0.35x for 0.35 s otherwise), the camera zooming onto the impact, a screen flash
  (red for match-ending) and a bell ping. In CPU tests 13 of 15 zooms were real KOs.
- Fighters past the screen edge (but inside the blast zones) show a bubble pinned to the edge
  with their initial and %, shrinking with distance.

## Real Pokémon models

- `public/models/<species>.glb`: the six roster models from Pokemon-3D-api/assets (Draco-decoded,
  WebP textures, about 1.9 MB total), skinned with GameFreak-style bone names. Loaded before the
  game starts (`preloadRigs` in `src/models/rig.js`); on failure the procedural models are used.
- `buildRig` clones the skinned scene per fighter, converts materials to our toon material (the
  texture is kept, plus rim light and hit flashes), normalises height to the species size with feet
  on the floor, and maps our joints to bones (hips/torso/head/arms/elbows/legs/knees/ankles/tail/
  ears, with chains sharing a rotation). creature.js poses dummy joints exactly as before;
  `retarget()` writes them to the bones as `P⁻¹ · R · C · P · qRest` (P = parent rest rotation in
  model space, C = rest correction that drops T-posed arms to hang). IK segment lengths come from
  bone positions.
- Extras: Charizard's wings flap on their bone chains and its tail flame (meshes skinned to TailA*)
  is an additive glow that flickers; Lucario's aura dreadlocks swing. The ink mask shader supports
  skinning.
- Floppy chains (tails, ears, Lucario's locks, Charizard's wing feelers) replay the joint's rotation
  with a per-bone lag (`LAG` in rig.js) so motion travels down them as a wave; shoulders share arm
  swings; the jaw opens on strikes, hits, Flamethrower and the victory cheer.
- Default look is the models' own materials (no cel shading); `?style=toon` restores toon + ink.
- Known gaps: no blinking; Charizard's long tail is purely visual.

## Polish pass 2: movement & models

- **Movement feel:** a hard flick bursts into an initial dash (so you can dash-dance), skid dust
  when reversing out of a run, footstep puffs as feet plant, landing puffs scaled to impact, and a
  star glint when you fast-fall. Dust is soft and round rather than faceted.
- **Feet:** legs get an ankle pivot (built automatically from the lowest parts of each leg) that
  keeps feet flat on the ground through the stride and points the toes in the air.
- **Pikachu** drops onto all fours at full speed, with a bounding gait and the tail streaming out
  behind.
- **Models:** smoother silhouettes (big parts get more segments), capsule limbs, a crisp warm cel
  rim light along the silhouette (toon style). Lucario is rebuilt: black-furred thighs and waist,
  digitigrade blue shins, cream chest fur with tufts, black muzzle and mask, cheek fur, black paws
  with steel spikes, a bushy tail. Charizard gets shoulders and clawed hands; Venusaur gets haunches,
  capsule legs with toes and frond-shaped leaves.

## Knees & elbows

- Every limb is split into upper and lower segments at a real joint (`bend()` in species.js adds
  a knee/elbow pivot and a ball to cover the seam); joints `kneeL/R` and `elbowL/R` animate like
  the rest.
- Run: knees fold as each leg swings through and straighten as the foot plants; elbows stay bent
  and pump. Jumps tuck the knees, the double-jump flip is a cannonball, the idle holds a guard.
- Attacks chamber and extend: the jab's elbow snaps straight, forward tilt chambers the knee then
  kicks out, back air is a tucked two-footed kick, smashes cock the arms back.
- Two-bone IK: whenever the body dips while standing (crouch, landing, wind-up, breathing), hips
  and knees bend so the feet stay on the floor; ankles counter the whole leg to stay flat.
- Venusaur's front legs are its "arms", so its elbows fold like knees.

Movement research (frame data, game-feel, procedural animation, and a prioritized change list):
see [MOVEMENT_RESEARCH.md](MOVEMENT_RESEARCH.md).

## Movement pass (research items 1–4)

- **Input buffer:** jump/attack/special/shield/grab/smash presses are remembered for
  `INPUT.buffer` = 7 frames (Ultimate: 9) and used on the first actionable frame; the action that
  uses a press consumes it (`Fighter.consume`). Mashing (grabs, sleep) still counts raw presses.
  Buffered actions out of landing lag come out on the same frame the lag ends.
- **Landing:** aerials landed before their first hitbox or 4+ frames after their last one
  auto-cancel into `PHYS.autoCancelLag` = 3 frames. Plain jumps land with 3 frames
  (`emptyLanding`) that jump or shield can cancel. Attack during jumpsquat (or jump+attack
  together) forces a short hop with the aerial coming out on the first airborne frame.
- **Dash:** a flick starts an initial dash (`dashFrames` 11 at `dashSpeed` 1.1× run). Flick back
  during it to dash-dance; reverse in its last 3 frames to pivot (face the other way, keep
  sliding). One neutral frame is allowed inside a dash; two ends it in a skid. Letting go of or
  reversing a run skids (`skidFrames` 10) and turns around at the end. Dash and skid are timers on
  the ground state (`dashF`, `skidF`), so nothing else that checks `ground` changed.
- **Animation for short states:** stiff joints (ω 60) during jumpsquat, landing, dash, skid and
  take-off; jumpsquat snaps into its crouch; take-off stretch; landings kick the bob spring (sink
  and rebound); dash start kicks the lean and smears the body forward; a braced skid pose with
  feet planted; turning uses ω 55 while moving (about 4 frames) and 26 when idle.

### Ideas after v1

Tera (once per match), switch-in resist rewards, abilities, items (Choice Band, Leftovers, Life Orb,
Focus Sash), hazards (Stealth Rock, Spikes), burn/paralysis/toxic, weather, sleep persisting on the
bench, Journey mode (evolution), more Pokémon and stages, music, online play.

## Controls (all devices)

| Action | Gamepad | Keyboard P1 | Keyboard P2 | Touch |
|---|---|---|---|---|
| Move | L-stick | A/D (W/S up/down) | Arrows | left stick |
| Jump | X | Space | ' | JUMP |
| Attack (jab/tilts/aerials) | A | F | / | ATTACK |
| Smash attack | R-stick flick, or tap direction + Attack together, hold to charge | tap dir + F | tap dir + / | flick stick + ATK |
| Special (4 moves) | B + direction | G + direction | . + direction | SPECIAL |
| Shield / dodge / air dodge | RB / LT / RT | H | , | SHIELD |
| Grab | LB, or Shield + Attack | R | ; | GRAB |
| Switch Pokémon (+ ◀ ▲ ▶ to choose) | Y | T | L | SWAP |
| Hidden picks (preview / KO) | stick ◀ ▲ ▶, ▼ / A = stay | A ◀ W ▲ D ▶ | arrows | tap |

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
2. **Showdown data + all 6 fighters** ✅ done: `@pkmn/dex` stats, types, type chart, STAB, moves,
   learnset checks; 3D models and animations for the roster; effectiveness callouts. Pulled in early
   because the roster's moves needed them: stat stages (Swords Dance, Shell Smash, Close Combat drops),
   sleep (Sleep Powder, Hypnosis), Leech Seed, drain (Giga Drain), recoil (Flare Blitz), Destiny Bond.
3. **Strategy layer** ✅ done: team builder, team preview, switching, KO hidden picks, bench healing,
   HUD info (revealed moves, bench %). Effectiveness hints landed in phase 4.
4. **Battle arena stage, CPU that switches sensibly, polish** ✅ done (see Phase 4 notes).

Later: Tera (once per match), switch-in resist rewards, abilities, items (Choice Band, Leftovers,
Life Orb, Focus Sash), hazards (Stealth Rock, Spikes), status (burn, paralysis, sleep, toxic),
weather, Journey mode (evolution), more Pokémon.

## Open questions

- Final name (working title: Showdown Smash).
- Exact PP numbers per stock (start with Showdown base PP and tune).
- Does Volt Switch/U-turn force a switch, or is it optional (hold to switch)?
