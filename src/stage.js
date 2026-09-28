// "Plateau Stadium": a stone battle field floating over a stadium bowl at dusk, with a crowd
// that cheers on big moments. The collision shapes are in config.js (STAGE); this file only
// builds the visuals to match them.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STAGE } from './config.js';
import { OCCLUDER_LAYER } from './ink.js';

// Bake static decoration into one mesh per material: hundreds of stand blocks become a
// couple of draw calls.
function bake(scene, meshes) {
  const byMat = new Map();
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(g);
    m.geometry.dispose();
  }
  for (const [mat, geos] of byMat) {
    const merged = mesh(mergeGeometries(geos), mat, 0, 0, 0, false);
    merged.castShadow = false;
    merged.receiveShadow = true;
    merged.matrixAutoUpdate = false;
    scene.add(merged);
    geos.forEach((g) => g.dispose());
  }
}

function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: o.r ?? 0.85, metalness: o.m ?? 0.1, flatShading: true,
    emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, map: o.map ?? null,
  });
}

function mesh(geo, mat, x = 0, y = 0, z = 0, shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The battle field: packed earth with white court lines and a Poké Ball centre circle.
function fieldTexture() {
  return canvasTexture(1024, 256, (g, w, h) => {
    g.fillStyle = '#b58a5a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const v = 150 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v * 0.78},${v * 0.52},0.3)`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 8;
    g.strokeRect(24, 24, w - 48, h - 48);
    g.beginPath();
    g.moveTo(w / 2, 24);
    g.lineTo(w / 2, h - 24);
    g.stroke();
    const r = 70;
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fill();
    g.beginPath();
    g.arc(w / 2, h / 2, r, Math.PI, 0);
    g.fillStyle = 'rgba(220,50,50,0.9)';
    g.fill();
    g.fillStyle = 'rgba(30,30,30,0.9)';
    g.fillRect(w / 2 - r, h / 2 - 6, r * 2, 12);
    g.beginPath();
    g.arc(w / 2, h / 2, 22, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(w / 2, h / 2, 13, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    for (const x of [w * 0.2, w * 0.8]) {
      g.beginPath();
      g.arc(x, h / 2, 36, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 6;
      g.stroke();
    }
  });
}

function stoneTexture() {
  const t = canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#8e8a84';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,36,34,0.55)';
    g.lineWidth = 3;
    for (let row = 0; row < 2; row++) {
      g.strokeRect(0, row * 32, w, 32);
      for (let x = (row % 2) * 32; x < w; x += 64) g.strokeRect(x, row * 32, 64, 32);
    }
    for (let i = 0; i < 500; i++) {
      const v = 110 + Math.random() * 50;
      g.fillStyle = `rgba(${v},${v},${v - 6},0.3)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function bannerTexture(color) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, h - 40, w, 40);
    g.beginPath();
    g.arc(w / 2, h * 0.42, 38, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.beginPath();
    g.arc(w / 2, h * 0.42, 38, Math.PI, 0);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fill();
    g.fillStyle = '#222';
    g.fillRect(w / 2 - 38, h * 0.42 - 4, 76, 8);
    g.beginPath();
    g.arc(w / 2, h * 0.42, 12, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(w / 2, h * 0.42, 7, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
  });
}

export function buildStage(scene, { shadowSize = 2048 } = {}) {
  const S = STAGE.main;
  const width = S.right - S.left;
  const updaters = [];
  const statics = []; // never move: merged into a few meshes at the end
  let cheer = 0;

  // Sky gradient dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x121a44) },
        mid: { value: new THREE.Color(0x6a3c7a) },
        horizon: { value: new THREE.Color(0xff9450) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 c = mix(horizon, mid, smoothstep(-0.05, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.6, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0x8a5a7e, 80, 340);
  scene.add(mesh(new THREE.CircleGeometry(26, 32), new THREE.MeshBasicMaterial({ color: 0xffd08a, fog: false, toneMapped: false }), 70, 22, -420, false));

  // Lights
  scene.add(new THREE.HemisphereLight(0xb9c6ff, 0x6a4a34, 1.15));
  const key = new THREE.DirectionalLight(0xffd6a8, 2.5);
  key.position.set(-12, 22, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(key.shadow.camera, { left: -24, right: 24, top: 18, bottom: -14, near: 1, far: 70 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 1.2);
  rim.position.set(8, 10, -14);
  scene.add(rim);

  // Distant mountains and drifting clouds
  const mtnMats = [std(0x3b2c52, { r: 1 }), std(0x523a5e, { r: 1 })];
  for (let i = 0; i < 16; i++) {
    const h = 30 + Math.random() * 60;
    const m = mesh(new THREE.ConeGeometry(25 + Math.random() * 35, h, 5 + (i % 3)), mtnMats[i % 2], -300 + i * 40 + Math.random() * 20, h / 2 - 40, -200 - Math.random() * 110, false);
    m.rotation.y = Math.random() * 3;
    statics.push(m);
  }
  const cloudMat = std(0xf3c6c6, { r: 1, e: 0x4a2a40, ei: 0.6 });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) c.add(mesh(new THREE.IcosahedronGeometry(3 + Math.random() * 4, 0), cloudMat, k * 4 - 6, Math.random() * 2, Math.random() * 2, false));
    c.position.set(-160 + Math.random() * 320, 22 + Math.random() * 30, -110 - Math.random() * 80);
    c.userData.speed = 1 + Math.random() * 2;
    scene.add(c);
    clouds.push(c);
  }
  updaters.push((t, dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 180) c.position.x = -180;
    }
  });

  // ---- Stadium bowl behind the field: tiered stands, crowd, floodlights, banners
  const standMat = std(0x5a5660, { r: 0.95 });
  const standDark = std(0x3e3a46, { r: 0.95 });
  const R = 60;
  const cx = 0;
  const cz = -8;
  const tiers = 7;
  const seats = [];
  for (let a = Math.PI * 1.08; a <= Math.PI * 1.92; a += 0.045) {
    for (let k = 0; k < tiers; k++) {
      const r = R + k * 2.6;
      const y = -26 + k * 2.4; // the bowl sits below the field so sky stays behind the fighters
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const step = mesh(new THREE.BoxGeometry(2.3, 2.4, 2.8), k % 2 ? standMat : standDark, x, y - 1.2, z, false);
      step.rotation.y = -a + Math.PI / 2;
      statics.push(step);
      seats.push({ x, y: y + 0.4, z, a });
    }
  }
  // Crowd: one instanced mesh of little fans that bounce when something big happens.
  const fanGeo = new THREE.BoxGeometry(0.55, 0.9, 0.5);
  const fanMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const fans = new THREE.InstancedMesh(fanGeo, fanMat, seats.length * 2);
  const fanData = [];
  const tmp = new THREE.Object3D();
  const palette = [0xe8453c, 0x2d7ff0, 0xf6cf2e, 0x78c850, 0xf08030, 0xa890f0, 0xeeeeee, 0xee99ac];
  const c3 = new THREE.Color();
  let n = 0;
  for (const s of seats) {
    for (const off of [-0.55, 0.55]) {
      const px = s.x + Math.cos(s.a + Math.PI / 2) * off;
      const pz = s.z + Math.sin(s.a + Math.PI / 2) * off;
      fanData.push({ x: px, y: s.y + 0.45, z: pz, phase: Math.random() * 10, rot: -s.a + Math.PI / 2 });
      fans.setColorAt(n, c3.set(palette[Math.floor(Math.random() * palette.length)]));
      n++;
    }
  }
  fans.count = n;
  fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(fans);
  updaters.push((t) => {
    for (let i = 0; i < n; i++) {
      const f = fanData[i];
      const hop = Math.max(0, Math.sin(t * (6 + cheer * 6) + f.phase)) * (0.05 + cheer * 0.55);
      tmp.position.set(f.x, f.y + hop, f.z);
      tmp.rotation.set(0, f.rot, 0);
      tmp.updateMatrix();
      fans.setMatrixAt(i, tmp.matrix);
    }
    fans.instanceMatrix.needsUpdate = true;
  });

  // Floodlight towers along the rim
  const towerMat = std(0x33363e, { m: 0.5 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4d8, toneMapped: false });
  for (const a of [Math.PI * 1.12, Math.PI * 1.35, Math.PI * 1.65, Math.PI * 1.88]) {
    const r = R + tiers * 2.6 + 2;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    statics.push(mesh(new THREE.BoxGeometry(0.8, 36, 0.8), towerMat, x, -8, z, false));
    const panel = mesh(new THREE.BoxGeometry(5, 2.6, 0.4), towerMat, x, 10.5, z, false);
    panel.lookAt(0, 0, 0);
    statics.push(panel);
    for (let i = -1; i <= 1; i++) {
      for (const j of [-0.55, 0.55]) {
        const lamp = mesh(new THREE.BoxGeometry(1.2, 0.8, 0.1), lampMat, 0, 0, 0, false);
        panel.add(lamp);
        lamp.position.set(i * 1.5, j, 0.25);
        statics.push(lamp);
      }
    }
  }

  // Team banners hanging on the front of the stands
  const redBanner = new THREE.MeshStandardMaterial({ map: bannerTexture('#c8382f'), side: THREE.DoubleSide, roughness: 0.9 });
  const blueBanner = new THREE.MeshStandardMaterial({ map: bannerTexture('#2a62c8'), side: THREE.DoubleSide, roughness: 0.9 });
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (1.18 + i * 0.09);
    const x = cx + Math.cos(a) * (R - 1.6);
    const z = cz + Math.sin(a) * (R - 1.6);
    const b = mesh(new THREE.PlaneGeometry(3.6, 7, 1, 4), i < 4 ? redBanner : blueBanner, x, -20, z, false);
    b.lookAt(0, -20, 0);
    statics.push(b);
  }

  // ---- The battle field (collision: STAGE.main)
  const field = fieldTexture();
  const stone = stoneTexture();
  stone.repeat.set(width / 2, 1);
  const topMat = [std(0x8e8a84, { map: stone }), std(0x8e8a84, { map: stone }), std(0xffffff, { map: field, r: 0.95 }), std(0x6e6a64), std(0x8e8a84, { map: stone }), std(0x8e8a84, { map: stone })];
  // Solid stage pieces also hide the characters' ink lines when a fighter is behind them.
  const occlude = (m) => { m.layers.enable(OCCLUDER_LAYER); return m; };
  scene.add(occlude(mesh(new THREE.BoxGeometry(width, 0.5, 6), topMat, 0, -0.25, 0)));
  const trimMat = std(0xc9a24a, { m: 0.6, r: 0.4 });
  scene.add(mesh(new THREE.BoxGeometry(width + 0.1, 0.14, 0.18), trimMat, 0, -0.05, 3.02));
  const sideTrim = mesh(new THREE.BoxGeometry(0.18, 0.14, 6), trimMat, S.left, -0.05, 0);
  scene.add(sideTrim, sideTrim.clone().translateX(width));
  const wallMat = std(0x77726c, { map: stone });
  scene.add(occlude(mesh(new THREE.BoxGeometry(width - 0.4, 1.8, 5.6), wallMat, 0, -1.4, 0)));
  const lightMat = std(0x000000, { e: 0xffc870, ei: 3 });
  for (let x = S.left + 0.8; x <= S.right - 0.6; x += 1.6) {
    statics.push(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.06), lightMat, x, -1.2, 2.82, false));
  }

  // Floating rock under the field, held up by glowing crystals.
  const rockMat = std(0x5b4a44, { r: 1 });
  const rock = mesh(new THREE.CylinderGeometry(8.8, 1.2, 8, 7, 2), rockMat, 0, -6.3, 0);
  rock.scale.z = 0.42;
  const pos = rock.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 3.9) {
      pos.setX(i, pos.getX(i) * (0.85 + Math.random() * 0.3));
      pos.setZ(i, pos.getZ(i) * (0.85 + Math.random() * 0.3));
    }
  }
  rock.geometry.computeVertexNormals();
  scene.add(occlude(rock));
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x9a7aff, emissive: 0x7a4aff, emissiveIntensity: 1.6, roughness: 0.2, flatShading: true });
  const crystals = [];
  for (let i = 0; i < 9; i++) {
    const c = mesh(new THREE.OctahedronGeometry(0.6 + Math.random() * 0.7, 0), crystalMat, -6 + i * 1.5 + Math.random() * 0.6, -3.4 - Math.random() * 3.2, 1.2 + Math.random() * 1.2, false);
    c.scale.y = 1.8;
    c.rotation.set(Math.random(), Math.random(), Math.random() * 0.4);
    scene.add(c);
    crystals.push(c);
  }
  updaters.push((t) => {
    crystalMat.emissiveIntensity = 1.4 + Math.sin(t * 1.5) * 0.3 + cheer * 1.2;
    crystals.forEach((c, i) => { c.rotation.y += 0.003 * (i % 2 ? 1 : -1); });
  });

  // Torches at the back corners of the field
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const x of [-7.6, 7.6]) {
    scene.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 6), std(0x77726c, { map: stone }), x, 0.9, -2.3));
    scene.add(mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.3, 8), trimMat, x, 1.9, -2.3));
    const f = mesh(new THREE.ConeGeometry(0.3, 0.9, 7), flameMat, x, 2.45, -2.3, false);
    scene.add(f);
    flames.push(f);
  }
  updaters.push(() => {
    for (const f of flames) f.scale.set(1, 0.8 + Math.random() * 0.5, 1);
  });

  // Soft platforms: floating stone slabs with gold trim and a crystal underneath.
  const slabMat = std(0x8e8a84, { map: stone });
  for (const p of STAGE.platforms) {
    const g = new THREE.Group();
    g.add(occlude(mesh(new THREE.BoxGeometry(p.w, 0.26, 2.4), slabMat, 0, -0.13, 0)));
    g.add(mesh(new THREE.BoxGeometry(p.w + 0.06, 0.08, 0.1), trimMat, 0, -0.03, 1.22, false));
    const c = mesh(new THREE.OctahedronGeometry(0.4, 0), crystalMat, 0, -0.7, 0, false);
    c.scale.y = 1.6;
    g.add(c);
    g.position.set(p.x, p.y, 0);
    scene.add(g);
  }

  // Birds circling in the distance
  const birdMat = std(0x2a2430);
  const birds = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Group();
    const wl = mesh(new THREE.BoxGeometry(1.2, 0.08, 0.4), birdMat, -0.6, 0, 0, false);
    const wr = mesh(new THREE.BoxGeometry(1.2, 0.08, 0.4), birdMat, 0.6, 0, 0, false);
    b.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.7), birdMat, 0, 0, 0, false), wl, wr);
    b.userData = { wl, wr, r: 50 + Math.random() * 30, h: 20 + Math.random() * 12, speed: 0.08 + Math.random() * 0.05, off: Math.random() * 6 };
    scene.add(b);
    birds.push(b);
  }
  updaters.push((t) => {
    for (const b of birds) {
      const u = b.userData;
      const a = t * u.speed + u.off;
      b.position.set(Math.cos(a) * u.r, u.h + Math.sin(t + u.off) * 1.5, -90 + Math.sin(a) * 30);
      b.rotation.y = -a;
      const flap = Math.sin(t * 8 + u.off) * 0.5;
      u.wl.rotation.z = flap;
      u.wr.rotation.z = -flap;
    }
  });

  // Revival platforms: a Poké Ball-style disc per player, banded in the player's colour.
  const drones = [0, 1].map(() => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20), std(0xd83a3a, { r: 0.4 }), 0, 0.0, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.7, 0.12, 20), std(0xf2f2f2, { r: 0.4 }), 0, -0.14, 0));
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const band = mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.05, 20), ringMat, 0, -0.07, 0, false);
    g.add(band);
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), std(0xffffff, { e: 0xffffff, ei: 0.6 }), 0, -0.07, 0, false)).rotation.x = Math.PI / 2;
    g.add(mesh(new THREE.ConeGeometry(0.4, 1.4, 12, 1, true), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), 0, -0.9, 0, false)).rotation.x = Math.PI;
    g.userData.ringMat = ringMat;
    g.visible = false;
    scene.add(g);
    return g;
  });

  bake(scene, statics);

  return {
    drones,
    // Big moments (KOs, super-effective hits) make the crowd jump.
    cheer(amount) { cheer = Math.min(1, cheer + amount); },
    update(t, dt) {
      cheer = Math.max(0, cheer - dt * 0.35);
      for (const u of updaters) u(t, dt);
    },
  };
}
