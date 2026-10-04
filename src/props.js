/* ============================================================
   props.js — подводный декор: камни, растения, коряга, сундук,
   актиния, улитка, трубки, пузырьки, планктон, круги по воде.
   ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TANK, TAU, clamp, randRange, randInt, makeRng } from './config.js';
import { fbm2 } from './noise.js';
import { makeRockTextures, makeWoodTexture, makeDotSprite, makeGlowTexture } from './textures.js';

/* ---------- покачивающийся материал (растения, актиния) ---------- */
function swayMaterial(opts, rng) {
  const uni = { uTime: { value: 0 }, uSway: { value: opts.sway === undefined ? 1 : opts.sway } };
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color, roughness: opts.roughness === undefined ? 0.7 : opts.roughness,
    metalness: opts.metalness || 0, side: THREE.DoubleSide,
    transparent: !!opts.transparent, opacity: opts.opacity === undefined ? 1 : opts.opacity,
    emissive: opts.emissive || 0x000000, emissiveIntensity: opts.emissiveIntensity || 0,
    vertexColors: !!opts.vertexColors
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = `uniform float uTime; uniform float uSway;\nattribute float aFlex;\n` + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      vec3 transformed = vec3(position);
      float s1 = sin(uTime * 1.15 + aFlex * 4.0 + position.y * 0.7) * 0.16
               + sin(uTime * 2.6 + position.y * 1.9) * 0.045;
      transformed.x += s1 * aFlex * uSway;
      transformed.z += s1 * 0.6 * aFlex * uSway;
    `);
  };
  mat.customProgramCacheKey = () => 'sway';
  return { mat, uni };
}

function setFlex(geo, fn) {
  const p = geo.attributes.position, a = new Float32Array(p.count);
  const bb = geo.boundingBox || (geo.computeBoundingBox(), geo.boundingBox);
  const h = Math.max(1e-4, bb.max.y - bb.min.y);
  for (let i = 0; i < p.count; i++) a[i] = fn((p.getY(i) - bb.min.y) / h, p.getX(i), p.getZ(i));
  geo.setAttribute('aFlex', new THREE.BufferAttribute(a, 1));
}

/* ---------- лист / лента растения ---------- */
function bladeGeometry(h, w, seg = 7, twist = 0.4) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const y = h * t;
    const width = w * Math.sin(Math.PI * Math.pow(t, 0.42) * 0.92 + 0.08) * (1 - 0.15 * t);
    const off = Math.sin(t * 2.4) * twist * h * 0.12;
    const bend = Math.sin(t * 1.6) * h * 0.10;
    pos.push(-width * 0.5 + off, y, bend, width * 0.5 + off, y, bend);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function leafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 22; i++) {
    x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
    x.fillRect(Math.random() * 128, 0, 1 + Math.random() * 2, 128);
  }
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0.35)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
  return t;
}

let _leafTex = null;
function makePlant(rng, pos, opts = {}) {
  const g = new THREE.Group();
  g.position.copy(pos);
  if (!_leafTex) _leafTex = leafTexture();
  const blades = opts.blades || randInt(rng, 7, 13);
  const H = opts.height || 2.0;
  const col = new THREE.Color(opts.color || 0x2f7a3a);
  const colTip = new THREE.Color(opts.tip || 0x7fc45a);

  const geos = [], colors = [];
  for (let i = 0; i < blades; i++) {
    const h = H * randRange(rng, 0.6, 1.25);
    const w = randRange(rng, 0.14, 0.3) * (opts.wide ? 2.2 : 1);
    const geo = bladeGeometry(h, w, 8, randRange(rng, -0.5, 0.5));
    geo.rotateY(rng() * TAU);
    geo.translate(randRange(rng, -0.18, 0.18), 0, randRange(rng, -0.18, 0.18));
    setFlex(geo, (t) => Math.pow(t, 1.5));
    const cc = new Float32Array(geo.attributes.position.count * 3);
    const p = geo.attributes.position;
    const tmp = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      const t = clamp(p.getY(k) / h, 0, 1);
      tmp.copy(col).lerp(colTip, t * 0.9);
      cc[k * 3] = tmp.r; cc[k * 3 + 1] = tmp.g; cc[k * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    geos.push(geo);
  }
  const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
  const { mat, uni } = swayMaterial({ color: 0xffffff, vertexColors: true, sway: opts.sway || 1, roughness: 0.66 });
  mat.map = _leafTex;
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  g.add(mesh);
  g.userData.uni = uni;
  return g;
}

/* ---------- камень ---------- */
function makeRock(rng, r, pos, detail = 2) {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    const n = fbm2(v.x * 1.6 + v.y, v.z * 1.6 - v.y, 4, 7 + Math.floor(v.x * 10));
    const k = 1 + (n - 0.5) * 0.55;
    v.multiplyScalar(k);
    v.y *= 0.78;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const { map, bump } = makeRockTextures();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map, bumpMap: bump, bumpScale: 0.35, roughness: 0.95, metalness: 0.03,
    color: new THREE.Color().setHSL(0.08 + rng() * 0.06, 0.12, 0.42 + rng() * 0.1)
  }));
  m.position.copy(pos);
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ---------- коряга ---------- */
function makeDriftwood(rng) {
  const g = new THREE.Group();
  const { map, bump } = makeWoodTexture();
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.2, roughness: 0.88, metalness: 0.02, color: 0xa08464 });

  const limb = (len, r0, r1, from, to, segs = 10) => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len2 = dir.length();
    const geo = new THREE.CylinderGeometry(r1, r0, len2, 9, segs, false);
    geo.translate(0, len2 / 2, 0);
    // лёгкий изгиб
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / len2;
      p.setX(i, p.getX(i) + Math.sin(y * 3.1) * 0.12 * r0);
      p.setZ(i, p.getZ(i) + Math.cos(y * 2.3) * 0.10 * r0);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.rotation.y += rng() * 0.4;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  const a = new THREE.Vector3(0, 0.1, 0);
  const b = new THREE.Vector3(2.4, 0.5, -0.5);
  const c = new THREE.Vector3(4.1, 0.15, 0.5);
  g.add(limb(2.5, 0.30, 0.22, a, b), limb(2.0, 0.22, 0.13, b, c));
  g.add(limb(1.5, 0.16, 0.05, b, new THREE.Vector3(2.0, 1.5, 0.6)));
  g.add(limb(1.2, 0.13, 0.04, new THREE.Vector3(1.2, 0.35, -0.2), new THREE.Vector3(0.6, 1.2, -1.0)));
  g.add(limb(1.1, 0.11, 0.03, new THREE.Vector3(3.1, 0.35, 0.1), new THREE.Vector3(3.7, 1.1, -0.6)));
  return g;
}

/* ---------- сундук с сокровищами ---------- */
function makeChest(rng) {
  const g = new THREE.Group();
  const { map, bump } = makeWoodTexture();
  const wood = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.15, roughness: 0.8, color: 0x8a5a34 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb08d3f, roughness: 0.35, metalness: 0.85 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 1.0), wood);
  body.position.y = 0.42; body.castShadow = true; body.receiveShadow = true;
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.85, -0.5);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.22, 1.05), wood);
  lid.position.set(0, 0.11, 0.5); lid.castShadow = true;
  lidPivot.add(lid);
  const bandGeo = new THREE.BoxGeometry(1.6, 0.1, 0.14);
  for (const bx of [-0.45, 0.45]) {
    const band = new THREE.Mesh(bandGeo, metal);
    band.position.set(0, 0.42, 0);
    band.position.x = bx;
    const band2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 1.06), metal);
    band2.position.set(bx, 0.42, 0);
    band2.scale.set(1, 1, 1);
    g.add(band, band2);
  }
  const gold = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x6a4a10, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.6 })
  );
  gold.scale.set(1.3, 0.45, 0.85);
  gold.position.y = 0.72;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2),
    new THREE.MeshBasicMaterial({ map: makeGlowTexture('rgba(255,215,120,0.85)'), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35, side: THREE.DoubleSide }));
  glow.position.y = 1.0;
  g.add(body, lidPivot, gold, glow);
  g.userData.lidPivot = lidPivot;
  g.userData.bubbleAt = new THREE.Vector3(0, 1.0, 0);
  return g;
}

/* ---------- актиния ---------- */
function makeAnemone(rng) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 10, 0, TAU, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0xb04a72, roughness: 0.8, side: THREE.DoubleSide })
  );
  base.scale.y = 0.6; base.castShadow = true;
  g.add(base);
  const geos = [];
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.3;
    const rad = 0.12 + rng() * 0.42;
    const h = 0.45 + rng() * 0.55;
    const geo = new THREE.CylinderGeometry(0.012, 0.05, h, 5, 4, true);
    geo.translate(0, h / 2, 0);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) / h;
      p.setY(k, p.getY(k) - t * t * 0.16);
    }
    geo.computeVertexNormals();
    geo.rotateZ(Math.cos(a) * (0.35 + rad));
    geo.rotateX(-Math.sin(a) * (0.35 + rad));
    geo.translate(Math.cos(a) * rad * 0.6, 0.18, Math.sin(a) * rad * 0.6);
    setFlex(geo, (t) => Math.pow(t, 1.2) * 1.4);
    geos.push(geo);
  }
  const merged = mergeGeometries(geos, false);
  const { mat, uni } = swayMaterial({ color: 0xd86a9a, roughness: 0.55, emissive: 0x4a1030, emissiveIntensity: 0.6, sway: 1.4 });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.renderOrder = 1;
  g.add(mesh);
  g.userData.uni = uni;
  return g;
}

/* ---------- керамическая трубка ---------- */
function makeTube(rng) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a5b3c, roughness: 0.85, side: THREE.DoubleSide });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.9, 20, 1, true), mat);
  tube.rotation.z = Math.PI / 2;
  tube.position.y = 0.42;
  tube.castShadow = true; tube.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 1.86, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x6a3c26, roughness: 0.95, side: THREE.BackSide }));
  inner.rotation.z = Math.PI / 2; inner.position.y = 0.42;
  g.add(tube, inner);
  return g;
}

/* ---------- улитка на стекле ---------- */
function makeSnail(rng) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.55, metalness: 0.1 })
  );
  shell.scale.set(1, 1, 0.62);
  const spiral = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x6a4c26, roughness: 0.6 }));
  spiral.position.z = 0.02;
  const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8c6a4, roughness: 0.7 }));
  foot.scale.set(1.5, 0.5, 0.7);
  foot.position.set(0.06, -0.02, 0.12);
  const eyeGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.3 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(0.22, 0.06 + s * 0.0, s * 0.06);
    g.add(e);
  }
  g.add(shell, spiral, foot);
  g.castShadow = true;
  return g;
}

/* ---------- струи пузырьков (GPU) ---------- */
function bubbleStreams(list) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uMap: { value: makeDotSprite('bubble') },
      uHeight: { value: TANK.waterTop }, uActive: { value: 1 }
    },
    vertexShader: /* glsl */`
      attribute float aPhase; attribute float aSpeed; attribute float aSize; attribute float aDrift;
      uniform float uTime, uHeight, uActive;
      varying float vA;
      void main(){
        float t = fract(aPhase + uTime * aSpeed);
        vec3 p = position;
        p.y += t * uHeight;
        float wob = 0.05 + 0.05 * t;
        p.x += sin(uTime * 2.1 + aPhase * 24.0) * wob * (0.4 + aDrift);
        p.z += cos(uTime * 1.7 + aPhase * 18.0) * wob * (0.4 + aDrift);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(aSize * (1.0 + t * 0.8) * (620.0 / max(0.6, -mv.z)), 1.0, 7.0);
        gl_Position = projectionMatrix * mv;
        vA = uActive * smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.86, 1.0, t));
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying float vA;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * t.r * 1.15, t.r * vA);
      }`
  });
  const N = 120;
  const pos = new Float32Array(N * 3), ph = new Float32Array(N), sp = new Float32Array(N),
    sz = new Float32Array(N), dr = new Float32Array(N);
  const rng = makeRng(909);
  for (let i = 0; i < N; i++) {
    const s = list[i % list.length];
    pos[i * 3] = s.x + randRange(rng, -0.06, 0.06);
    pos[i * 3 + 1] = s.y;
    pos[i * 3 + 2] = s.z + randRange(rng, -0.06, 0.06);
    ph[i] = rng(); sp[i] = randRange(rng, 0.16, 0.34); sz[i] = randRange(rng, 0.035, 0.075); dr[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(sp, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  geo.setAttribute('aDrift', new THREE.BufferAttribute(dr, 1));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  group.add(pts);
  group.userData.uni = mat.uniforms;
  return group;
}

/* ---------- планктон (ночью) ---------- */
function plankton() {
  const N = 320;
  const pos = new Float32Array(N * 3), ph = new Float32Array(N), sz = new Float32Array(N);
  const rng = makeRng(1234);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = randRange(rng, -TANK.hx + 0.3, TANK.hx - 0.3);
    pos[i * 3 + 1] = randRange(rng, TANK.sand + 0.2, TANK.waterTop - 0.3);
    pos[i * 3 + 2] = randRange(rng, -TANK.hz + 0.3, TANK.hz - 0.3);
    ph[i] = rng() * 10; sz[i] = randRange(rng, 0.022, 0.05);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uMap: { value: makeDotSprite('dot') } },
    vertexShader: /* glsl */`
      attribute float aPhase; attribute float aSize;
      uniform float uTime, uNight;
      varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.35 + aPhase * 6.0) * 0.22;
        p.y += sin(uTime * 0.22 + aPhase * 3.0) * 0.16;
        p.z += cos(uTime * 0.3 + aPhase * 5.0) * 0.22;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(aSize * (620.0 / max(0.6, -mv.z)), 1.0, 5.0);
        gl_Position = projectionMatrix * mv;
        vA = uNight * (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.7 + aPhase * 9.0)));
      }`,
    fragmentShader: `uniform sampler2D uMap; varying float vA;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(0.6,0.95,1.0)*t.r, t.r*vA*0.85); }`
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  pts.name = 'plankton';
  pts.userData.uni = mat.uniforms;
  return pts;
}

/* ---------- круги (по воде и по стеклу) ---------- */
class Ripples {
  constructor(scene) {
    this.pool = [];
    const geo = new THREE.RingGeometry(0.5, 0.62, 40);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0xcfeeff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide
      }));
      m.visible = false; m.renderOrder = 3;
      scene.add(m);
      this.pool.push({ mesh: m, t: 0, dur: 1, r0: 0.3, r1: 2, active: false, kind: 'water' });
    }
    this.i = 0;
  }
  spawn(pos, kind, strength = 1, dur = 1.2, r1 = 2.2) {
    const e = this.pool[this.i = (this.i + 1) % this.pool.length];
    e.t = 0; e.dur = dur; e.r0 = 0.25; e.r1 = r1; e.active = true; e.kind = kind; e.strength = strength;
    e.mesh.visible = true;
    e.mesh.position.copy(pos);
    if (kind === 'water') { e.mesh.rotation.set(-Math.PI / 2, 0, 0); e.mesh.position.y = TANK.waterTop - 0.02; }
    else { e.mesh.rotation.set(0, kind === 'y' ? Math.PI / 2 : 0, 0); }
    e.mesh.scale.setScalar(e.r0);
    return e;
  }
  update(dt) {
    for (const e of this.pool) {
      if (!e.active) continue;
      e.t += dt;
      const t = e.t / e.dur;
      if (t >= 1) { e.active = false; e.mesh.visible = false; continue; }
      const r = e.r0 + (e.r1 - e.r0) * (1 - Math.pow(1 - t, 2.2));
      e.mesh.scale.setScalar(r);
      e.mesh.material.opacity = (1 - t) * 0.55 * e.strength;
    }
  }
}

/* ---------- всплеск пузырьков от испуга (CPU) ---------- */
class BubbleBurst {
  constructor(max = 160) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.size = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(max), 1));
    this.alpha = geo.attributes.aAlpha.array;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: makeDotSprite('bubble') } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = clamp(aSize * (620.0 / max(0.6, -mv.z)), 1.0, 8.0); gl_Position = projectionMatrix*mv; vA = aAlpha; }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(0.8,0.95,1.0)*t.r*1.1, t.r*vA); }`
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.geo = geo;
  }
  spawn(center, n = 14, spread = 0.6, up = 0.9) {
    for (let k = 0; k < n; k++) {
      const i = this.i = (this.i + 1) % this.max;
      const a = Math.random() * TAU, r = Math.random() * spread;
      this.pos[i * 3] = center.x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = center.y + (Math.random() - 0.3) * spread * 0.7;
      this.pos[i * 3 + 2] = center.z + Math.sin(a) * r;
      this.vel[i * 3] = Math.cos(a) * 0.5 * Math.random();
      this.vel[i * 3 + 1] = up * (0.4 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.sin(a) * 0.5 * Math.random();
      this.life[i] = 1.2 + Math.random() * 1.2;
      this.size[i] = 0.04 + Math.random() * 0.06;
      this.alpha[i] = 1;
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] += dt * 0.6;
      this.vel[i * 3] *= 0.97; this.vel[i * 3 + 2] *= 0.97;
      this.alpha[i] = Math.max(0, Math.min(1, this.life[i] * 0.9));
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

/* ============================================================ */
export function buildProps(scene) {
  const rng = makeRng(20240719);
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  const swayers = [];
  const sandTop = TANK.sand + 0.35;

  // камни
  const rocks = [];
  const rockSpots = [
    [-5.4, sandTop + 0.1, -2.6, 1.25], [-4.6, sandTop, -1.3, 0.75], [-5.9, sandTop, -0.2, 0.55],
    [4.9, sandTop + 0.05, 2.3, 1.05], [5.8, sandTop, 1.2, 0.62], [3.6, sandTop, -3.4, 0.8],
    [-1.2, sandTop, 3.7, 0.65], [2.2, sandTop, 3.5, 0.45]
  ];
  for (const [x, y, z, r] of rockSpots) {
    const m = makeRock(rng, r, new THREE.Vector3(x, y - r * 0.35, z), r > 0.9 ? 3 : 2);
    rocks.push(m); group.add(m);
  }

  // растения
  const plants = [];
  const plantSpots = [
    [-5.1, sandTop - 0.1, -1.9, { height: 2.9, color: 0x1f5f2e, tip: 0x74c055, blades: 12 }],
    [-4.2, sandTop - 0.05, 1.6, { height: 1.7, color: 0x2a6f38, tip: 0xa8d45e, blades: 9, wide: true }],
    [-6.1, sandTop - 0.1, 2.5, { height: 3.4, color: 0x174f2a, tip: 0x5fb44a, blades: 16 }],
    [5.4, sandTop - 0.1, -2.1, { height: 2.4, color: 0x256b34, tip: 0x8fce5c, blades: 11 }],
    [6.2, sandTop - 0.05, -0.4, { height: 1.4, color: 0x2f7a3a, tip: 0xc0dd6a, blades: 7, wide: true }],
    [1.4, sandTop - 0.1, -3.7, { height: 2.1, color: 0x1d5c2c, tip: 0x6fbb50, blades: 10 }],
    [-1.9, sandTop - 0.05, -3.4, { height: 1.2, color: 0x2b7038, tip: 0x9ed15c, blades: 6 }]
  ];
  for (const [x, y, z, o] of plantSpots) {
    const p = makePlant(rng, new THREE.Vector3(x, y, z), o);
    plants.push(p); group.add(p); swayers.push(p.userData.uni);
  }

  // коряга
  const wood = makeDriftwood(rng);
  wood.position.set(-1.0, sandTop - 0.12, 0.4);
  wood.rotation.y = 0.5;
  group.add(wood);

  // сундук
  const chest = makeChest(rng);
  chest.position.set(3.3, sandTop - 0.15, -1.6);
  chest.rotation.y = -0.7;
  group.add(chest);

  // актиния (домик для рыбок-клоунов)
  const anemone = makeAnemone(rng);
  anemone.position.set(-2.6, sandTop + 0.1, 2.4);
  group.add(anemone);
  swayers.push(anemone.userData.uni);

  // трубка
  const tube = makeTube(rng);
  tube.position.set(1.0, sandTop - 0.1, 2.2);
  tube.rotation.y = 0.9;
  group.add(tube);

  // улитка
  const snail = makeSnail(rng);
  group.add(snail);

  // пузырьки
  const streams = bubbleStreams([
    { x: -3.2, y: sandTop + 0.05, z: -0.6 },
    { x: 2.4, y: sandTop + 0.05, z: 1.5 },
    { x: 5.2, y: sandTop + 0.05, z: 2.6 }
  ]);
  group.add(streams);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9fb0b8, roughness: 0.95 });
  for (const p of [[-3.2, -0.6], [2.4, 1.5], [5.2, 2.6]]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 12), stoneMat);
    st.position.set(p[0], sandTop - 0.02, p[1]);
    group.add(st);
  }

  const plank = plankton();
  group.add(plank);

  const ripples = new Ripples(scene);
  const burst = new BubbleBurst(200);
  scene.add(burst.points);

  function update(dt, time, night) {
    for (const u of swayers) u.uTime.value = time;
    streams.userData.uni.uTime.value = time;
    plank.userData.uni.uTime.value = time;
    plank.userData.uni.uNight.value = night;
    ripples.update(dt);
    burst.update(dt);
    // улитка ползёт по переднему стеклу
    const t = time * 0.045;
    const x = -5.4 + ((t * 1.0) % 11.0);
    const y = sandTop + 0.5 + Math.sin(t * 2.2) * 0.6 + ((t * 0.35) % 1.2);
    snail.position.set(x, Math.min(y, TANK.waterTop - 1.2), TANK.hz - 0.22);
    snail.rotation.set(Math.PI / 2, 0, Math.sin(t * 2.2) * 0.25);
    // сундук слегка открывает крышку и пускает пузырьки
    const lidOpen = 0.25 + 0.22 * (0.5 + 0.5 * Math.sin(time * 0.33));
    chest.userData.lidPivot.rotation.x = -lidOpen;
    if (Math.random() < dt * 2.2) {
      const wp = chest.userData.bubbleAt.clone();
      chest.localToWorld(wp);
      burst.spawn(wp, 2, 0.25, 0.7);
    }
  }

  return {
    group, rocks, plants, chest, anemone, tube, snail, wood,
    streams, plankton: plank, ripples, burst,
    sandTop,
    update,
    homeOf(name) {
      if (name === 'anemone') return anemone.position.clone().add(new THREE.Vector3(0, 0.35, 0));
      if (name === 'tube') return tube.position.clone();
      return new THREE.Vector3(0, 2, 0);
    }
  };
}
