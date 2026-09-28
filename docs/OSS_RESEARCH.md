# OSS borrow research: Showdown Smash

Date: 2026-09-28. Everything below was checked from this sandbox. Licenses come from the repos' LICENSE files, fetched raw, or from `npm view`. Downloads and experiments are in `scratchpad/oss/`.

> **Policy flag:** `docs/DESIGN.md` says *"3D models: Built procedurally in code… No ripped assets."* Every usable Pokémon GLB below is a game rip (© Nintendo/Creatures/GAME FREAK). The owner already accepted takedown risk for the public GitHub Pages deploy, but using these models reverses a logged decision. If we adopt them, update the decisions log. Keep the procedural models as the `?style=lowpoly` / fallback path.

---

## 1. Pokémon 3D models (highest priority)

| Name | URL | License | What to borrow | Effort | Rec. |
|---|---|---|---|---|---|
| **Pokemon-3D-api/assets** | https://github.com/Pokemon-3D-api/assets | Repo code MIT (© 2024 Sudhanshu Ambastha). README: "Models: property of Nintendo/Creatures/GAME FREAK". Sourced from Sketchfab uploads via `scripts/download_sketchfab.py`. | 1,322 GLBs in `models/opt/{regular,shiny,mega,megaShiny,gmax,x,y,alolan,…}/<dex>.glb`. **All 6 roster mons are present, and every one is skinned.** Also Mega Charizard X/Y, Mega Blastoise/Venusaur/Gengar/Lucario, and Gigantamax forms. | Low–Med | **USE** |
| Pokemon-3D-api/api-server | https://github.com/Pokemon-3D-api/api-server | (no LICENSE seen; README only) | `server/json/MergedOpt.json`: an id → forms → raw URL index. Only useful for bulk lookups. | – | Reference only |
| Sudhanshu-Ambastha/Pokemon-3D-api | https://github.com/Sudhanshu-Ambastha/Pokemon-3D-api | MIT; archived 2026-06-03 | Predecessor of the org above | – | Skip |
| Models Resource: Scarlet/Violet rips | https://models.spriters-resource.com/nintendo_switch/pokemonscarletviolet/asset/341477/ (Pikachu) | None stated (rip) | DAE/OBJ plus full PBR texture sets. Pikachu is 18 MB, 266 files. High-res. Rig/animation not listed. | High (Blender cleanup → GLB, decimate, bake) | Only if the 3DS-era look is too low-res |
| Sketchfab originals (e.g. Lucario by Eleanie, "Mega Lucario [Animated]") | https://sketchfab.com/3d-models/lucario-b848d431df2443b7a4ce9e4fb46634d3 , https://sketchfab.com/tags/lucario | Uploader-chosen (usually CC-BY, which the uploader can't actually grant); IP belongs to Nintendo | Some have extra baked animations. Downloads need a login or API token. | Med | Fallback per-species |
| SPICA / Pokemon3DStoUnity (3DS rip tools) | https://github.com/gdkchan/SPICA | Tool; needs your own game files | Full 3DS animation sets (Wait/Attack/Damage/Faint) exported as DAE/GLTF | High | Skip unless we want the official anims |

### GLB inspection results (Pokemon-3D-api, commit `429de1288cea0d43f5b4f56305d2276e94239d65`, 2026-08-22)

URL pattern: `https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/regular/<dex>.glb`. All six downloaded with HTTP 200. Tools used: a GLB JSON-chunk parser, `gltf-transform inspect/validate` v4, and a node + three r186 `GLTFLoader` script (after Draco decode) that measured skinned bounds and bone world positions.

All files share these properties. Generator is glTF-Transform v4.3.0. **Required extensions: `KHR_draco_mesh_compression` and `EXT_texture_webp`** (Pikachu also uses `KHR_materials_specular`). Textures are tiny baseColor-only WebP (64²–512×256, 0.5–11 KB each). Materials are double-sided and OPAQUE. Bone names follow the GameFreak 3DS rig convention (`Hips/Waist, Spine1, Spine2, Neck, Head, L/RShoulder, L/RArm, L/RForeArm, L/RHand, L/RThigh, L/RLeg, L/RFoot, L/RToe, TailN, L/REar, Jaw, Feeler*`). The raw files use a ×2.54 inch→cm node scale. Validation shows only `ACCESSOR_WEIGHTS_NON_NORMALIZED` warnings (sums of 0.99984), which are harmless.

