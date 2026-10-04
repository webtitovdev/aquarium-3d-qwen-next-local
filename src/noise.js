/* ============================================================
   noise.js — value noise + fbm на JS, и те же шумы на GLSL.
   ============================================================ */

const HASH_SEED = 0x9e3779b9;

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * HASH_SEED) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function valueNoise2(x, y, seed = 7) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm2(x, y, octaves = 4, seed = 7) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x, y, seed + i * 131);
    norm += amp;
    x *= 2.03; y *= 1.97; amp *= 0.5;
  }
  return sum / norm;
}

export function fbm3(x, y, z, octaves = 3) {
  // дешёвый 3D-шум через два наложенных 2D
  const a = fbm2(x + z * 0.37, y - z * 0.61, octaves, 11);
  const b = fbm2(x - z * 0.83, y + z * 0.29, octaves, 71);
  return (a + b) * 0.5;
}

/* ---------- GLSL ---------- */
export const GLSL_NOISE = /* glsl */ `
float hash21(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.07 + 11.3; a *= 0.5; }
  return s;
}
`;
