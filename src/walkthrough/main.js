// スクロールで建物の中を歩いて進むウォークスルーデモ
// 1階(エントランス→回廊→ギャラリー→ラウンジ)から階段で2階へ上がり、
// 2階ギャラリーと吹き抜けのブリッジを通って入り口へ戻る回遊動線。
// 建物はコードで構築(実案件ではglTF等に差し替える想定)。

import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import scene01 from '../../assets/scene-01.jpg';
import scene02 from '../../assets/scene-02.jpg';

// ---- 進行に応じたキャプション([開始, 終了] は進行率 0..1) ----
const CAPTIONS = [
  {
    range: [0.01, 0.09],
    en: '00 — ENTRANCE',
    title: '吹き抜けの光の下へ。',
    body: 'スクロールするだけで、建物の中を歩いて進めます。',
  },
  {
    range: [0.12, 0.19],
    en: '01 — CORRIDOR',
    title: '光をたどる回廊。',
    body: '天井の低い回廊を抜けると、空間がひらけます。',
  },
  {
    range: [0.22, 0.33],
    en: '02 — GALLERY',
    title: '作品と歩く。',
    body: '壁面の作品を眺めながら、奥のラウンジへ。',
  },
  {
    range: [0.35, 0.41],
    en: '03 — LOUNGE',
    title: '腰を下ろしたくなる場所。',
    body: '突き当たりの階段から、2階へ上がります。',
  },
  {
    range: [0.43, 0.55],
    en: '04 — STAIRS',
    title: '階段を上って、2階へ。',
    body: '折り返しの階段が、視点の高さを変えていきます。',
  },
  {
    range: [0.58, 0.73],
    en: '05 — GALLERY 2F',
    title: '上階の回遊ギャラリー。',
    body: '2階にも作品が続きます。来た道の真上を戻っていきます。',
  },
  {
    range: [0.77, 0.84],
    en: '06 — BRIDGE',
    title: '吹き抜けを見下ろす。',
    body: 'ブリッジを渡ると、エントランスの上のバルコニーへ。',
  },
  {
    range: [0.87, 0.97],
    en: '07 — RETURN',
    title: '歩いて、入り口へ。',
    body: '階段を下りて、はじめの場所に帰ってきました。',
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

// ---- プロシージャルテクスチャ(外部画像なしで質感を出す) ----
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 板張りの床(目地+板ごとの色むら+木目)
function drawWood(ctx, s, base = [122, 95, 68]) {
  ctx.fillStyle = '#35281e';
  ctx.fillRect(0, 0, s, s);
  const rows = 8;
  const h = s / rows;
  for (let r = 0; r < rows; r++) {
    let x = -Math.random() * 180;
    while (x < s) {
      const w = 120 + Math.random() * 160;
      const l = 0.8 + Math.random() * 0.35;
      ctx.fillStyle = `rgb(${(base[0] * l) | 0},${(base[1] * l) | 0},${(base[2] * l) | 0})`;
      ctx.fillRect(x, r * h + 1, w - 3, h - 2);
      x += w;
    }
  }
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#241a12';
  for (let i = 0; i < 240; i++) {
    const y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(s * 0.3, y + Math.random() * 8 - 4, s * 0.7, y + Math.random() * 8 - 4, s, y + Math.random() * 6 - 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// 漆喰壁(淡いむら+粒ノイズ)
function drawPlaster(ctx, s) {
  ctx.fillStyle = '#ddd5c6';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const r = s * (0.15 + Math.random() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = Math.random() > 0.5 ? '255,250,238' : '120,110,95';
    g.addColorStop(0, `rgba(${tone},0.06)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
  }
}

function initWalkthrough() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const bg = new THREE.Color('#15110d');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 12, 60);

  // 環境光(IBL)。PBRマテリアルの質感が大きく向上する
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 90);

  // ---- マテリアル ----
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const plasterTex = canvasTexture(512, drawPlaster);
  plasterTex.repeat.set(2, 2);
  const wallMat = new THREE.MeshStandardMaterial({
    map: plasterTex, bumpMap: plasterTex, bumpScale: 0.4, roughness: 0.95,
  });
  const woodTexBase = canvasTexture(512, drawWood);
  // 用途ごとにリピート数を変えた木材マテリアル(テクスチャ実体は共有)
  const woodOf = (rx, ry, rough = 0.55) => {
    const tex = woodTexBase.clone();
    tex.repeat.set(rx, ry);
    tex.anisotropy = Math.min(8, maxAniso);
    return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.3, roughness: rough });
  };
  const floorMat = woodOf(9, 12);
  const darkMat = new THREE.MeshStandardMaterial({ color: '#352e26', roughness: 0.6, metalness: 0.15 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#d6cec0', roughness: 1 });
  const lightMat = new THREE.MeshStandardMaterial({
    color: '#fff7e8', emissive: '#ffedc9', emissiveIntensity: 2.4,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#cfd8d6', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.18,
  });
  const greenMat = new THREE.MeshStandardMaterial({ color: '#33502f', roughness: 1, flatShading: true });

  // ---- 建物(箱の組み合わせ) ----
  // 平面: 1F=エントランス(z 0..-12,吹抜け)→回廊(z -12..-20)→ギャラリーB(x -5..5, z -20..-34)
  //       →ラウンジC(x 5..18, z -26..-34)。2FスラブはY4.0..4.2、2F天井はY7.6。
  const building = new THREE.Group();
  scene.add(building);

  const box = (w, h, d, x, y, z, mat = wallMat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    building.add(m);
    return m;
  };

  // 床(全室共通)
  box(28, 0.2, 40, 6, -0.1, -17, floorMat);

  // --- エントランス吹き抜け(x -4..4 / z 0..-12 / 高さ8) ---
  box(8.6, 8, 0.3, 0, 4, 0.15);                 // 背面
  box(0.3, 8, 12, -4, 4, -6);                   // 西
  box(0.3, 8, 12, 4, 4, -6);                    // 東
  box(2.5, 8, 0.3, -2.75, 4, -12);              // 北(開口の左)
  box(2.5, 8, 0.3, 2.75, 4, -12);               // 北(開口の右)
  box(3, 1.2, 0.3, 0, 3.6, -12);                // 1F開口上〜2F床の帯
  box(3, 0.8, 0.3, 0, 7.6, -12);                // 2F開口上
  // 屋根+トップライト
  box(2, 0.2, 12, -3, 8.1, -6, ceilMat);
  box(2, 0.2, 12, 3, 8.1, -6, ceilMat);
  box(4, 0.2, 2, 0, 8.1, -1, ceilMat);
  box(4, 0.2, 2, 0, 8.1, -11, ceilMat);
  box(4, 0.05, 8, 0, 8.0, -6, lightMat);        // 光天井
  // 受付カウンターとアクセント
  box(2.6, 1.0, 0.7, 2.4, 0.5, -7, woodOf(2, 1));
  box(2.8, 0.06, 0.9, 2.4, 1.03, -7, darkMat);
  box(3.5, 3.2, 0.12, 0, 1.7, -0.06, darkMat);
  // 巾木
  box(0.06, 0.14, 11.8, -3.82, 0.07, -6, darkMat);
  box(0.06, 0.14, 11.8, 3.82, 0.07, -6, darkMat);
  box(7.6, 0.14, 0.06, 0, 0.07, -0.02, darkMat);

  // --- 1F回廊+2Fブリッジ(x -1.5..1.5 / z -12..-20) ---
  box(0.3, 7.6, 8, -1.5, 3.8, -16);
  box(0.3, 7.6, 8, 1.5, 3.8, -16);
  box(3, 0.2, 8, 0, 3.1, -16, ceilMat);          // 1F天井
  box(3, 0.2, 8, 0, 4.1, -16, woodOf(1.5, 4));   // ブリッジ床
  box(0.4, 0.05, 7, 0, 2.97, -16, lightMat);     // 1F光帯
  box(0.4, 0.05, 7, 0, 7.55, -16, lightMat);     // 2F光帯

  // --- ギャラリーB(x -5..5 / z -20..-34) 1F+2F共通の外殻 ---
  box(3.5, 7.6, 0.3, -3.25, 3.8, -20);           // 南(開口の左)
  box(3.5, 7.6, 0.3, 3.25, 3.8, -20);            // 南(開口の右)
  box(3, 1.2, 0.3, 0, 3.6, -20);                 // 1F開口上の帯
  box(3, 0.4, 0.3, 0, 7.4, -20);                 // 2F開口上
  box(0.3, 7.6, 14, -5, 3.8, -27);               // 西
  box(0.3, 7.6, 10, 5, 3.8, -25);                // 東(z -20..-30)
  box(0.3, 1.2, 3, 5, 3.6, -31.5);               // 東ドア上の帯(1F/2F共通開口 z -30..-33)
  box(0.3, 0.4, 3, 5, 7.4, -31.5);               // 東2Fドア上
  box(0.3, 7.6, 1, 5, 3.8, -33.5);               // 東(z -33..-34)
  box(10.3, 7.6, 0.3, 0, 3.8, -34);              // 北
  box(10, 0.2, 14, 0, 4.1, -27, woodOf(5, 7));   // 2F床スラブ(=1F天井)
  for (const z of [-23, -27, -31]) box(6, 0.05, 0.4, 0, 3.97, z, lightMat);
  box(0.06, 0.14, 13.8, -4.82, 0.07, -27, darkMat);
  box(0.06, 0.14, 9.8, 4.82, 0.07, -24.9, darkMat);

  // --- ラウンジC(1F)+ギャラリーD(2F) (x 5..18 / z -26..-34) ---
  box(13, 7.6, 0.3, 11.5, 3.8, -26);             // 南
  box(13, 7.6, 0.3, 11.5, 3.8, -34);             // 北
  box(0.3, 7.6, 8, 18, 3.8, -30);                // 東
  // 2F床スラブ(階段の吹き抜け x 11.2..18, z -30.4..-34 を開ける)
  box(13, 0.2, 4.4, 11.5, 4.1, -28.2, woodOf(6, 2));  // 北側 x 5..18, z -26..-30.4
  box(6.2, 0.2, 3.6, 8.1, 4.1, -32.2, woodOf(3, 2));  // 南西側 x 5..11.2, z -30.4..-34
  box(5, 0.05, 3, 9, 3.97, -28.2, lightMat);     // 1Fラウンジ光天井
  box(5, 0.05, 3, 11, 7.55, -30, lightMat);      // 2F光天井
  box(0.1, 2.2, 4, 17.84, 5.8, -30, lightMat);   // 2F突き当たりの発光スリット
  // ローベンチ(南側の壁沿い)
  box(4, 0.45, 1.2, 8, 0.32, -27.3, darkMat);
  box(4, 0.45, 1.2, 12.5, 0.32, -27.3, darkMat);

  // --- 上階全体の屋根(回廊〜ギャラリー〜ラウンジ上) ---
  box(23, 0.2, 22, 6.5, 7.7, -23, ceilMat);

  // ---- 階段(段は床から立ち上がるソリッド。axis='x'でx方向、'z'でz方向に進む) ----
  const stairs = (axis, c, width, a0, a1, y0, y1, mat) => {
    const n = Math.max(2, Math.round(Math.abs(y1 - y0) / 0.17));
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const A = a0 + (a1 - a0) * t0;
      const B = a0 + (a1 - a0) * t1;
      const top = Math.max(y0 + (y1 - y0) * t0, y0 + (y1 - y0) * t1);
      if (axis === 'x') box(Math.abs(B - A), top, width, (A + B) / 2, top / 2, c, mat);
      else box(width, top, Math.abs(B - A), c, top / 2, (A + B) / 2, mat);
    }
  };
  const stairMat = woodOf(1, 1, 0.7);

  // ラウンジの折り返し階段(進行方向=東向きに正面から上る):
  // 上り1(x 11→16.6, 0→2.1m, 北寄り) → 東端の踊り場 → 上り2(x 16.6→11, 2.1→4.2m)
  stairs('x', -32.8, 1.3, 11, 16.6, 0, 2.1, stairMat);
  box(1.25, 2.1, 3.0, 17.22, 1.05, -32.0, stairMat);     // 踊り場(東壁沿い)
  stairs('x', -31.2, 1.3, 16.6, 11, 2.1, 4.2, stairMat);
  // 階段まわりのガラス手すり(rotX=z方向の勾配 / rotZ=x方向の勾配)
  const rail = (w, d, x, y, z, rotX = 0, rotZ = 0) => {
    const g = box(w, 1.0, d, x, y, z, glassMat);
    g.rotation.set(rotX, 0, rotZ);
    g.castShadow = false;
    const top = box(Math.max(w, 0.06), 0.05, Math.max(d, 0.06), x, y + 0.52, z, darkMat);
    top.rotation.set(rotX, 0, rotZ);
    return g;
  };
  rail(5.7, 0.06, 13.8, 1.55, -32.12, 0, Math.atan2(2.1, 5.6));   // 上り1の南側
  rail(5.7, 0.06, 13.8, 3.65, -31.88, 0, -Math.atan2(2.1, 5.6));  // 上り2の南側
  rail(6.6, 0.06, 14.5, 4.85, -30.45);                            // 2F吹き抜け縁(北側)
  rail(0.06, 2.1, 11.2, 4.85, -32.95);                            // 2F吹き抜け縁(西側)

  // --- エントランス2Fバルコニー+下り階段 ---
  box(8, 0.2, 3, 0, 4.1, -10.5, woodOf(4, 1.5)); // バルコニー床
  rail(6.6, 0.06, 0.7, 4.72, -9);                // バルコニー手すり(階段口 x -3.6..-2.6 を空ける)
  rail(0.4, 0.06, -3.8, 4.72, -9);
  stairs('z', -3.1, 1.0, -9, -2, 4.2, 0, stairMat); // 下り階段(z -9→-2 で 4.2m→0)
  rail(0.06, 7.2, -2.55, 2.6, -5.5, Math.atan2(4.2, 7)); // 階段の東側手すり

  // ---- ドア枠(濃色トリム) ----
  const doorTrimZ = (z) => {
    box(0.12, 3.05, 0.5, -1.55, 1.52, z, darkMat);
    box(0.12, 3.05, 0.5, 1.55, 1.52, z, darkMat);
    box(3.35, 0.12, 0.5, 0, 3.02, z, darkMat);
  };
  doorTrimZ(-12);
  doorTrimZ(-20);
  box(0.5, 3.05, 0.12, 5, 1.52, -29.95, darkMat);
  box(0.5, 3.05, 0.12, 5, 1.52, -33.05, darkMat);
  box(0.5, 0.12, 3.3, 5, 3.02, -31.5, darkMat);

  // ---- 額装した作品 ----
  const texLoader = new THREE.TextureLoader();
  const addArtwork = (src, x, y, z, rotY) => {
    const tex = texLoader.load(src);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const group = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 0.08), darkMat);
    frame.castShadow = true;
    const img = new THREE.Mesh(
      new THREE.PlaneGeometry(3.3, 1.6),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    img.position.z = 0.05;
    group.add(frame, img);
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    building.add(group);
  };
  addArtwork(scene01, 3.83, 2.6, -6, -Math.PI / 2);      // エントランス東壁
  addArtwork(scene01, -4.8, 1.9, -24, Math.PI / 2);      // 1Fギャラリー西
  addArtwork(scene02, 4.8, 1.9, -23, -Math.PI / 2);      // 1Fギャラリー東
  addArtwork(scene02, -4.8, 1.9, -29.5, Math.PI / 2);    // 1Fギャラリー西(奥)
  addArtwork(scene01, 8, 1.9, -33.8, 0);                 // 1Fラウンジ北
  addArtwork(scene01, -4.8, 5.9, -26, Math.PI / 2);      // 2Fギャラリー西
  addArtwork(scene02, -4.8, 5.9, -31, Math.PI / 2);      // 2Fギャラリー西(奥)
  addArtwork(scene01, 4.8, 5.9, -22.5, -Math.PI / 2);    // 2Fギャラリー東
  addArtwork(scene02, 10.5, 5.9, -33.8, 0);              // 2F北壁

  // ---- 観葉植物(ローポリの点景) ----
  const plant = (x, yBase, z, s = 1) => {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.26 * s, 0.5 * s, 16), darkMat);
    pot.position.y = 0.25 * s;
    pot.castShadow = true;
    g.add(pot);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38 * s, 0), greenMat);
      leaf.position.set((Math.random() - 0.5) * 0.45 * s, (0.85 + i * 0.22) * s, (Math.random() - 0.5) * 0.45 * s);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.position.set(x, yBase, z);
    building.add(g);
  };
  plant(-3.3, 0, -10.6);
  plant(3.3, 0, -10.6);
  plant(6.2, 0, -27.2);
  plant(4, 4.2, -21.3);

  // ---- 照明 ----
  const spot = (x, y, z, tx, tz, intensity, castShadow) => {
    const l = new THREE.SpotLight('#ffe9c4', intensity, 22, 1.0, 0.6, 2);
    l.position.set(x, y, z);
    l.target.position.set(tx, 0, tz);
    l.castShadow = castShadow;
    if (castShadow) {
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.02;
    }
    scene.add(l, l.target);
  };
  spot(0, 7.7, -6, 0, -6, 300, true);     // 吹き抜けトップライト
  spot(0, 3.9, -26, 0, -27, 90, true);    // 1Fギャラリー
  spot(0, 7.4, -27, 0, -27, 250, true);   // 2Fギャラリー
  const addPoint = (x, y, z, intensity, distance) => {
    const l = new THREE.PointLight('#ffe9c4', intensity, distance, 2);
    l.position.set(x, y, z);
    scene.add(l);
  };
  addPoint(0, 2.7, -16, 15, 9);       // 1F回廊
  addPoint(0, 6.9, -16, 25, 10);      // ブリッジ
  addPoint(10, 3.7, -30, 35, 12);     // 1Fラウンジ
  addPoint(11, 7.0, -30, 60, 14);     // 2Fギャラリー奥
  addPoint(15.3, 4.6, -30.5, 30, 10); // 階段室
  addPoint(0, 7.4, -10.5, 40, 12);    // バルコニー

  // ---- カメラパス(回遊動線。目線=床+1.6m)。閉ループなので何周でも歩ける ----
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.6, -1),
    new THREE.Vector3(0, 1.6, -6),
    new THREE.Vector3(0, 1.55, -10.8),
    new THREE.Vector3(0, 1.5, -16),
    new THREE.Vector3(0, 1.6, -21.5),
    new THREE.Vector3(-1.4, 1.6, -25),
    new THREE.Vector3(0.8, 1.6, -28.6),
    new THREE.Vector3(3.4, 1.6, -31.3),
    new THREE.Vector3(6.5, 1.6, -31.4),    // ラウンジへ
    new THREE.Vector3(8.8, 1.6, -32.0),
    new THREE.Vector3(10.9, 1.75, -32.7),  // 階段正面へ
    new THREE.Vector3(12.6, 2.2, -32.8),   // 上り1(東向きに正面から)
    new THREE.Vector3(14.8, 3.0, -32.8),
    new THREE.Vector3(16.3, 3.55, -32.8),
    new THREE.Vector3(17.25, 3.75, -32.3), // 踊り場でUターン
    new THREE.Vector3(17.25, 3.78, -31.3),
    new THREE.Vector3(15.8, 4.0, -31.2),   // 上り2(西向き)
    new THREE.Vector3(13.8, 4.75, -31.2),
    new THREE.Vector3(11.9, 5.45, -31.2),
    new THREE.Vector3(10.5, 5.8, -31.0),   // 2F着床
    new THREE.Vector3(7.8, 5.8, -31.3),
    new THREE.Vector3(5.8, 5.8, -31.4),    // 2Fドア
    new THREE.Vector3(3.0, 5.8, -29.8),
    new THREE.Vector3(0.5, 5.8, -26.5),
    new THREE.Vector3(0, 5.8, -22),
    new THREE.Vector3(0, 5.75, -16),       // ブリッジ
    new THREE.Vector3(0, 5.8, -11.2),      // バルコニー
    new THREE.Vector3(-1.8, 5.8, -10.0),
    new THREE.Vector3(-3.05, 5.55, -8.6),  // 下り階段
    new THREE.Vector3(-3.1, 4.1, -6.2),
    new THREE.Vector3(-3.1, 2.7, -3.8),
    new THREE.Vector3(-2.9, 1.7, -2.0),
    new THREE.Vector3(-1.6, 1.6, -1.1),    // 出発点へ合流(閉ループ)
  ], true, 'centripetal');

  // ---- 状態 ----
  let targetProgress = 0;   // スクロール由来の生の進行率
  let progress = 0;         // 表示用(lerp追従)。周回時は一時的に負になる
  let primed = false;       // 初回/リサイズ後の強制描画フラグ
  let mouseX = 0;
  let mouseY = 0;
  let lookX = 0;
  let lookY = 0;
  let hinted = false;

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  const readScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max <= 0) return;
    // 周回: 最下部に達したら先頭へ巻き戻して2周目へ。
    // パスが閉ループ(終点=始点)なので映像は途切れない
    if (scrollY >= max - 0.5) {
      progress -= 1;
      scrollTo(0, 0);
    }
    targetProgress = Math.min(1, Math.max(0, scrollY / max));
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
    primed = false; // 強制再描画
    readScroll();
  });

  const updateCaptions = (p) => {
    for (let i = 0; i < CAPTIONS.length; i++) {
      const [a, b] = CAPTIONS[i].range;
      const fade = 0.025;
      let o = 0;
      if (p > a && p < b) {
        o = Math.min(1, (p - a) / fade, (b - p) / fade);
      }
      captionEls[i].style.opacity = o.toFixed(3);
      captionEls[i].style.transform = `translateY(${(1 - o) * 14}px)`;
    }
  };

  const render = () => {
    // 閉ループ上の位置(0..1に正規化)。注視点は少し先を見る
    const t = ((progress % 1) + 1) % 1;
    path.getPointAt(t, camPos);
    path.getPointAt((t + 0.035) % 1, camLook);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    // マウスでわずかに視線が振れる(reduced motion時は無効)
    camera.rotation.y -= lookX * 0.045;
    camera.rotation.x -= lookY * 0.03;

    renderer.render(scene, camera);
    updateCaptions(t);
    progressFill.style.height = (t * 100).toFixed(2) + '%';
  };

  const tick = () => {
    requestAnimationFrame(tick);

    const forced = !primed;
    if (!primed) {
      progress = targetProgress;
      primed = true;
    } else {
      const ease = reducedMotion ? 1 : 0.07;
      progress += (targetProgress - progress) * ease;
    }

    const targetLX = reducedMotion ? 0 : mouseX;
    const targetLY = reducedMotion ? 0 : mouseY;
    lookX += (targetLX - lookX) * 0.06;
    lookY += (targetLY - lookY) * 0.06;

    // ほぼ静止していたら描画をスキップ(放置時のGPU負荷ゼロ化)
    const moving =
      forced ||
      Math.abs(targetProgress - progress) > 0.00003 ||
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