| Mon (dex) | Draco GLB | Decoded GLB | Tris | Skinned meshes / joints | Textures | Anims | Rest bbox (after file transforms) |
|---|---|---|---|---|---|---|---|
| Pikachu (25) | 142.7 KB | 285 KB | 4,556 | 5 meshes, 1 skin / 45 joints | 4 WebP (128×256, 256²) | **`Impactrueno` (Thunderbolt), 4.50 s, 135 ch** | 1.54 × 2.11 × 2.32. **Lies Z-up: needs `rotateX(-π/2)`**, then height ≈ 2.3 |
| Charizard (6) | 169.6 KB | 394 KB | 6,218 | 5 / 72 joints | 5 WebP (64×128 … 512×256) | **`Chariard_dizzy`, 4.29 s, 216 ch** | 6.28 × 4.41 × 8.28. Feet at y≈−1.29 (needs +1.3 offset). Very long tail to z=−6 |
| Blastoise (9) | 82.8 KB | 316 KB | 6,305 | 6 meshes, **3 skins** (36/6/2 joints: body, cannons A/B) | 4 WebP | none | 3.72 × 3.50 × 4.06, feet on y=0 |
| Venusaur (3) | 79.9 KB | 313 KB | 6,346 | 4 / 55 joints | 4 WebP | none | 7.12 × 4.86 × 7.12, feet on y=0 |
| Gengar (94) | 46.3 KB | 189 KB | 4,308 | 2 / 31 joints | 2 WebP | none | 5.17 × 3.97 × 3.31, feet on y=0 |
| Lucario (448) | 80.4 KB | 335 KB | 6,947 | 3 / 58 joints | 3 WebP | none | 2.72 × 3.24 × 2.49, feet on y=0 |

Total is **0.6 MB Draco or 1.9 MB decoded** for all six. Every model faces **+Z** (head z > hips z), which matches our `creature.js` convention.

**Bone lists (verbatim):**
- **Pikachu:** GLTF_created_0_rootJoint, Pikachu_46, Origin_34, Waist_33, Spine1_19, Spine2_18, Head_9, LEar1_5, LEar2_3, LEar3_2, REar1_8, REar2_7, REar3_6, LShoulder_13, LArm_12, LForeArm_11, LHand_10, RShoulder_17, RArm_16, RForeArm_15, RHand_14, Hips_32, LThigh_23, LLeg_22, LFoot_21, LToe_20, RThigh_27, RLeg_26, RFoot_25, RToe_24, Tail1_30, Tail2_29, Tail3_28, Feeler_31, PikachuSkin_35, PikachuFace_36, stereoCamera_* (6 junk camera joints). Names carry a `_N` suffix, so strip `/_\d+$/`.
- **Charizard:** GLTF_created_0_rootJoint, pm0006_00_70, Origin_64, Waist_63, Spine1_40, L/RFeeler1–6 (wing chains), Spine2_39, L/RShoulder, L/RArm, L/RForeArm, L/RHand, L/RFingerA1/A2/B1/B2/C1/C2, Neck1_28, Neck2_27, Neck3_26, Head_25, EndHead_22, Jaw_24, Tongue_23, Hips_62, L/RThigh, L/RLeg, L/RFoot, L/RToe, Tail1–7_5x, EndTail7_45, TailA01–A04 (flame), EndTailA04_46, plus 5 `*Skin` joints.
- **Blastoise:** Head, Neck, Jaw, LEar, REar, Waist, L/RArm, L/RForeArm, L/RHand, L/RFingerA/B/C, L/RThigh, L/RLeg, L/RFoot, L/RToeA–D, Tail1, Tail2, L/RFeelerA. Cannon skins: L/RFeelerA–C and L/RFeelerD.
- **Venusaur:** Hips, Spine1, Spine2, Neck1, Neck2, Head, Jaw, LJaw, RJaw, LEar, REar, L/RShoulder, L/RArm, L/RForeArm, L/RHand, L/RFinger1, L/RThigh, L/RLeg, L/RFoot, L/RToe. Flower/leaf chains: FeelerA1–2, FeelerB1–3, FeelerC1–3, L/RFeelerA1–3, L/RFeelerB1–2, L/RFeelerC1–2, L/RFeelerD1–2.
- **Gengar:** Hips, Head, Jaw, REar, LEar, FeelerA, FeelerA1, FeelerB, L/RShoulder, L/RArm, L/RForeArm, L/RHand, L/RFingerA/B/C, L/RThigh, L/RLeg, L/RFoot, L/RToe, Tail. (No spine: the head is a direct child of the root.)
- **Lucario (hierarchy):** Hips → {FeelerF, L/RThigh→Leg→Foot→Toe1→Toe2, Tail1…Tail7, Spine1 → Spine2 → {FeelerC, FeelerD, L/RFeelerE, L/RShoulder→Arm→ForeArm→Hand→Finger, Neck→Head→{Jaw, L/REar1→Ear2, L/RFeelerA1–4, L/RFeelerB1–4}}}. The B1–4 chains are the hanging aura dreadlocks, ideal for spring bones.

