import './style.css';
import { initFV } from './fv/initFV.js';
import { initFVFallback } from './fv/fallback.js';

import scene01 from '../assets/scene-01.jpg';
import scene01Depth from '../assets/scene-01-depth.jpg';
import scene02 from '../assets/scene-02.jpg';
import scene02Depth from '../assets/scene-02-depth.jpg';

// シーンを増やすときはこの配列に追加するだけ
const scenes = [
  {
    src: scene01,
    depthSrc: scene01Depth,
    ar: 1859 / 846,
    label: '庭に面したラウンジの内観',
  },
  {
    src: scene02,
    depthSrc: scene02Depth,
    ar: 1863 / 844,
    label: '本棚とテーブルのあるライブラリ空間の内観',
  },
];

const stage = document.getElementById('stage');
const dot = document.getElementById('dot');
const cur = document.getElementById('cur');
const total = document.getElementById('total');
const hintText = document.getElementById('hintText');

total.textContent = scenes.length < 10 ? '0' + scenes.length : String(scenes.length);

const callbacks = {
  onPan(p) {
    dot.style.left = (10 + p * 80) + '%';
  },
  onSceneChange(index) {
    cur.textContent = index + 1 < 10 ? '0' + (index + 1) : String(index + 1);
  },
  onFirstDrag() {
    hintText.textContent = 'SWIPE TO MOVE ON';
  },
  onContextLost() {
    // WebGLコンテキスト喪失時はCSS版に切り替え
    initFVFallback(stage, scenes, { ...callbacks, onContextLost: null });
  },
};

// ?fallback=1 でCSS版を強制(QA用)。WebGL2不可・初期化失敗時も自動でCSS版へ
const forceFallback = new URLSearchParams(location.search).has('fallback');
const fv = forceFallback ? null : initFV(stage, scenes, callbacks);
if (!fv) {
  initFVFallback(stage, scenes, callbacks);
}
