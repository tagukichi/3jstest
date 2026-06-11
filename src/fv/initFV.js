// FV "swipe to walk through the space" — Three.js + depth-parallax implementation.
//
// The interaction model (pan / pull / transition / inertia / direction lock) is a
// direct port of reference/fv-swipe-demo.html — that file is the source of truth
// for the experience. Only the rendering layer changed: CSS transforms became
// uniform updates on a single fullscreen ShaderMaterial quad.
//
// Usage:
//   const fv = initFV(stageEl, scenes, { onPan, onSceneChange, onFirstDrag });
//   scenes: [{ src, depthSrc, ar, label }, ...]  — any number of scenes.
//   Returns null when WebGL2 is unavailable (caller should mount the CSS fallback).

import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders.js';

const OVERSCAN = 1.12;
const PULL_THRESHOLD = 90;
const PULL_VISUAL_MAX = 56;
const TRANS_DURATION = 0.85;
const ENTER_OFFSET = 0.62;
const LERP_K = 0.085;
const PULL_LERP_K = 0.18;
const DRAG_X = 1.1;
const DRAG_Y = 0.7;
const INERTIA = 12;
const KEY_STEP = 160;

const PARALLAX_MAX = 0.045;   // max uv offset for depth parallax
const PARALLAX_GAIN = 0.55;   // pan-lag (uv) -> parallax conversion
const PARALLAX_SMOOTH = 0.12;
const EDGE_INSET = 0.97;      // extra zoom so parallax sampling stays inside the texture
const ROT_MAX = 1.8 * Math.PI / 180; // fake rotateY at full pan

function clamp(v, m) { return Math.max(-m, Math.min(m, v)); }
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export function isWebGL2Available() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

