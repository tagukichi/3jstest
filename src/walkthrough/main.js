// スクロールで建物の中を歩いて進むウォークスルーデモ
// 建物はコードで組んだ簡易ギャラリー(実案件ではglTFモデル等に差し替える想定)。
// カメラはCatmullRom曲線上をスクロール進行率に応じて移動する。

import './style.css';
import * as THREE from 'three';

import scene01 from '../../assets/scene-01.jpg';
import scene02 from '../../assets/scene-02.jpg';

// ---- 進行に応じたキャプション([開始, 終了] は進行率 0..1) ----
const CAPTIONS = [
  {
    range: [0.02, 0.17],
    en: '00 — ENTRANCE',
    title: '静けさの中へ。',
    body: 'スクロールするだけで、建物の中を歩いて進めます。',
  },
  {
    range: [0.24, 0.38],
    en: '01 — CORRIDOR',
    title: '光をたどる回廊。',
    body: '天井の低い回廊を抜けると、空間がひらけます。',
  },
  {
    range: [0.45, 0.66],
    en: '02 — GALLERY',
    title: '作品と歩く。',
    body: '壁面の作品を眺めながら、奥のラウンジへ。',
  },
  {
    range: [0.78, 0.98],
    en: '03 — LOUNGE',
    title: '庭の気配のラウンジ。',
    body: 'ここが終点。実装ではこの先に通常のセクションが続きます。',
  },
];

const stage = document.getElementById('stage');
const captionsRoot = document.getElementById('captions');
const progressFill = document.getElementById('progressFill');
const hint = document.getElementById('hint');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- キャプションDOM生成 ----
const captionEls = CAPTIONS.map((c) => {
  const el = document.createElement('div');
  el.className = 'wt__caption';
  el.innerHTML = `<small>${c.en}</small><h2>${c.title}</h2><p>${c.body}</p>`;
  captionsRoot.appendChild(el);
  return el;
});

