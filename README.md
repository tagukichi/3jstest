# FV「スワイプで空間を移動する」— Three.js 実装

[HANDOFF.md](HANDOFF.md) の仕様に基づく実装。体験仕様(操作感)は `reference/fv-swipe-demo.html` のロジックを1:1で移植し、レンダリングのみ Three.js + カスタムシェーダー化して「深度マップ2.5Dパララックス」と「シェーダー製シーン遷移」を追加している。

## セットアップ

```sh
npm install
npm run dev      # 開発サーバー (http://localhost:5173)
npm run build    # dist/ に相対パスでビルド(静的サイト/WordPressに載せやすい)
```

## 構成

| ファイル | 役割 |
|---|---|
| `src/main.js` | シーン設定配列とUI(ゲージ/カウンター/ヒント)の配線 |
| `src/fv/initFV.js` | FV本体(自己完結モジュール)。`initFV(stageEl, scenes, callbacks)` |
| `src/fv/shaders.js` | 頂点/フラグメントシェーダー(パララックス+遷移) |
| `src/fv/fallback.js` | WebGL2不可時のCSS transform版(リファレンスの移植) |
| `tools/gen_depth.py` | 深度マップ生成スクリプト(Depth Anything V2 Small) |

## シーンの追加(N枚対応)

`src/main.js` の `scenes` 配列に追記するだけ:

```js
{
  src: scene03,           // 内観パース画像
  depthSrc: scene03Depth, // 深度マップ(手前=白/奥=黒)
  ar: 1859 / 846,         // 画像のアスペクト比
  label: '空間の説明(aria-labelに使用)',
}
```

## 深度マップの再生成

```sh
py -3.13 -m venv %USERPROFILE%\.fv-depth-venv
%USERPROFILE%\.fv-depth-venv\Scripts\pip install torch --index-url https://download.pytorch.org/whl/cpu
%USERPROFILE%\.fv-depth-venv\Scripts\pip install transformers pillow
%USERPROFILE%\.fv-depth-venv\Scripts\python tools\gen_depth.py
```

元画像の1/2解像度・グレースケール・σ=2pxブラーで `assets/<name>-depth.jpg` に出力される。

## チューニング

操作感の定数は `src/fv/initFV.js` 冒頭にまとまっている(リファレンス実装と同値)。Three.js版で追加したもの:

- `PARALLAX_MAX = 0.045` — パララックスの最大uvオフセット(上げすぎるとエッジが破綻)
- `PARALLAX_GAIN = 0.55` — パン速度→パララックス変換係数
- `EDGE_INSET = 0.97` — エッジ引き伸ばし対策の中央寄せズーム
- `DISP_STRENGTH = 0.16`(shaders.js)— 遷移ディスプレイスメントの強さ

## QA

- `?fallback=1` を付けるとCSS版を強制表示(WebGL不可環境の確認用)
- `prefers-reduced-motion: reduce` でlerp・慣性・遷移アニメ・パララックスがすべて無効化(即時切り替え)

## 受け入れ基準の検証状況

- [x] 自動の動きが一切ない(放置で完全静止を確認)
- [x] スワイプで深度パララックス(手前/奥のシフト差を定量確認)
- [x] 閾値(90px)超えリリースで遷移、未満でスプリングバック
- [x] 遷移中の破綻なし(全フレーム輝度計測で白フラッシュなし)
- [ ] iOS Safari / Android Chrome 実機での縦スクロール共存 — **実機未確認**(ロジックはリファレンスと同一: `touch-action: pan-y` + 8px方向ロック)
- [x] `prefers-reduced-motion` 対応(コードパス実装済み)
- [x] キーボード ← → 操作
- [x] シーン追加は配列追記のみ
- [x] WebGL不可でCSS版フォールバック