export function initFV(stage, sceneDefs, opts = {}) {
  const cb = {
    onSceneChange: () => {},
    onPan: () => {},
    onFirstDrag: () => {},
    ...opts,
  };

  if (!isWebGL2Available()) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    return null;
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x16110b, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.classList.add('fv__canvas');
  stage.appendChild(renderer.domElement);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const glScene = new THREE.Scene();

  const placeholder = new THREE.DataTexture(new Uint8Array([22, 17, 11, 255]), 1, 1);
  placeholder.needsUpdate = true;

  const uniforms = {
    uTexA: { value: placeholder }, uDepthA: { value: placeholder },
    uTexB: { value: placeholder }, uDepthB: { value: placeholder },
    uCoverA: { value: new THREE.Vector2(1, 1) }, uPanA: { value: new THREE.Vector2(0, 0) },
    uZoomA: { value: 1 }, uRotA: { value: 0 },
    uCoverB: { value: new THREE.Vector2(1, 1) }, uPanB: { value: new THREE.Vector2(0, 0) },
    uZoomB: { value: 1 }, uRotB: { value: 0 },
    uParallaxA: { value: new THREE.Vector2(0, 0) },
    uParallaxB: { value: new THREE.Vector2(0, 0) },
    uMix: { value: 0 }, uProgress: { value: 0 }, uDir: { value: 1 }, uHasB: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  glScene.add(quad);

  // ---- scene records (state layout identical to the reference implementation)
  const scenes = sceneDefs.map((def) => ({
    def,
    ar: def.ar,
    tex: null, depth: null, ready: false, loading: null,
    tx: 0, ty: 0, cx: 0, cy: 0,
    maxX: 0, maxY: 0, w: 1, h: 1,
  }));

  const loader = new THREE.TextureLoader();
  function loadTexture(url, isColor) {
    return new Promise((resolve, reject) => {
      loader.load(url, (tex) => {
        tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        resolve(tex);
      }, undefined, reject);
    });
  }
  function loadScene(s) {
    if (!s.loading) {
      s.loading = Promise.all([
        loadTexture(s.def.src, true),
        loadTexture(s.def.depthSrc, false),
      ]).then(([tex, depth]) => {
        s.tex = tex;
        s.depth = depth;
        s.ready = true;
        needsRender = true;
      });
    }
    return s.loading;
  }

  // ---- state
  let vw = 0, vh = 0;
  let active = 0;
  let dragging = false, lastX = 0, lastY = 0, startX = 0, startY = 0;
  let horizontalLock = null;
  let vx = 0;
  let pullT = 0, pullC = 0;
  let trans = null;
  let hinted = false;
  let started = false;
  let destroyed = false;
  let needsRender = true;
  let parX = 0, parY = 0;
  let raf = 0;

  function layout() {
    const r = stage.getBoundingClientRect();
    vw = Math.max(1, r.width);
    vh = Math.max(1, r.height);
    renderer.setSize(vw, vh, false);
    for (const s of scenes) {
      let h = vh * OVERSCAN;
      let w = h * s.ar;
      if (w < vw * 1.06) { w = vw * 1.06; h = w / s.ar; }
      s.w = w;
      s.h = h;
      s.maxX = Math.max(0, (w - vw) / 2);
      s.maxY = Math.max(0, (h - vh) / 2);
      s.tx = clamp(s.tx, s.maxX);
      s.ty = clamp(s.ty, s.maxY);
    }
    needsRender = true;
  }

  function neighbor(dir) {
    const n = active + dir;
    return (n >= 0 && n < scenes.length && scenes[n].ready) ? n : -1;
  }

  function setAria() {
    const label = scenes[active].def.label || '';
    stage.setAttribute('aria-label', label + '(左右にスワイプで視点移動)');
  }

  // px-space pan -> uv-space uniforms for one shader slot
  function setSlot(slot, s, px, py, zoom) {
    uniforms['uTex' + slot].value = s.tex || placeholder;
    uniforms['uDepth' + slot].value = s.depth || placeholder;
    uniforms['uCover' + slot].value.set((vw / s.w) * EDGE_INSET, (vh / s.h) * EDGE_INSET);
    uniforms['uPan' + slot].value.set(px / s.w, -py / s.h);
    uniforms['uZoom' + slot].value = zoom;
    uniforms['uRot' + slot].value = s.maxX ? (clamp(px, s.maxX) / s.maxX) * ROT_MAX : 0;
  }

  // ---- input (ported from the reference)
  function onPointerDown(e) {
    if (trans || !started) return;
    dragging = true;
    horizontalLock = null;
    stage.classList.add('is-grabbing');
    lastX = startX = e.clientX;
    lastY = startY = e.clientY;
    vx = 0;
  }

  function onPointerMove(e) {
    if (!dragging || trans) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (horizontalLock === null) {
      const adx = Math.abs(e.clientX - startX);
      const ady = Math.abs(e.clientY - startY);
      if (adx > 8 || ady > 8) horizontalLock = adx >= ady;
    }
    if (horizontalLock === false) return;
    if (horizontalLock === true) {
      if (e.cancelable) e.preventDefault();
      try {
        if (stage.setPointerCapture && !stage.hasPointerCapture(e.pointerId)) {
          stage.setPointerCapture(e.pointerId);
        }
      } catch (err) { /* 合成イベント等でpointerIdが無効な場合は無視 */ }
    }
    lastX = e.clientX;
    lastY = e.clientY;

    const s = scenes[active];
    const want = s.tx - dx * DRAG_X;
    vx = -dx;

    if (want > s.maxX && neighbor(1) !== -1) {
      s.tx = s.maxX;
      pullT = Math.min(PULL_THRESHOLD * 1.6, pullT + (want - s.maxX));
    } else if (want < -s.maxX && neighbor(-1) !== -1) {
      s.tx = -s.maxX;
      pullT = Math.max(-PULL_THRESHOLD * 1.6, pullT - (-s.maxX - want));
    } else {
      s.tx = clamp(want, s.maxX);
      pullT = 0;
    }
    s.ty = clamp(s.ty - dy * DRAG_Y, s.maxY);
    needsRender = true;

    if (!hinted && Math.abs(e.clientX - startX) > 30) {
      hinted = true;
      cb.onFirstDrag();
    }
  }

  function onRelease() {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-grabbing');
    if (trans) return;
    const s = scenes[active];

    if (Math.abs(pullT) >= PULL_THRESHOLD) {
      const dir = pullT > 0 ? 1 : -1;
      if (neighbor(dir) !== -1) { startTransition(dir); return; }
    }
    pullT = 0;
    if (!reduced && horizontalLock === true) {
      s.tx = clamp(s.tx + vx * INERTIA, s.maxX);
    }
    needsRender = true;
  }

  function onKeyDown(e) {
    if (trans || !started) return;
    const s = scenes[active];
    if (e.key === 'ArrowRight') {
      if (s.tx >= s.maxX - 1 && neighbor(1) !== -1) startTransition(1);
      else s.tx = clamp(s.tx + KEY_STEP, s.maxX);
      needsRender = true;
    } else if (e.key === 'ArrowLeft') {
      if (s.tx <= -s.maxX + 1 && neighbor(-1) !== -1) startTransition(-1);
      else s.tx = clamp(s.tx - KEY_STEP, s.maxX);
      needsRender = true;
    }
  }

  function startTransition(dir) {
    const from = scenes[active];
    const to = scenes[active + dir];
    to.tx = to.cx = -dir * to.maxX * ENTER_OFFSET;
    to.ty = to.cy = 0;
    trans = { from, to, dir, t: 0 };
    pullT = 0;
    pullC = 0;
    active += dir;
    setAria();
    cb.onSceneChange(active, scenes.length);
    needsRender = true;
  }

  // ---- frame loop
  let prevTime = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (destroyed) return;
    const dt = prevTime ? Math.min(0.05, (now - prevTime) / 1000) : 0.016;
    prevTime = now;
    if (!started) return;

    const k = reduced ? 1 : LERP_K;
    pullC += (pullT - pullC) * (reduced ? 1 : PULL_LERP_K);
    if (pullT === 0 && Math.abs(pullC) < 0.02) pullC = 0;

    let parTX = 0, parTY = 0;

    if (trans) {
      trans.t += dt / (reduced ? 0.0001 : TRANS_DURATION);
      const t = Math.min(1, trans.t);
      const e = ease(t);
      const d = trans.dir;
      const from = trans.from;
      const to = trans.to;

      to.cx += (to.tx - to.cx) * k;
      setSlot('A', from, from.cx + d * (PULL_VISUAL_MAX + 90 * e), from.cy, 1 + 0.06 * e);
      setSlot('B', to, to.cx - d * 50 * (1 - e), to.cy, 1.09 - 0.09 * e);
      uniforms.uMix.value = e;
      uniforms.uProgress.value = e;
      uniforms.uDir.value = d;
      uniforms.uHasB.value = 1;

      if (t >= 1) {
        trans = null;
        uniforms.uMix.value = 0;
        uniforms.uProgress.value = 0;
        uniforms.uHasB.value = 0;
      }
      needsRender = true;
    } else {
      const s = scenes[active];
      s.cx += (s.tx - s.cx) * k;
      s.cy += (s.ty - s.cy) * k;
      const settled = Math.abs(s.tx - s.cx) < 0.05 && Math.abs(s.ty - s.cy) < 0.05;
      if (settled) { s.cx = s.tx; s.cy = s.ty; }
      else needsRender = true;

      if (!reduced) {
        parTX = clamp(((s.tx - s.cx) / s.w) * PARALLAX_GAIN, PARALLAX_MAX);
        parTY = clamp((-(s.ty - s.cy) / s.h) * PARALLAX_GAIN * 0.6, PARALLAX_MAX * 0.6);
      }

      const pv = Math.sign(pullC) * Math.min(PULL_VISUAL_MAX, Math.abs(pullC) * 0.45);
      setSlot('A', s, s.cx + pv, s.cy, 1);

      const nIdx = pullC > 4 ? neighbor(1) : (pullC < -4 ? neighbor(-1) : -1);
      if (nIdx !== -1) {
        const n = scenes[nIdx];
        const prog = Math.min(1, Math.abs(pullC) / PULL_THRESHOLD);
        const d2 = pullC > 0 ? 1 : -1;
        n.cx = -d2 * n.maxX * ENTER_OFFSET;
        n.cy = 0;
        setSlot('B', n, n.cx - d2 * 50, 0, 1.09);
        uniforms.uMix.value = prog * 0.55;
        uniforms.uProgress.value = prog * 0.3;
        uniforms.uDir.value = d2;
        uniforms.uHasB.value = 1;
        needsRender = true;
      } else {
        uniforms.uMix.value = 0;
        uniforms.uProgress.value = 0;
        uniforms.uHasB.value = 0;
      }
      if (Math.abs(pullC) > 0.01) needsRender = true;

      if (s.maxX) cb.onPan((clamp(s.cx, s.maxX) / s.maxX + 1) / 2);
    }

    // smooth the parallax so it eases in and decays to exactly zero at rest
    parX += (parTX - parX) * PARALLAX_SMOOTH;
    parY += (parTY - parY) * PARALLAX_SMOOTH;
    if (Math.abs(parX) + Math.abs(parY) > 1e-5) needsRender = true;
    else { parX = 0; parY = 0; }
    uniforms.uParallaxA.value.set(parX, parY);
    uniforms.uParallaxB.value.set(parX * 0.5, parY * 0.5);

    if (needsRender) {
      renderer.render(glScene, camera);
      needsRender = false;
    }
  }

  function onContextLost(e) {
    e.preventDefault();
    destroy();
    if (cb.onContextLost) cb.onContextLost();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointermove', onPointerMove);
    stage.removeEventListener('pointerup', onRelease);
    stage.removeEventListener('pointercancel', onRelease);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', layout);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
    for (const s of scenes) {
      if (s.tex) s.tex.dispose();
      if (s.depth) s.depth.dispose();
    }
    placeholder.dispose();
    quad.geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  // ---- boot
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onRelease);
  stage.addEventListener('pointercancel', onRelease);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', layout);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  stage.setAttribute('role', 'img');
  stage.setAttribute('tabindex', '0');
  setAria();

  layout();
  raf = requestAnimationFrame(frame);

  // load the active scene first for fast first paint, the rest in the background
  loadScene(scenes[0]).then(() => {
    const s = scenes[0];
    s.tx = s.cx = -s.maxX * 0.35;
    started = true;
    needsRender = true;
    cb.onPan((clamp(s.cx, s.maxX) / s.maxX + 1) / 2);
    for (let i = 1; i < scenes.length; i++) loadScene(scenes[i]);
  }).catch(() => {
    destroy();
    if (cb.onContextLost) cb.onContextLost();
  });

  return { destroy };
}
