/* ============================================================
   tank.js — стекло, вода, грунт, каустика, свет, «божьи лучи»,
   подставка и комната.
   ============================================================ */
import * as THREE from 'three';
import { TANK, TAU, clamp } from './config.js';
import { GLSL_NOISE } from './noise.js';
import { fbm2 } from './noise.js';
import { makeSandTextures, makeGlowTexture } from './textures.js';

/* ---------- стекло: френель + блик лампы + разводы ---------- */
function glassMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTint: { value: new THREE.Color(0x0d2b38) },
      uRim: { value: new THREE.Color(0x9fd8ff) },
      uLamp: { value: new THREE.Vector3(0, TANK.hy + 1.2, 0) },
      uTime: { value: 0 },
      uSmudge: { value: 1 },
      uAspect: { value: 1 },
      uRipple: { value: new THREE.Vector4(0, 0, 0, 0) } // x,y по стеклу, z=возраст, w=сила
    },
    vertexShader: /* glsl */`
      varying vec3 vWPos; varying vec3 vNrm; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vNrm = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      varying vec3 vWPos; varying vec3 vNrm; varying vec2 vUv;
      uniform vec3 uTint, uRim, uLamp;
      uniform float uTime, uSmudge, uAspect;
      uniform vec4 uRipple;
      void main(){
        vec3 N = normalize(vNrm);
        vec3 V = normalize(cameraPosition - vWPos);
        float ndv = abs(dot(N, V));
        float fres = pow(1.0 - ndv, 5.0);

        // разводы и микроцарапины
        float sm = fbm(vUv * vec2(9.0, 7.0)) * 0.6 + fbm(vUv * vec2(60.0, 40.0)) * 0.4;
        float streak = fbm(vec2(vUv.x * 90.0, vUv.y * 2.0));

        vec3 col = uTint * (0.55 + 0.45 * sm);
        col += uRim * fres * 0.30;

        vec3 L = normalize(uLamp - vWPos);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 110.0);
        col += vec3(1.0, 0.96, 0.86) * spec * 1.5;
        col += vec3(0.5, 0.8, 1.0) * pow(max(dot(N, H), 0.0), 9.0) * 0.05 * streak;

        // круг от удара по стеклу
        if (uRipple.w > 0.0) {
          vec2 p = (vUv - uRipple.xy) * vec2(uAspect, 1.0);
          float d = length(p);
          float age = uRipple.z;
          float ringR = age * 0.55;
          float ring = exp(-pow((d - ringR) * 16.0, 2.0));
          float ring2 = exp(-pow((d - ringR * 0.55) * 22.0, 2.0)) * 0.5;
          col += vec3(0.75, 0.92, 1.0) * (ring + ring2) * uRipple.w * 2.2;
        }

        float alpha = 0.055 + fres * 0.42 + spec * 0.85 + sm * 0.02 * uSmudge;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
      }`
  });
}

