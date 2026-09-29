// Particles, KO blasts, callouts and flash lights. Particles use two
// instanced meshes (glowing sparks and solid smoke) so hundreds cost one draw call each.

import * as THREE from 'three';

const MAX_GLOW = 1400;
const MAX_SMOKE = 500;
const tmp = new THREE.Object3D();
const tmpColor = new THREE.Color();

function additive(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
}


export class Effects {
  constructor(scene) {
    this.scene = scene;
    const cube = new THREE.BoxGeometry(1, 1, 1);
    this.glow = new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), MAX_GLOW);
    // Soft round puffs (smooth-shaded, lit only by ambient + key) rather than faceted rocks.
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 2), new THREE.MeshLambertMaterial({
      color: 0xffffff, emissive: 0x3a3440,
    }), MAX_SMOKE);
    for (const m of [this.glow, this.smoke]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, tmpColor.set(0xffffff));
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.parts = [];

    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 32);
    // A four-point star for sparkles (fast fall).
    const star = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 0.12 : 0.6;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    this.starGeo = new THREE.ShapeGeometry(star);
    this.glints = [];
    this.impacts = [];
    this.beams = [];
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
    this.callouts = [];
    this.calloutTex = new Map();
    this.swooshes = [];
    this.balls = [];
    this.ballGeo = {
      top: new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      bottom: new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      band: new THREE.TorusGeometry(0.2, 0.025, 6, 20),
      button: new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12),
    };
    this.ballMats = {
      red: new THREE.MeshStandardMaterial({ color: 0xe03a3a, roughness: 0.3 }),
      white: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.3 }),
      black: new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
    };

    this.lights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 12, 1.6);
      l.userData = { life: 0, max: 1, peak: 0 };
      scene.add(l);
      this.lights.push(l);
    }
  }

  add(kind, x, y, z, vx, vy, vz, life, size, color, { grav = 0, drag = 0, grow = 0 } = {}) {
    const list = this.parts;
    if (list.length > MAX_GLOW + MAX_SMOKE - 10) return;
    list.push({
      kind, x, y, z, vx, vy, vz, life, max: life, size, grow, color: new THREE.Color(color), grav, drag,
      rx: Math.random() * 6, ry: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
    });
  }

  sparks(x, y, dx, dy, color = 0xffd27a, count = 8, speed = 10) {
    const base = Math.atan2(dy, dx);
    const spread = dx === 0 && dy === 0 ? Math.PI : 0.9;
    for (let i = 0; i < count; i++) {
      const a = (dx === 0 && dy === 0 ? Math.random() * Math.PI * 2 : base + (Math.random() - 0.5) * spread * 2);
      const s = speed * (0.4 + Math.random() * 0.8);
      this.add(0, x, y, (Math.random() - 0.5) * 0.4, Math.cos(a) * s, Math.sin(a) * s, (Math.random() - 0.5) * 3,
        0.2 + Math.random() * 0.25, 0.06 + Math.random() * 0.07, color, { grav: 20, drag: 2 });
    }
  }

  dust(x, y, count = 6) {
    for (let i = 0; i < count; i++) {
      const dir = i % 2 ? 1 : -1;
      this.add(1, x + dir * 0.2, y + 0.1, (Math.random() - 0.5) * 0.8, dir * (2 + Math.random() * 3), 0.5 + Math.random() * 1.5,
        (Math.random() - 0.5), 0.35 + Math.random() * 0.25, 0.25 + Math.random() * 0.15, 0xcfc6b8, { drag: 4 });
    }
  }

  trail(x, y, color) {
    this.add(1, x, y, -0.2, 0, 0.3, 0, 0.5, 0.3, 0xdddddd, { drag: 1 });
    this.add(0, x, y, 0, (Math.random() - 0.5), (Math.random() - 0.5), 0, 0.25, 0.14, color, { drag: 1 });
  }

  boost(x, y, dx, dy, color, big) {
    for (let i = 0; i < (big ? 18 : 10); i++) {
      const s = 4 + Math.random() * 6;
      this.add(0, x, y, (Math.random() - 0.5) * 0.4, dx * s + (Math.random() - 0.5) * 3, dy * s + (Math.random() - 0.5) * 3, 0,
        0.25 + Math.random() * 0.2, 0.1 + Math.random() * 0.1, color, { drag: 5 });
    }
    this.ring(x, y, color, big ? 2 : 1.3, 0.25);
  }

  muzzle(x, y, dx, dy, weaponId) {
    const n = weaponId === 'shotgun' ? 10 : weaponId === 'sniper' ? 8 : 2;
    this.sparks(x, y, dx, dy, 0xffd27a, n, weaponId === 'smg' ? 6 : 12);
    if (weaponId !== 'smg') {
      for (let i = 0; i < 4; i++) {
        this.add(1, x + dx * 0.3, y + dy * 0.3, 0, dx * 2 + (Math.random() - 0.5), dy * 2 + Math.random(), 0,
          0.5, 0.2 + Math.random() * 0.15, 0x9a9a9a, { drag: 3, grow: 0.8 });
      }
    }
    this.light(x, y, 0xffc070, weaponId === 'smg' ? 6 : 18, 0.06);
  }


  koBlast(x, y, color, nx, ny) {
    // A Smash-style blast column from the point of exit, pointing back toward the stage.
    const beamMat = additive(color, 0.9);
    const beam = new THREE.Mesh(this.beamGeo, beamMat);
    beam.position.set(x, y, 0);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, 0).normalize());
    beam.userData = { life: 0.9, max: 0.9 };
    beam.scale.set(0.2, 26, 0.2);
    this.scene.add(beam);
    this.beams.push(beam);
    const core = new THREE.Mesh(this.beamGeo, additive(0xffffff, 1));
    core.position.copy(beam.position);
    core.quaternion.copy(beam.quaternion);
    core.userData = { life: 0.6, max: 0.6, core: true };
    core.scale.set(0.1, 26, 0.1);
    this.scene.add(core);
    this.beams.push(core);
    for (let i = 0; i < 90; i++) {
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.6;
      const s = 6 + Math.random() * 24;
      this.add(0, x, y, (Math.random() - 0.5) * 2, Math.cos(a) * s, Math.sin(a) * s, (Math.random() - 0.5) * 6,
        0.5 + Math.random() * 0.6, 0.15 + Math.random() * 0.3, i % 3 ? color : 0xffffff, { drag: 2.5 });
    }
    this.ring(x, y, color, 7, 0.5);
    this.ring(x, y, 0xffffff, 4, 0.35);
    this.light(x, y, color, 120, 0.6);
  }

  // Motion trail that follows a striking limb: a tapered ribbon through the limb's last few
  // positions, fading from the tip. One per fighter slot; call with the limb's world position
  // (or null when it isn't striking) every frame.
  limbTrail(slot, pos, color, width, dt) {
    this.trails ||= {};
    let tr = this.trails[slot];
    if (!tr) {
      const N = 16;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 4), 4));
      const idx = [];
      for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }));
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      tr = this.trails[slot] = { mesh, N, pts: [] };
    }
    for (const p of tr.pts) p.age += dt;
    if (pos) tr.pts.unshift({ x: pos.x, y: pos.y, age: 0 });
    tr.pts = tr.pts.filter((p) => p.age < 0.14).slice(0, tr.N);
    const P = tr.mesh.geometry.attributes.position;
    const C = tr.mesh.geometry.attributes.color;
    const c = tmpColor.set(color);
    const n = tr.pts.length;
    for (let i = 0; i < tr.N; i++) {
      const p = tr.pts[Math.min(i, n - 1)];
      if (!p || n < 2) { P.setXYZ(i * 2, 0, -99, 0); P.setXYZ(i * 2 + 1, 0, -99, 0); continue; }
      const q = tr.pts[Math.min(i + 1, n - 1)];
      const r = tr.pts[Math.min(Math.max(i - 1, 0), n - 1)];
      let dx = r.x - q.x;
      let dy = r.y - q.y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const k = 1 - i / Math.max(1, n - 1);
      const life = Math.max(0, 1 - p.age / 0.14);
      const w = width * (0.25 + 0.75 * k) * life;
      P.setXYZ(i * 2, p.x - dy * w, p.y + dx * w, 0.35);
      P.setXYZ(i * 2 + 1, p.x + dy * w, p.y - dx * w, 0.35);
      const a = 0.85 * k * life;
      C.setXYZW(i * 2, c.r, c.g, c.b, a);
      C.setXYZW(i * 2 + 1, c.r, c.g, c.b, a);
    }
    P.needsUpdate = true;
    C.needsUpdate = true;
    tr.mesh.visible = n >= 2;
  }

  // Dust kicked up by the feet, blown in direction dir (-1 / 1).
  puff(x, y, dir, count = 3) {
    for (let i = 0; i < count; i++) {
      this.add(1, x, y + 0.08, (Math.random() - 0.5) * 0.6, dir * (1.5 + Math.random() * 2.5), 0.4 + Math.random() * 1.2,
        (Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.2, 0.08 + Math.random() * 0.08, 0xf0e6d6, { drag: 5, grow: 0.5 });
    }
  }

  // Speed-line sparks thrown along the launch direction (stretched along their velocity).
  streaks(x, y, ang, color, count = 8, speed = 16, spread = 0.35) {
    for (let i = 0; i < count; i++) {
      const a = ang + (Math.random() - 0.5) * spread * 2;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.add(2, x, y, (Math.random() - 0.5) * 0.3, Math.cos(a) * s, Math.sin(a) * s, 0,
        0.12 + Math.random() * 0.12, 0.05 + Math.random() * 0.04, color, { drag: 7 });
    }
  }

  // A flat star burst at the point of contact that pops out and fades in a few frames.
  impact(x, y, color = 0xffffff, size = 1, life = 0.13) {
    const m = new THREE.Mesh(this.starGeo, additive(color, 1));
    m.position.set(x, y, 0.7);
    m.rotation.z = Math.random() * Math.PI;
    m.userData = { life, max: life, size };
    m.renderOrder = 6;
    m.scale.setScalar(0.01);
    this.scene.add(m);
    this.impacts.push(m);
  }

  glint(x, y, color = 0xffffff) {
    const m = new THREE.Mesh(this.starGeo, additive(color, 1));
    m.position.set(x, y, 0.6);
    m.userData = { life: 0.22, max: 0.22 };
    m.renderOrder = 5;
    this.scene.add(m);
    this.glints.push(m);
  }

  ring(x, y, color, size = 2, life = 0.3) {
    const m = new THREE.Mesh(this.ringGeo, additive(color, 0.9));
    m.position.set(x, y, 0.1);
    m.userData = { life, max: life, size };
    m.scale.setScalar(0.1);
    this.scene.add(m);
    this.rings.push(m);
  }


  // Floating Showdown-style text ("SUPER EFFECTIVE!", "FELL ASLEEP!") that rises and fades.
  callout(x, y, text, color = 0xffffff) {
    const key = text + color;
    let tex = this.calloutTex.get(key);
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 96;
      const g = c.getContext('2d');
      g.font = 'bold 54px "Black Ops One", Impact, sans-serif';
      g.textAlign = 'center';
      g.lineWidth = 10;
      g.strokeStyle = '#000';
      g.strokeText(text, 256, 66);
      g.fillStyle = '#' + color.toString(16).padStart(6, '0');
      g.fillText(text, 256, 66);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.calloutTex.set(key, tex);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
    s.position.set(x, y, 1);
    s.renderOrder = 30;
    s.userData = { life: 1.0, max: 1.0, y };
    this.scene.add(s);
    this.callouts.push(s);
  }

  // A quick crescent smear that traces an attack, from the attacker's body through the hitbox.
  swoosh(cx, cy, hx, hy, r, color = 0xffffff) {
    const dx = hx - cx;
    const dy = hy - cy;
    const d = Math.hypot(dx, dy);
    let geo;
    if (d < r * 0.6) {
      geo = new THREE.RingGeometry(r * 0.7, r * 1.25, 28, 1, 0, Math.PI * 1.7); // spinning/body hits
    } else {
      const a = Math.atan2(dy, dx);
      const len = 1.5;
      geo = new THREE.RingGeometry(Math.max(0.05, d - r * 0.55), d + r * 0.45, 20, 1, a - len / 2, len);
    }
    const m = new THREE.Mesh(geo, additive(color, 0.8));
    m.position.set(d < r * 0.6 ? hx : cx, d < r * 0.6 ? hy : cy, 0.45);
    m.userData = { life: 0.15, max: 0.15, ownGeo: true };
    this.scene.add(m);
    this.swooshes.push(m);
  }

  // A Poké Ball arcs in from the trainer's side and bursts open where the Pokémon appears.
  pokeball(x0, y0, x1, y1, color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.ballGeo.top, this.ballMats.red), new THREE.Mesh(this.ballGeo.bottom, this.ballMats.white));
    const band = new THREE.Mesh(this.ballGeo.band, this.ballMats.black);
    band.rotation.x = Math.PI / 2;
    const button = new THREE.Mesh(this.ballGeo.button, this.ballMats.white);
    button.rotation.x = Math.PI / 2;
    button.position.z = 0.2;
    g.add(band, button);
    g.position.set(x0, y0, 0.5);
    this.scene.add(g);
    this.balls.push({ g, x0, y0, x1, y1, t: 0, dur: 0.32, color });
  }

  // Red recall beam from the trainer's side into the Pokémon being switched out.
  recallBeam(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 8, 1, true), additive(0xff3a3a, 0.9));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.4);
    m.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    m.userData = { life: 0.35, max: 0.35, ownGeo: true };
    this.scene.add(m);
    this.swooshes.push(m);
    this.sparks(x1, y1, 0, 0, 0xff5050, 14, 6);
  }

  // Particles streaming from one point to another (Giga Drain, Leech Seed).
  drain(x0, y0, x1, y1, color) {
    for (let i = 0; i < 10; i++) {
      const t = 0.35 + Math.random() * 0.2;
      this.add(0, x0 + (Math.random() - 0.5) * 0.4, y0 + (Math.random() - 0.5) * 0.4, 0, (x1 - x0) / t, (y1 - y0) / t + 1, 0, t, 0.08, color, { grav: 2 });
    }
  }

  light(x, y, color, intensity, life) {
    const l = this.lights.reduce((a, b) => (a.userData.life < b.userData.life ? a : b));
    l.position.set(x, y, 1.5);
    l.color.set(color);
    l.userData = { life, max: life, peak: intensity };
    l.intensity = intensity;
  }

  update(dt) {
    let gi = 0;
    let si = 0;
    const list = this.parts;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      p.vy -= p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.vr * dt;
      p.ry += p.vr * 0.7 * dt;
      const f = p.life / p.max;
      const size = p.size * (p.grow ? 1 + (1 - f) * p.grow * 3 : 1) * (p.kind === 0 ? Math.sqrt(f) : Math.min(1, f * 2.5));
      tmp.position.set(p.x, p.y, p.z);
      tmp.rotation.set(p.rx, p.ry, 0);
      tmp.scale.setScalar(size);
      if (p.kind === 2) {
        // Streak: a thin bar along its velocity, shrinking as it slows.
        const sp = Math.hypot(p.vx, p.vy);
        tmp.rotation.set(0, 0, Math.atan2(p.vy, p.vx));
        tmp.scale.set(p.size * (1 + sp * 0.35) * f, p.size * 0.45 * f, p.size * 0.45 * f);
      }
      tmp.updateMatrix();
      if ((p.kind === 0 || p.kind === 2) && gi < MAX_GLOW) {
        this.glow.setMatrixAt(gi, tmp.matrix);
        this.glow.setColorAt(gi, tmpColor.copy(p.color).multiplyScalar(0.4 + f));
        gi++;
      } else if (p.kind === 1 && si < MAX_SMOKE) {
        this.smoke.setMatrixAt(si, tmp.matrix);
        this.smoke.setColorAt(si, p.color);
        si++;
      }
    }
    this.glow.count = gi;
    this.smoke.count = si;
    for (const m of [this.glow, this.smoke]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    const fade = (arr, fn) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const o = arr[i];
        o.userData.life -= dt;
        if (o.userData.life <= 0) {
          this.scene.remove(o);
          o.material.dispose();
          if (o.userData.ownGeo) o.geometry.dispose();
          arr.splice(i, 1);
        } else {
          fn(o, 1 - o.userData.life / o.userData.max);
        }
      }
    };
    fade(this.rings, (o, k) => {
      o.scale.setScalar(0.2 + o.userData.size * Math.sqrt(k));
      o.material.opacity = 0.9 * (1 - k);
    });
    fade(this.beams, (o, k) => {
      const w = o.userData.core ? 0.5 : 1.6;
      const r = w * Math.sin(Math.min(1, k * 3) * Math.PI / 2) * (1 - k * 0.8);
      o.scale.set(r, 26, r);
      o.material.opacity = 1 - k;
    });
    fade(this.glints, (o, k) => {
      o.scale.setScalar(Math.sin(Math.min(1, k * 2.5) * Math.PI / 2) * (1.2 - k));
      o.rotation.z = k * 1.2;
      o.material.opacity = 1 - k * k;
    });
    fade(this.impacts, (o, k) => {
      o.scale.setScalar(o.userData.size * (0.5 + 1.1 * Math.sqrt(Math.min(1, k * 2.2))) * (1 - k * 0.3));
      o.material.opacity = 1 - k * k;
    });
    fade(this.swooshes, (o, k) => {
      o.scale.setScalar(1 + k * 0.2);
      o.material.opacity = 0.8 * (1 - k) ** 1.5;
    });
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.g.position.set(b.x0 + (b.x1 - b.x0) * k, b.y0 + (b.y1 - b.y0) * k + Math.sin(k * Math.PI) * 2.5, 0.5);
      b.g.rotation.z += dt * 18;
      if (k >= 1) {
        this.scene.remove(b.g);
        this.balls.splice(i, 1);
        this.ring(b.x1, b.y1, 0xffffff, 2.4, 0.35);
        this.ring(b.x1, b.y1, b.color, 1.6, 0.3);
        this.sparks(b.x1, b.y1, 0, 0, 0xffffff, 22, 9);
        this.light(b.x1, b.y1, 0xffffff, 40, 0.3);
      }
    }
    fade(this.callouts, (o, k) => {
      const pop = Math.min(1, k * 8);
      o.scale.set(3.2 * (0.6 + 0.4 * pop), 0.6 * (0.6 + 0.4 * pop), 1);
      o.position.y = o.userData.y + k * 0.8;
      o.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    });
    for (const l of this.lights) {
      const u = l.userData;
      if (u.life > 0) {
        u.life -= dt;
        l.intensity = Math.max(0, u.peak * (u.life / u.max));
      } else {
        l.intensity = 0;
      }
    }
  }

  clear() {
    this.parts.length = 0;
    this.glow.count = 0;
    this.smoke.count = 0;
    for (const l of this.lights) { l.userData.life = 0; l.intensity = 0; }
    for (const b of this.balls) this.scene.remove(b.g);
    this.balls.length = 0;
    for (const tr of Object.values(this.trails || {})) { tr.pts = []; tr.mesh.visible = false; }
    for (const arr of [this.rings, this.beams, this.callouts, this.swooshes, this.glints, this.impacts]) {
      for (const o of arr) {
        this.scene.remove(o);
        o.material.dispose();
        if (o.userData.ownGeo) o.geometry.dispose();
      }
      arr.length = 0;
    }
  }
}