### Assessment

**Rigged: yes, all six.** Baked animations are nearly absent: only a Thunderbolt clip on Pikachu and a "dizzy" clip on Charizard. There are no idle, walk or attack clips. **So the main path is to drive the bones from our existing procedural pose system.** That suits us, because `creature.js` already produces per-joint Euler rotations for every state. Pikachu's `Impactrueno` could play through `THREE.AnimationMixer` as a Thunderbolt/Thunder special flourish. Charizard's `dizzy` clip fits sleep/shield-break.

**Joint map** (our joint → their bone, suffix stripped):

| ours | bone | notes |
|---|---|---|
| hips | `Hips` (fallback `Waist`) | Pikachu/Charizard have both `Waist` and `Hips`; use `Waist` as the body pivot |
| torso | `Spine1` (+ a little on `Spine2`) | Gengar has none; fold into Hips |
| head | `Head` (+ `Neck*` share) | Charizard has a 3-bone neck; split the rotation across it |
| armL/R | `LArm`/`RArm` | `LShoulder` stays at rest |
| elbowL/R | `LForeArm`/`RForeArm` | |
| legL/R | `LThigh`/`RThigh` | |
| kneeL/R | `LLeg`/`RLeg` | ankle → `LFoot` |
| tail | `Tail1` (spread across `Tail1..N` with falloff) | or hand it to spring bones |
| earL/R | `LEar1`/`LEar` / `REar…` | Pikachu has 3-bone ears |

**Retargeting math.** Our joint groups rest aligned with the model axes; their bones don't. For a bone whose parent has rest model-space rotation `P`, and whose rest local rotation is `qRest`, apply our local joint rotation `R` like this:
`bone.quaternion = P⁻¹ · R · P · qRest`.
Cache `P` and `qRest` once, at load, in the rest pose. This keeps our "negative x swings the limb forward" semantics without per-bone axis tables. Precompute `Pinv·…·P` as two cached quaternions per bone.

