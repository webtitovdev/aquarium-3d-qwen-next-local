/* ============================================================
   _harness.mjs — прогоном модулей банка в Node (без GPU):
   логика рыб, корм, мутность, декор, геометрия, NaN-контроль.
   Запуск:  node _harness.mjs
   ============================================================ */
import fs from 'node:fs';

/* ---------- mock DOM: textures.js рисует на canvas ---------- */
const noop = () => {};
function makeCtx(canvas) {
  const grad = { addColorStop: noop };
  return {
    canvas, fillStyle: '', strokeStyle: '', lineWidth: 0, filter: 'none', font: '',
    globalCompositeOperation: 'source-over', globalAlpha: 1, lineCap: '', lineJoin: '', shadowBlur: 0, shadowColor: '',
    fillRect: noop, clearRect: noop, strokeRect: noop, fillText: noop, strokeText: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, ellipse: noop,
    bezierCurveTo: noop, quadraticCurveTo: noop, rect: noop, fill: noop, stroke: noop, clip: noop,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop, transform: noop,
    drawImage: noop, createRadialGradient: () => grad, createLinearGradient: () => grad,
    createPattern: () => null, measureText: () => ({ width: 10 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h }),
    putImageData: noop, createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)) })
  };
}
function makeCanvas() {
  const c = {
    width: 300, height: 150, nodeType: 1, style: {}, tagName: 'CANVAS',
    getContext: (k) => (String(k).startsWith('2d') ? makeCtx(c) : null),
    toDataURL: () => 'data:,','addEventListener': noop, removeEventListener: noop
  };
  return c;
}
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(), nodeType: 1, style: {}, textContent: '', innerHTML: '',
    classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    appendChild: noop, removeChild: noop, remove: noop, querySelector: () => null,
    querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    setAttribute: noop, cloneNode: () => makeEl(tag)
  };
  return el;
}
globalThis.document = {
  createElement: (t) => (t === 'canvas' ? makeCanvas() : makeEl(t)),
  createElementNS: (ns, t) => makeEl(t),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener: noop, removeEventListener: noop,
  body: { appendChild: noop, removeChild: noop }, head: { appendChild: noop },
  documentElement: makeEl('html')
};
globalThis.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener: noop, removeEventListener: noop, location: { search: '' }
};
globalThis.self = globalThis.window;
globalThis.requestAnimationFrame = () => 0;

/* ---------- импорт модулей банка ---------- */
const THREE = await import('three');
const { TANK, TAU, clamp, makeRng, randRange, swimBounds } = await import('./src/config.js');
const { buildAquarium } = await import('./src/tank.js');
const { buildProps } = await import('./src/props.js');
const { buildFoodSystem } = await import('./src/food.js');
const { populate, Fish } = await import('./src/fish.js');
const { SPECIES, speciesById } = await import('./src/species.js');

const problems = [];
const warn = (m) => problems.push(m);
const ok = (cond, m) => { if (!cond) warn(m); };

/* ---------- сборка мира (как в main.js) ---------- */
const rng = makeRng(20240614);
const scene = new THREE.Scene();
const world = {
  scene, time: 0, phase: 0.06, night: 0, turbidity: 0.05,
  species: SPECIES, fishes: [], sandTop: TANK.sand + 0.35,
  tool: 'feed', hoverFish: null, muted: false, feedPulse: 0,
  threat: { pos: new THREE.Vector3(0, -50, 0), radius: 3, strength: 0 },
  threatTimer: 0,
  pointer: { pos: new THREE.Vector3(0, 4, 20), active: false },
  net: { pos: new THREE.Vector3(0, 4, 20), active: false },
  torch: { pos: new THREE.Vector3(), level: 0 },
  addTurbidity(x) { world.turbidity = clamp(world.turbidity + x, 0, 1); },
  scare(pos, s = 1) {
    world.threat.pos.copy(pos); world.threat.radius = 3 + s * 1.2;
    world.threat.strength = s; world.threatTimer = 1.2;
  },
  onHover(f) { world.hoverFish = f; },
  notify: noop, sound: noop
};
world.tank = buildAquarium(scene);
world.props = buildProps(scene);
world.sandTop = world.props.sandTop;
world.homeOf = (n) => world.props.homeOf(n);
world.foodSys = buildFoodSystem(scene, world);
Object.defineProperty(world, 'foods', { get: () => world.foodSys.food.list });
Object.defineProperty(world, 'scavenge', { get: () => world.foodSys.debris.list });
let eats = 0, poops = 0, scavenged = 0;
world.spawnPoop = (p, l) => { const it = world.foodSys.poop(p, l); if (it) { poops++; world.addTurbidity(0.0006); } };
world.eat = (item, fish) => {
  world.foodSys.food.kill(item);
  eats++;
  fish.satiety = clamp(fish.satiety + 0.18 * (1 / Math.max(0.5, fish.spec.len)) * (fish.spec.greed || 1), 0, 1);
};
world.eatScavenge = (item, fish) => {
  world.foodSys.debris.kill(item);
  scavenged++;
  fish.satiety = clamp(fish.satiety + 0.05 * (fish.spec.greed || 1), 0, 1);
  world.addTurbidity(-0.005);
};
populate(world, rng);

