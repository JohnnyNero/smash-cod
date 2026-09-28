// Particles, explosions, KO blasts, hitmarkers and flash lights. Particles use two
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

function hitmarkerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.lineCap = 'round';
  for (const [x0, y0, x1, y1] of [[10, 10, 24, 24], [54, 10, 40, 24], [10, 54, 24, 40], [54, 54, 40, 40]]) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const cube = new THREE.BoxGeometry(1, 1, 1);
    this.glow = new THREE.InstancedMesh(cube, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), MAX_GLOW);
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, flatShading: true,
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
    this.beams = [];
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
    this.markers = [];
    this.markerTex = hitmarkerTexture();
    this.callouts = [];
    this.calloutTex = new Map();

    this.lights = [];
    for (let i = 0; i < 4; i++) {
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

  explosion(x, y, radius) {
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * radius * 4;
      const c = [0xfff2a0, 0xffb040, 0xff6020][i % 3];
      this.add(0, x, y, (Math.random() - 0.5) * 2, Math.cos(a) * s, Math.sin(a) * s + 2, (Math.random() - 0.5) * 4,
        0.3 + Math.random() * 0.4, 0.2 + Math.random() * 0.35, c, { drag: 4, grav: -2 });
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 4;
      this.add(1, x, y, (Math.random() - 0.5) * 1.5, Math.cos(a) * s, Math.sin(a) * s + 1.5, (Math.random() - 0.5) * 2,
        0.8 + Math.random() * 0.8, 0.5 + Math.random() * 0.5, i % 2 ? 0x3a3a3a : 0x5a5552, { drag: 2.5, grav: -1.5, grow: 0.6 });
    }
    this.ring(x, y, 0xffc070, radius * 1.6, 0.35);
    this.light(x, y, 0xff9040, 60, 0.35);
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

  ring(x, y, color, size = 2, life = 0.3) {
    const m = new THREE.Mesh(this.ringGeo, additive(color, 0.9));
    m.position.set(x, y, 0.1);
    m.userData = { life, max: life, size };
    m.scale.setScalar(0.1);
    this.scene.add(m);
    this.rings.push(m);
  }

  hitmarker(x, y, heavy) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.markerTex, color: heavy ? 0xff5040 : 0xffffff, depthTest: false, transparent: true, toneMapped: false,
    }));
    s.position.set(x, y, 0.5);
    s.renderOrder = 20;
    s.userData = { life: 0.22, max: 0.22, size: heavy ? 1.1 : 0.6 };
    this.scene.add(s);
    this.markers.push(s);
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
      tmp.updateMatrix();
      if (p.kind === 0 && gi < MAX_GLOW) {
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
    fade(this.callouts, (o, k) => {
      const pop = Math.min(1, k * 8);
      o.scale.set(3.2 * (0.6 + 0.4 * pop), 0.6 * (0.6 + 0.4 * pop), 1);
      o.position.y = o.userData.y + k * 0.8;
      o.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    });
    fade(this.markers, (o, k) => {
      o.scale.setScalar(o.userData.size * (1.3 - k * 0.5));
      o.material.opacity = 1 - k * k;
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
    for (const arr of [this.rings, this.beams, this.markers, this.callouts]) {
      for (const o of arr) {
        this.scene.remove(o);
        o.material.dispose();
      }
      arr.length = 0;
    }
  }
}