**Hotlinking vs vendoring.** `raw.githubusercontent.com` and `cdn.jsdelivr.net/gh/...` both return `access-control-allow-origin: *` (checked), so hotlinking works. **Still: vendor the files.** raw.github isn't a CDN, the repo is a moving target, and the six files total only 1.9 MB decoded. Run `npx @gltf-transform/cli copy in.glb out.glb` to strip Draco, so we don't need to ship the 190 KB Draco wasm or configure `DRACOLoader`. WebP is supported everywhere (Safari 14+). Decoded copies are already in `scratchpad/oss/p3d-dec/`. If we'd rather keep Draco: `new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')`, or vendor `three/examples/jsm/libs/draco/gltf/`.

**GitHub Pages limits.** Published site ≤ 1 GB, repo recommended ≤ 1 GB, hard 100 MB per-file push limit (warning at 50 MB), soft 100 GB/month bandwidth, and 10 builds/hour for branch builds (https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). About 2 MB of GLBs is a non-issue. Even all 1,322 opt models would be around 150 MB Draco, still OK.

**Rendering them in our style.** Replace each material with `MeshToonMaterial({ map: orig.map, gradientMap: toonGradient() })`, keep `side: DoubleSide`, and set `map.colorSpace = SRGBColorSpace`. Build outlines with the clip-space hull (section 3), not `scale.setScalar`: it doesn't work on a SkinnedMesh sharing a skeleton. Build it as `new SkinnedMesh(geo, outlineMat)` plus `hull.bind(mesh.skeleton, mesh.bindMatrix)`, with the extrusion done in the vertex shader.

---

## 2. Platform-fighter mechanics code

| Name | URL | License | What to borrow | Effort | Rec. |
|---|---|---|---|---|---|
| **rubendal/SSBU-Calculator** | https://github.com/rubendal/SSBU-Calculator | **MIT** (© 2018 rubendal) | `js/formulas.js`: `parameters` block (DI 0.17 rad, LSI 0.92–1.095, **launch decay 0.051/frame**, gravity boost `5*(g-0.075)`, hitstun `kb*0.4`, tumble ≥32 frames, hitlag `floor((dmg*0.65+6)*mult)` capped at 30, shield stun/pushback, stale-move table, Rage). `VSKB()` is the real Ultimate knockback formula. Also `SakuraiAngle()`, `DI()`, `LSI()`, `DIAngleDeadzones()`, `HitstunCancel()`, `ShieldStun()`, `ShieldPushback()`, `StaleNegation()`, and `knockback.js`'s `Knockback.calculate()` (gravity boost, the 0/180°→32° rule, DI eligibility). Plain JS, no deps. | **Low** | **PORT (top pick)** |
| rubendal SSBU data: `Data/<char>/data.json`, `Data/ulthitboxes/NN_<char>.json` | same repo | MIT (repo); data is derived from game files | **Real Ultimate params for 5 of our 6** (pikachu, lucario, plizardon, pzenigame, pfushigisou): WalkSpeed, DashInitialSpeed, RunSpeed, Jumpsquat, JumpHeight, HopHeight, Gravity, FallSpeed, FastFallSpeed, Weight, landing lags, ShieldSize. Also per-move hitboxes (damage, angle, bkb, kbg, fkb, size, hitlag, sdi, frames, faf). Pikachu has 34 moves. | Low | **USE for tuning** |
| altf4/SmashBot | https://github.com/altf4/SmashBot | GPL-3.0 | Architecture: Goals → Strategies → Tactics → Chains (edgeguard, punish, defend, recover). Tech-chase and edgeguard decision logic. Copy the ideas, not the code, unless we accept GPL. | Med | Ideas for `ai.js` |
| altf4/libmelee | https://github.com/altf4/libmelee | LGPL-3.0 | `framedata.py` (range checks, "is this attack going to hit", frames until actionable) | Med | Ideas |
| project-slippi/slippi-js | https://github.com/project-slippi/slippi-js | LGPL-3.0 | Replay/stat model (combos, openings/kill). Useful for a post-match stats screen. | Med | Later |
| pfirsich/meleeFrameDataExtractor | https://github.com/pfirsich/meleeFrameDataExtractor | none found | Melee hitbox/subaction JSON schema | – | Reference |
| Frannsoft/FrannHammer | https://github.com/Frannsoft/FrannHammer | archived | KuroganeHammer frame data API | – | Skip (rubendal data is better) |
| L4igi/PlatformFighterGodot | https://github.com/L4igi/PlatformFighterGodot | none found (all rights reserved) | Ultimate-style state machine plus per-character JSON attack schema (damage, angle, effect) | Med | Reference |
| NyxTheShield/Godot-Smash-Engine | https://github.com/NyxTheShield/Godot-Smash-Engine | GPL-3.0 | Melee-like state machine (ledge, airdodge, wavedash) | Med | Reference |
| eclancy/DrawFight | https://github.com/eclancy/DrawFight | none found | Godot 4.5 C# Smash knockback on paper-puppet rigs | – | Skim |
| panthavma/castagne | https://github.com/panthavma/castagne | MPL-2.0 | Godot fighting engine: input buffer/motion parsing, state-script DSL, hitstop/cancel windows | Med | Ideas |
| ikemen-engine/Ikemen-GO | https://github.com/ikemen-engine/Ikemen-GO | MIT (engine); screenpack CC-BY-3 | MUGEN-style hitpause/"hitshake", juggle points, camera. Traditional 2D. | High | Skip |

**What to port concretely.** Today `fighter.js:1190` computes `launch = (kb + percent*grow*(0.5+dmg/20))/weight`, and there is no DI, no launch-speed decay and no gravity boost. Porting `VSKB` + `Knockback.calculate` + `DI` + `LSI` + per-frame decay (`vel -= 0.051·dir` per 60 Hz frame on the launch component, kept separate from player-controlled velocity) gives the Smash "launch arc" feel: fast out, decelerating, then DI-able. Convert units once: Ultimate launch speed is `kb*0.03` units/frame. Pick a scale factor so a 100% fsmash kills at our blast zones. Move `hit.kb/hit.grow` to `bkb/kbg/angle` (0–361) in our move tables, seeded from the rubendal hitbox JSON for the matching moves (Thunder Jolt, Quick Attack, Skull Bash, Flamethrower, Aura Sphere, Force Palm, Water Gun, Razor Leaf…).

---

## 3. Rendering: smooth toon outlines and cel shading

**Why the outlines look jagged (confirmed in `game.js:79`).** When `quality=high`, rendering goes through `new EffectComposer(this.renderer)` with its default render target, **which has `samples: 0`**. The `antialias: true` on `WebGLRenderer` only applies to the default framebuffer, so bloom mode loses all MSAA. Secondly, the hulls are made by `hull.scale.setScalar(1 + OUTLINE/r)`. That gives world-space thickness, so width varies with camera zoom and is uneven on non-spherical parts, with thin slivers that alias badly.

| Name | URL | License | What to borrow | Effort | Rec. |
|---|---|---|---|---|---|
| **MSAA render target for EffectComposer** (three core) | three r186 `EffectComposer(renderer, renderTarget)` | MIT | `new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType }))`. One line, and it fixes most of the jaggies with bloom on. | **Trivial** | **DO FIRST** |
| **three `OutlineEffect`** (`three/addons/effects/OutlineEffect.js`) | https://github.com/mrdoob/three.js/blob/dev/examples/jsm/effects/OutlineEffect.js | MIT | Its vertex shader `calculateOutline(pos, normal, skinned)` returns `pos + normalize(clipNormal) * thickness * pos.w`. That is **constant screen-space width**, and it includes skinning/morph chunks. Either use the effect (render it inside a custom Pass that targets the composer's readBuffer), or copy its ~15-line shader into our hull material via `onBeforeCompile`. | Low | **USE the shader** |
| three `SMAAPass` / `FXAAPass` (r186 addons) | three addons | MIT | Post AA after bloom for the remaining edge shimmer, especially on low-quality mode, where MSAA costs too much | Low | Low-quality mode |
| **pmndrs/postprocessing** 6.39.5 | https://github.com/pmndrs/postprocessing | **Zlib** (peer three ≥0.168 <0.187, so r186 is OK) | `EffectComposer({ multisampling: 4 })` merges effects into a single pass. `BloomEffect({ mipmapBlur: true, luminanceThreshold })` is smoother and cheaper than UnrealBloom and supports selective bloom. Also `SMAAEffect`. (Its `OutlineEffect` is a selection glow, not toon ink.) | Med (replaces the composer) | Good upgrade later |
| **OmarShehata/webgl-outlines** | https://github.com/OmarShehata/webgl-outlines | **MIT** | Screen-space Sobel on depth + normals + surface-ID buffers for three.js `EffectComposer`. Constant pixel width, catches interior creases, no hull geometry. | Med | Option for stage and creases |
| three TSL `toonOutlinePass`, `SobelOperatorNode`, `SMAANode` | three r186 `src/nodes/display/ToonOutlinePassNode.js` | MIT | Same idea for **WebGPURenderer** only | High (renderer switch) | Not now |
| FarazzShaikh/THREE-CustomShaderMaterial 6.4.0 | https://github.com/FarazzShaikh/THREE-CustomShaderMaterial | MIT (r3f peers are optional; use `three-custom-shader-material/vanilla`) | Extend MeshToonMaterial with custom rim/spec bands without `onBeforeCompile` string hacks | Low | Optional |

**Best approach (keep bloom).**
1. Pass an MSAA target (`samples: 4`, HalfFloat) to the composer. On low quality, run without the composer (as now) and keep `antialias`.
2. Replace the scale-based hulls with a shared outline material that extrudes in clip space, the same as OutlineEffect: `gl_Position.xy += normalize((projectionMatrix*viewMatrix*vec4(worldNormal,0)).xy) * uThicknessPx * 2.0/uResolution * gl_Position.w`. Include `<skinning_pars_vertex>/<skinning_vertex>` so it also works for GLB SkinnedMeshes. This gives constant ~2–3 px lines at any zoom.
3. For hard-edged low-poly parts, give the hull **smoothed normals** (merge vertices / `toCreasedNormals` or a `mergeVertices` + `computeVertexNormals` copy stored as an attribute) so the extruded shell doesn't crack at corners.
4. Keep outline color out of the bloom range (dark ink is), and set UnrealBloom's threshold above the toon-lit band so outlines don't halo.
5. Optional later: pmndrs `EffectComposer({ multisampling: 4 })` + `BloomEffect(mipmapBlur)` + `SMAAEffect`.

---

## 4. Animation, IK and physics helpers

| Name | URL | License | What to borrow | Effort | Rec. |
|---|---|---|---|---|---|
| **@pixiv/three-vrm-springbone** 3.5.5 | https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm-springbone | **MIT** | Standalone `VRMSpringBoneManager` + `VRMSpringBoneJoint(bone, child, {stiffness, dragForce, gravityPower, hitRadius})` + sphere/capsule colliders. The official examples (`single.html`, `multiple.html`, `collider.html`) use **plain Object3D chains**, so it works on our current procedural `tail`/`earL/R` groups today, and on GLB chains: Pikachu ears/tail, Lucario `L/RFeelerB1–4`, Charizard `TailN` / `Feeler` wings, Venusaur leaves. | Low | **USE** |
| three `CCDIKSolver` (`three/addons/animation/CCDIKSolver.js`) | three addons | MIT | Foot planting on slopes/platform edges, hand-reach for grabs/ledge hangs on SkinnedMesh bones | Med | Ledge/grab polish |
| Analytic two-bone IK (write ourselves, ~30 lines) | – | – | Legs (thigh/leg/foot) and arms. Cheaper and more stable than CCD for 2-link chains. | Low | Prefer for legs |
| jsantell/three-ik 0.1.0 | https://github.com/jsantell/three-ik | MIT | FABRIK chains. Unmaintained since 2018. | – | Skip |
| three `AnimationMixer` + `AnimationUtils.subclip` / additive (`makeClipAdditive`) | three core | MIT | Layer the few baked clips (Pikachu Thunderbolt, Charizard dizzy) over procedural poses. Use `makeClipAdditive` to blend a clip on top of our pose. | Low | Use for those 2 clips |

---

## 5. Audio

| Name | URL | License | What to borrow | Effort | Rec. |
|---|---|---|---|---|---|
| **PokeAPI/cries** | https://github.com/PokeAPI/cries. `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/<dex>.ogg` (also `/legacy/`) | README/LICENSE: audio © The Pokémon Company | OGG cries, about 6–7 KB each. **CORS `*` (checked)**, so it works with `fetch` → `decodeAudioData` and through our compressor/panner. | Low | **USE (vendor 6 files)** |
| Showdown cries | `https://play.pokemonshowdown.com/audio/cries/<id>.mp3` | © TPC | MP3, about 7 KB. **No `Access-Control-Allow-Origin` (checked)**, so WebAudio can't decode it cross-origin. Vendor it, or use it as the MP3 source for Safari builds without Vorbis. | Low | Vendor if Safari <17 matters |
| **Kenney Impact Sounds** | https://kenney.nl/assets/impact-sounds (zip: `https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip`) | **CC0** | Punchy impact/thud layers to mix under our synthesized hits (heavy hits, landings, shield) | Low | USE |
| Kenney Interface Sounds | https://kenney.nl/assets/interface-sounds | CC0 | Menu clicks/confirms | Low | Optional |
| **ZzFX** 1.3.2 | https://github.com/KilledByAPixel/ZzFX | **MIT** | 1 KB parametric synth. Its designer at https://killedbyapixel.github.io/ZzFX/ exports param arrays. Replace hand-tuned `tone/noise` presets with designed ones and keep "no asset files". | Low | USE |
| jsfxr 1.4.1 | https://github.com/chr15m/jsfxr | Unlicense | sfxr presets (hit/explosion/powerup) | Low | Alternative |

