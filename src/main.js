/* ============================================================
   main.js — сборка всего вместе: рендер, постобработка, мир,
   цикл дня и ночи, мутность воды, главный кадр.
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { TANK, TAU, clamp, lerp, damp, makeRng, randRange, randInt } from './config.js';
import { makeEnvTexture } from './textures.js';
import { buildAquarium } from './tank.js';
import { buildProps } from './props.js';
import { buildFoodSystem } from './food.js';
import { populate, Fish } from './fish.js';
import { SPECIES } from './species.js';
import { buildInteraction, updateShells } from './interaction.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';

const CYCLE = 420;            // секунд на полные сутки
const rng = makeRng(20240614);

function fail(msg) {
  let d = document.querySelector('.warn');
  if (!d) { d = document.createElement('div'); d.className = 'warn'; document.body.appendChild(d); }
  d.style.display = 'block';
  d.innerHTML = '<b>Не получилось запустить банку</b><br>' + msg;
  const l = document.getElementById('load');
  if (l) l.classList.add('gone');
}

try {
  window.addEventListener('error', (ev) => {
    fail('<code>' + String(ev.message + (ev.filename ? ' @' + ev.filename + ':' + ev.lineno : '')).replace(/</g, '&lt;') + '</code>');
  });
  boot();
} catch (e) {
  console.error(e);
  fail('<code>' + (e && e.stack ? String(e.stack).replace(/</g, '&lt;') : e) + '</code>');
}

function boot() {
  /* ---------- режим ---------- */
  // ?quality=low / ?lite=1 — принудительно легко; ?quality=high — принудительно красиво
  const forced = (new URLSearchParams(location.search).get('quality') || '').toLowerCase();
  // софтверный GL (SwiftShader/llvmpipe) не тянет MSAA + bloom: сразу уходим в лёгкий режим
  let softGL = false;
  let glName = '?';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      glName = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      softGL = /swiftshader|llvmpipe|software|basic render/i.test(glName);
    }
  } catch (e) { /* не страшно */ }
  const LITE = forced === 'low' || /[?&]lite=1/.test(location.search) || (softGL && forced !== 'high');

  const NO_BLOOM = /[?&]nobloom=1/.test(location.search);
  const NO_SHADOW = /[?&]noshadow=1/.test(location.search);
  const NO_MSAA = /[?&]nomsaa=1/.test(location.search);
  const NO_TESTLINE = /[?&]notestline=1/.test(location.search);
  // ?phase=0.5 — сразу прыгнуть в нужную точку суток (0 = полдень, 0.5 = полночь)
  const START_PHASE = parseFloat(new URLSearchParams(location.search).get('phase') || '');

  /* ---------- рендерер ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(LITE ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !LITE && !NO_SHADOW;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.08, 260);
  camera.position.set(10.2, 6.4, 14.4);

  /* ---------- окружение ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = makeEnvTexture();
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  const env = pmrem.fromEquirectangular(envTex).texture;
  scene.environment = env;
  envTex.dispose();
  pmrem.dispose();

  /* ---------- звук и интерфейс (создаём раньше: в них ссылаются колбэки мира) ---------- */
  const audio = createAudio();
  let ui = null;

  /* ---------- мир ---------- */
  const world = {
    scene, camera, renderer,
    time: 0, phase: Number.isFinite(START_PHASE) ? START_PHASE : 0.06, night: 0, turbidity: 0.05,
    species: SPECIES, fishes: [],
    sandTop: TANK.sand + 0.35,
    tool: 'feed', hoverFish: null, muted: false, feedPulse: 0,
    threat: { pos: new THREE.Vector3(0, -50, 0), radius: 3.0, strength: 0 },
    threatTimer: 0,
    pointer: { pos: new THREE.Vector3(0, 4, 20), active: false },
    net: { pos: new THREE.Vector3(0, 4, 20), active: false },
    torch: { pos: new THREE.Vector3(), level: 0 },
    addTurbidity(x) { world.turbidity = clamp(world.turbidity + x, 0, 1); },
    scare(pos, strength = 1) {
      world.threat.pos.copy(pos);
      world.threat.radius = 3.0 + strength * 1.2;
      world.threat.strength = strength;
      world.threatTimer = 1.2;
      world.feedPulse = 0;
    },
    onHover(f) { world.hoverFish = f; },
    notify(t, d) { if (ui) ui.notify(t, d); },
    sound(n, i) { audio.play(n, i); }
  };

  /* ---------- банка, декор, корм ---------- */
  world.tank = buildAquarium(scene);
  world.props = buildProps(scene);
  world.sandTop = world.props.sandTop;
  world.homeOf = (name) => world.props.homeOf(name);
  world.foodSys = buildFoodSystem(scene, world);
  Object.defineProperty(world, 'foods', { get: () => world.foodSys.food.list, enumerable: false });
  Object.defineProperty(world, 'scavenge', { get: () => world.foodSys.debris.list, enumerable: false });

  world.spawnPoop = (pos, len) => {
    const it = world.foodSys.poop(pos, len);
    if (it) world.addTurbidity(0.0006);
  };
  world.eat = (item, fish) => {
    world.foodSys.food.kill(item);
    const gain = 0.18 * (1 / Math.max(0.5, fish.spec.len)) * (fish.spec.greed || 1);
    fish.satiety = clamp(fish.satiety + gain, 0, 1);
    if (rng() < 0.22) audio.play('munch', 0.5 * clamp(fish.spec.len, 0.3, 1));
    fish.mood = fish.satiety > 0.82 ? 'сыта и довольна' : 'клюёт корм';
  };
  // донные сомики и улитка подбирают мусор — и тем самым чистят воду
  world.eatScavenge = (item, fish) => {
    world.foodSys.debris.kill(item);
    fish.satiety = clamp(fish.satiety + 0.05 * (fish.spec.greed || 1), 0, 1);
    world.addTurbidity(-0.005);
    fish.mood = 'счищает налёт';
    if (rng() < 0.12) audio.play('munch', 0.28);
  };

  /* ---------- рыбы ---------- */
  populate(world, rng);

  /* ---------- взаимодействие ---------- */
  const inter = buildInteraction(renderer, scene, camera, world);
  world.inter = inter;

  /* ---------- постобработка ---------- */
  const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: THREE.HalfFloatType, samples: (LITE || NO_MSAA) ? 0 : 2
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.58, 0.85, 0.62);
  bloom.enabled = !LITE && !NO_BLOOM;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- интерфейс ---------- */
  const actions = {
    setTool(id) { inter.setTool(id); },
    daynight() {
      // перемотать на противоположную половину суток
      world.phase = (world.phase + 0.5) % 1;
      const target = 0.5 - 0.5 * Math.cos(world.phase * TAU);
      audio.play('chime', 0.7);
      ui.notify(target > 0.5 ? 'Ночь: свет гаснет, рыбы замедляются.' : 'День: лампа разгорается.', 2.2);
    },
    water() {
      world.turbidity = 0.03;
      world.foodSys.debris.reset();
      world.props.ripples.spawn(new THREE.Vector3(0, TANK.waterTop - 0.1, 0), 'water', 1.2, 1.8, 4.5);
      audio.play('splash', 1);
      ui.notify('Подменили воду — чистота 100%.', 2);
    },
    add() {
      const spec = SPECIES[randInt(rng, 0, SPECIES.length - 1)];
      const f = new Fish(spec, world, rng);
      const b = f.bounds;
      f.pos.set(randRange(rng, b.xMin, b.xMax), randRange(rng, f.yMin, f.yMax), randRange(rng, b.zMin, b.zMax));
      world.fishes.push(f);
      scene.add(f.root);
      world.props.ripples.spawn(f.pos, 'water', 0.7, 1.0, 1.6);
      audio.play('plop', 0.8);
      ui.notify(`Подселили: ${f.name} (${spec.ru}).`, 2);
    },
    del() {
      if (world.fishes.length <= 3) { ui.notify('Не хочу совсем пустую банку.', 1.6); return; }
      const f = world.fishes.pop();
      scene.remove(f.root);
      if (inter.follow === f) inter.follow = null;
      ui.notify(`${f.name} уплыла в вечность.`, 1.8);
    },
    shot() { pendingShot = true; },
    mute() {
      world.muted = !world.muted;
      audio.setMuted(world.muted);
      ui.notify(world.muted ? 'Тишина.' : 'Звук включён.', 1.2);
    },
    scareAtPointer() {
      const p = world.pointer.pos;
      inter.scareAtPoint(p);
    }
  };
  ui = createUI({ world, actions });
  ui.notify('Кликни по банке — корм падает в воду. Рыбы это любят.', 3.4);

  /* ---------- кадр ---------- */
  const clock = new THREE.Clock();
  let perfAcc = 0, perfN = 0, perfDone = false, lastTick = 0;
  let pendingShot = false;
  const loadEl = document.getElementById('load');

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  let frame = 0;
  let running = true;
  function step() {
    const dt = Math.min(0.05, clock.getDelta());
    world.time += dt;
    frame++;

    // сутки
    world.phase = (world.phase + dt / CYCLE) % 1;
    const want = 0.5 - 0.5 * Math.cos(world.phase * TAU);
    world.night = damp(world.night, want, 0.9, dt);
    world.tank.dayNight(world.night);

    // мутность: фильтры медленно чистят, свет гаснет в мутной воде
    world.turbidity = Math.max(0.03, world.turbidity - dt * 0.010);
    const tb = world.turbidity;
    scene.fog.density = lerp(0.014, 0.075, tb) + world.night * 0.010;
    for (const m of world.tank.panelMeshes) m.material.uniforms.uSmudge.value = 0.45 + tb * 2.4;
    bloom.strength = lerp(0.58, 0.30, tb);

    // угроза от удара гаснет
    if (world.threatTimer > 0) {
      world.threatTimer -= dt;
      if (world.threatTimer <= 0) world.threat.pos.set(0, -50, 0);
    }
    world.feedPulse = Math.max(0, world.feedPulse - dt);

    // рыбы
    const camDist = camera.position;
    for (const f of world.fishes) {
      f.update(dt, world, camera);
      if (f.eyes && f.pos.distanceToSquared(camDist) < 100) f.animateEyes(camera);
    }

    world.foodSys.update(dt);
    world.props.update(dt, world.time, world.night);
    updateShells(inter.shells, dt);
    inter.update(dt, world.time);
    audio.update(dt);
    ui.update(dt);

    composer.render();

    if (pendingShot) {
      pendingShot = false;
      try {
        const url = renderer.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'akvarium.png';
        a.click();
        ui.notify('Сохранили кадр.', 1.5);
      } catch (e) { ui.notify('Кадр не получился: ' + e.message, 2.5); }
    }

    if (loadEl && !loadEl.classList.contains('gone') && (frame > 2 || AUTOTEST)) {
      loadEl.classList.add('gone');
      if (AUTOTEST) loadEl.style.display = 'none';
    }

    if (AUTOTEST) autotest();
  }

  function tick() {
    if (!running) return;
    // авто-качество: следим за реальным темпом кадров (dt в шаге прижат — по нему не мерить)
    if (!LITE && !perfDone) {
      const now = performance.now();
      if (lastTick) {
        const d = (now - lastTick) / 1000;
        if (frame >= 20 && d < 0.5) { perfAcc += d; perfN++; }
        if (perfN >= 100) {
          perfDone = true;
          const fps = perfN / Math.max(0.001, perfAcc);
          if (fps < 22) {
            bloom.enabled = false;
            renderer.shadowMap.enabled = false;
            renderer.setPixelRatio(1);
            renderer.setSize(window.innerWidth, window.innerHeight);
            composer.setSize(window.innerWidth, window.innerHeight);
            world.quality = 'low';
            ui.notify('Железо не тянет красоту: убрали свечение и тени — банка пошла плавнее.', 4.5);
          }
        }
      }
      lastTick = now;
    }
    try {
      step();
    } catch (e) {
      running = false;
      console.error(e);
      fail('<code>' + String(e && e.stack ? e.stack : e).replace(/</g, '&lt;') + '</code><br><span style="opacity:.65">кадр ' + frame + '</span>');
      return;
    }
    requestAnimationFrame(tick);
  }

  /* ---------- автотест для headless-проверки ---------- */
  const AUTOTEST = /[?&]autotest=1/.test(location.search);
  // ?hide=waterSurface,shafts — удобно отлаживать картинку в headless
  const hideList = (new URLSearchParams(location.search).get('hide') || '').split(',').filter(Boolean);
  for (const n of hideList) {
    scene.traverse((o) => { if (o.name === n) o.visible = false; });
  }
  let testEl = null;
  // ?probe=1 — луч из центра экрана: кто именно рисуется в этой точке
  const DO_PROBE = /[?&]probe=1/.test(location.search);
  const probes = {};
  function probe(tag, nx, ny) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
    probes[tag] = rc.intersectObjects(scene.children, true).slice(0, 9).map((h) => {
      const o = h.object, m = o.material || {};
      return `${o.name || o.type}#${m.type ? m.type.replace('ShaderMaterial', 'SHADER') : ''}` +
        ` d${+h.distance.toFixed(1)} s${o.scale ? +o.scale.x.toFixed(2) : 0} bl${m.blending === undefined ? '-' : m.blending}` +
        ` op${m.opacity === undefined ? '-' : +m.opacity.toFixed(2)} vis${o.visible ? 1 : 0}`;
    });
    // всё крупное вблизи луча — в том числе то, что raycast не ловит
    const big = [];
    scene.traverse((o) => {
      if (!o.visible || !o.geometry || !o.material) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere;
      if (!bs) return;
      const sc = o.scale ? Math.max(o.scale.x, o.scale.y, o.scale.z) : 1;
      const r = bs.radius * sc;
      if (r < 0.7) return;
      o.updateWorldMatrix(true, false);
      const c = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const d = rc.ray.distanceToPoint(c);
      if (d > r + 1.2) return;
      const m = o.material;
      big.push(`${o.name || o.type} r${r.toFixed(1)} d${d.toFixed(1)} bl${m.blending}${m.emissiveIntensity ? ' em' + m.emissiveIntensity : ''}` +
        ` op${(m.opacity === undefined ? 1 : m.opacity).toFixed(2)} n${o.geometry.attributes.position ? o.geometry.attributes.position.count : 1}`);
    });
    probes[tag + 'big'] = big;
  }
  function autotest() {
    if (DO_PROBE && frame === 2) probe('early', 0.11, 0.14);
    if (DO_PROBE && frame === 10) probe('late', 0.11, 0.14);
    // прогоняем те же пути, по которым ходит игрок, а не только нижний уровень
    if (frame === 3) { inter.setTool('feed'); inter.feedAtPoint(new THREE.Vector3(-1, TANK.waterTop - 0.2, 1)); }
    if (frame === 5) { inter.feedAtPoint(new THREE.Vector3(2.2, TANK.waterTop - 0.2, -0.6)); }
    if (frame === 6) { inter.setTool('scare'); inter.scareAtPoint(new THREE.Vector3(2, 4, 0)); }
    if (frame === 9) { inter.setTool('light'); }
    if (frame === 12) { actions.add(); actions.water(); actions.daynight(); }
    if (frame >= 1) {
      if (!testEl && !NO_TESTLINE) {
        testEl = document.createElement('pre');
        testEl.id = 'testout';
        testEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;color:#9fe8ff;font-size:12px;margin:0;font-family:monospace;text-shadow:0 1px 2px #000';
        document.body.appendChild(testEl);
      }
      const r = {
        frames: frame,
        t: +world.time.toFixed(3),
        fish: world.fishes.length,
        food: world.foodSys.count,
        debris: world.foodSys.debris.list.length,
        turbidity: +world.turbidity.toFixed(4),
        fleeing: world.fishes.filter((f) => f.state === 'flee').length,
        puffed: world.fishes.filter((f) => f.puff > 1.05).length,
        moving: world.fishes.filter((f) => f.vel.lengthSq() > 0.02).length,
        torch: +world.torch.level.toFixed(2),
        night: +world.night.toFixed(3),
        mode: (LITE ? 'lite' : 'full') + (softGL ? '/soft' : ''),
        gl: glName,
        probes,
        calls: renderer.info.render.calls,
        tris: renderer.info.render.triangles,
        progs: renderer.info.programs ? renderer.info.programs.length : -1
      };
      window.__TEST = r;
      if (testEl) testEl.textContent = 'TEST ' + JSON.stringify(r);
    }
  }

  requestAnimationFrame(tick);

  window.__aquarium = { world, renderer, scene, camera, inter, ui, actions };
}
