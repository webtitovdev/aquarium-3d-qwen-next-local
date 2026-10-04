/* ============================================================
   fishModel.js — генеративная модель рыбы: тело-«гофр», плавники,
   глаза, узор чешуи и шейдер плавания (изгиб тела волной).
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, clamp } from './config.js';
import { makeFishMap, makeFishEmissiveMap, makeFinTexture } from './textures.js';

const STATIONS = 28;
const RING = 16;

export const zNoseOf = (L) => 0.52 * L;
export const zTailOf = (L) => -0.44 * L;

/* ---------- сглаженная выборка профиля (Catmull-Rom) ---------- */
export function sampleProfile(arr, u) {
  const n = arr.length - 1;
  const t = clamp(u, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(t));
  const f = t - i;
  const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(n, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
    (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

function profileFn(spec) {
  const L = spec.len;
  const p = spec.profile;
  return {
    L,
    zNose: zNoseOf(L), zTail: zTailOf(L),
    uAt(z) { return clamp((this.zNose - z) / (this.zNose - this.zTail), 0, 1.15); },
    zAt(u) { return this.zNose + (this.zTail - this.zNose) * u; },
    top(u) { return sampleProfile(p.top, u) * L; },
    bot(u) { return sampleProfile(p.bottom, u) * L; },
    wid(u) { return sampleProfile(p.width, u) * L; },
    ctr(u) { return sampleProfile(p.center, u) * L; },
    backAt(z) { const u = this.uAt(z); return this.ctr(u) + this.top(u); },
    bellyAt(z) { const u = this.uAt(z); return this.ctr(u) - this.bot(u); }
  };
}

const waveWeight = (u) => Math.pow(clamp(u, 0, 1), 1.7);

/* ---------- тело ---------- */
function bodyGeometry(prof) {
  const verts = [], uvs = [], wave = [], flutter = [], idx = [];
  const stationRings = [];

  for (let i = 0; i <= STATIONS; i++) {
    const u = i / STATIONS;
    const z = prof.zAt(u);
    const w = prof.wid(u), tp = prof.top(u), bt = prof.bot(u), cy = prof.ctr(u);
    const ring = [];
    for (let j = 0; j < RING; j++) {
      const th = (j / RING) * TAU;
      const s = Math.sin(th), c = Math.cos(th);
      const r = s >= 0 ? tp : bt;
      const x = w * c;
      const y = cy + r * s;
      ring.push(verts.length / 3);
      verts.push(x, y, z);
      uvs.push(u, th / TAU);
      wave.push(waveWeight(u));
      flutter.push(0);
    }
    stationRings.push(ring);
  }

  for (let i = 0; i < STATIONS; i++) {
    const a = stationRings[i], b = stationRings[i + 1];
    for (let j = 0; j < RING; j++) {
      const j2 = (j + 1) % RING;
      idx.push(a[j], b[j], b[j2], a[j], b[j2], a[j2]);
    }
  }

  // нос (веер к точке)
  const uNose = -0.08;
  const noseZ = prof.zAt(uNose), noseY = prof.ctr(0) + prof.top(0) * 0.35;
  const noseIdx = verts.length / 3;
  verts.push(0, noseY, noseZ); uvs.push(0.0, 0.5); wave.push(0); flutter.push(0);
  const r0 = stationRings[0];
  for (let j = 0; j < RING; j++) idx.push(noseIdx, r0[j], r0[(j + 1) % RING]);

  // хвостовой срез
  const rL = stationRings[STATIONS];
  const uL = 1;
  const capIdx = verts.length / 3;
  verts.push(0, prof.ctr(uL), prof.zAt(uL)); uvs.push(1.0, 0.5); wave.push(waveWeight(uL)); flutter.push(0);
  for (let j = 0; j < RING; j++) idx.push(capIdx, rL[(j + 1) % RING], rL[j]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aWave', new THREE.Float32BufferAttribute(wave, 1));
  geo.setAttribute('aFlutter', new THREE.Float32BufferAttribute(flutter, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ---------- формы хвоста: t ∈ [-1,1] -> смещение назад (в долях len) ---------- */
const TAIL_SHAPES = {
  fork: (t) => -(0.42 + 0.58 * t * t),
  round: (t) => -Math.sqrt(Math.max(0.06, 1 - 0.92 * t * t)),
  fan: (t) => -Math.sqrt(Math.max(0.02, 1 - 0.62 * t * t)),
  spade: (t) => -(0.80 + 0.20 * t * t),
  double: (t) => -(0.45 + 0.55 * Math.pow(Math.abs(t), 0.65)),
  veil: (t) => -(1 - 0.40 * t * t) * (1 + 0.06 * Math.sin(t * 8.0)),
  lyre: (t) => -(0.30 + 0.70 * Math.pow(Math.abs(t), 1.7))
};

/* лента плавника: rootFn(t) -> [z,y], edgeFn(t) -> [z,y], t ∈ [0,1] */
function finStrip(rootFn, edgeFn, n, prof, opts = {}) {
  const verts = [], uvs = [], wave = [], flutter = [], idx = [];
  const flutterAmt = opts.flutter === undefined ? 1 : opts.flutter;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = rootFn(t), e = edgeFn(t);
    verts.push(0, r[1], r[0]); uvs.push(t, 0);
    verts.push(0, e[1], e[0]); uvs.push(t, 1);
    const u = prof.uAt(Math.min(r[0], e[0]));
    const wv = Math.min(1.35, waveWeight(u) + (u >= 1 ? 0.3 : 0));
    wave.push(wv * 0.55, wv);
    flutter.push(flutterAmt * 0.35, flutterAmt);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, d, a, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aWave', new THREE.Float32BufferAttribute(wave, 1));
  geo.setAttribute('aFlutter', new THREE.Float32BufferAttribute(flutter, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (opts.uvFlatten) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, opts.uvFlatten[0], opts.uvFlatten[1]);
  }
  return geo;
}

/* ---------- плавники рыбы ---------- */
function buildFins(spec, prof, simple) {
  const L = spec.len;
  const fins = [];
  const F = spec.fins;
  const finUV = simple ? [0.40, 0.34] : null;

  // хвостовой
  if (F.caudal) {
    const sh = TAIL_SHAPES[F.caudal.kind] || TAIL_SHAPES.round;
    const h = F.caudal.h * L, len = F.caudal.len * L;
    const zT = prof.zTail;
    const yTop = prof.backAt(zT - 0.01), yBot = prof.bellyAt(zT - 0.01);
    const geo = finStrip(
      (t) => [zT - 0.005, yBot + (yTop - yBot) * t],
      (t) => { const s = t * 2 - 1; return [zT + sh(s) * len, yBot + (yTop - yBot) * t + (t - 0.5) * h * 1.9]; },
      18, prof, { uvFlatten: finUV, flutter: 1 }
    );
    fins.push({ geo, kind: 'caudal', tex: F.caudal.tex, tint: F.caudal.tint });
  }

  // спинной
  if (F.dorsal) {
    const a0 = F.dorsal.a0 * L, a1 = F.dorsal.a1 * L, h = F.dorsal.h * L;
    const lean = (F.dorsal.lean || -0.06) * L;
    const geo = finStrip(
      (t) => [a0 + (a1 - a0) * t, prof.backAt(a0 + (a1 - a0) * t) - 0.012 * L],
      (t) => [a0 + (a1 - a0) * t + lean * Math.sin(Math.PI * t),
        prof.backAt(a0 + (a1 - a0) * t) + h * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.8)],
      16, prof, { uvFlatten: finUV, flutter: 0.85 }
    );
    fins.push({ geo, kind: 'dorsal', tex: F.dorsal.tex, tint: F.dorsal.tint });
  }

  // подхвостовой
  if (F.anal) {
    const a0 = F.anal.a0 * L, a1 = F.anal.a1 * L, h = F.anal.h * L;
    const geo = finStrip(
      (t) => [a0 + (a1 - a0) * t, prof.bellyAt(a0 + (a1 - a0) * t) + 0.012 * L],
      (t) => [a0 + (a1 - a0) * t,
        prof.bellyAt(a0 + (a1 - a0) * t) - h * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75)],
      14, prof, { uvFlatten: finUV, flutter: 0.9 }
    );
    fins.push({ geo, kind: 'anal', tex: F.anal.tex, tint: F.anal.tint });
  }

  // брюшные / нити
  if (F.ventral) {
    for (const side of [1, -1]) {
      const a0 = F.ventral.a0 * L, a1 = F.ventral.a1 * L, h = F.ventral.h * L;
      const x0 = side * prof.wid(prof.uAt(a0)) * 0.45;
      const geo = finStrip(
        (t) => [a0 + (a1 - a0) * t, prof.bellyAt(a0 + (a1 - a0) * t) - 0.01 * L],
        (t) => [a0 + (a1 - a0) * t - 0.10 * L * t,
          prof.bellyAt(a0 + (a1 - a0) * t) - h * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.55)],
        14, prof, { uvFlatten: finUV, flutter: 1.15 }
      );
      geo.translate(x0, 0, 0);
      fins.push({ geo, kind: 'ventral', side, tex: F.ventral.tex, tint: F.ventral.tint });
    }
  }

  // грудные
  if (F.pectoral) {
    const size = F.pectoral.size * L, chord = size * 0.85;
    const z0 = prof.zAt(0.52), y0 = prof.ctr(0.52) - prof.bot(0.52) * 0.25;
    const x0 = prof.wid(0.52) * 0.82;
    const sh = TAIL_SHAPES.fan;
    for (const side of [1, -1]) {
      const geo = finStrip(
        (t) => [z0 + 0.02 * L, (t - 0.5) * chord],
        (t) => [z0 + sh((t - 0.5) * 2) * size, (t - 0.5) * chord * 1.25],
        12, prof, { uvFlatten: finUV, flutter: 1.3 }
      );
      // лента лежит в плоскости YZ; наклоняем её вбок вокруг оси Z
      const ang = (side > 0 ? -1 : 1) * (F.pectoral.splay || 60) * Math.PI / 180;
      geo.rotateZ(ang);
      geo.translate(side * x0, y0, 0);
      fins.push({ geo, kind: 'pectoral', side, tex: F.pectoral.tex, tint: F.pectoral.tint,
        flapPhase: side > 0 ? 0 : Math.PI });
    }
  }

  return fins;
}

/* ---------- глаза (для «главных» рыб) ---------- */
function makeEye(r) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(
    new THREE.SphereGeometry(r, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xf7f2e6, roughness: 0.4, metalness: 0 })
  );
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(r * 0.66, 12, 9),
    new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.2, metalness: 0.1 })
  );
  g.add(white, pupil);
  white.castShadow = false;
  return { g, white, pupil, r };
}