Hit-sound design: layer a short noise transient with a pitched body tone scaled by damage, plus a low "thump" at KO or high knockback. Kenney impacts cover the thump. Sync the sound start to hitlag start, as Smash does.

---

## 6. VFX

| Name | URL | License | What to borrow | Effort | Rec. |
|---|---|---|---|---|---|
| **three.quarks** 0.17.1 | https://github.com/Alchemist0823/three.quarks | **MIT** (peer three ≥0.182) | Batched GPU-friendly particle system with a visual editor (quarks.art) that exports JSON. Hit sparks, flame trails, electric arcs, aura, and a trail renderer for sword/limb swipes. | Med | **USE for specials** |
| three-nebula 13.3.0 | https://github.com/creativelifeform/three-nebula | MIT | Older particle engine with a JSON editor | Med | Second choice |
| **Kenney Particle Pack** | https://kenney.nl/assets/particle-pack (zip `https://kenney.nl/media/pages/assets/particle-pack/f8fe0f8cb8-1677578741/kenney_particle-pack.zip`) | **CC0** | About 80 sprite textures (sparks, stars, smoke, flares, magic, scorch) for billboards in `effects.js` or quarks emitters | Low | USE |
| Showdown `battle-animations-moves.ts` (777 KB) + `battle-animations.ts` | https://github.com/smogon/pokemon-showdown-client/tree/master/play.pokemonshowdown.com/src | **AGPL-3.0** (Zarel offers MIT relicensing on request) | Per-move choreography: which sprite (`lightning`, `electroball`, `fireball`, `waterwisp`, `shadowball`, `energyball`…), timing in ms, scale/opacity tweens, `backgroundEffect(color, ms, alpha)`. Example: Thunderbolt = black BG flash for 600 ms at 0.2, then 3 staggered lightning bolts at ±15 px, 200 ms apart. **Re-implement by reading it** (colors/timing are facts, not code). Copying verbatim is AGPL, which is fine for a private repo but makes the Pages site AGPL. | Low–Med | Use as a spec |
| Showdown fx sprites | `https://play.pokemonshowdown.com/fx/<name>.png` | Unclear/fan art | Sprites exist, but there's no CORS header, so they'd need vendoring | Low | Prefer Kenney CC0 |