function initWalkthrough() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const bg = new THREE.Color('#171310');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 10, 46);

  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 80);

  // ---- マテリアル ----
  const wallMat = new THREE.MeshStandardMaterial({ color: '#d9d0c2', roughness: 0.95 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#3a322a', roughness: 0.9 });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#6e5a44', roughness: 0.8 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#cfc6b8', roughness: 1 });
  const lightMat = new THREE.MeshStandardMaterial({
    color: '#fff7e8', emissive: '#ffedc9', emissiveIntensity: 2.2,
  });

  // ---- 建物のジオメトリ(箱の組み合わせで部屋を作る) ----
  const building = new THREE.Group();
  scene.add(building);

  const box = (w, h, d, x, y, z, mat = wallMat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    building.add(m);
    return m;
  };

  // 床(全室共通)
  box(28, 0.2, 40, 6, -0.1, -17, floorMat);

  // --- Room A: エントランスホール (x -4..4 / z 0..-12 / 高さ5) ---
  box(8.6, 5, 0.3, 0, 2.5, 0.15);            // 背面
  box(0.3, 5, 12, -4, 2.5, -6);               // 西
  box(0.3, 5, 12, 4, 2.5, -6);                // 東
  box(2.5, 5, 0.3, -2.75, 2.5, -12);           // 北(回廊開口の左)
  box(2.5, 5, 0.3, 2.75, 2.5, -12);            // 北(回廊開口の右)
  box(3, 2, 0.3, 0, 4, -12);                   // 開口上の垂れ壁
  box(8, 0.2, 12, 0, 5, -6, ceilMat);          // 天井
  // 円柱とアクセント壁
  for (const z of [-4, -8]) {
    for (const x of [-2.5, 2.5]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 5, 24), darkMat);
      col.position.set(x, 2.5, z);
      building.add(col);
    }
  }
  box(3.5, 3.2, 0.12, 0, 1.7, -0.05, darkMat); // 背面のアクセント slab
  // 天井の光帯
  box(0.5, 0.06, 10, -1.6, 4.95, -6, lightMat);
  box(0.5, 0.06, 10, 1.6, 4.95, -6, lightMat);

  // --- 回廊 (x -1.5..1.5 / z -12..-20 / 高さ3) ---
  box(0.3, 3, 8, -1.5, 1.5, -16);
  box(0.3, 3, 8, 1.5, 1.5, -16);
  box(3, 0.2, 8, 0, 3, -16, ceilMat);
  box(0.4, 0.06, 7, 0, 2.95, -16, lightMat);

  // --- Room B: ギャラリー (x -5..5 / z -20..-34 / 高さ4.5) ---
  box(3.5, 4.5, 0.3, -3.25, 2.25, -20);        // 南(開口の左)
  box(3.5, 4.5, 0.3, 3.25, 2.25, -20);         // 南(開口の右)
  box(3, 1.5, 0.3, 0, 3.75, -20);              // 開口上
  box(0.3, 4.5, 14, -5, 2.25, -27);            // 西
  box(0.3, 4.5, 10, 5, 2.25, -25);             // 東(z -20..-30)
  box(0.3, 4.5, 1, 5, 2.25, -33.5);            // 東(z -33..-34)
  box(0.3, 1.5, 3, 5, 3.75, -31.5);            // Room Cへの開口上
  box(10.3, 4.5, 0.3, 0, 2.25, -34);           // 北
  box(10, 0.2, 14, 0, 4.5, -27, ceilMat);      // 天井
  for (const z of [-23, -27, -31]) box(6, 0.06, 0.5, 0, 4.45, z, lightMat);

  // --- Room C: ラウンジ (x 5..18 / z -26..-34 / 高さ4) ---
  box(13, 4, 0.3, 11.5, 2, -26);
  box(13, 4, 0.3, 11.5, 2, -34);
  box(0.3, 4, 8, 18, 2, -30);
  box(0.3, 4, 4, 5, 2, -28);
  box(13, 0.2, 8, 11.5, 4, -30, ceilMat);
  box(6, 0.06, 4, 12.5, 3.95, -30, lightMat);  // 大きな光天井
  // ローベンチ
  box(4, 0.45, 1.2, 12, 0.32, -32.4, darkMat);
  box(4, 0.45, 1.2, 12, 0.32, -27.6, darkMat);
  // 突き当たりの発光壁(ゴール)
  box(0.1, 2.6, 5, 17.8, 1.6, -30, lightMat);

  // ---- 額装した作品(既存アセットを流用) ----
  const texLoader = new THREE.TextureLoader();
  const addArtwork = (src, x, z, rotY) => {
    const tex = texLoader.load(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const group = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 0.08), darkMat);
    const img = new THREE.Mesh(
      new THREE.PlaneGeometry(3.3, 1.6),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    img.position.z = 0.05;
    group.add(frame, img);
    group.position.set(x, 1.9, z);
    group.rotation.y = rotY;
    building.add(group);
  };
  addArtwork(scene01, -4.8, -24, Math.PI / 2);   // 西壁
  addArtwork(scene02, 4.8, -23, -Math.PI / 2);   // 東壁
  addArtwork(scene02, -4.8, -30, Math.PI / 2);   // 西壁(奥)
  addArtwork(scene01, 11.5, -33.8, 0);           // ラウンジ北壁

  // ---- 照明 ----
  scene.add(new THREE.HemisphereLight('#fff4e0', '#2c241c', 0.7));
  const addPoint = (x, y, z, intensity, distance) => {
    const l = new THREE.PointLight('#ffe9c4', intensity, distance, 2);
    l.position.set(x, y, z);
    scene.add(l);
  };
  addPoint(0, 4.2, -6, 50, 18);     // Room A
  addPoint(0, 2.6, -16, 14, 10);    // 回廊
  addPoint(0, 3.8, -24, 40, 16);    // Room B 手前
  addPoint(0, 3.8, -31, 40, 16);    // Room B 奥
  addPoint(12, 3.4, -30, 45, 15);   // Room C

  // ---- カメラパス(目線高さ ≈1.6m) ----
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.6, -1),
    new THREE.Vector3(0, 1.6, -6),
    new THREE.Vector3(0, 1.55, -10.5),
    new THREE.Vector3(0, 1.5, -16),
    new THREE.Vector3(0, 1.6, -21.5),
    new THREE.Vector3(-1.4, 1.6, -25.5),
    new THREE.Vector3(0.8, 1.6, -28.8),
    new THREE.Vector3(3.4, 1.6, -31.2),
    new THREE.Vector3(6.5, 1.6, -31.4),
    new THREE.Vector3(10, 1.6, -30.4),
    new THREE.Vector3(14.5, 1.6, -30),
  ]);

  // ---- 状態 ----
  let targetProgress = 0;   // スクロール由来の生の進行率
  let progress = -1;        // 表示用(lerp追従)。-1で初回強制描画
  let mouseX = 0;
  let mouseY = 0;
  let lookX = 0;
  let lookY = 0;
  let hinted = false;

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  const readScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    targetProgress = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    if (!hinted && targetProgress > 0.01) {
      hinted = true;
      hint.classList.add('is-hidden');
    }
  };

  addEventListener('scroll', readScroll, { passive: true });

  addEventListener('pointermove', (e) => {
    mouseX = (e.clientX / innerWidth) * 2 - 1;
    mouseY = (e.clientY / innerHeight) * 2 - 1;
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    progress = -1; // 強制再描画
    readScroll();
  });

  const updateCaptions = (p) => {
    for (let i = 0; i < CAPTIONS.length; i++) {
      const [a, b] = CAPTIONS[i].range;
      const fade = 0.04;
      let o = 0;
      if (p > a && p < b) {
        o = Math.min(1, (p - a) / fade, (b - p) / fade);
      }
      captionEls[i].style.opacity = o.toFixed(3);
      captionEls[i].style.transform = `translateY(${(1 - o) * 14}px)`;
    }
  };

  const render = () => {
    // カメラ位置: パス終端の少し手前まで。注視点は少し先を見る
    const t = progress * 0.955;
    path.getPointAt(t, camPos);
    path.getPointAt(Math.min(t + 0.045, 1), camLook);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    // マウスでわずかに視線が振れる(reduced motion時は無効)
    camera.rotation.y -= lookX * 0.045;
    camera.rotation.x -= lookY * 0.03;

    renderer.render(scene, camera);
    updateCaptions(progress);
    progressFill.style.height = (progress * 100).toFixed(2) + '%';
  };

  const tick = () => {
    requestAnimationFrame(tick);

    const ease = reducedMotion ? 1 : 0.07;
    const prev = progress;
    progress = progress < 0 ? targetProgress : prev + (targetProgress - prev) * ease;

    const targetLX = reducedMotion ? 0 : mouseX;
    const targetLY = reducedMotion ? 0 : mouseY;
    lookX += (targetLX - lookX) * 0.06;
    lookY += (targetLY - lookY) * 0.06;

    // ほぼ静止していたら描画をスキップ(放置時のGPU負荷ゼロ化)
    const moving =
      prev < 0 ||
      Math.abs(targetProgress - progress) > 0.00005 ||
      Math.abs(targetLX - lookX) > 0.002 ||
      Math.abs(targetLY - lookY) > 0.002;
    if (moving) render();
  };

  readScroll();
  tick();
  return true;
}

function initFallback() {
  const el = document.createElement('div');
  el.className = 'wt__fallback';
  el.style.backgroundImage = `url(${scene01})`;
  el.innerHTML =
    '<p>お使いの環境では3Dウォークスルーを表示できません。<br>本実装では静止画+スクロール演出のフォールバックに差し替わります。</p>';
  stage.appendChild(el);
}

let ok = false;
try {
  ok = initWalkthrough();
} catch (e) {
  console.error('walkthrough init failed:', e);
}
if (!ok) initFallback();
