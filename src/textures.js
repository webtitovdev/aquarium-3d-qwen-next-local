/* ============================================================
   textures.js — всё нарисовано кодом, ни одной внешней картинки.
   ============================================================ */
import * as THREE from 'three';
import { fbm2, valueNoise2 } from './noise.js';
import { TAU, clamp, makeRng } from './config.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}
function toTexture(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true;
  return t;
}

/* ---------- окружение (для PMREM): тёмно-синий градиент + лампа сверху ---------- */
export function makeEnvTexture() {
  const { c, x } = canvas(512, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, '#1b3a52');
  g.addColorStop(0.32, '#12303f');
  g.addColorStop(0.55, '#0b1e2a');
  g.addColorStop(1.00, '#050d14');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  // полоса лампы
  const lamp = x.createRadialGradient(256, 22, 4, 256, 22, 150);
  lamp.addColorStop(0, 'rgba(255,248,226,0.95)');
  lamp.addColorStop(0.45, 'rgba(190,220,255,0.20)');
  lamp.addColorStop(1, 'rgba(190,220,255,0)');
  x.fillStyle = lamp; x.fillRect(0, 0, 512, 160);
  // холодный блик сбоку
  const side = x.createRadialGradient(430, 120, 4, 430, 120, 130);
  side.addColorStop(0, 'rgba(120,190,255,0.35)'); side.addColorStop(1, 'rgba(120,190,255,0)');
  x.fillStyle = side; x.fillRect(280, 20, 232, 220);
  return toTexture(c);
}

/* ---------- песок ---------- */
export function makeSandTextures() {
  const S = 512;
  const col = canvas(S, S), bmp = canvas(S, S);
  const rng = makeRng(4242);
  const img = col.x.createImageData(S, S);
  const bimg = bmp.x.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const u = i / S, v = j / S;
      let n = fbm2(u * 9, v * 9, 4, 3) * 0.6 + fbm2(u * 46, v * 46, 3, 17) * 0.4;
      // песчинки
      const grain = valueNoise2(u * 260, v * 260, 5);
      const wave = 0.5 + 0.5 * Math.sin((u * 12 + fbm2(u * 4, v * 4, 2, 9) * 3.0) * Math.PI);
      const lum = clamp(n * 0.55 + grain * 0.35 + wave * 0.10, 0, 1);
      const r = 96 + lum * 122, g2 = 84 + lum * 108, b = 62 + lum * 82;
      const k = (j * S + i) * 4;
      img.data[k] = r; img.data[k + 1] = g2; img.data[k + 2] = b; img.data[k + 3] = 255;
      const hv = Math.round(clamp(n * 0.5 + grain * 0.5, 0, 1) * 255);
      bimg.data[k] = hv; bimg.data[k + 1] = hv; bimg.data[k + 2] = hv; bimg.data[k + 3] = 255;
    }
  }
  col.x.putImageData(img, 0, 0);
  bmp.x.putImageData(bimg, 0, 0);
  return {
    map: toTexture(col.c, { repeat: [4, 3] }),
    bump: toTexture(bmp.c, { srgb: false, repeat: [4, 3] })
  };
}

/* ---------- камень ---------- */
export function makeRockTextures() {
  const S = 256;
  const col = canvas(S, S), bmp = canvas(S, S);
  const img = col.x.createImageData(S, S), bimg = bmp.x.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const u = i / S, v = j / S;
      const n = fbm2(u * 6, v * 6, 5, 23);
      const mottle = fbm2(u * 22 + 5, v * 22, 3, 91);
      const l = clamp(n * 0.75 + mottle * 0.25, 0, 1);
      const k = (j * S + i) * 4;
      img.data[k] = 52 + l * 96; img.data[k + 1] = 56 + l * 92; img.data[k + 2] = 58 + l * 88; img.data[k + 3] = 255;
      const hv = Math.round(l * 255);
      bimg.data[k] = hv; bimg.data[k + 1] = hv; bimg.data[k + 2] = hv; bimg.data[k + 3] = 255;
    }
  }
  col.x.putImageData(img, 0, 0); bmp.x.putImageData(bimg, 0, 0);
  return { map: toTexture(col.c, { repeat: [1, 1] }), bump: toTexture(bmp.c, { srgb: false, repeat: [1, 1] }) };
}