---

## Top-10 borrow list (prioritized, with integration steps)

1. **MSAA composer target (fixes jagged outlines with bloom).** In `src/game.js`: `const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }); this.composer = new EffectComposer(this.renderer, rt);`. Keep `setSize`/`setPixelRatio` wiring. Effort: 10 min.

2. **Constant-width clip-space outline shader (from three OutlineEffect, MIT).** In `creature.js`, replace `outlineMat` + `hull.scale.setScalar` with a `ShaderMaterial` (or `MeshBasicMaterial.onBeforeCompile`) that has uniforms `uThickness` (px) and `uResolution` and includes skinning chunks. Add hulls at scale 1 with `side: BackSide`. For low-poly parts, add a smoothed-normal attribute. Effort: 2–3 h.

3. **Pokémon GLBs from Pokemon-3D-api (rig + textures, ~1.9 MB).** Steps:
   a. `curl` `models/opt/regular/{25,6,9,3,94,448}.glb` at commit `429de128…`, then run `npx @gltf-transform/cli copy` to strip Draco into `public/models/<id>.glb`. Record the provenance and the "© Nintendo/GF, via Sketchfab → Pokemon-3D-api (MIT code)" note in `docs/DESIGN.md` and update the "No ripped assets" decision.
   b. New `src/models/glb.js`: `GLTFLoader().loadAsync`, then a per-species fixup table: `{ pikachu: { rotX: -Math.PI/2 }, charizard: { yOffset: +1.3 }, … }`. Normalize height with the bbox to the `species.js` height, and swap materials to `MeshToonMaterial({ map, gradientMap: toonGradient() })` + `addRim`.
   c. Build a `JOINT_MAP` (table in section 1). For each mapped bone, cache `qRest` and the parent rest model-space `P`. Every frame after `creature.js` computes its joint Euler values, set `bone.quaternion = P⁻¹·R·P·qRest`.
   d. Keep the current procedural model as fallback/`?style=lowpoly`, and while loading.
   Effort: 1–2 days, including tuning.