const camera = new THREE.PerspectiveCamera(46, 1.5, 0.1, 100);
camera.position.set(10.2, 6.4, 14.4);
camera.lookAt(0, 3.4, 0);
camera.updateMatrixWorld(true);

/* ---------- проверки геометрии ---------- */
let verts = 0, meshes = 0, attrsMissing = 0;
scene.traverse((o) => {
  if (!o.isMesh && !o.isInstancedMesh) return;
  meshes++;
  const g = o.geometry;
  if (!g || !g.attributes.position) { warn(`нет position у ${o.name || o.type}`); return; }
  verts += g.attributes.position.count;
  for (const key of ['position', 'normal', 'uv']) {
    if (!g.attributes[key]) { attrsMissing++; warn(`${o.name || o.type}: нет атрибута ${key}`); break; }
  }
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i++) {
    if (!Number.isFinite(p[i])) { warn(`${o.name || o.type}: NaN в position[${i}]`); break; }
  }
  if (g.index) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i++) if (idx[i] >= g.attributes.position.count) { warn(`${o.name || o.type}: индекс вне диапазона`); break; }
  }
});
const fishMeshes = world.fishes.reduce((a, f) => a + (f.root ? countMeshes(f.root) : 0), 0);
function countMeshes(o) {
  let n = o.isMesh ? 1 : 0;
  for (const c of o.children || []) n += countMeshes(c);
  return n;
}
ok(world.fishes.length === SPECIES.reduce((a, s) => a + s.count, 0), 'число рыб не совпало с набором видов');
for (const f of world.fishes) {
  ok(f.bounds && Number.isFinite(f.bounds.xMin), `${f.name}: bounds сломаны`);
  ok(f.uniforms && Number.isFinite(f.uniforms.uAmp.value), `${f.name}: нет uniforms`);
  ok(!!f.name && /[А-Яа-я]/.test(f.name), `${f.spec.id}: имя не по-русски`);
}
const names = new Set(world.fishes.map((f) => f.name));
ok(names.size >= world.fishes.length * 0.6, 'имена рыб почти не различаются');

/* ---------- прогон симуляции ---------- */
const dt = 1 / 60;
const seenStates = new Set();
let NaNpos = 0, outOfBounds = 0, puffedMax = 1;
const series = [];

function step(seconds) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    world.time += dt;
    world.phase = (world.phase + dt / 420) % 1;
    world.night = 0.5 - 0.5 * Math.cos(world.phase * TAU);
    world.tank.dayNight(world.night);
    world.tank.update(dt, world.time);
    world.turbidity = Math.max(0.03, world.turbidity - dt * 0.010);
    if (world.threatTimer > 0) { world.threatTimer -= dt; if (world.threatTimer <= 0) world.threat.pos.set(0, -50, 0); }
    for (const f of world.fishes) {
      f.update(dt, world, camera);
      f.animateEyes(camera);
      seenStates.add(f.state);
      if (!Number.isFinite(f.pos.x + f.pos.y + f.pos.z)) NaNpos++;
      const b = f.bounds;
      if (f.pos.x < b.xMin - 0.35 || f.pos.x > b.xMax + 0.35 ||
          f.pos.y < b.yMin - 0.45 || f.pos.y > b.yMax + 0.35 ||
          f.pos.z < b.zMin - 0.35 || f.pos.z > b.zMax + 0.35) outOfBounds++;
      puffedMax = Math.max(puffedMax, f.puff);
    }
    world.foodSys.update(dt);
    world.props.update(dt, world.time, world.night);
    if (i % 60 === 0) series.push(+world.turbidity.toFixed(4));
  }
}
const satAvg = () => world.fishes.reduce((a, f) => a + f.satiety, 0) / world.fishes.length;
const speedAvg = () => world.fishes.reduce((a, f) => a + f.vel.length(), 0) / world.fishes.length;

// фаза A: живут без вмешательства (2 минуты)
step(120);
const idleTurbidity = world.turbidity;
const satIdle = satAvg();

// фаза B: умеренная кормёжка — 3 щепотки (как это делает интерфейс)
const pinch = Math.round(clamp(6 + world.fishes.length * 0.5, 8, 26));
const satBeforeFeeding = satAvg();
for (let k = 0; k < 3; k++) {
  world.foodSys.drop(new THREE.Vector3(randRange(rng, -3, 3), TANK.waterTop - 0.2, randRange(rng, -2, 2)), pinch);
  step(14);
}
step(25);
const foodAfterModerate = world.foodSys.count;
const satAfterModerate = satAvg();
const turbidityModerate = world.turbidity;

