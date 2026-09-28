// "Outpost": a floating military rooftop at dusk. The collision shapes are in config.js
// (STAGE); this file only builds the visuals to match them.

import * as THREE from 'three';
import { STAGE } from './config.js';

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

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1a1a';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#f2b705';
  for (let x = -16; x < 64; x += 16) {
    g.beginPath();
    g.moveTo(x, 16);
    g.lineTo(x + 8, 16);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 8, 0);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function concreteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8b9096';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 120 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.strokeStyle = 'rgba(40,40,45,0.5)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildStage(scene, { shadowSize = 2048 } = {}) {
  const S = STAGE.main;
  const width = S.right - S.left;
  const updaters = [];

  // Sky gradient dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x141c44) },
        mid: { value: new THREE.Color(0x6b3f78) },
        horizon: { value: new THREE.Color(0xff8c4a) },
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
  scene.fog = new THREE.Fog(0x8a5a7e, 70, 330);

  const sun = mesh(new THREE.CircleGeometry(26, 32), new THREE.MeshBasicMaterial({ color: 0xffd08a, fog: false, toneMapped: false }), 70, 22, -420, false);
  scene.add(sun);

  // Lights
  scene.add(new THREE.HemisphereLight(0xb9c6ff, 0x5a4034, 1.1));
  const key = new THREE.DirectionalLight(0xffd6a8, 2.6);
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

  // Distant mountains
  const mtnMat = std(0x3b2c52, { r: 1 });
  const mtnMat2 = std(0x523a5e, { r: 1 });
  for (let i = 0; i < 16; i++) {
    const h = 30 + Math.random() * 60;
    const r = 25 + Math.random() * 35;
    const m = mesh(new THREE.ConeGeometry(r, h, 5 + (i % 3)), i % 2 ? mtnMat : mtnMat2, -300 + i * 40 + Math.random() * 20, h / 2 - 40, -160 - Math.random() * 110, false);
    m.rotation.y = Math.random() * 3;
    scene.add(m);
  }

  // Clouds
  const cloudMat = std(0xf3c6c6, { r: 1, e: 0x4a2a40, ei: 0.6 });
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = 3 + Math.random() * 4;
      c.add(mesh(new THREE.IcosahedronGeometry(s, 0), cloudMat, k * 4 - 6, Math.random() * 2, Math.random() * 2, false));
    }
    c.position.set(-160 + Math.random() * 320, 10 + Math.random() * 35, -70 - Math.random() * 80);
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

  // Main deck
  const concrete = concreteTexture();
  concrete.repeat.set(width / 2, 3);
  const deckMat = std(0xffffff, { map: concrete });
  scene.add(mesh(new THREE.BoxGeometry(width, 0.5, 6), deckMat, 0, -0.25, 0));
  const stripes = stripeTexture();
  stripes.repeat.set(width / 1.2, 1);
  const stripeMat = std(0xffffff, { map: stripes, r: 0.6 });
  scene.add(mesh(new THREE.BoxGeometry(width + 0.02, 0.18, 0.12), stripeMat, 0, -0.1, 3.0));
  const sideStripe = mesh(new THREE.BoxGeometry(0.12, 0.18, 6), stripeMat, S.left, -0.1, 0);
  scene.add(sideStripe, sideStripe.clone().translateX(width));
  const steel = std(0x2c3138, { m: 0.6, r: 0.5 });
  scene.add(mesh(new THREE.BoxGeometry(width - 0.6, 1.8, 5.4), steel, 0, -1.4, 0));
  for (let x = S.left + 1; x <= S.right - 1; x += 1.9) {
    scene.add(mesh(new THREE.BoxGeometry(0.2, 1.7, 0.2), std(0x444b55, { m: 0.5 }), x, -1.35, 2.72));
  }
  const edgeLightMat = std(0x000000, { e: 0x55f2ff, ei: 3 });
  for (let x = S.left + 0.5; x <= S.right - 0.4; x += 1.4) {
    scene.add(mesh(new THREE.BoxGeometry(0.28, 0.08, 0.06), edgeLightMat, x, -0.62, 2.72, false));
  }

  // Floating rock under the deck, with glowing thrusters holding it up.
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
  scene.add(rock);
  const thrusterGlow = new THREE.MeshBasicMaterial({ color: 0xff9a4a, toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const thrusterFlames = [];
  for (const x of [-5.5, 5.5]) {
    scene.add(mesh(new THREE.CylinderGeometry(0.9, 0.7, 1.2, 8), steel, x, -3.1, 0));
    const f = mesh(new THREE.ConeGeometry(0.65, 3, 8), thrusterGlow, x, -5.2, 0, false);
    f.rotation.x = Math.PI;
    scene.add(f);
    thrusterFlames.push(f);
  }
  updaters.push((t) => {
    for (const f of thrusterFlames) f.scale.y = 0.85 + Math.sin(t * 30 + f.position.x) * 0.1 + Math.random() * 0.1;
  });

  // Background props (behind the fighting plane so they never block the view)
  const bagMat = std(0x9b8a64, { r: 1 });
  for (let i = 0; i < 9; i++) {
    const bag = mesh(new THREE.CapsuleGeometry(0.2, 0.45, 2, 6), bagMat, -7.2 + i * 0.55 + (i > 4 ? 9.5 : 0), 0.2, -2.2);
    bag.rotation.z = Math.PI / 2;
    scene.add(bag);
    if (i % 2 === 0) {
      const top = bag.clone();
      top.position.y = 0.55;
      top.position.x += 0.27;
      scene.add(top);
    }
  }
  const crateMat = std(0x5e6b3e);
  const crateTrim = std(0x3a4228);
  for (const [x, s, y] of [[-1.8, 1.1, 0], [-0.6, 0.9, 0], [-1.3, 0.8, 1.1]]) {
    const c = mesh(new THREE.BoxGeometry(s, s, s), crateMat, x, y + s / 2, -1.9);
    c.rotation.y = x * 0.3;
    c.add(mesh(new THREE.BoxGeometry(s * 1.02, s * 0.12, s * 1.02), crateTrim));
    scene.add(c);
  }
  const tower = new THREE.Group();
  const towerMat = std(0x3d434c, { m: 0.5 });
  for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
    tower.add(mesh(new THREE.BoxGeometry(0.08, 6, 0.08), towerMat, x, 3, z));
  }
  for (let y = 0.6; y < 6; y += 1) tower.add(mesh(new THREE.BoxGeometry(0.8, 0.06, 0.8), towerMat, 0, y, 0));
  const beacon = mesh(new THREE.SphereGeometry(0.16, 8, 6), std(0x000000, { e: 0xff2a2a, ei: 4 }), 0, 6.2, 0, false);
  tower.add(beacon);
  tower.position.set(6.6, 0, -2.3);
  scene.add(tower);
  updaters.push((t) => { beacon.visible = Math.sin(t * 4) > -0.2; });

  const flagPole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 4, 6), towerMat, -6.4, 2, -2.4);
  scene.add(flagPole);
  const flagGeo = new THREE.PlaneGeometry(1.6, 0.9, 8, 1);
  const flag = mesh(flagGeo, std(0xd8452f, { r: 0.9 }), -5.6, 3.5, -2.4);
  flag.material.side = THREE.DoubleSide;
  scene.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();
  updaters.push((t) => {
    const p = flagGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = flagBase[i * 3];
      p.setZ(i, Math.sin(t * 5 + x * 3) * 0.12 * (x + 0.8));
    }
    p.needsUpdate = true;
  });

  // Soft platforms (hover plates)
  const plateMat = std(0x59616b, { m: 0.6, r: 0.45 });
  const plateGlow = std(0x000000, { e: 0x55f2ff, ei: 3 });
  const hover = new THREE.MeshBasicMaterial({ color: 0x55f2ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const p of STAGE.platforms) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(p.w, 0.22, 2.4), plateMat, 0, -0.11, 0));
    g.add(mesh(new THREE.BoxGeometry(p.w + 0.04, 0.06, 0.06), plateGlow, 0, -0.08, 1.21, false));
    g.add(mesh(new THREE.BoxGeometry(p.w * 0.7, 0.18, 1.6), steel, 0, -0.3, 0));
    for (const x of [-p.w * 0.3, p.w * 0.3]) {
      const h = mesh(new THREE.CylinderGeometry(0.28, 0.05, 0.9, 8, 1, true), hover, x, -0.8, 0, false);
      g.add(h);
    }
    g.position.set(p.x, p.y, 0);
    scene.add(g);
  }

  // Background helicopter circling the outpost
  const heli = new THREE.Group();
  const heliMat = std(0x2d3530, { m: 0.3 });
  heli.add(mesh(new THREE.BoxGeometry(3, 1.2, 1.3), heliMat));
  heli.add(mesh(new THREE.BoxGeometry(1, 0.8, 1.1), std(0x9fd0ff, { m: 0.8, r: 0.2 }), 1.7, 0.05, 0));
  heli.add(mesh(new THREE.BoxGeometry(3.4, 0.35, 0.35), heliMat, -3, 0.25, 0));
  const rotor = mesh(new THREE.BoxGeometry(7, 0.05, 0.3), std(0x111111), 0, 0.75, 0);
  rotor.add(mesh(new THREE.BoxGeometry(0.3, 0.05, 7), std(0x111111)));
  heli.add(rotor);
  const tailRotor = mesh(new THREE.BoxGeometry(0.05, 1.4, 0.2), std(0x111111), -4.6, 0.3, 0.25);
  heli.add(tailRotor);
  const heliLight = mesh(new THREE.SphereGeometry(0.15, 6, 4), std(0x000000, { e: 0xff3030, ei: 5 }), -4.6, 0.7, 0, false);
  heli.add(heliLight);
  heli.scale.setScalar(0.9);
  scene.add(heli);
  updaters.push((t, dt) => {
    const a = t * 0.12;
    heli.position.set(Math.cos(a) * 55, 18 + Math.sin(t * 0.7) * 1.5, -70 + Math.sin(a) * 25);
    heli.rotation.y = -a + Math.PI;
    heli.rotation.z = 0.08;
    rotor.rotation.y += dt * 30;
    tailRotor.rotation.x += dt * 40;
    heliLight.visible = Math.sin(t * 6) > 0.3;
  });

  // Revival drone platforms, one per player
  const drones = [0, 1].map(() => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.55, 0.2, 12), std(0x3c434c, { m: 0.6, r: 0.4 }), 0, -0.1, 0));
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const ring = mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 24), ringMat, 0, -0.08, 0, false);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    g.add(mesh(new THREE.ConeGeometry(0.4, 1.4, 12, 1, true), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), 0, -0.9, 0, false)).rotation.x = Math.PI;
    g.userData.ringMat = ringMat;
    g.visible = false;
    scene.add(g);
    return g;
  });

  return {
    drones,
    update(t, dt) { for (const u of updaters) u(t, dt); },
  };
}
