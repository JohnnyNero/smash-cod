# Gameplay research, round 2: what's left to borrow

A second pass after the first research round (SMASH_RESEARCH.md, MOVEMENT_RESEARCH.md) had
mostly been implemented. Ranked by fun for couch 1v1 ÷ effort. Numbers are Smash Ultimate unless
noted; sources at the bottom.

| # | Mechanic | Kind | Status here | Effort |
|---|---|---|---|---|
| 1 | Parry (release shield at the right moment) | Core feel + depth | missing | S |
| 2 | Jab combos + rapid-jab finisher | Core feel | jab only repeats | S–M |
| 3 | Rage (attacker's % boosts knockback) | Comeback | missing | XS |
| 4 | Electric (and other type) hitlag flavours | Spectacle | **done** | XS |
| 5 | SDI: wiggle out of long hitlag | Depth | ASDI only | S |
| 6 | Hitstun cancelling on big launches | Depth / feel | **done** | S |
| 7 | Sakurai angle + autolink multi-hits | Depth | missing | M |
| 8 | Crouch + crouch cancel | Depth | missing | S |
| 9 | Mega Evolution meter (Pokémon "Final Smash") | Comeback + spectacle | missing | L |
| 10 | Sudden death bombs + shrinking blast zones | Spectacle | 300% only | S |
| 11 | Dodge staling | Depth | missing | S |
| 12 | 1v1 damage ×1.2 | Pace | skip: our KO % is already tuned | XS |
| – | Respawn platform + invincibility | Core | already have (4 s, 90 f) | – |

## Details

1. **Parry.** Ultimate: release shield and get hit within the first 5 frames of the drop
   (shield held ≥ 3 f): the attacker takes +14 hitlag and the defender is +3 f (+12 vs
   projectiles). Rivals: fixed 40 f stun on the attacker (60–100 f at range), defender
   invulnerable 40 f. For couch play the Rivals-style visible stun reads better than a
   hidden 3 f. Flash, "ting", freeze.
2. **Jab combos.** Pressing attack in a window after jab 1 goes to jab 2 → jab 3; rapid-jab
   characters loop while held and do a finisher on release. Ultimate jabs launch low and
   horizontal with little growth. Per-species jab strings would give each Pokémon a signature
   close-range string.
3. **Rage.** Knockback × `1 + clamp((p − 35)/115, 0, 1) × 0.1` on the attacker's own %,
   1.0× → 1.1×. Not on set-knockback moves (Smash 4's 1.15× incl. set KB was abused).
   Visible steam past 100%.
4. **Type hitlag.** Hitlag = ⌊(d × 0.65 + 6) × e⌋, capped at 30 f; Electric e = 1.5. Our spin:
   Electric lingers with a buzz + skeleton flash; Ice briefly freezes (tint); Fire embers.
5. **SDI.** Each new stick direction during hitlag nudges the victim 0.2 m (Ultimate), next
   input 4 f later; per-move multipliers. The counterplay to multi-hits and long electric
   hitlag: mash to escape.
6. **Hitstun cancel.** Ultimate: air dodge out of hitstun after 40 f if launch speed < 2.5,
   aerial after 45 f if < 2.0. Big launches stop feeling like cutscenes; combos still hold.
   Don't copy Brawl's 13 f / 26 f (killed combos).
7. **Sakurai angle / autolink.** Angle 361: grounded victims go flat (0°) under 60 KB, diagonal
   above; aerial victims 38°. Angle 367 multi-hits pull the victim along with the attacker's
   motion so hits link (Rapid Spin, Close Combat, Flamethrower don't drop).
8. **Crouch cancel.** Hit while crouching: 0.85× knockback, 0.67× hitlag for both. Low-%
   counterplay to jab/tilt pressure; also a crouch pose.
9. **Mega meter.** Ultimate's FS meter: 2000 points; +4/s, +9 per 1% taken, +3 per 1% dealt;
   drains after 20 s. Our version: a timed Mega Evolution (Charizard X/Y, Blastoise, Venusaur,
   Gengar, Lucario all have Megas; Pikachu gets a Gigantamax-flavoured one) for ~10 s with
   +20% Atk/SpA and new VFX, once per stock. Comeback-weighted without a guaranteed KO.
10. **Sudden death.** Both at 300%, Voltorb/Electrode "bombs" fall after 14 s, the blast
    zones and camera close in.
11. **Dodge staling.** 5 levels: rolls/spot dodges animate up to 1.3× slower, less
    intangibility, air dodge distance down to 0.667×; one level refreshes per 2 s. Fixes
    roll-spam from novices and the CPU.

Honourable mentions: anti-infinite decay (same attack 4+ times in one combo weakens), B-reverse
(flip a special's facing within 4 f), footstools, jab locks (max 2), grab release parity (29 f
each), Poké Ball items (an items-on toggle; at most 3 on the field).

## Deliberately not copying

- **Brawl's hitstun cancel and tripping**: remove agency; random trips feel unfair on a couch.
- **Smash 4 rage on set knockback / meter-charged cinematic supers**: early-KO nonsense; meter
  supers that guarantee KOs reward stalling (why the FS meter is banned competitively).
- **Brawlhalla's long dodge cooldowns (80 f ground / 194 f air)**: opaque lockouts; Ultimate's
  visible, gradual dodge staling reads better.

## Sources

ssbwiki.com: Perfect_shield, 1v1_multiplier, Jab, Revival_platform, Hitstun_canceling, Hitstun,
Rage, Sakurai_angle, Autolink_angle, Hitlag, Smash_directional_influence, Crouch_cancel,
Final_Smash_Meter, Sudden_Death, Dodge_staling, B-reverse, Footstool_jump, Jab_lock, Wall_jump,
Poké_Ball, Grab_release. Rivals: rivals-of-aether.fandom.com/wiki/Parrying and
rivalsofaether.com balance patch 2.1.4.0 (numbers from search snippets, unverified).
MultiVersus 1.03 patch notes (sportskeeda). brawlhalla.wiki.gg/wiki/Movement.