/* ---------- поверхность воды ---------- */
function waterSurfaceMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x123c4a) },
      uSky: { value: new THREE.Color(0x8fc7e8) },
      uNight: { value: 0 }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWPos; varying vec3 vNrm;
      uniform float uTime;
      void main(){
        vUv = uv;
        vec3 p = position;
        float w = sin(p.x * 1.7 + uTime * 1.6) * 0.035 + sin(p.y * 2.3 - uTime * 1.9) * 0.03
                + sin((p.x + p.y) * 3.7 + uTime * 2.7) * 0.014;
        p.z += w;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWPos = wp.xyz;
        vNrm = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      varying vec2 vUv; varying vec3 vWPos; varying vec3 vNrm;
      uniform float uTime, uNight;
      uniform vec3 uDeep, uSky;
      // высота ряби: функция должна быть на верхнем уровне — GLSL не разрешает
      // вложенные объявления функций внутри main()
      float rippleH(vec2 q){
        return fbm(q * 0.5 + vec2(uTime*0.25, -uTime*0.18)) * 1.4
             + 0.35 * sin(q.x*1.3 + uTime*2.2) * sin(q.y*1.1 - uTime*1.7);
      }
      void main(){
        bool below = !gl_FrontFacing;         // смотрим на плёнку воды изнутри банки
        vec3 N = normalize(below ? -vNrm : vNrm);
        vec3 V = normalize(cameraPosition - vWPos);

        // анимированная нормаль из двух слоёв ряби
        vec2 p = vUv * 34.0;
        float e = 0.35;
        float dx = rippleH(p + vec2(e,0.0)) - rippleH(p - vec2(e,0.0));
        float dy = rippleH(p + vec2(0.0,e)) - rippleH(p - vec2(0.0,e));
        vec3 Nw = normalize(N + vec3(dx, 0.0, dy) * 0.9);

        float ndv = abs(dot(Nw, V));
        float fres = pow(1.0 - ndv, 4.0);
        vec3 sky = mix(uSky, vec3(0.18,0.32,0.44), uNight);
        vec3 col;
        float alpha;
        if (below) {
          // из-под воды: тёмная толща и светлое «окно Снелла» строго над головой
          float up = clamp(dot(V, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
          float win = pow(up, 7.0);
          col = mix(uDeep * 0.55, sky * 0.85, win * 0.8 * (1.0 - uNight * 0.7));
          alpha = mix(0.16, 0.42, fres) + win * 0.25;
        } else {
          col = mix(uDeep * 0.7, sky, 0.18 + fres * 0.85);
          alpha = mix(0.62, 0.92, fres);
        }

        // солнечные зайчики
        vec3 L = normalize(vec3(0.15, 1.0, 0.1));
        vec3 H = normalize(L + V);
        col += vec3(1.0, 0.97, 0.88) * pow(max(dot(Nw, H), 0.0), 160.0) * 2.2 * (1.0 - uNight * 0.75);
        if (!below) col += vec3(0.55,0.85,1.0) * pow(max(dot(Nw,H),0.0), 12.0) * 0.10;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }`
  });
}

/* ---------- каустика на грунте ---------- */
function causticMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x8fd8ff) },
      uStrength: { value: 0.55 },
      uScale: { value: 0.52 }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWPos;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWPos;
      uniform float uTime, uStrength, uScale;
      uniform vec3 uColor;
      float caust(vec2 p, float t){
        vec2 i = p; float c = 1.0; const float inten = 0.0045;
        for (int n = 0; n < 4; n++){
          float tt = t * (1.0 - (3.4 / float(n + 1)));
          i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
        }
        c /= 4.0;
        c = 1.16 - pow(c, 1.45);
        return clamp(pow(abs(c), 9.0), 0.0, 0.85);
      }
      void main(){
        vec2 p = (vWPos.xz) * uScale;
        float c1 = caust(p, uTime * 0.55);
        float c2 = caust(p * 0.63 + 7.3, uTime * 0.42 + 12.0);
        float c = min(c1 * 0.6 + c2 * 0.4, 0.5);
        // затухание к стенкам
        float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x)
                   * smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.84, vUv.y);
        gl_FragColor = vec4(uColor * c * uStrength * edge, 1.0);
      }`
  });
}

/* ---------- божьи лучи ---------- */
function shaftMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x9ed4ff) }, uStrength: { value: 1 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWPos; varying vec3 vNrm;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz; vNrm = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      varying vec2 vUv; varying vec3 vWPos; varying vec3 vNrm;
      uniform float uTime, uStrength; uniform vec3 uColor;
      void main(){
        vec3 V = normalize(cameraPosition - vWPos);
        vec3 N = normalize(vNrm);
        float rim = pow(1.0 - abs(dot(N, V)), 1.6);      // ярче, когда смотришь «вдоль» луча
        float vert = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
        float flick = 0.6 + 0.4 * fbm(vec2(vWPos.x * 0.7 + uTime * 0.16, vWPos.z * 0.7 - uTime * 0.11));
        float a = rim * vert * flick * uStrength * 0.105;
        gl_FragColor = vec4(uColor * a, a);
      }`
  });
}

/* ---------- комната и подставка ---------- */
function buildRoom() {
  const g = new THREE.Group();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(70, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uA: { value: new THREE.Color(0x0a1520) }, uB: { value: new THREE.Color(0x02060a) } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 uA, uB;
        void main(){ float t = smoothstep(-0.4, 1.0, normalize(vP).y); gl_FragColor = vec4(mix(uB, uA, t), 1.0); }`
    })
  );
  dome.name = 'dome';
  g.add(dome);

  const floorY = -3.55;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.85, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  floor.name = 'floor';
  g.add(floor);

  // лужа света под аквариумом
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(TANK.hx * 4.4, TANK.hz * 4.6),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture('rgba(150,210,255,0.9)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = floorY + 0.02;
  glow.name = 'floorGlow';
  g.add(glow);

  // подставка-тумба
  const standH = 3.2;
  const stand = new THREE.Mesh(
    new THREE.BoxGeometry(TANK.hx * 2 + 0.9, standH, TANK.hz * 2 + 0.9),
    new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.72, metalness: 0.08 })
  );
  stand.position.y = -standH / 2 - 0.32;
  stand.castShadow = true;
  stand.receiveShadow = true;
  stand.name = 'stand';
  g.add(stand);

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(TANK.hx * 2 + 1.15, 0.14, TANK.hz * 2 + 1.15),
    new THREE.MeshStandardMaterial({ color: 0x0d0a08, roughness: 0.4, metalness: 0.5 })
  );
  trim.position.y = -0.33;
  g.add(trim);

  return g;
}

