# Movement feel research for Showdown Smash

## 1. Unit conversion

Ultimate's Battlefield and Final Destination run ledge to ledge at about 160 units ([KuroganeHammer stages](https://kuroganehammer.com/Ultimate/Stages)). Minecraft World sizes those stages at 16 blocks, about 16 m ([SmashWiki FD](https://www.ssbwiki.com/Final_Destination_(SSBU))). That gives **1 Smash unit ≈ 0.1 m**, and our 17 m stage is almost the same size. Values are converted as follows:

- speed: u/frame × 6 = m/s
- acceleration: u/frame² × 360 = m/s²
- height: units × 0.1 = m

## 2. Key findings

**Jumpsquat.** Every Ultimate character has 3 frames except Kazuya. Melee ranges from 3 (Fox, Pikachu) to 8 (Bowser). Brawl and Smash 4 used 4–9 frames and felt sluggish ([SmashWiki Jumpsquat](https://www.ssbwiki.com/Jumpsquat)). Community sources give Rivals a universal 4 frames. **Ours takes 3 frames (`sf >= 3`), which is correct.**

**Short hop.** You get a short hop by releasing jump before jumpsquat ends. Mario's short hop is 17.54 u (1.75 m) against a 36.33 u (3.63 m) full hop, a ratio of 0.48 ([Mario SSBU](https://www.ssbwiki.com/Mario_(SSBU))). Ours is 0.72× the jump velocity, so the height ratio is 0.52. That is fine.

**Buffer.** Ultimate buffers inputs for 9 frames and Brawl for 10. Melee has almost no buffer ([SmashWiki Buffer](https://www.ssbwiki.com/Buffer)). Celeste buffers jumps and has 5 frames of coyote time ([Thorson thread](https://threadreaderapp.com/thread/1238338574220546049.html), [Celeste & Forgiveness](https://maddythorson.medium.com/celeste-forgiveness-31e4a40399f1)). **We have neither.** Our `inp.pressed` is edge-only, so a press during `landlag`, `jumpsquat` or the end of a move is lost. This is the biggest responsiveness gap.

**Dash.** Initial dash lasts 10–15 frames in Ultimate and 7–15 in Melee. Flicking back during the initial dash gives a dash dance. Ultimate adds a 3-frame delay to turnaround dashes ([SmashWiki Dash](https://www.ssbwiki.com/Dash)). Mario's initial dash speed is 1.936 u/f (11.6 m/s), which is **1.1× his run speed** of 1.76 (10.6 m/s). His walk speed is 1.155 (6.9 m/s, 0.66× run) and his traction is 0.102 (36.7 m/s²). Run speeds across the Ultimate cast go from 7.1 m/s (Incineroar) to 23 m/s (Sonic).

**Gravity and fall speed** ([Gravity](https://www.ssbwiki.com/Gravity), [Falling speed](https://www.ssbwiki.com/Falling_speed), [Fast fall](https://www.ssbwiki.com/Fast_fall)):
- Gravity for Ultimate Mario is 0.087 (31 m/s²). Fox is 0.23 (83 m/s²) and Jigglypuff 0.053 (19 m/s²).
- Fall speed for Ultimate Mario is 1.5 (9 m/s). Ultimate ranges from 5.9 m/s (Jigglypuff) to 12.6 m/s (Fox). Melee is 7.8–18.6 m/s.
- The fast-fall multiplier is 1.6× for most of the Ultimate cast.
- "Floaty" means low gravity and low terminal speed. Melee's fast characters combine high gravity with high fall speed and reach terminal speed in about 9 frames.

**Landing lag.**
- Mario's empty landing takes 4 frames ([Mario SSBU](https://www.ssbwiki.com/Mario_(SSBU))).
- Rivals' default landing time is about 4 frames, and 6 for heavies ([Rivals Academy](https://rivals.academy/lectures/understanding-landing-lag/)).
- Wavedash end lag is 10 frames in Rivals and Melee.
- Aerials auto-cancel into normal landing lag when they land early or late in the move, so short-hop aerials flow.
- **We have 0 frames of empty landing and no auto-cancel windows.**

**Hitlag.** Melee uses ⌊d/3+3⌋ (cap 20). Ultimate uses ⌊d·0.65+6⌋ (cap 30) ([SmashWiki Hitlag](https://www.ssbwiki.com/Hitlag)). Ours is 3+0.6d (cap 20). For a 10% hit that gives Melee 6, **ours 9** and Ultimate 12, which is a sensible middle.

**Brawlhalla** has no hard landing states. Its fast fall is held and can be released, and gravity cancel turns ground attacks into air attacks ([Brawlhalla wiki](https://brawlhalla.wiki.gg/wiki/Movement)).

**Game-feel principles:**
- **Latency.** Swink puts the threshold for "real-time" at a response under 100 ms, which is 6 frames ([Game feel](https://en.wikipedia.org/wiki/Game_feel)). Input-to-motion must never wait on animation.
- **Forgiveness.** Celeste uses coyote time, a jump buffer and half gravity at the apex while jump is held. All three widen timing windows in the player's favour.
- **Impact.** Nijman's "Art of Screenshake" recommends freeze frames, kickback, camera trauma and permanence such as dust ([talk](https://www.youtube.com/watch?v=AJdEqssNZ-U), [notes](http://notebook.maryrosecook.com/Theartofscreenshake,JanWillemNijman.html)). We already have hitstop, trauma shake and dust.

**Procedural animation.** Rosen's Overgrowth talk animates everything from about 13 keyframes. His methods ([GDC Vault](https://www.gdcvault.com/play/1020583/Animation-Bootcamp-An-Indie-Approach), [video](https://www.youtube.com/watch?v=LNidsMesxSE)):
- Drive the stride from distance travelled.
- Blend poses by velocity.
- Let spring-damper physics add overshoot and follow-through.
- Absorb landings with a vertical spring impulse.
- Let the physics lead and have the animation follow.

Our `creature.js` already follows the first three. The gap is **spring stiffness vs. state length**. The joint springs (ω=30, ζ=0.62) settle in about 13 frames, and the yaw spring (ω=26) in about 12. The 3-frame jumpsquat and instant turnarounds therefore never visibly reach their poses. Smash covers these short states with snap-to-pose keys and smears or stretch on fast transitions.

## 3. Current values vs. reference (metres, seconds, 60 fps frames)

| Property | Ours | Reference |
|---|---|---|
| Gravity | 40 (Gengar 32) | Ult Mario 31, Melee Mario 34, Fox 83 |
| Full hop height | 2.6–3.6 m, apex 22–26 f | Mario 3.63 m, apex ≈29 f |
| Short hop / full hop height | 0.52 | 0.48 |
| Jumpsquat | 3 f | Ult 3, Rivals 4, Melee 3–8 |
| Max fall | 11–16 m/s | Ult 5.9–12.6 (Mario 9), Melee 7.8–18.6 |
| Fast fall | 1.6× (up to 25.6 m/s) | 1.6× (Ult), max about 20 m/s |
| Run speed | 9.0–11.7 | Ult 7.1–23, Mario 10.6 |
| Initial dash | 0.9× run, no commitment | 1.1× run, 10–15 f |
| Walk | 0.45× run | Mario 0.66× |
| Traction / friction | 40 m/s² | Mario 36.7 m/s² |
| Air speed | 5.3–6.6 (0.58× run) | Mario 7.25 (0.69× run) |
| Air acceleration | 26, flat | Mario 3.6 base + 25 × stick |
| Empty landing | 0 f | Ult 4, Rivals 4–6 |
| Aerial landing lag | 7–16 f, no auto-cancel | Ult 6–25 f plus auto-cancel windows |
| Buffer | 0 f | Ult 9, Brawl 10 |
| Coyote time | 0 f | Celeste 5 (Smash: none) |
| Hitlag at 10% | 9 f | Melee 6, Ult 12 |
| Turn (visual) | ≈12 f yaw spring | 1–4 f |

## 4. Prioritized changes

### Physics and controls (`src/fighter.js`, `src/config.js`)

1. **Input buffer (highest impact).**
   - Add `INPUT.buffer = 7` frames to `config.js`.
   - In `readInput()`, store `this.buf[btn] = frame` for jump, attack, special, shield and grab. Also store the stick direction for smash flicks.
   - Add `consume(btn)` and replace `inp.pressed.X` checks with it in `groundControl`, `airControl`, `shieldControl`, landlag exit and `endMove`.
   - Give landlag, jumpsquat and the end of a move an actionable "consume on first free frame".
   - Why: presses made during lag are dropped today. Ultimate uses 9 frames, but 6–8 keeps inputs from feeling sticky.

2. **Auto-cancel windows and a short-hop aerial macro.**
   - In `land()`, if `moveF < firstHitboxStart` or `moveF > lastActiveEnd + 4`, call `landLag(3)` instead of `m.landLag`. Moves can override this with an `autoCancel: [a, b]` field in `moves.js`.
   - In `jumpsquat`, if attack is pressed during jumpsquat or on the same frame as jump, force a short hop and queue the aerial.
   - Why: a short hop is in the air for about 35 f, while fair (38 f) and nair (36 f) outlast it. Every short-hop aerial therefore eats full landing lag.

3. **Real dash state.**
   - Add a `dash` state for `PHYS.dashFrames = 11`.
   - On entry, set `vel.x = dir * runSpeed * 1.1`, above run speed, then settle to run.
   - A flick back during the dash re-enters dash in the opposite direction, which is dash dancing.
   - Releasing the stick or reversing from a run enters a `skid` state of about 10 f that decelerates at `groundFriction`. Jump and attack cancel out of skid; turning does not. A reverse flick within the last 3 f of the dash is a pivot: face the other way and keep sliding.
   - Why: today a flick gives a free 0.9× burst with no commitment, so dashing feels like sliding rather than planting feet.

4. **Walk and air speed.**
   - In `groundControl`, change walk from `0.45` to `0.6` × runSpeed.
   - In `fighterStats`, change `airSpeed` to `(2.6 + spe/22)`. That gives Pikachu 6.7 and Blastoise 6.1, about 0.66× run.
   - In `airDrift`, use `accel = 4 + 24*|sx|`, which is Smash's base-plus-additional model, so light tilts drift gently.

5. **Empty landing.** In `land()`, when `st === 'air'` and `impact > 6`, call `landLag(3)` so the landing squash reads and the body has weight. Buffered jump and shield (change 1) must be able to act on frame 1 of it. Lighter landings stay at 0.

6. **Coyote jump.** When `leaveGround()` fires from a `ground` or `dash` state without the drop-through input, set `this.coyote = 5`. In `airControl`, a jump while `coyote > 0` uses `st.jump` and does not spend `airJumps`. This follows Celeste. It is not canon Smash, but it prevents the "my jump got eaten at the edge" moment.

7. **Fall speed.** Lower `physique.maxFall` by about 20%: Pikachu 12, Charizard 12, Blastoise 13, Venusaur 12, Lucario 12, Gengar 9. Keep `gravity: 40` and `fastFallMult: 1.6`.
   - Why: our fast falls reach 22–26 m/s, beyond Melee Fox. Slightly lower terminal speed matches the design doc's "a little floatier than Ultimate" and makes fast fall a bigger, more readable change.
   - Optional: when jump is held and `|vel.y| < 2.5`, use 0.6× gravity, like Celeste's apex hang.

8. **Jump-cancel options.** In `jumpsquat`, accept up-smash (up plus attack or a smash flick), grab and up-special, as Ultimate does. This makes jump-cancel grabs and up-smash out of shield work through the existing shield-to-jumpsquat path.

### Animation (`src/models/creature.js`)

9. **Make short states readable.**
   - In the joint loop, raise `w` from 30 to 60 and `zeta` to 0.75 when `v.state` is `jumpsquat`, `landlag`, `dash` or `skid`.
   - For `jumpsquat`, write `pv.bodyY` and `pv.stretch` directly (snap) instead of damping, with `stretch -0.18`.
   - Add a take-off stretch: when `vy > 0` and less than 5 frames have passed since the jump, add `stretch += 0.15` with `curl 0.9`.
   - Replace the fixed `landSquash * -0.22` with an impulse on `springs.bob`: `bob.v -= impact*0.05`. This is Rosen's spring landing absorption, so a heavy landing sinks and rebounds.

10. **Turnarounds and dash poses.**
    - In the yaw integrator, raise ω from 26 to 55 when grounded and `|vx| > 1`, or when the state is `dash`. That turns the body in about 4 f. Keep 26 for idle turns.
    - On dash entry, kick `pv.lean += 0.3` and add a short horizontal smear by scaling the body 1.15 along x for 2 frames.
    - In `skid`, hold a lean-back pose (`torso.x -0.4`, legs braced) and set ankle `plant = 1`.
    - Why: Smash sells dash dances and pivots with 1–3 frame pose snaps and smears. A 12-frame spring blurs them away.

Priority order: 1, 2, 3, 9, 10, 5, 4, 6, 7, 8.
