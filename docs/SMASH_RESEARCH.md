# Showdown Smash: deep research on what makes platform fighters great

Scope: combat systems, game feel, CPU AI, lessons from other platform fighters, and stages/modes, mapped onto the current code (`src/fighter.js`, `src/game.js`, `src/ai.js`, `src/config.js`, `src/effects.js`, `src/audio.js`, `src/models/creature.js`). This builds on `docs/MOVEMENT_RESEARCH.md` (buffer, dash, landing, jumpsquat, hitlag basics) and does not repeat it.

**Units.** This report uses the convention from MOVEMENT_RESEARCH: 1 Smash unit ≈ 0.1 m and 1 of our units ≈ 1 m (speed u/f × 6 = m/s, acceleration u/f² × 360 = m/s²). Note that `config.js` line 1 says "1 unit ~ half a meter", which contradicts `MOVEMENT_RESEARCH.md`. Pick one and fix the comment.

---

## 1. Combat systems: the numbers

### Knockback, launch and hitstun
- **Knockback formula** (Melee through Ultimate): `KB = ((((p/10 + p·d/20) · 200/(w+100) · 1.4) + 18) · s + b) · r`, where p is percent after the hit, d is damage, w is weight, s is growth/100, b is base KB, and r covers staling, rage and other ratios ([SmashWiki Knockback](https://www.ssbwiki.com/Knockback)).
  - Weight only scales the percent term. **Base knockback is weight-independent.**
- **Launch speed** = KB × 0.03 u/f. It **decays by 0.051 u/f every frame**, which is about 18 m/s² along the launch vector, on top of normal gravity. **Tumble** starts at about 80 KB, which is 2.4 u/f or about 14.4 m/s (same source).
  - Ultimate adds "balloon knockback": when hitstun is over 32 frames, the start of the launch is sped up.
  - Launch angles from 70° to 110° are homogenised vertically.
- **Hitstun** = 0.4 × KB frames. Ultimate takes one frame off that ([SmashWiki Hitstun](https://www.ssbwiki.com/Hitstun)). In our units this works out to about **2.2 frames per m/s of launch**.
- **Hitstun cancel (Ultimate).**
  - Air dodge is allowed after 40 frames of hitstun once launch speed is below 2.5 u/f (about 15 m/s).
  - An aerial is allowed after 45 frames once launch speed is below 2.0 u/f.
  - This stops long hitstun at high launch speeds from being a death sentence.
- **Rage (Ultimate).** `1 + (p − 35)/115 × 0.1`: a linear bonus on the attacker's own % from 35% to 150%, capped at ×1.10. It was ×1.15 in Smash 4. Ultimate removed it from set-knockback moves because early KOs felt "abnormally rewarding" ([SmashWiki Rage](https://www.ssbwiki.com/Rage)).

### DI, SDI and ASDI
- **Trajectory DI** rotates the launch angle toward the stick. The rotation is largest when the stick is perpendicular to the launch and zero when it is parallel. Maximum rotation is **18° in Melee and about 9.74° in Ultimate** ([SmashWiki DI](https://www.ssbwiki.com/Directional_influence)).
  - The stick is read on the **last frame of hitlag**.
  - Ultimate adds **LSI**: holding up multiplies launch speed by up to ×1.095, holding down by ×0.92. LSI does nothing for launch angles between 65° and 115°.
- **SDI** moves the victim during hitlag, once per stick flick. Melee moves them 6 u (0.6 m) per flick; Ultimate moves them 2 u (0.2 m), with at most one input every 4 frames.
- **ASDI** is a single nudge when hitlag ends: 3 u in Melee, 1.33 u (0.13 m) in Ultimate ([SmashWiki SDI](https://www.ssbwiki.com/Smash_directional_influence)).
- NASB2 added **diminishing SDI returns**: the more you SDI during one hitstun, the less each input moves you ([SuperCombo NASB2](https://wiki.supercombo.gg/w/Nickelodeon_All-Star_Brawl_2/Universal_Mechanics)).

### Hitlag specifics
- Ultimate hitlag: `⌊(d·0.65 + 6) · multipliers⌋`, capped at 30 frames ([SmashWiki Hitlag](https://www.ssbwiki.com/Hitlag)).
- **Electric hits ×1.5.** Crouch cancel ×0.67.
- Hitlag also applies on shield. When a hit is shielded, multipliers below 1 are ignored, but the electric multiplier still applies.
- **Crouch cancel** in Ultimate gives ×0.85 knockback and ×0.67 hitlag. In Melee it gives ×0.67 knockback ([Crouch cancel](https://www.ssbwiki.com/Crouch_cancel)).
- **Meteor cancel** exists only in Melee (8 frames after hitlag) and Brawl (25 frames). Ultimate removed it, so spikes are pure spikes ([Meteor cancel](https://www.ssbwiki.com/Meteor_cancel)).

### Staling (freshness)
- The game keeps a queue of the **last 9 moves that connected**.
- Each copy of a move in the queue takes off 0.08, 0.076, 0.068, 0.060, 0.053, 0.045, 0.038, 0.030 or 0.022 (by queue position).
- A move that is not in the queue gets a **freshness bonus of ×1.05**.
- In Ultimate, hitting a shield also stales the move ([Stale-move negation](https://www.ssbwiki.com/Stale-move_negation)).
- Staling mostly shows up in damage. Its effect on knockback is small in Smash 4 and Ultimate.

### Shields
- **Ultimate shield values** ([Shield](https://www.ssbwiki.com/Shield)):
  - 50 HP, taking damage at **×1.19**.
  - Drains **0.15 per frame** while held and regenerates 0.08 per frame.
  - Dropping the shield takes **11 frames** (15 in Melee).
  - Up smash and up special can be used out of shield without a jump.
- **Shieldstun (Ultimate)** is `⌊0.8·d·t·m·p + 2⌋` ([Shieldstun](https://www.ssbwiki.com/Shieldstun)), capped at 60 frames:
  - t = 0.33 for aerials, 0.725 for smash attacks, 1 for everything else.
  - p = 0.29 for projectiles.
- **Parry (Ultimate)**: a 5-frame window as the shield is **released**. It gives +3 frames of advantage against direct hits and +12 against indirect ones. It cannot parry multi-hits twice in one shield drop ([Perfect shield](https://www.ssbwiki.com/Perfect_shield)).
- **Rivals of Aether** has no shield. A timed parry leaves the attacker stunned for **40 frames after the move ends**, or helpless if they were in the air ([Rivals wiki](https://rivals-of-aether.fandom.com/wiki/Parrying)).

### Grabs
- Hold time: `90 + 1.7p` frames. Each mash takes off **8 frames**.
- After a release, the victim is **immune to grabs for 60 frames** in Ultimate (70 in Smash 4) ([Grab](https://www.ssbwiki.com/Grab)).
- An air release leaves the victim in 29 frames of lag ([Grab release](https://www.ssbwiki.com/Grab_release)).

### Ledges
- **Ultimate ledge intangibility**: `60·(airtime/300) + 44 − (p/120)·44` frames, which ranges from 23 to 123 frames. Coming back from far away at low % buys more safety.
- **Regrabs**: 0.8× intangibility on the first regrab, 0.5× on the second, none after that. There is a hard limit of 6 grabs per airtime.
- **Ledge trump**: grabbing an occupied ledge pops the current occupant off it.
- **2-frame window**: the grabber is vulnerable for 2 frames before intangibility starts.
- Melee used a flat 30 frames of intangibility ([Edge](https://www.ssbwiki.com/Edge)).
- **Project M** limited ledge invincibility to the first 5 regrabs to stop planking ([Planking](https://www.ssbwiki.com/Planking)).
- **Rivals** removed ledges entirely so that "the corner was not the safest part of the battlefield" ([Gameverse interview](https://gameverse.com/2015/12/01/dan-fornace-talks-rivals-of-aether/)).

### Dodges, techs and clanking
- **Dodge staling (Ultimate)**: up to 5 levels.
  - At full staleness, ground dodges play 1.3× slower and directional air dodges travel 0.667× as far.
  - Mario's spot dodge goes from intangible on frames 3–17 to frames 6–17.
  - A dodge stays fresh if you use it no more than once a second ([Dodge staling](https://www.ssbwiki.com/Dodge_staling)).
- **Brawlhalla** puts a hard cooldown on dodges instead: 60 frames on the ground and 163 in the air ([Brawlhalla wiki](https://brawlhalla.wiki.gg/wiki/Movement)).
- **MultiVersus** added a 6-frame lockout on neutral dodge after hitstun, plus a "same attack 3× in one combo decays it" rule, to kill dodge-fests and infinites ([EventHubs patch notes](https://www.eventhubs.com/news/2024/jul/02/multiversus-mid-season-patch-notes/)).
- **Tech timing** ([Tech](https://www.ssbwiki.com/Tech)):
  - Melee: a 20-frame window with a **40-frame lockout** after any press, so mashing fails.
  - Smash 4: 8 frames with a 30-frame lockout.
  - Ultimate: an 11-frame window.
- **Clanking**: two grounded hitboxes within **9%** damage of each other both cancel, and both fighters rebound for a time based on the stronger hit. If the gap is larger, the stronger hit wins. Aerials never clank. "Transcendent" hitboxes ignore clanking entirely ([Priority](https://www.ssbwiki.com/Priority)).

### KO presentation
- **Special Zoom**: a blue background flash, radial lines, heavy slow motion and a camera zoom onto the point of impact.
- **Finish Zoom**: the red version. It fires when the game predicts a **match-ending KO from knockback and angle alone**, ignoring DI and obstacles. It barely triggers with more than two players ([Special Zoom](https://www.ssbwiki.com/Special_Zoom)).
- **Star and Screen KOs** happen at random off the top blast zone. They are disabled in the last 5 s and in sudden death ([Star KO](https://www.ssbwiki.com/Star_KO)).
- **Magnifying glass**: an off-screen fighter who is still inside the blast lines is drawn in a bubble at the screen edge ([Magnifying glass](https://www.ssbwiki.com/Magnifying_glass)).

---

## 2. Game feel: Sakurai and others

**Sakurai, "Eight Hit Stop Techniques"** ([video](https://www.youtube.com/watch?v=tycbMSjDDLg), [summary](https://nintendowire.com/news/2022/12/12/this-week-in-sakurai-12-5-12-11-fine-tuning-hit-stop-and-cheating-the-system/)):
1. Shake the victim more than the attacker.
2. Don't move the hitbox.
3. **Shake horizontally on the ground and vertically in the air.**
4. **Let the shake decay.**
5. Control the amount of hitstop.
6. Interpolate into the damage pose.
7. **Keep the attacker moving a little.**
8. **Scale the shake by camera distance.**

**Sakurai, other episodes:**
- "Stop for Big Moments!" ([video](https://www.youtube.com/watch?v=OdVkEOzdCPw)) introduces "boss stop": freezing, shaking or slowing the game for decisive moments, not only ordinary hits.
- "Make It Pop" ([video](https://www.youtube.com/watch?v=kcYDrtRvuKg)) and "Let Your Characters Shine" ([video](https://www.youtube.com/watch?v=0ucvynuIe-o)): additive glare alone looks cheap. Effects need contrast, and **must never hide the characters**.
- "Too Much is Just Right" ([video](https://www.youtube.com/watch?v=zNBKzLzDKtM)) and "Making Lead-ins Instant and Impactful" ([video](https://www.youtube.com/watch?v=E8DKndKkHw8)): exaggerate poses, and make the anticipation of an attack short and punchy.
- "Risk and Reward" ([video](https://www.youtube.com/watch?v=FXqEykD5Ub4)): game essence is push and pull. Reward should match how risky or difficult the action was ("How good a thing did you do?"). Keep characters' strengths and weaknesses sharp rather than flattening them ("Grow the Strengths, and Grow the Weaknesses Too") ([Senko summary](https://en.senkohome.com/sakurai-game-dev-gameplay/)).
- The knockback system itself grew out of Kirby, where damage knocked you back and flying off-screen lost a life ([Shacknews](https://www.shacknews.com/article/135315/sakurai-details-how-kirby-gameplay-inspired-smash-knockback-mechanic)).

**Readability critique of Ultimate** ([DDRKirby(ISQ)](http://ddrkirbyisq.blogspot.com/2018/12/smash-ultimates-lack-of-visual.html)):
- Balloon knockback throws fighters off-screen before the camera catches up.
- Busy, bright stages blur into the fighters.
- Red and blue team colours need strong contrast.
- Smoke trails help, but only at high knockback ([SmashWiki Knockback](https://www.ssbwiki.com/Knockback)).

---

## 3. CPU AI

**How Smash CPUs work.**
- Levels 1–9 control how likely the CPU is to follow through on a decision and how fast it reacts ([SmashWiki AI](https://www.ssbwiki.com/Artificial_intelligence)).
- From Brawl on, high levels react in **one frame**. That produces disproportionate perfect shields and dodges and near-perfect air dodging, which players find frustrating.
- CPUs don't adapt within a match. Only amiibo learn.

**SmashBot** ([repo](https://github.com/altf4/SmashBot)) is the Melee reference design.
- It uses a four-level hierarchy: **Goals → Strategies → Tactics → Chains** (button macros).
- Its `punish.py` ([source](https://github.com/altf4/SmashBot/blob/master/Tactics/punish.py)):
  - A `framesleft()` function works out when the opponent can act next, from hitstun, landing lag and move cooldown.
  - For airborne opponents, it integrates gravity and fall speed to predict where they will land.
  - It commits to a punish only if the attack's startup (plus any transition frames) fits inside that window.
- Its `recover.py` ([source](https://github.com/altf4/SmashBot/blob/master/Tactics/recover.py)) randomises the recovery:
  - It picks side-B or up-B at random.
  - It varies the up-B height across a **30-frame window**.
  - It takes a high recovery about 1 time in 4.
  - It air-dodges when an opponent moves toward the edge.

**Killer Instinct Shadow AI** (GDC 2016, [Game Developer](https://www.gamedeveloper.com/programming/the-killer-groove-the-shadow-ai-of-killer-instinct)):
- It ranks candidate actions by their value.
- **With a small probability it picks a lower-ranked one**, to stay unpredictable.
- It falls back gracefully when a combo gets blocked.

**General lesson** ([Game Developer, KI AI talk](https://www.gamedeveloper.com/design/video-designing-competitive-game-ai-the-i-killer-instinct-i-way)): easy AI that just blocks less stops responding to the player at all, and expert AI with perfect reactions feels cheap. Give the AI human reaction time and imperfect knowledge instead.

**Architecture.** A utility scorer (normalised considerations multiplied into an action score) is a good fit for picking what to do, with small state machines or macros carrying it out ([Game Developer: BT to Utility AI](https://www.gamedeveloper.com/programming/indie-ai-programming-from-behaviour-trees-to-utility-ai)).

---

## 4. Lessons from other platform fighters

- **Rivals of Aether.**
  - Swapped shield and grab for a timed parry, to reward reads over holding a button.
  - Removed ledges to kill stalling.
  - Keeps DI at up to 18° ([Rivals wiki Advanced](https://rivals-of-aether.fandom.com/wiki/Advanced), [Gameverse](https://gameverse.com/2015/12/01/dan-fornace-talks-rivals-of-aether/)).
- **Brawlhalla.** Hard dodge cooldowns, and a budget of three air actions shared between jumps and recoveries ([wiki](https://brawlhalla.wiki.gg/wiki/Movement)).
- **Slap City** ([design blog](https://slapcity.se/blogs/design)):
  - "Moves that combo easily and infinitely into themselves are no fun."
  - Any ground move can be done while standing, walking, running or turning.
  - Advanced tech is optional: new players should have fun without discovering it.
  - Nerf at most one move per character per patch; buffs are free.
- **NASB / NASB2.**
  - A strafe button stops the fighter turning around.
  - Any grab can pull an opponent off the ledge.
  - SDI has diminishing returns ([SuperCombo NASB](https://wiki.supercombo.gg/w/Nickelodeon_All-Star_Brawl/Universal_Mechanics)).
  - The launch was criticised for thin content, not for how it felt ([TheGamer](https://www.thegamer.com/nickelodeon-all-star-brawl-rough-launch/)).
- **MultiVersus.** Criticised for dodge-fests and infinites, which it patched with dodge lockouts and in-combo move decay ([EventHubs](https://www.eventhubs.com/news/2024/jul/02/multiversus-mid-season-patch-notes/)).
- **Project M.** Capped ledge-invincibility regrabs at 5 ([SmashWiki Planking](https://www.ssbwiki.com/Planking)).

## 5. Stages, modes and couch play

- **Legal stages** are symmetric, have no hazards, no walk-offs and no walls that allow infinites, and use standard platform layouts. The usual starters are Battlefield, Final Destination, Smashville and Small Battlefield ([Stage legality](https://www.ssbwiki.com/Stage_legality)).
- **Battlefield proportions**: the edges are at ±80 and the blast zones at ±240 horizontally, +192 up and −140 down ([KuroganeHammer](https://kuroganehammer.com/Ultimate/Stages)).
  - As a ratio to the stage's half-width, that is **side 3.0, top 2.4, bottom 1.75**.
  - Ours is **2.29 / 2.06 / 1.29** (19.5, 17.5 and −11 against a half-width of 8.5). That is notably tighter, especially at the bottom, so KOs come early and recoveries are short. This is deliberate ("blast zones tightened"), but it pulls against the design doc's "roomier" pillar.
- **Training mode (Ultimate)** ([Training Mode](https://www.ssbwiki.com/Training_Mode)):
  - Speeds of ¼, ½, ⅔, 1.5× and frame-advance.
  - CPU behaviours: stand, walk, jump, evade, attack, control.
  - A **trajectory guide** showing launch arcs at 0%, 50% and 100%.
  - Damage display, combo counter, fixed %, staling and rage toggles, and an intangibility overlay.
  - A grid stage for measuring distances.
- **Replays** store inputs plus the RNG seed and re-simulate the match, so a replay file is tiny. They break when the game is patched ([Replay](https://www.ssbwiki.com/Replay)).
- **Items.** Sakurai calls items "an important essence when people gather and play together", and says every player should be able to choose how they play ([Nintendo Everything](https://nintendoeverything.com/sakurai-on-smash-bros-ultimate-tempo-items-changes-and-additions-choosing-taunts-much-more/2/)).
- **Difficulty.** Adjust it without humiliating the player, and allow changing it mid-session ("Better Than Unbeatable").

---

## 6. Gap analysis

| Smash feature | Ours? | How ours differs (file / line) |
|---|---|---|
| KB formula with weight | Partly | `takeHit` uses `(kb + p·grow·(0.5+d/20)) / weight`. Weight divides base KB too, so light Pokémon fly further even at 0%. No +18 floor. The weight spread (0.88–1.18) is close to Smash's 200/(w+100) spread. |
| Launch decay | Different | `PHYS.kbDecay` = 10 m/s², horizontal only, above air speed. Vertical uses 0.45× gravity. Smash decays about 18 m/s² along the launch vector. Our vertical launches float. |
| Hitstun | Close | `hitstunPerLaunch` 0.03 s gives 1.8·v + 3 frames. Smash is about 2.2·v. |
| Hitstun cancel | **No** | Big launches lock you out for their whole duration. |
| Tumble threshold | Yes | `tumbleAt` 11 m/s against Smash's ~14.4. |
| Trajectory DI / LSI | **No** | `hitstunControl` only adds a drift of `sx*4` m/s² (tiny). There is no angle DI. |
| SDI / ASDI | **No** | `game.step` returns during hitstop, so the victim can't act at all. |
| Hitlag | Yes | Global freeze of 3 + 0.6d frames, cap 20. No electric ×1.5. The attacker is fully frozen. |
| Hitlag shake | Partly | `creature.js:1032` gives random, constant, x-only jitter. |
| Staling / freshness | **No** | PP limits specials, but jab and smash spam cost nothing. |
| Rage | No | Lucario Aura only (`damage.js`). |
| Shieldstun | Partly | `takeHit` uses `0.8d + 2` with no multipliers for aerials, smashes or projectiles, so aerials on shield are much less safe than in Ultimate. Shield hitlag is only 3 frames. |
| Shield drop lag | **No (0 f)** | `shieldControl` goes straight to `ground` on release. Ultimate uses 11 frames, so our shield is nearly free to hold. |
| Shield numbers | Close | Drain 0.12 against 0.15, damage multiplier 1.2 against 1.19, regen 0.08 matches. |
| Parry / perfect shield | **No** | — |
| Grab hold / mash | Partly | `70 + 0.6p` with −5 per mash, against `90 + 1.7p` with −8. No grab immunity after a release (Ultimate: 60 frames). |
| Ledge intangibility | Partly | A flat 30 frames on every grab (`LEDGE.invulnFrames`), with no regrab decay and no airtime or % scaling. |
| Ledge trump | No (edgehog) | `ledgeOccupied` blocks a second grab outright, like Melee. |
| Tech | **Mashable** | `techWindow` is 20 frames with no lockout. `shieldPressedAt` updates on every press, so mashing always techs. |
| Missed tech | Minimal | A flat 24-frame `landLag` with no getup options. |
| Dodge staling / cooldown | **No** | Unlimited fresh 16-frame spot dodges. |
| Clank / rebound | **No** | Both attacks hit. No projectile clash either. |
| Crouch cancel | No | Fine to skip; it goes against the "simple execution" pillar. |
| Finish / Special Zoom | **No** | Only a 0.25× slow motion after `gameover`. Nothing at the moment of impact. |
| KO blast | Yes | `effects.koBlast` fires a beam and particles, and the crowd cheers. |
| Launch smoke trail | Yes | `game.step` spawns a trail when speed > 13. |
| Off-screen bubble | **No** | The camera is clamped to ±19 / −8..15, so fighters near the blast zone can leave the frame. |
| Hit sparks by tier | Partly | Two tiers (heavy or super effective vs. normal). |
| SFX layering | Yes | `audio.hit` layers noise, a tone and a type-flavoured sound. No KO-confirm "ping". |
| Announcer | Yes | `audio.say` through speechSynthesis. |
| % colour and bump | Yes | `percentColor` ramp and `.bump`. The bump size doesn't scale with damage. |
| CPU reaction | Random timer | `think` = 0.12–0.4 s, then a random pick. No perception delay model. |
| CPU punish / edgeguard | **No** | No frame-data punishes, no edgeguard, and "DI" is horizontal toward the centre. |
| CPU recovery mixup | Weak | Up-B height is deterministic. Ledge options are random. |
| Training mode | **No** | — |
| Replays | **No** | Deterministic engine: `fighter.js` has no `Math.random`, and only `ai.js` and the game's pick logic are random. |
| Stage variants / hazards toggle | No | One stage. Platforms are Battlefield-like (side platforms at 0.36× half-width, BF ≈ 0.34). |

---

## 7. Top 15 changes for this codebase (in priority order)

### Mechanics

**1. Real DI plus ASDI** (effort S, impact High)
- In `takeHit`, store `this.diPending = {ang, launch}`.
- In `hitstunControl`, on the first frame after hitstop (`sf === 0`), rotate the velocity: `θ += COMBAT.diMaxDeg · sin(stickAngle − θ) · |stick|`, with `diMaxDeg: 12`. That sits between Ultimate's 9.74° and Melee's 18°, which suits "strategy over reflexes".
- Also nudge `pos` by `stick · COMBAT.asdi` with `asdi: 0.15`.
- Remove the `sx*4` drift.
- Why: this gives survival skill to the person being hit, which is the core of Sakurai's "skill while in disadvantage".

**2. Shield drop lag and per-kind shieldstun** (S, High)
- Add `SHIELD.dropFrames = 8` (Ultimate uses 11; ours is a slower game, so a little shorter): a `shielddrop` timer on the `ground` state, in the same style as `dashF` and `skidF`.
- Jump, up-special and up-smash out of shield are allowed during it.
- In `takeHit`, use `shieldStun = floor(0.8·d·t + 2)`, where t is 0.33 for aerials (`move.air`), 0.725 for smash attacks and 0.29 for projectiles. `applyHit` needs to pass the move kind in.
- Give shield hits real hitlag: `stop·1.0` instead of 3.

**3. Tech lockout** (S, Med)
- In `readInput`, register a tech press only if there was no press in the previous `COMBAT.techLockout = 30` frames. Set `techWindow` to 14.
- Add missed-tech getup options from the knockdown: getup, roll, or getup attack. Reuse `startGetup`.

**4. Staling for normals, with a freshness bonus** (S, Med–High)
- Add `this.staleQ = []` (length 9) to `Fighter`. Push `move.id` in `resolveHits` when the move hits, including hits on shield.
- Compute `staleMult = 1 − Σ (factor at each queue position where the move appears)` using [.08, .076, .068, .060, .053, .045, .038, .030, .022]. Use ×1.05 when the move isn't in the queue.
- Apply it only to normals, since PP already rations specials. This also pushes players toward varied moves, which suits Showdown.

**5. Ledge rework** (M, Med)
- Replace `LEDGE.invulnFrames` with `clamp(20 + airtime/300·40 + (1 − min(p,120)/120)·30)` frames (roughly Ultimate's formula scaled to our pace).
- Multiply it by 1, then 0.5, then 0 on successive grabs in one airtime (`this.ledgeGrabs`, reset in `touchDown` and `takeHit`).
- Add ledge **trump**: in `checkLedgeGrab`, if the ledge is occupied, pop the occupant into `air` with no intangibility, instead of skipping the grab.
- Why: stops ledge planking, and gives edgeguarding a readable way to win.

**6. Clank and projectile clash** (M, Med)
- In `resolveHits`, before hurtbox tests, check active hitbox against active hitbox for pairs where both attackers are grounded (aerials never clank).
- If `|d1 − d2| ≤ 9`, send both into `rebound` for `10 + 0.5·max(d)` frames with shared hitstop. Otherwise the stronger hit carries on.
- In `updateProjectiles`, opposing projectiles cancel each other. Pokémon flavour: the super-effective one survives, with the "It's super effective!" callout.

**7. Dodge staling and post-release grab immunity** (S, Med)
- Keep a `dodgeStale` level (0–5) that rises on each dodge and decays by 1 per 1.5 s.
- At level L: dodge length ×(1 + 0.06L), intangibility starts L/2 frames later and ends L/2 frames sooner, and air-dodge `speed` ×(1 − 0.066L).
- Add `grabImmune = 60` frames after `releaseGrab(true)`.
- Why: stops the MultiVersus-style dodge-fest.

### Feel and juice

**8. Finish Zoom** (M, High)
- In `applyHit`, after `takeHit`, predict whether the hit kills: step the victim's position forward with the same gravity and decay model for up to 90 frames against `STAGE.blast`, ignoring DI (as Smash does).
- If it kills **and** it's the last stock or last Pokémon (or any KO in TEAM mode, at lower intensity), set `this.finish = {x, y, t: 0.7}`.
- While it runs:
  - `timeScale` = 0.12 for the first 0.35 s, easing back to 1.
  - `updateCamera` targets the impact point at `td ≈ 9`.
  - The background flashes red (blue for a normal Special Zoom on fully charged smashes).
  - Add radial speed lines in `effects`, and a ping sound in `audio.finish()`.
- Why: Sakurai's "boss stop". It is the single biggest spectacle moment Smash has.

**9. Sakurai hitlag shake** (S, Med–High)
- Pass `shakeDir` and `shakeT` in the view: horizontal if grounded, vertical if airborne, or along the launch vector.
- In `creature.js:1032`, use `amp = 0.18·(remaining/total)·(camDist/20)` and alternate the sign every frame instead of `Math.random()`.
- Let the attacker drift 10–20% of its animation during hitstop rather than freezing.
- Once SDI exists, move the victim's actual root during hitstop.

**10. Electric hitlag ×1.5 and tiered sparks** (S, Med)
- In `applyHit`, for `move.type === 'Electric'`, use `stop = floor(stop·1.5)` plus a skeleton or white flash on the victim.
- Use sparks in four tiers: under 6%, 6–12%, 12% and up, and a predicted KO (big starburst plus a ring).
- Scale the `.bump` CSS on the % display by damage.
- Raise `hitstopMax` to 24 for heavy hits.

**11. Off-screen magnifier bubbles and camera caps** (M, High for readability)
- In `updateCamera`, project each fighter. When one is outside the view but inside `STAGE.blast`, draw a circular HUD portrait at the clamped screen edge with an arrow and the current %.
- Keep the camera zoom inside the blast zones: widen the clamp ranges from ±19 / −8..15 toward the blast zones rather than beyond them.
- Why: Ultimate's balloon-knockback readability problem. Players can't DI what they can't see.

### AI (`src/ai.js`)

**12. Perception delay and fair defence** (S, High)
- Replace the random `think` timer with a ring buffer of foe snapshots. The CPU acts on the state from N frames ago: EASY 24, NORMAL 15, HARD 9.
- Allow shielding only if the foe's move startup is greater than the reaction delay, and cap the shield probability.
- About 10% of the time, pick the second-best option (the KI Shadow trick).
- Why: this removes the Brawl/Ultimate-style 1-frame "perfect shield" frustration.

**13. Utility-scored tactics: punish, edgeguard, recovery mixups and survival DI** (M–L, High)
- Add a `framesLeft(foe)` function that reads `foe.move.total − foe.moveF`, `landLagF − sf`, `hitstun`, `shieldStun` and the dodge length.
- **Punish**: if the quickest option that reaches the foe has startup no greater than `framesLeft`, commit (SmashBot's punish logic).
- **Edgeguard** (NORMAL and HARD): when the foe is off-stage and below the ledge, go to the ledge, or on HARD, jump out for a back air or forward air.
- **Recovery**: randomise the up-B trigger height across ±1.2 m (SmashBot's 30-frame window), aim high one time in four, and air-dodge in when the foe runs to the edge.
- **DI**: perpendicular to the launch angle toward the stage (up-and-in for horizontal launches, sideways for vertical ones), once #1 exists.

### Modes and UX

**14. Training mode** (M, Med–High)
- A TRAINING option in `RULES.modes`:
  - CPU behaviour set to stand, walk, jump, shield or attack.
  - Fixed %, adjustable in steps of 10.
  - **Trajectory guide**: arcs at 0%, 50% and 100% on every hit, using the #8 predictor.
  - Hitbox and hurtbox overlay, reading `hitboxes` in `resolveHits`.
  - Speeds of ½ and ¼ through `timeScale`, and frame-advance.
  - A combo counter (count while the victim stays in `hitstun`).
- Why: the fixed 60 Hz sim makes all of these cheap, and they speed up tuning.

**15. Replays, handicap and a flat stage** (M, Med)
- **Replays**: record `inputFor()` results per frame plus a seed. Route `Math.random` in `ai.js`, `game.js` and the pick logic through a seeded PRNG. Store the log in localStorage, and offer "watch last match" from the results screen.
- **Handicap**: a per-slot starting % (0, 30 or 60), for couch play between mismatched players ("Better Than Unbeatable").
- **Stage variant**: a platformless "Omega" layout via `STAGE.platforms = []`, plus a hazards toggle for future stage events.
- **Items**: keep them off by default. Items later (Berries and held items) should be a toggle.

### Deliberately not recommended
- **Crouch cancel, meteor cancel, L-cancel and wavedash**: they go against the "execution is simple" pillar.
- **Full balloon-knockback launch model**: replacing `kbDecay` with vector decay of about 18 m/s² plus hitstun cancel (40 frames, speed under 15 m/s) is the most "Smash-accurate" change here. But it shifts every KO percentage, so treat it as a later tuning pass using the headless sim noted in DESIGN.md.
- **Rage**: Lucario's Aura already covers it. Bench healing plus rage would blur the Showdown resource game.