/* ---------- стеклянная банка + рамка + крышка с лампой ---------- */
function buildTank() {
  const g = new THREE.Group();
  const { hx, hy, hz, glass, frame } = TANK;

  const panels = [
    { size: [hx * 2, hy], pos: [0, hy / 2, hz], rot: [0, 0, 0] },
    { size: [hx * 2, hy], pos: [0, hy / 2, -hz], rot: [0, Math.PI, 0] },
    { size: [hz * 2, hy], pos: [hx, hy / 2, 0], rot: [0, Math.PI / 2, 0] },
    { size: [hz * 2, hy], pos: [-hx, hy / 2, 0], rot: [0, -Math.PI / 2, 0] }
  ];
  const panelMeshes = [], panelMats = [];
  panels.forEach((p, i) => {
    const mat = glassMaterial();
    mat.name = 'glass';
    mat.uniforms.uAspect.value = p.size[0] / p.size[1];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.size[0], p.size[1], 1, 1), mat);
    m.position.set(...p.pos);
    m.rotation.set(...p.rot);
    m.renderOrder = 4;
    m.name = 'glassPanel';
    m.userData.panelIndex = i;
    panelMeshes.push(m); panelMats.push(mat);
    g.add(m);
  });

  // дно из стекла
  const bottom = new THREE.Mesh(
    new THREE.BoxGeometry(hx * 2 + glass * 2, glass, hz * 2 + glass * 2),
    new THREE.MeshPhysicalMaterial({
      color: 0x2c4a52, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.55
    })
  );
  bottom.position.y = -glass / 2;
  bottom.name = 'glassBottom';
  g.add(bottom);

  // металлическая рамка по рёбрам
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ab, roughness: 0.34, metalness: 0.85 });
  const bars = [];
  const addBar = (len, pos, axis) => {
    const size = [frame, frame, frame];
    size[axis] = len;
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), frameMat);
    m.position.set(...pos);
    m.castShadow = true;
    bars.push(m);
  };
  const X = hx + frame / 2, Z = hz + frame / 2;
  for (const y of [0, hy]) {
    addBar(hx * 2 + frame * 2, [0, y, Z], 0);
    addBar(hx * 2 + frame * 2, [0, y, -Z], 0);
    addBar(hz * 2, [X, y, 0], 2);
    addBar(hz * 2, [-X, y, 0], 2);
  }
  for (const x of [X, -X]) for (const z of [Z, -Z]) addBar(hy, [x, hy / 2, z], 1);
  bars.forEach((b) => b.name = 'frameBar');
  g.add(...bars);

  // крышка + светодиодная лампа
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(hx * 2 + frame * 2, 0.3, hz * 2 + frame * 2),
    new THREE.MeshStandardMaterial({ color: 0x11161a, roughness: 0.55, metalness: 0.4 })
  );
  lid.position.y = hy + 0.17;
  lid.castShadow = true;
  lid.name = 'lid';
  g.add(lid);

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(hx * 1.86, 0.06, hz * 1.7),
    new THREE.MeshBasicMaterial({ color: 0xfff3d8 })
  );
  strip.position.y = hy + 0.005;
  strip.name = 'lampStrip';
  g.add(strip);

  const lampGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(hx * 2.3, hz * 2.3),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture('rgba(255,246,224,0.95)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55,
      side: THREE.DoubleSide
    })
  );
  lampGlow.rotation.x = -Math.PI / 2;
  lampGlow.position.y = hy - 0.06;
  lampGlow.name = 'lampGlow';
  g.add(lampGlow);

  return { group: g, glassMat: panelMats[0], panelMats, panelMeshes, strip, lampGlow };
}