/* ---------- шейдер плавания ---------- */
export function applySwim(mat, u) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = /* glsl */`
      uniform float uTime; uniform float uSwim; uniform float uAmp; uniform float uFreq;
      uniform float uPhase; uniform float uPuff;
      attribute float aWave; attribute float aFlutter;
    ` + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', /* glsl */`
      float _ph = position.z * uFreq - uTime * 8.0 + uPhase;
      float _bend = sin(_ph) * uAmp * uSwim * aWave
                  + sin(_ph * 1.6 + position.y * 4.0) * uAmp * uSwim * aFlutter * 0.5;
      float _d = uAmp * uSwim * (uFreq * cos(_ph) * aWave + uFreq * 1.6 * cos(_ph * 1.6 + position.y * 4.0) * aFlutter * 0.5);
      vec3 objectNormal = normalize(vec3(normal.x - _d * normal.z, normal.y, normal.z));
    `);
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      vec3 transformed = position;
      transformed.x += _bend;
      transformed.z *= mix(1.0, 0.86, uPuff - 1.0);
      transformed *= mix(1.0, uPuff, 0.75 + 0.25 * aWave);
    `);
  };
  mat.customProgramCacheKey = () => 'swim';
  return mat;
}

/* ---------- сборка рыбы ---------- */
const geoCache = new Map();

