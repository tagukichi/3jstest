// FV shaders — single fullscreen quad mixing two scenes (A: current/outgoing, B: neighbor/incoming).
// Pan / cover-fit happens in uv space; depth maps drive 2.5D parallax and the
// displacement transition.

export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTexA;
uniform sampler2D uDepthA;
uniform sampler2D uTexB;
uniform sampler2D uDepthB;

uniform vec2  uCoverA;     // visible fraction of image A (incl. edge inset)
uniform vec2  uPanA;       // uv offset of view center from image center
uniform float uZoomA;      // transition zoom (1 = none)
uniform float uRotA;       // fake rotateY shear factor
uniform vec2  uCoverB;
uniform vec2  uPanB;
uniform float uZoomB;
uniform float uRotB;

uniform vec2  uParallaxA;  // depth parallax strength (uv units)
uniform vec2  uParallaxB;

uniform float uMix;        // A->B blend (0..1)
uniform float uProgress;   // displacement progress (0..1)
uniform float uDir;        // transition direction (+1 / -1)
uniform float uHasB;       // 1 when B textures are bound

const float DISP_STRENGTH = 0.16;

vec2 sceneUv(vec2 uv, vec2 cover, vec2 pan, float zoom, float rot) {
  vec2 c = uv - 0.5;
  // subtle fake rotateY: vertical shear + horizontal squeeze by pan position
  c.y *= 1.0 + c.x * rot;
  c.x *= 1.0 - abs(rot) * 0.5;
  c *= cover / zoom;
  return vec2(0.5) + pan + c;
}

// Two-tap parallax: re-sample depth at the displaced position to reduce edge smear.
vec4 sampleScene(sampler2D tex, sampler2D dep, vec2 uv, vec2 parallax, float disp) {
  float d = texture2D(dep, clamp(uv, 0.0, 1.0)).r;
  vec2 off = parallax * (d - 0.5) + vec2(disp * d, 0.0);
  float d2 = texture2D(dep, clamp(uv + off, 0.0, 1.0)).r;
  off = parallax * (d2 - 0.5) + vec2(disp * d2, 0.0);
  return texture2D(tex, clamp(uv + off, vec2(0.001), vec2(0.999)));
}

void main() {
  vec2 uvA = sceneUv(vUv, uCoverA, uPanA, uZoomA, uRotA);
  float dispA = uDir * uProgress * DISP_STRENGTH;
  vec4 col = sampleScene(uTexA, uDepthA, uvA, uParallaxA, dispA);

  if (uHasB > 0.5 && uMix > 0.001) {
    vec2 uvB = sceneUv(vUv, uCoverB, uPanB, uZoomB, uRotB);
    float dispB = -uDir * (1.0 - uProgress) * DISP_STRENGTH * 0.6;
    vec4 colB = sampleScene(uTexB, uDepthB, uvB, uParallaxB, dispB);
    // depth-aware blend: nearer incoming pixels arrive a touch earlier
    float dB = texture2D(uDepthB, clamp(uvB, 0.0, 1.0)).r;
    float w = clamp(uMix + (dB - 0.5) * 0.18 * uMix * (1.0 - uMix) * 4.0, 0.0, 1.0);
    col = mix(col, colB, w);
  }

  gl_FragColor = vec4(col.rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