4. **Ultimate knockback, DI, LSI, launch decay and hitlag (rubendal SSBU-Calculator, MIT).** Copy `parameters`, `VSKB`, `SakuraiAngle`, `Hitstun`, `Hitlag`, `DI`, `LSI`, `DIAngleDeadzones` and `ShieldStun` into `src/damage.js` (keep the MIT header). In `fighter.js` `takeHit`, compute `kb`, then the launch vector, then apply DI from the victim's stick at the end of hitlag. Store `launchVel` separately and decay it by `0.051·60²·scale` per second. Add the gravity boost. Map hitstun frames to seconds, and tumble at ≥32 frames. Effort: 1 day.

5. **Real Ultimate character params and move hitboxes (rubendal `Data/`).** Write a script `scripts/gen-ult.mjs` that reads `Data/{pikachu,lucario,plizardon,pzenigame,pfushigisou}/data.json` + `ulthitboxes/*.json` and emits relative multipliers (weight, gravity, fall speed, run speed, jumpsquat, landing lag) into `species.js`/`config.js`. Keep our "slightly slower than Ultimate" global scale. Gengar has no Ultimate data, so borrow a similar-archetype's values (e.g. a floaty mid-weight). Effort: half a day.

6. **Spring bones (@pixiv/three-vrm-springbone, MIT).** Run `npm i @pixiv/three-vrm-springbone`. For each creature, `new VRMSpringBoneJoint(tailSeg[i], tailSeg[i+1], { stiffness: 1.2, dragForce: 0.4, gravityPower: 0.2, hitRadius: 0.05 })`. Call `manager.update(dt)` after the pose step. It works now on the procedural tail/ears and later on GLB chains (Lucario dreadlocks, Pikachu ears). Effort: 3–4 h.