function buildGeometries(spec) {
  const prof = profileFn(spec);
  const body = bodyGeometry(prof);
  const fins = buildFins(spec, prof, !!spec.simple);
  if (spec.simple) {
    const list = [body, ...fins.map((f) => f.geo)];
    const colors = [];
    const push = (geo, tint) => {
      const c = new Float32Array(geo.attributes.position.count * 3);
      const col = new THREE.Color(tint);
      for (let i = 0; i < geo.attributes.position.count; i++) {
        c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    };
    push(body, 0xffffff);
    fins.forEach((f) => push(f.geo, f.tint === undefined ? 0xbfd6e6 : f.tint));
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g !== merged && g.dispose());
    return { merged, fins: [], prof };
  }
  return { body, fins, prof };
}

export function getFishGeometries(spec) {
  let g = geoCache.get(spec.id);
  if (!g) { g = buildGeometries(spec); geoCache.set(spec.id, g); }
  return g;
}

/* Строит Object3D рыбы; геометрии общие на вид, материалы свои. */
export function buildFishMesh(spec, rng) {
  const G = getFishGeometries(spec);
  const prof = G.prof;
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const map = makeFishMap(spec);
  const hasGlow = spec.pattern && spec.pattern.glow;
  const emis = hasGlow ? makeFishEmissiveMap(spec) : null;

  const u = {
    uTime: { value: 0 }, uSwim: { value: 1 }, uAmp: { value: 0.14 * spec.len },
    uFreq: { value: (10.5 / Math.max(0.25, spec.len)) * 0.55 },
    uPhase: { value: rng() * 6.283 }, uPuff: { value: 1 }
  };

  const bodyMat = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.42, metalness: 0.18,
    emissiveMap: emis || null,
    emissive: emis ? new THREE.Color(0x6fd8ff) : new THREE.Color(0x000000),
    emissiveIntensity: emis ? 0.0 : 0.0,
    vertexColors: !!spec.simple
  });
  applySwim(bodyMat, u);

  let bodyMesh;
  if (spec.simple) {
    bodyMesh = new THREE.Mesh(G.merged, bodyMat);
    bodyMesh.castShadow = true;
    bodyGroup.add(bodyMesh);
  } else {
    bodyMesh = new THREE.Mesh(G.body, bodyMat);
    bodyMesh.castShadow = true;
    bodyGroup.add(bodyMesh);

    const finMeshes = [];
    for (const f of G.fins) {
      const tex = makeFinTexture(f.tex || { root: '#cfe3ee', edge: 'rgba(200,225,240,0.35)', rays: 'rgba(255,255,255,0.25)', rayCount: 10 }, spec.seed + f.kind.length);
      const fm = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, opacity: 0.92,
        side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05,
        depthWrite: false
      });
      applySwim(fm, u);
      const mesh = new THREE.Mesh(f.geo, fm);
      mesh.renderOrder = 1;
      bodyGroup.add(mesh);
      finMeshes.push({ mesh, kind: f.kind, side: f.side, flapPhase: f.flapPhase });
    }
    group.userData.finMeshes = finMeshes;

    // глаза
    const uEye = 0.14;
    const zE = prof.zAt(uEye), yE = prof.ctr(uEye) + prof.top(uEye) * 0.28;
    const xE = prof.wid(uEye) * 0.86;
    const rE = Math.max(0.018, spec.len * 0.062);
    const eyes = [];
    for (const side of [1, -1]) {
      const e = makeEye(rE);
      e.g.position.set(side * xE, yE, zE);
      bodyGroup.add(e.g);
      eyes.push(e);
    }
    group.userData.eyes = eyes;
  }

  group.userData.prof = prof;
  group.userData.uniforms = u;
  group.userData.bodyMat = bodyMat;
  return group;
}
