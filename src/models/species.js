// Species builders: each one adds low-poly meshes to a CreatureModel and registers the joints
// the animation system drives (hips, torso, head, armL/R, legL/R, tail, earL/R).
// Coordinates: feet at y = 0, facing +z. Flat parts that should read from the side (tails,
// ears) are thin along x, because x points into the screen once the model turns sideways.

import * as THREE from 'three';
import { glowMat } from './creature.js';

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const ball = (r, mat, sx = 1, sy = 1, sz = 1, seg = 10) => {
  const m = mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3)), mat);
  m.scale.set(sx, sy, sz);
  return m;
};
const group = (x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
};

function pikachu(model, colors) {
  const M = {
    yellow: model.mat(0xf6cf2e, { r: 0.6 }),
    brown: model.mat(0x7a4a22),
    black: model.mat(0x151515, { r: 0.4 }),
    white: model.mat(0xffffff, { r: 0.3 }),
    cheek: model.mat(0xe0402a, { r: 0.5, e: 0xff5a20, ei: 0 }),
    team: model.mat(colors.main, { r: 0.6 }),
    tail: model.mat(0xf6cf2e, { r: 0.5 }),
  };
  const j = model.j;

  const hips = group(0, 0.28, 0);
  model.body.add(hips);
  j.hips = hips;

  for (const side of [-1, 1]) {
    const leg = group(side * 0.13, 0, 0.02);
    leg.add(ball(0.11, M.yellow, 1, 1.1, 1));
    const foot = ball(0.1, M.yellow, 1, 0.6, 1.6);
    foot.position.set(0, -0.2, 0.06);
    leg.add(foot);
    hips.add(leg);
    j[side < 0 ? 'legR' : 'legL'] = leg;
  }

  const torso = group(0, 0, 0);
  hips.add(torso);
  j.torso = torso;
  const bodyMesh = ball(1, M.yellow, 0.3, 0.3, 0.26, 12);
  bodyMesh.position.y = 0.2;
  torso.add(bodyMesh);
  for (const [y, w] of [[0.3, 0.22], [0.2, 0.2]]) torso.add(mesh(new THREE.BoxGeometry(w, 0.045, 0.05), M.brown, 0, y, -0.245));

  // Bandana in the player's colour so P1 and P2 are easy to tell apart.
  torso.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 10), M.team, 0, 0.42, 0.01));
  const knot = mesh(new THREE.BoxGeometry(0.06, 0.12, 0.1), M.team, 0, 0.36, -0.22);
  knot.rotation.x = 0.5;
  torso.add(knot);

  const head = group(0, 0.44, 0.03);
  torso.add(head);
  j.head = head;
  const headMesh = ball(1, M.yellow, 0.34, 0.3, 0.3, 12);
  headMesh.position.y = 0.2;
  head.add(headMesh);
  for (const side of [-1, 1]) {
    const eye = ball(0.055, M.black, 1, 1.1, 0.7, 8);
    eye.position.set(side * 0.13, 0.24, 0.255);
    head.add(eye);
    const glint = ball(0.02, M.white, 1, 1, 1, 6);
    glint.position.set(side * 0.13 + 0.015, 0.265, 0.29);
    head.add(glint);
    const cheek = ball(0.075, M.cheek, 1, 1, 0.5, 8);
    cheek.position.set(side * 0.22, 0.12, 0.2);
    head.add(cheek);

    const ear = group(side * 0.17, 0.4, -0.02);
    ear.rotation.z = -side * 0.45;
    ear.add(mesh(new THREE.ConeGeometry(0.085, 0.44, 8), M.yellow, 0, 0.22, 0));
    ear.add(mesh(new THREE.ConeGeometry(0.052, 0.16, 8), M.black, 0, 0.37, 0));
    head.add(ear);
    j[side < 0 ? 'earR' : 'earL'] = ear;
  }
  head.add(ball(0.016, M.black, 1, 1, 1, 6)).position.set(0, 0.2, 0.3);
  head.add(mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), M.black, 0, 0.13, 0.29));

  for (const side of [-1, 1]) {
    const arm = group(side * 0.2, 0.3, 0.1);
    const upper = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.18, 6), M.yellow, 0, -0.08, 0);
    arm.add(upper);
    arm.add(ball(0.055, M.yellow, 1, 1, 1, 8)).position.set(0, -0.18, 0);
    arm.rotation.x = -0.4;
    torso.add(arm);
    j[side < 0 ? 'armR' : 'armL'] = arm;
  }

  // Lightning-bolt tail: three flat zigzag segments, thin along x so it reads from the side.
  const tail = group(0, 0.12, -0.24);
  tail.rotation.x = 0.55;
  tail.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 0.07), M.brown, 0, 0.1, 0));
  const t2 = group(0, 0.19, 0);
  t2.rotation.x = -0.9;
  t2.add(mesh(new THREE.BoxGeometry(0.05, 0.26, 0.1), M.tail, 0, 0.12, 0));
  tail.add(t2);
  const t3 = group(0, 0.24, 0);
  t3.rotation.x = 1.3;
  t3.add(mesh(new THREE.BoxGeometry(0.05, 0.34, 0.24), M.tail, 0, 0.16, 0));
  t2.add(t3);
  torso.add(tail);
  j.tail = tail;

  const spark = glowMat(0xfff27a, 0.9);
  const sparks = [];
  for (let i = 0; i < 4; i++) {
    const s = mesh(new THREE.OctahedronGeometry(0.05), spark);
    s.castShadow = false;
    s.visible = false;
    head.add(s);
    sparks.push(s);
  }
  const steel = new THREE.Color(0xc8ccd8);
  const gold = new THREE.Color(0xf6cf2e);

  return {
    update(v, t) {
      // Cheeks crackle when using electric moves (and now and then at idle).
      const electric = v.state === 'attack' && ['cast', 'ball', 'fsmash', 'dsmash', 'nair', 'dair'].includes(v.anim);
      const idleSpark = v.state === 'ground' && Math.sin(t * 1.3) > 0.97;
      const glow = electric ? 3 : idleSpark ? 1.5 : 0;
      M.cheek.emissiveIntensity = glow * (0.7 + Math.random() * 0.6);
      M.cheek.userData.baseIntensity = M.cheek.emissiveIntensity;
      sparks.forEach((s, i) => {
        s.visible = glow > 0 && Math.random() < 0.6;
        if (s.visible) {
          const side = i % 2 ? 1 : -1;
          s.position.set(side * (0.26 + Math.random() * 0.12), 0.12 + (Math.random() - 0.5) * 0.2, 0.2 + Math.random() * 0.1);
          s.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        }
      });
      // Iron Tail turns the tail to steel.
      const iron = v.state === 'attack' && (v.anim === 'tailslam' || v.anim === 'tailspike');
      M.tail.color.copy(iron ? steel : gold);
      M.tail.metalness = iron ? 0.8 : 0.05;
    },
  };
}

export const BUILDERS = { pikachu };
