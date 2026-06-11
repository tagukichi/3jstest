// CSS transform fallback — used when WebGL2 is unavailable or the context dies.
// This is the reference implementation (reference/fv-swipe-demo.html) adapted to
// build its DOM from the same scenes config as initFV. No depth parallax here.

const OVERSCAN = 1.12;
const PULL_THRESHOLD = 90;
const PULL_VISUAL_MAX = 56;
const TRANS_DURATION = 0.85;
const ENTER_OFFSET = 0.62;

function clamp(v, m) { return Math.max(-m, Math.min(m, v)); }
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export function initFVFallback(stage, sceneDefs, opts = {}) {
  const cb = {
    onSceneChange: () => {},
    onPan: () => {},
    onFirstDrag: () => {},
    ...opts,
  };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let vw = 0, vh = 0;
  const scenes = sceneDefs.map((def) => {
    const el = document.createElement('div');
    el.className = 'fv__pan';
    const img = document.createElement('img');
    img.src = def.src;
    img.alt = def.label || '';
    img.draggable = false;
    el.appendChild(img);
    stage.appendChild(el);
    return { el, img, ar: def.ar, tx: 0, ty: 0, cx: 0, cy: 0, maxX: 0, maxY: 0 };
  });

  let active = 0;
  let dragging = false, lastX = 0, lastY = 0, startX = 0, startY = 0;
  let horizontalLock = null;
  let vx = 0;
  let pullT = 0, pullC = 0;
  let trans = null;
  let hinted = false;
  let raf = 0;
  let destroyed = false;

  function layout() {
    const r = stage.getBoundingClientRect();
    vw = r.width;
    vh = r.height;
    for (const s of scenes) {
      let h = vh * OVERSCAN;
      let w = h * s.ar;
      if (w < vw * 1.06) { w = vw * 1.06; h = w / s.ar; }
      s.el.style.width = w + 'px';
      s.el.style.height = h + 'px';
      s.maxX = Math.max(0, (w - vw) / 2);
      s.maxY = Math.max(0, (h - vh) / 2);
      s.tx = clamp(s.tx, s.maxX);
      s.ty = clamp(s.ty, s.maxY);
    }
  }

  function neighbor(dir) {
    const n = active + dir;
    return (n >= 0 && n < scenes.length) ? n : -1;
  }

  function onPointerDown(e) {
    if (trans) return;
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
    const want = s.tx - dx * 1.1;
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
    s.ty = clamp(s.ty - dy * 0.7, s.maxY);

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
      s.tx = clamp(s.tx + vx * 12, s.maxX);
    }
  }

  function onKeyDown(e) {
    if (trans) return;
    const s = scenes[active];
    if (e.key === 'ArrowRight') {
      if (s.tx >= s.maxX - 1 && neighbor(1) !== -1) startTransition(1);
      else s.tx = clamp(s.tx + 160, s.maxX);
    } else if (e.key === 'ArrowLeft') {
      if (s.tx <= -s.maxX + 1 && neighbor(-1) !== -1) startTransition(-1);
      else s.tx = clamp(s.tx - 160, s.maxX);
    }
  }

  function startTransition(dir) {
    const from = scenes[active];
    const to = scenes[active + dir];
    to.tx = to.cx = -dir * to.maxX * ENTER_OFFSET;
    to.ty = to.cy = 0;
    trans = { from, to, dir, t: 0 };
    pullT = 0;
    active += dir;
    cb.onSceneChange(active, scenes.length);
  }

  function applyScene(s, x, y, opacity, scale, extraX) {
    s.el.style.visibility = opacity > 0.001 ? 'visible' : 'hidden';
    s.el.style.opacity = opacity.toFixed(3);
    const rot = s.maxX ? (x / s.maxX) * 1.8 : 0;
    s.el.style.transform =
      'translate(-50%, -50%) translate3d(' + (-(x) + (extraX || 0)).toFixed(2) + 'px,' +
      (-y).toFixed(2) + 'px, 0) rotateY(' + rot.toFixed(3) + 'deg)' +
      ' scale(' + scale.toFixed(4) + ')';
  }

  let prevTime = 0;
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = prevTime ? Math.min(0.05, (now - prevTime) / 1000) : 0.016;
    prevTime = now;

    const k = reduced ? 1 : 0.085;
    pullC += (pullT - pullC) * (reduced ? 1 : 0.18);

    if (trans) {
      trans.t += dt / (reduced ? 0.001 : TRANS_DURATION);
      const t = Math.min(1, trans.t);
      const e = ease(t);
      const d = trans.dir;

      applyScene(trans.from, trans.from.cx, trans.from.cy, 1 - e, 1 + 0.06 * e, -d * (PULL_VISUAL_MAX + 90 * e));
      trans.to.cx += (trans.to.tx - trans.to.cx) * k;
      applyScene(trans.to, trans.to.cx, trans.to.cy, e, 1.09 - 0.09 * e, d * 50 * (1 - e));

      if (t >= 1) {
        applyScene(trans.from, trans.from.cx, trans.from.cy, 0, 1, 0);
        trans = null;
      }
    } else {
      const s = scenes[active];
      s.cx += (s.tx - s.cx) * k;
      s.cy += (s.ty - s.cy) * k;

      const pv = Math.sign(pullC) * Math.min(PULL_VISUAL_MAX, Math.abs(pullC) * 0.45);
      applyScene(s, s.cx, s.cy, 1, 1, -pv);

      const nIdx = pullC > 4 ? neighbor(1) : (pullC < -4 ? neighbor(-1) : -1);
      for (let i = 0; i < scenes.length; i++) {
        if (i === active) continue;
        if (i === nIdx) {
          const n = scenes[i];
          const prog = Math.min(1, Math.abs(pullC) / PULL_THRESHOLD);
          const d2 = pullC > 0 ? 1 : -1;
          n.cx = -d2 * n.maxX * ENTER_OFFSET;
          n.cy = 0;
          applyScene(n, n.cx, n.cy, prog * 0.55, 1.09, d2 * 50);
        } else {
          scenes[i].el.style.opacity = '0';
          scenes[i].el.style.visibility = 'hidden';
        }
      }

      if (s.maxX) cb.onPan((clamp(s.cx, s.maxX) / s.maxX + 1) / 2);
    }
  }

  function start() {
    layout();
    const s = scenes[0];
    s.tx = s.cx = -s.maxX * 0.35;
    applyScene(s, s.cx, 0, 1, 1, 0);
    raf = requestAnimationFrame(frame);
  }

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointermove', onPointerMove);
    stage.removeEventListener('pointerup', onRelease);
    stage.removeEventListener('pointercancel', onRelease);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', layout);
    for (const s of scenes) s.el.remove();
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onRelease);
  stage.addEventListener('pointercancel', onRelease);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', layout);

  const img0 = scenes[0].img;
  if (img0.complete) start(); else img0.addEventListener('load', start);

  return { destroy };
}