7. **Cries (PokeAPI/cries).** Vendor `latest/{25,6,9,3,94,448}.ogg` (~40 KB) to `public/audio/cries/`, plus the Showdown MP3 for Safari fallback. In `audio.js`, add `cry(id, x)` using `fetch → decodeAudioData`, routed through the existing panner/compressor. Play it on switch-in, KO, and the smash-charge release. Effort: 1–2 h.

8. **Hit-SFX layering (Kenney Impact Sounds CC0 + ZzFX MIT).** Pick 4–6 impact OGGs (light/medium/heavy/shield/land). Add `audio.sample(name, x, rate)`. Layer the samples under the synthesized hits, choosing the layer from the damage tier and pitching it by the type. Replace the remaining ad-hoc tones with ZzFX presets. Effort: 3 h.

9. **VFX: Kenney Particle Pack (CC0) + three.quarks (MIT), timed from Showdown's choreography.** Start by swapping `effects.js` sparks to Kenney textures (`spark_0x.png`, `star_0x.png`, `flare_01.png`) on additive billboards. Then author 6 quarks emitters for the signature specials (Thunderbolt bolts + BG dim, Flamethrower cone, Hydro Pump jet, Aura Sphere, Shadow Ball, Solar Beam). Use `battle-animations-moves.ts` as the spec for color, stagger and duration. Effort: 1–2 days.

10. **Baked clips via AnimationMixer.** Use Pikachu `Impactrueno` (4.5 s; subclip it to the ~0.6 s cast pose) for Thunderbolt/Thunder, and Charizard `Chariard_dizzy` for sleep/shield-break. Use `AnimationUtils.makeClipAdditive` so they blend over the procedural pose. Later: two-bone IK for foot planting and CCDIKSolver for ledge hang. Effort: 3–4 h.

**Deferred / idea-only:** SmashBot's tactic/chain architecture for `ai.js` edgeguards and tech-chases (GPL, so ideas only). pmndrs postprocessing composer with mipmap bloom + SMAA. Omar Shehata's Sobel outlines for the stage. Slippi-style post-match stats.

## Files produced in the scratchpad
- `oss/p3d/*.glb`: the original Draco GLBs (25, 6, 9, 3, 94, 448).
- `oss/p3d-dec/*.glb`: Draco-stripped copies, ready to vendor.
- `oss/inspect.mjs`: GLB JSON-chunk inspector (tris, bones, animations, extensions).
- `oss/measure.mjs`, `oss/bones.mjs`: node + three r186 skinned-bounds and bone world-position probes.
- `oss/ssbu/`: rubendal SSBU-Calculator clone (formulas + Ultimate data).
- `oss/bam.ts`: Showdown `battle-animations-moves.ts`.
