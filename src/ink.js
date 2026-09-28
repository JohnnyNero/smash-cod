// Screen-space ink outlines for the characters (toon style).
//
// Per-part outline shells can't be consistent: parts overlap, hide each other's lines and double
// them up. Instead we render a coverage + depth image of just the characters (layer INK_LAYER),
// with the solid stage (layer OCCLUDER_LAYER) as a depth-only occluder, then draw ink where:
//   - a pixel is outside a character but within `radius` of one (the outer silhouette, one
//     continuous line of even width), or
//   - a nearer character surface is close by (inner lines where an arm crosses the body, or one
//     fighter overlaps the other).
// The ink is alpha-blended straight onto the frame, scissored to the characters' screen area.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const INK_LAYER = 1;
export const OCCLUDER_LAYER = 2;

// Every live character model registers here so the pass knows where to look.
export const inkTargets = new Set();

const maskMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying float vDepth;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying float vDepth;
    void main() { gl_FragColor = vec4(1.0, vDepth, 0.0, 1.0); }`,
});
const occluderMat = new THREE.MeshBasicMaterial({ colorWrite: false });

const DIRS = 12;
const inkMat = new THREE.ShaderMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tMask: { value: null },
    texel: { value: new THREE.Vector2(1, 1) },
    radius: { value: 2.5 },
    depthThresh: { value: 0.12 },
    ink: { value: new THREE.Color(0x14121c) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    #define DIRS ${DIRS}
    uniform sampler2D tMask;
    uniform vec2 texel;
    uniform float radius, depthThresh;
    uniform vec3 ink;
    varying vec2 vUv;
    float depthOf(vec2 s) { return s.r > 0.02 ? s.g / s.r : 1e6; }
    void main() {
      vec2 c = texture2D(tMask, vUv).rg;
      float cd = depthOf(c);
      // Two rings half a pixel apart give the line's outer edge a soft (antialiased) falloff.
      float outerA = 0.0;
      float outerB = 0.0;
      float inner = 0.0;
      for (int i = 0; i < DIRS; i++) {
        float a = float(i) * 6.2831853 / float(DIRS);
        vec2 d = vec2(cos(a), sin(a)) * texel;
        vec2 sA = texture2D(tMask, vUv + d * (radius - 0.5)).rg;
        vec2 sB = texture2D(tMask, vUv + d * (radius + 0.5)).rg;
        vec2 sI = texture2D(tMask, vUv + d * max(1.0, radius * 0.6)).rg;
        outerA = max(outerA, sA.r);
        outerB = max(outerB, sB.r);
        // Inner line: something clearly nearer than this surface sits right next to it.
        if (c.r > 0.5 && depthOf(sI) < cd - depthThresh * max(1.0, cd * 0.04)) inner = max(inner, sI.r);
      }
      float outer = 0.5 * (outerA + outerB) * (1.0 - c.r);
      float a = clamp(max(outer, inner * 0.85), 0.0, 1.0);
      if (a < 0.01) discard;
      gl_FragColor = vec4(ink, a);
    }`,
});

const tmpV = new THREE.Vector3();

export class InkPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false; // ink is blended straight onto the frame
    this.maskRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.quad = new FullScreenQuad(inkMat);
    this.size = new THREE.Vector2(1, 1);
    this.worldWidth = 0.035; // line width in world units at the characters' distance
    this.minPx = 1.8;
    this.maxPx = 4.5;
    this.pixelRatio = 1;
  }

  setSize(w, h) {
    this.maskRT.setSize(w, h);
    this.size.set(w, h);
    inkMat.uniforms.texel.value.set(1 / w, 1 / h);
  }

  // Screen rectangle (drawing-buffer pixels) around every visible character, padded for the
  // line; null if none are on screen.
  screenRect() {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    let dist = Infinity;
    const cam = this.camera;
    for (const m of inkTargets) {
      if (!m.root.visible || !m.root.parent) continue;
      let vis = true;
      for (let o = m.root; o; o = o.parent) if (!o.visible) { vis = false; break; }
      if (!vis) continue;
      m.root.getWorldPosition(tmpV);
      dist = Math.min(dist, tmpV.distanceTo(cam.position));
      const r = Math.max(m.h, m.species.size.w) * 1.2 * m.root.scale.x;
      for (const [dx, dy] of [[-r, -r * 0.6], [r, -r * 0.6], [-r, r * 1.6], [r, r * 1.6]]) {
        const p = tmpV.clone().add(new THREE.Vector3(dx, dy, 0)).project(cam);
        if (p.z > 1) continue;
        const sx = (p.x * 0.5 + 0.5) * this.size.x;
        const sy = (p.y * 0.5 + 0.5) * this.size.y;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
    }
    if (!Number.isFinite(x0)) return null;
    const pad = 8;
    x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
    x1 = Math.min(this.size.x, Math.ceil(x1 + pad)); y1 = Math.min(this.size.y, Math.ceil(y1 + pad));
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, dist };
  }

  render(renderer, writeBuffer, readBuffer) {
    const rect = this.screenRect();
    if (!rect) return;
    const { scene, camera } = this;

    // 1) Coverage + depth of the characters, with the solid stage as a depth-only occluder.
    const saved = {
      layers: camera.layers.mask, override: scene.overrideMaterial, bg: scene.background,
      auto: renderer.autoClear, shadow: renderer.shadowMap.autoUpdate,
      clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
    };
    renderer.shadowMap.autoUpdate = false; // don't redo the shadow pass for the mask
    scene.background = null;
    renderer.setRenderTarget(this.maskRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.autoClear = false;
    camera.layers.set(OCCLUDER_LAYER);
    scene.overrideMaterial = occluderMat;
    renderer.render(scene, camera);
    camera.layers.set(INK_LAYER);
    scene.overrideMaterial = maskMat;
    renderer.render(scene, camera);
    camera.layers.mask = saved.layers;
    scene.overrideMaterial = saved.override;
    scene.background = saved.bg;
    renderer.shadowMap.autoUpdate = saved.shadow;
    renderer.setClearColor(saved.clear, saved.alpha);

    // 2) Ink, blended onto the frame inside the characters' screen rectangle.
    const proj = camera.projectionMatrix.elements[5] * 0.5 * this.size.y;
    const px = (this.worldWidth * proj) / Math.max(1, rect.dist);
    inkMat.uniforms.radius.value = Math.min(this.maxPx * this.pixelRatio, Math.max(this.minPx * this.pixelRatio, px));
    inkMat.uniforms.tMask.value = this.maskRT.texture;
    // Scissor must be set before binding the target (three copies it on setRenderTarget).
    const pr = renderer.getPixelRatio();
    renderer.setScissor(rect.x / pr, rect.y / pr, rect.w / pr, rect.h / pr);
    renderer.setScissorTest(true);
    if (!this.renderToScreen) {
      readBuffer.scissor.set(rect.x, rect.y, rect.w, rect.h);
      readBuffer.scissorTest = true;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
    renderer.setScissorTest(false);
    if (!this.renderToScreen) readBuffer.scissorTest = false;
    renderer.autoClear = saved.auto;
  }

  dispose() {
    this.maskRT.dispose();
    this.quad.dispose();
  }
}