// фаза C: перекорм — 6 щепоток подряд
for (let k = 0; k < 6; k++) {
  world.foodSys.drop(new THREE.Vector3(randRange(rng, -4, 4), TANK.waterTop - 0.2, randRange(rng, -3, 3)), pinch);
  step(4);
}
const satOverfed = satAvg();
const foodAtOverfeed = world.foodSys.count;
step(80);
const turbidityOverfed = world.turbidity;

// фаза D: испуг пугалкой прямо рядом с фугу
const pufferFish = world.fishes.find((f) => f.spec.puffer);
const pBefore = { state: pufferFish.state, stress: +pufferFish.stress.toFixed(2) };
world.scare(pufferFish.pos.clone(), 1);
step(0.7);
const pMid = { state: pufferFish.state, stress: +pufferFish.stress.toFixed(2), puffTarget: pufferFish.puffTarget, puff: +pufferFish.puff.toFixed(2), d: +world.threat.pos.distanceTo(pufferFish.pos).toFixed(2), r: world.threat.radius };
step(0.7);
const fleeingNow = world.fishes.filter((f) => f.state === 'flee').length;
const pufferPuff = pufferFish.puff;
step(6);
const stressAfter = world.fishes.reduce((a, f) => a + f.stress, 0) / world.fishes.length;

// фаза E: сачок у самой рыбы
const victim = world.fishes[0];
world.net.pos.copy(victim.pos);
world.net.active = true;
step(1);
const netFleeing = world.fishes.filter((f) => f.state === 'flee').length;
world.net.active = false;

// фаза F: любопытство — палец у стекла рядом с любопытной рыбой
const nosy = world.fishes.filter((f) => f.spec.curiosity > 0.6).sort((a, b) => b.spec.curiosity - a.spec.curiosity)[0];
world.pointer.pos.copy(nosy.pos);
world.pointer.active = true;
step(12);
const curiousNow = world.fishes.filter((f) => f.state === 'curious').length;
world.pointer.active = false;

// фаза G: день/ночь
world.phase = 0.5; step(12);
const nightSpeed = speedAvg(), nightState = world.fishes.filter((f) => f.state === 'rest').length;
world.phase = 0.05; step(12);
const daySpeed = speedAvg();

// фаза H: фильтры очищают воду
world.turbidity = 0.7;
step(100);
const turbidityClean = world.turbidity;

/* ---------- отчёт ---------- */
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const report = {
  species: SPECIES.length,
  fish: world.fishes.length,
  meshesInScene: meshes,
  meshesOnFish: fishMeshes,
  verticesTotal: verts,
  sceneChildren: scene.children.length,
  fog: !!scene.fog,
  lights: (() => { let n = 0; scene.traverse((o) => { if (o.isLight) n++; }); return n; })(),
  sim: {
    NaNpos, outOfBounds, seenStates: [...seenStates].sort(),
    eats, poops, scavenged, puffer: [pBefore, pMid],
    idleTurbidity: +idleTurbidity.toFixed(3), satIdle: +satIdle.toFixed(3),
    satBeforeFeeding: +satBeforeFeeding.toFixed(3), satAfterModerate: +satAfterModerate.toFixed(3),
    satOverfed: +satOverfed.toFixed(3), foodAtOverfeed,
    foodAfterModerate, turbidityModerate: +turbidityModerate.toFixed(3),
    turbidityOverfed: +turbidityOverfed.toFixed(3),
    fleeingNow, pufferPuff: +pufferPuff.toFixed(3), netFleeing, curiousNow,
    stressAfter: +stressAfter.toFixed(3),
    nightSpeed: +nightSpeed.toFixed(3), daySpeed: +daySpeed.toFixed(3), nightRest: nightState,
    turbidityClean: +turbidityClean.toFixed(3),
    turbiditySeries: [series[0], series[7200] || null, series[series.length - 1]],
    depthRange: [
      +Math.min(...world.fishes.map((f) => f.pos.y)).toFixed(2),
      +Math.max(...world.fishes.map((f) => f.pos.y)).toFixed(2)
    ],
    moods: [...new Set(world.fishes.map((f) => f.mood))]
  },
  problems
};
ok(pufferPuff > 1.2, 'фугу не надулась при испуге');
ok(netFleeing > 0, 'сачок не пугает рыб');
ok(satAfterModerate > satBeforeFeeding, 'рыбы не едят корм');
ok(foodAfterModerate < 40, 'корм почти не съедается: осталось ' + foodAfterModerate);
ok(turbidityOverfed > 0.25, 'перекорм не портит воду');
ok(turbidityClean < 0.35, 'фильтры не очищают воду: ' + turbidityClean.toFixed(3));
ok(nightSpeed < daySpeed * 0.95, 'ночью рыбы не замедляются');
ok(idleTurbidity < 0.35, 'вода без кормёжки мутнеет слишком сильно: ' + idleTurbidity.toFixed(3));
fs.writeFileSync(new URL('./_test_report.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(problems.length ? 1 : 0);