/* ---------- дерево (коряга) ---------- */
export function makeWoodTexture() {
  const S = 256;
  const { c, x } = canvas(S, S);
  const bmp = canvas(S, S);
  for (let j = 0; j < S; j++) {
    const v = j / S;
    for (let i = 0; i < S; i++) {
      const u = i / S;
      const rings = 0.5 + 0.5 * Math.sin((u * 18 + fbm2(u * 3, v * 8, 4, 5) * 5.5) * Math.PI * 2);
      const n = fbm2(u * 40, v * 5, 4, 13);
      const l = clamp(rings * 0.55 + n * 0.45, 0, 1);
      const k = (j * S + i) * 4;
      const d = 40 + l * 90;
      x.fillStyle = `rgb(${d | 0},${(d * 0.72) | 0},${(d * 0.5) | 0})`;
      x.fillRect(i, j, 1, 1);
      const hv = Math.round(l * 255);
      bmp.x.fillStyle = `rgb(${hv},${hv},${hv})`;
      bmp.x.fillRect(i, j, 1, 1);
    }
  }
  return { map: toTexture(c, { repeat: [3, 1] }), bump: toTexture(bmp.c, { srgb: false, repeat: [3, 1] }) };
}

/* ---------- точки: пузырьки, планктон, кал ---------- */
export function makeDotSprite(kind = 'bubble') {
  const S = 128;
  const { c, x } = canvas(S, S);
  const cx = S / 2;
  if (kind === 'bubble') {
    const g = x.createRadialGradient(cx, cx, S * 0.10, cx, cx, S * 0.5);
    g.addColorStop(0.0, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.72, 'rgba(220,245,255,0.10)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.75)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = 'lighter';
    const h = x.createRadialGradient(cx * 0.68, cx * 0.62, 1, cx * 0.68, cx * 0.62, S * 0.14);
    h.addColorStop(0, 'rgba(255,255,255,0.9)'); h.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = h; x.fillRect(0, 0, S, S);
  } else {
    const g = x.createRadialGradient(cx, cx, 0, cx, cx, S * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(210,235,255,0.55)');
    g.addColorStop(1, 'rgba(180,220,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  return toTexture(c);
}

/* ============================================================
   Рыбьи текстуры. UV туловища: u = 0 (нос) -> 1 (хвостовой плавник),
   v = угол вокруг тела (0 = бок, 0.25 = спина, 0.5 = другой бок,
   0.75 = брюхо).
   ============================================================ */
function hband(x, W, H, v0, v1, css) {
  // горизонтальная полоса с.wrap-ом по v
  x.fillStyle = css;
  for (const off of [-1, 0, 1]) {
    const a = (v0 + off) * H, b = (v1 + off) * H;
    if (b < 0 || a > H) continue;
    x.fillRect(0, Math.max(0, a), W, Math.min(H, b) - Math.max(0, a));
  }
}
function vband(x, W, H, u0, u1, css) {
  x.fillStyle = css;
  x.fillRect(u0 * W, 0, (u1 - u0) * W, H);
}
function softVBand(x, W, H, u0, u1, css, feather = 0.02) {
  const g = x.createLinearGradient(u0 * W, 0, u1 * W, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(feather / (u1 - u0 || 1), css);
  g.addColorStop(1 - feather / (u1 - u0 || 1), css);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(u0 * W, 0, (u1 - u0) * W, H);
}

function drawScales(x, W, H, alpha) {
  x.save();
  x.globalAlpha = alpha;
  x.strokeStyle = 'rgba(255,255,255,0.35)';
  x.lineWidth = 1.2;
  const r = H / 13;
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 44; col++) {
      const px = (col + (row % 2 ? 0.5 : 0)) * (W / 44);
      const py = row * r * 0.82;
      x.beginPath();
      x.arc(px, py, r, Math.PI * 0.15, Math.PI * 0.85);
      x.stroke();
    }
  }
  x.restore();
}

function drawPaintedEyes(x, W, H, spec) {
  const eyeU = 0.10, r = H * 0.055;
  for (const v of [0.0, 0.5]) {
    for (const off of [-1, 0, 1]) {
      const cy = (v + off) * H;
      if (cy < -r || cy > H + r) continue;
      x.beginPath(); x.fillStyle = '#f6f2ea';
      x.arc(eyeU * W, cy, r * 1.55, 0, TAU); x.fill();
      x.beginPath(); x.fillStyle = '#120e0c';
      x.arc(eyeU * W, cy, r * 0.85, 0, TAU); x.fill();
      x.beginPath(); x.fillStyle = 'rgba(255,255,255,0.85)';
      x.arc(eyeU * W - r * 0.35, cy - r * 0.4, r * 0.3, 0, TAU); x.fill();
    }
  }
}

export function makeFishMap(spec) {
  const W = 512, H = 256;
  const { c, x } = canvas(W, H);
  const rng = makeRng(spec.seed || 11);
  const base = spec.colors;

  // базовый градиент по окружности тела: бок -> спина -> бок -> брюхо -> бок
  // (v = 0 и v = 1 — один и тот же бок, поэтому градиент «циклический»)
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, base.mid);
  g.addColorStop(0.22, base.back);
  g.addColorStop(0.42, base.mid);
  g.addColorStop(0.50, base.mid);
  g.addColorStop(0.74, base.belly);
  g.addColorStop(1.00, base.mid);
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  const p = spec.pattern;
  if (p.type === 'bands') {
    for (const b of p.bands) {
      const a = b.u - b.w / 2, z = b.u + b.w / 2;
      if (b.soft) softVBand(x, W, H, a - 0.02, z + 0.02, b.color, 0.02);
      else {
        vband(x, W, H, a, z, b.color);
        if (b.edge) { vband(x, W, H, a - 0.012, a, b.edge); vband(x, W, H, z, z + 0.012, b.edge); }
      }
    }
  } else if (p.type === 'sideStripes') {
    for (const s of p.stripes) hband(x, W, H, s.v - s.w / 2, s.v + s.w / 2, s.color);
  } else if (p.type === 'neon') {
    const [b0, b1] = p.band;
    hband(x, W, H, b0, b1, p.bandColor);
    hband(x, W, H, b0 - 0.5, b1 - 0.5, p.bandColor);
    hband(x, W, H, b1, b1 + 0.018, 'rgba(18,24,38,0.9)');
    hband(x, W, H, b1 - 0.5, b1 - 0.482, 'rgba(18,24,38,0.9)');
    // красная задняя часть снизу
    x.save();
    x.globalAlpha = 0.92;
    const rg = x.createLinearGradient(p.rear[0] * W, 0, W, 0);
    rg.addColorStop(0, 'rgba(200,40,40,0)'); rg.addColorStop(0.5, p.rearColor); rg.addColorStop(1, p.rearColor);
    x.fillStyle = rg;
    x.fillRect(p.rear[0] * W, H * 0.52, W - p.rear[0] * W, H * 0.34);
    x.restore();
  } else if (p.type === 'spots') {
    x.save();
    for (let i = 0; i < p.count; i++) {
      const u = 0.12 + rng() * 0.72, v = 0.06 + rng() * 0.66;
      const r = (0.008 + rng() * 0.02) * W;
      x.fillStyle = p.color;
      x.globalAlpha = 0.5 + rng() * 0.5;
      x.beginPath(); x.ellipse(u * W, v * H, r * 1.4, r, 0, 0, TAU); x.fill();
    }
    x.restore();
  } else if (p.type === 'mottle') {
    x.save();
    for (let i = 0; i < p.count; i++) {
      const u = rng(), v = rng() * 0.8 + 0.05;
      const r = (0.03 + rng() * 0.09) * W;
      const rg = x.createRadialGradient(u * W, v * H, 0, u * W, v * H, r);
      rg.addColorStop(0, p.color); rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg;
      x.beginPath(); x.ellipse(u * W, v * H, r * 1.6, r, 0, 0, TAU); x.fill();
    }
    x.restore();
  } else if (p.type === 'gradientU') {
    const lg = x.createLinearGradient(p.at[0] * W, 0, p.at[1] * W, 0);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.55, p.color); lg.addColorStop(1, p.color);
    x.fillStyle = lg; x.fillRect(p.at[0] * W, 0, W - p.at[0] * W, H);
  }

  if (spec.scales) drawScales(x, W, H, spec.scales);
  if (spec.paintEyes) drawPaintedEyes(x, W, H, spec);

  // мягкая шумовая «пыль» для натуральности
  x.save();
  x.globalAlpha = 0.10;
  for (let i = 0; i < 900; i++) {
    x.fillStyle = rng() > 0.5 ? '#ffffff' : '#000000';
    x.fillRect(rng() * W, rng() * H, 2, 2);
  }
  x.restore();

  return toTexture(c);
}

export function makeFishEmissiveMap(spec) {
  const W = 512, H = 256;
  const { c, x } = canvas(W, H);
  x.fillStyle = '#000000'; x.fillRect(0, 0, W, H);
  const p = spec.pattern;
  if (p.type === 'neon') {
    const [b0, b1] = p.band;
    hband(x, W, H, b0, b1, p.glow);
    hband(x, W, H, b0 - 0.5, b1 - 0.5, p.glow);
  } else if (p.glow) {
    x.fillStyle = p.glow;
    x.fillRect(0, 0, W, H);
  }
  const t = toTexture(c);
  return t;
}

export function makeFinTexture(fin, seed = 3) {
  const W = 256, H = 128;
  const { c, x } = canvas(W, H);
  const rng = makeRng(seed * 977 + 17);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, fin.root); g.addColorStop(1, fin.edge);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // лучи плавника
  x.save();
  x.globalAlpha = 0.5;
  x.strokeStyle = fin.rays || 'rgba(255,255,255,0.35)';
  x.lineWidth = 1.6;
  const n = fin.rayCount || 12;
  for (let i = 0; i <= n; i++) {
    const px = (i / n) * W;
    x.beginPath(); x.moveTo(px, 0);
    x.quadraticCurveTo(px + (i - n / 2) * 1.2, H * 0.55, px + (i - n / 2) * 3.0, H);
    x.stroke();
  }
  x.restore();
  if (fin.spots) {
    x.save();
    for (let i = 0; i < fin.spots.count; i++) {
      const r = 3 + rng() * 9;
      x.globalAlpha = 0.55 + rng() * 0.45;
      x.fillStyle = fin.spots.color;
      x.beginPath(); x.arc(rng() * W, rng() * H * 0.85 + 6, r, 0, TAU); x.fill();
    }
    x.restore();
  }
  // прозрачность к кромке
  const a = x.createLinearGradient(0, 0, 0, H);
  a.addColorStop(0, 'rgba(0,0,0,1)');
  a.addColorStop(0.6, 'rgba(0,0,0,0.85)');
  a.addColorStop(1, 'rgba(0,0,0,0.45)');
  x.globalCompositeOperation = 'destination-in';
  x.fillStyle = a; x.fillRect(0, 0, W, H);
  return toTexture(c);
}

/* ---------- мягкий круг для «пятна света» под аквариумом ---------- */
export function makeGlowTexture(inner = 'rgba(255,255,255,0.9)') {
  const S = 256;
  const { c, x } = canvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return toTexture(c);
}