/* ---------- грунт с барханами ---------- */
function buildSand() {
  const seg = 64;
  const geo = new THREE.PlaneGeometry(TANK.hx * 2, TANK.hz * 2, seg, Math.round(seg * TANK.hz / TANK.hx));
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i); // плоскость в XY до поворота
    const dune = fbm2(x * 0.22 + 3.1, y * 0.24 - 1.7, 4, 3) * 0.9;
    const ripple = Math.sin(x * 2.4 + fbm2(x * 0.6, y * 0.6, 2, 9) * 4.0) * 0.05;
    const edge = Math.min(1, Math.min(TANK.hx - Math.abs(x), TANK.hz - Math.abs(y)) / 1.1);
    pos.setZ(i, (dune * 0.55 + ripple) * (0.35 + 0.65 * edge));
  }
  geo.computeVertexNormals();
  geo.rotateX(-Math.PI / 2);

  const { map, bump } = makeSandTextures();
  const mat = new THREE.MeshStandardMaterial({
    map, bumpMap: bump, bumpScale: 0.14, roughness: 0.96, metalness: 0.02, color: 0xbfb09a
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = TANK.sand - 0.18;
  mesh.receiveShadow = true;
  mesh.name = 'sand';
  return mesh;
}

/* ============================================================ */
export function buildAquarium(scene) {
  const root = new THREE.Group();
  root.name = 'aquariumRoot';
  scene.add(root);

  const room = buildRoom();
  root.add(room);

  const tank = buildTank();
  root.add(tank.group);

  const sand = buildSand();
  root.add(sand);

  // каустика поверх грунта
  const causticGeo = new THREE.PlaneGeometry(TANK.hx * 2 - 0.05, TANK.hz * 2 - 0.05, 1, 1);
  causticGeo.rotateX(-Math.PI / 2);
  const caustic = new THREE.Mesh(causticGeo, causticMaterial());
  caustic.position.y = TANK.sand + 0.03;
  caustic.renderOrder = 2;
  caustic.name = 'caustics';
  root.add(caustic);

  // каустика на боковых стенках (мягкий свет по стеклу снизу)
  const wallCaustic = causticMaterial();
  wallCaustic.uniforms.uScale.value = 0.34;
  wallCaustic.uniforms.uStrength.value = 0.22;
  const wallPanes = [];
  for (const p of [
    { pos: [0, 1.5, TANK.hz - 0.06], rot: [0, 0, 0], w: TANK.hx * 2 - 0.3 },
    { pos: [0, 1.5, -TANK.hz + 0.06], rot: [0, Math.PI, 0], w: TANK.hx * 2 - 0.3 },
    { pos: [TANK.hx - 0.06, 1.5, 0], rot: [0, Math.PI / 2, 0], w: TANK.hz * 2 - 0.3 },
    { pos: [-TANK.hx + 0.06, 1.5, 0], rot: [0, -Math.PI / 2, 0], w: TANK.hz * 2 - 0.3 }
  ]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, 3.0), wallCaustic);
    m.position.set(...p.pos); m.rotation.set(...p.rot);
    m.renderOrder = 2;
    m.name = 'wallCaustics';
    root.add(m);
    wallPanes.push(m);
  }

  // поверхность воды
  const wGeo = new THREE.PlaneGeometry(TANK.hx * 2 - 0.02, TANK.hz * 2 - 0.02, 48, 32);
  wGeo.rotateX(-Math.PI / 2);
  const waterMat = waterSurfaceMaterial();
  const water = new THREE.Mesh(wGeo, waterMat);
  water.position.y = TANK.waterTop;
  water.renderOrder = 3;
  water.name = 'waterSurface';
  root.add(water);

  // божьи лучи
  const shafts = new THREE.Group();
  shafts.name = 'shafts';
  const shaftMat = shaftMaterial();
  for (let i = 0; i < 5; i++) {
    const h = TANK.waterTop + 0.4;
    const geo = new THREE.CylinderGeometry(0.22 + i * 0.05, 0.95 + i * 0.22, h, 14, 1, true);
    const m = new THREE.Mesh(geo, shaftMat);
    m.position.set(-4.6 + i * 2.35 + Math.sin(i * 2.1) * 0.6, h / 2, Math.sin(i * 1.7) * 2.4);
    m.rotation.z = Math.sin(i * 1.3) * 0.07;
    m.renderOrder = 2;
    shafts.add(m);
  }
  root.add(shafts);

  /* ---------- свет ---------- */
  const lights = new THREE.Group();
  root.add(lights);

  const hemi = new THREE.HemisphereLight(0x6f9fc4, 0x2a1d16, 0.55);
  hemi.name = 'hemi';
  lights.add(hemi);

  const key = new THREE.DirectionalLight(0xfff0d6, 2.6);
  key.position.set(2.0, TANK.hy + 8, 4.0);
  key.target.position.set(0, 1.0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -9; key.shadow.camera.right = 9;
  key.shadow.camera.top = 11; key.shadow.camera.bottom = -11;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.03;
  key.name = 'keyLight';
  lights.add(key, key.target);

  const spot = new THREE.SpotLight(0xdff0ff, 260, 26, 0.72, 0.62, 1.6);
  spot.position.set(0, TANK.hy + 1.4, 0);
  spot.target.position.set(0, 0, 0);
  spot.name = 'spotLight';
  lights.add(spot, spot.target);

  const accentA = new THREE.PointLight(0x2f7fd6, 120, 16, 1.8);
  accentA.position.set(-TANK.hx + 1.2, 4.6, -TANK.hz + 1.0);
  accentA.name = 'accentBlue';
  lights.add(accentA);

  const accentB = new THREE.PointLight(0xff9f57, 70, 14, 1.8);
  accentB.position.set(TANK.hx - 1.4, 2.2, TANK.hz - 0.9);
  accentB.name = 'accentWarm';
  lights.add(accentB);

  const fog = new THREE.FogExp2(0x0d2a38, 0.017);
  scene.fog = fog;

  /* ---------- день / ночь ---------- */
  const dayNight = (t) => {
    // t = 0 день, 1 ночь
    const k = clamp(t, 0, 1);
    hemi.intensity = 0.55 - 0.34 * k;
    hemi.color.setHex(0x6f9fc4).lerp(new THREE.Color(0x2a4a6e), k);
    key.intensity = 2.6 - 2.0 * k;
    key.color.setHex(0xfff0d6).lerp(new THREE.Color(0x7fa8d8), k);
    spot.intensity = 260 - 175 * k;
    spot.color.setHex(0xdff0ff).lerp(new THREE.Color(0x5f8ec8), k);
    accentA.intensity = 120 + 90 * k;
    accentB.intensity = 70 - 45 * k;
    tank.strip.material.color.setHex(0xfff3d8).lerp(new THREE.Color(0x8fb6e8), k);
    tank.lampGlow.material.opacity = 0.55 - 0.3 * k;
    waterMat.uniforms.uNight.value = k;
    caustic.material.uniforms.uStrength.value = 0.55 - 0.3 * k;
    wallCaustic.uniforms.uStrength.value = 0.22 - 0.14 * k;
    shaftMat.uniforms.uStrength.value = 1 - 0.75 * k;
    fog.color.setHex(0x0d2a38).lerp(new THREE.Color(0x040d18), k);
    room.getObjectByName('floorGlow').material.opacity = 0.5 - 0.18 * k;
  };
  dayNight(0);

  /* ---------- круги по стеклу ---------- */
  const ripples = tank.panelMats.map(() => ({ age: -1, u: 0.5, v: 0.5, s: 0 }));
  function glassRipple(mesh, uv, strength = 1) {
    const i = mesh && mesh.userData.panelIndex !== undefined ? mesh.userData.panelIndex : 0;
    const st = ripples[i];
    st.age = 0;
    st.u = uv ? uv.x : 0.5;
    st.v = uv ? uv.y : 0.5;
    st.s = clamp(strength, 0, 1.6);
  }

  function update(dt, time) {
    for (let i = 0; i < tank.panelMats.length; i++) {
      const uni = tank.panelMats[i].uniforms, st = ripples[i];
      uni.uTime.value = time;
      if (st.age >= 0) {
        st.age += dt;
        if (st.age > 1.8) { st.age = -1; uni.uRipple.value.set(0, 0, 0, 0); }
        else uni.uRipple.value.set(st.u, st.v, st.age, st.s * (1 - st.age / 1.8));
      }
    }
    waterMat.uniforms.uTime.value = time;
    caustic.material.uniforms.uTime.value = time;
    wallCaustic.uniforms.uTime.value = time;
    shaftMat.uniforms.uTime.value = time;
    key.intensity += Math.sin(time * 1.7) * 0.0015;   // лёгкое дрожание воды
  }

  return {
    root, sand, water, caustic, shafts, lights,
    glassMat: tank.glassMat, panelMeshes: tank.panelMeshes, glassRipple,
    waterMat, fog, dayNight, update,
    lampStrip: tank.strip
  };
}
