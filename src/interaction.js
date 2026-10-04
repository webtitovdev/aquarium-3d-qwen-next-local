/* ============================================================
   interaction.js — чем и как ты взаимодействуешь с банкой:
   орбита/зум, кормление, испуг, фонарик, сачок, слежение за рыбой.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TANK, TAU, clamp, damp, randRange, makeRng } from './config.js';
import { makeGlowTexture } from './textures.js';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(235,245,255,0.95)';
  x.lineWidth = 5;
  for (let i = -128; i <= 128; i += 26) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke();
    x.beginPath(); x.moveTo(i + 128, 0); x.lineTo(i, 128); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

export function buildInteraction(renderer, scene, camera, world) {
  const el = renderer.domElement;
  const controls = new OrbitControls(camera, el);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.6;
  controls.minDistance = 0.9;
  controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.target.set(0, 3.4, 0);
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  const rng = makeRng(555);
  const api = {
    controls, tool: 'feed', hover: null, follow: null,
    shake: 0, shakeAmp: 0,
    pointer: world.pointer
  };

  /* ---------- точки на стекле и в воде ---------- */
  const panelMeshes = world.tank.panelMeshes;
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TANK.waterTop - 0.06));

  function setNdc(ev) {
    const r = el.getBoundingClientRect();
    _ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    _ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    _ray.setFromCamera(_ndc, camera);
  }

  // точка, куда «смотрит» курсор внутри банки: стекло или поверхность воды
  function hitPoint(out) {
    const hits = _ray.intersectObjects(panelMeshes, false);
    if (hits.length) {
      out.copy(hits[0].point);
      out.userData = { panel: hits[0].object, uv: hits[0].uv };
      return out;
    }
    const hit = _ray.ray.intersectPlane(waterPlane, out);
    if (hit) {
      hit.x = clamp(hit.x, -TANK.hx + 0.3, TANK.hx - 0.3);
      hit.z = clamp(hit.z, -TANK.hz + 0.3, TANK.hz - 0.3);
      hit.userData = { panel: null, uv: null };
      return hit;
    }
    out.copy(controls.target);
    out.userData = { panel: null, uv: null };
    return out;
  }

  /* ----------fish hover (быстрая проверка луч-сфера) ---------- */
  function fishAtRay() {
    let best = null, bestD = Infinity;
    for (const f of world.fishes) {
      const r = f.len * 0.62;
      const d = _ray.ray.distanceSqToPoint(f.pos);
      if (d < r * r) {
        const along = _tmp.copy(f.pos).sub(_ray.ray.origin).dot(_ray.ray.direction);
        if (along > 0 && along < bestD) { bestD = along; best = f; }
      }
    }
    return best;
  }

  /* ---------- shockwave (ударная волна в воде) ---------- */
  const shells = [];
  const shellGeo = new THREE.SphereGeometry(1, 26, 18);
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uA: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; uniform float uA;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
        gl_FragColor = vec4(vec3(0.55,0.86,1.0) * f * 1.8, f * uA); }`
    });
    const m = new THREE.Mesh(shellGeo, mat);
    m.visible = false; m.renderOrder = 3;
    scene.add(m);
    shells.push({ mesh: m, t: 0, dur: 0.8, r0: 0.2, r1: 2.8, active: false });
  }
  function shockwave(pos, strength = 1, r1 = 2.8) {
    const e = shells.find((s) => !s.active) || shells[0];
    e.active = true; e.t = 0; e.dur = 0.75; e.r1 = r1; e.strength = strength;
    e.mesh.visible = true;
    e.mesh.position.copy(pos);
    e.mesh.scale.setScalar(e.r0);
    world.props.burst.spawn(pos, Math.round(10 + 14 * strength), 0.8, 1.0);
  }

  /* ---------- flashlight ---------- */
  const torch = new THREE.SpotLight(0xfff2d2, 0, 18, 0.42, 0.55, 1.4);
  torch.position.set(0, 6, 12);
  torch.target.position.set(0, 3, 0);
  scene.add(torch, torch.target);
  const torchGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,244,214,0.9)'), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0
  }));
  torchGlow.scale.set(1.6, 1.6, 1);
  scene.add(torchGlow);
  let torchOn = false, torchLevel = 0;

  /* ---------- net ---------- */
  const net = new THREE.Group();
  {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 26),
      new THREE.MeshStandardMaterial({ color: 0xd7dde2, roughness: 0.3, metalness: 0.85 }));
    rim.rotation.x = Math.PI / 2;
    const bagGeo = new THREE.SphereGeometry(0.45, 18, 12, 0, TAU, 0, Math.PI * 0.66);
    bagGeo.scale(1, -0.95, 1);
    bagGeo.rotateX(-Math.PI / 2);
    const bag = new THREE.Mesh(bagGeo, new THREE.MeshStandardMaterial({
      map: netTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
      color: 0xdfe9f2, roughness: 0.8, metalness: 0.05, depthWrite: false
    }));
    bag.position.z = 0.25;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 1.7, 10),
      new THREE.MeshStandardMaterial({ color: 0xb98a52, roughness: 0.75 }));
    handle.rotation.x = Math.PI / 2;
    handle.position.z = -1.05;
    net.add(rim, bag, handle);
  }
  net.visible = false;
  scene.add(net);
  const netPos = new THREE.Vector3(0, 4, 8);
  world.net = { pos: netPos, active: false };

  /* ---------- состояние указателя ---------- */
  world.pointer = { pos: new THREE.Vector3(0, 4, 6), active: false, ndc: _ndc };
  let downAt = null, downTime = 0, moved = 0, dragging = false;
  let sprinkleTimer = 0;
  let grabbed = null, grabTimer = 0;

  function toolPoint() {
    const p = hitPoint(_p);
    world.pointer.pos.copy(p);
    world.pointer.active = true;
    return p;
  }

  function doFeed(p) {
    const at = _tmp.copy(p);
    at.y = Math.min(at.y, TANK.waterTop - 0.08);
    at.x = clamp(at.x, -TANK.hx + 0.4, TANK.hx - 0.4);
    at.z = clamp(at.z, -TANK.hz + 0.4, TANK.hz - 0.4);
    // щепотка подстраивается под количество рыб: большую стаю кормят щедрее
    const pinch = Math.round(clamp(6 + world.fishes.length * 0.5, 8, 26) * (0.8 + rng() * 0.4));
    const n = world.foodSys.drop(at, pinch);
    if (n > 0) {
      world.props.ripples.spawn(at, 'water', 0.8, 1.1, 1.5);
      world.sound('splash', clamp(0.35 + rng() * 0.3, 0, 1));
      world.feedPulse = 1;
    }
  }

  function doScare(p, panel, uv) {
    const at = _tmp.copy(p);
    at.x = clamp(at.x, -TANK.hx + 0.2, TANK.hx - 0.2);
    at.z = clamp(at.z, -TANK.hz + 0.2, TANK.hz - 0.2);
    at.y = clamp(at.y, TANK.sand + 0.3, TANK.waterTop - 0.2);
    world.scare(at, 1);
    shockwave(at, 1, 3.2);
    if (panel) world.tank.glassRipple(panel, uv, 1.2);
    world.props.ripples.spawn(_p2.set(at.x, TANK.waterTop - 0.05, at.z), 'water', 1.0, 1.4, 2.6);
    api.shake = 0.42; api.shakeAmp = 0.055;
    world.sound('knock', 0.9);
  }

  function grabFish(f, p) {
    grabbed = f;
    grabTimer = 0;
    f.caught = true;
    f.state = 'caught';
    f.mood = 'в сачке';
    f.stress = 1;
    world.sound('swish', 0.8);
    world.notify(`Ты поймал ${f.name}!`, 1.6);
  }

  /* ---------- события ---------- */
  el.addEventListener('pointermove', (ev) => {
    setNdc(ev);
    if (downAt) {
      moved += Math.abs(ev.movementX || 0) + Math.abs(ev.movementY || 0);
      dragging = moved > 8;
    }
    // непрерывная точка под курсором (для фонарика, сачка, кормёжки)
    hitPoint(world.pointer.pos);
    world.pointer.active = true;
    if (api.follow) return;
    api.hover = fishAtRay();
    world.onHover && world.onHover(api.hover);
  });

  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    setNdc(ev);
    downAt = { x: ev.clientX, y: ev.clientY };
    downTime = performance.now();
    moved = 0; dragging = false;
    const p = toolPoint();
    if (api.tool === 'net') {
      net.visible = true;
      netPos.copy(p);
      world.net.active = true;
    }
  });

  window.addEventListener('pointerup', (ev) => {
    if (ev.button !== 0 || !downAt) return;
    const quick = performance.now() - downTime < 420 && !dragging;
    setNdc(ev);
    const p = toolPoint();
    const hit = _ray.intersectObjects(panelMeshes, false)[0];
    if (quick) {
      if (api.tool === 'feed') doFeed(p);
      else if (api.tool === 'scare') doScare(p, hit && hit.object, hit && hit.uv);
      else if (api.tool === 'net') {
        const f = fishAtRay();
        if (f) grabFish(f, p);
        else world.notify('Мимо. Сачок — инструмент терпеливых.', 1.4);
      }
    }
    downAt = null; dragging = false;
    if (api.tool !== 'net') { net.visible = false; world.net.active = false; }
  });

  el.addEventListener('dblclick', (ev) => {
    setNdc(ev);
    const f = fishAtRay();
    if (f) {
      api.follow = f;
      world.notify(`Следим за ${f.name} (${f.spec.ru}). Esc — отпустить.`, 2.4);
      world.sound('blip', 0.5);
    } else {
      api.follow = null;
    }
  });

  el.addEventListener('pointerleave', () => { world.pointer.active = false; api.hover = null; world.onHover && world.onHover(null); });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { api.follow = null; }
    if (ev.key === 'r' || ev.key === 'R' || ev.key === 'к' || ev.key === 'К') api.resetCamera();
  });

  api.scareAtPoint = (p) => {
    const hit = _ray.intersectObjects(panelMeshes, false)[0];
    doScare(p || world.pointer.pos, hit && hit.object, hit && hit.uv);
  };
  api.feedAtPoint = (p) => doFeed(p || world.pointer.pos);

  api.resetCamera = () => {
    api.follow = null;
    controls.target.set(0, 3.4, 0);
    camera.position.set(9.5, 6.2, 13.5);
    api.shake = 0;
  };

  api.setTool = (t) => {
    api.tool = t;
    torchOn = (t === 'light');
    if (t !== 'net') { net.visible = false; world.net.active = false; }
    else net.visible = true;
  };

  /* ---------- шаг ---------- */
  const shakeOff = new THREE.Vector3();
  api.update = (dt, time) => {
    // инструмент под курсором — точка уже обновлена в pointermove

    if (api.tool === 'net' && world.net.active) {
      _tmp.copy(world.pointer.pos);
      netPos.lerp(_tmp, 1 - Math.exp(-9 * dt));
      net.visible = true;
      net.position.copy(netPos);
      _dir.copy(netPos).sub(camera.position).normalize();
      net.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _dir);
      // поимка
      if (!grabbed) {
        for (const f of world.fishes) {
          if (f.caught) continue;
          if (f.pos.distanceToSquared(netPos) < (0.55 + f.radius) * (0.55 + f.radius)) { grabFish(f); break; }
        }
      }
    }

    // кормёжка перетаскиванием
    if (api.tool === 'feed' && dragging && downAt) {
      sprinkleTimer -= dt;
      if (sprinkleTimer <= 0) { sprinkleTimer = 0.22; doFeed(world.pointer.pos); }
    }

    // сачок тащит рыбу к поверхности
    if (grabbed) {
      grabTimer += dt;
      const f = grabbed;
      f.target.set(f.pos.x, TANK.waterTop - 0.25, f.pos.z);
      if (grabTimer > 1.15) {
        f.caught = false;
        f.state = 'wander';
        f.mood = 'на свободе';
        f.startFlee(f.pos, 1.2);
        world.props.ripples.spawn(f.pos, 'water', 1.2, 1.3, 2.4);
        world.props.burst.spawn(_p2.set(f.pos.x, TANK.waterTop - 0.15, f.pos.z), 16, 0.5, 1.4);
        world.sound('splash', 1);
        world.notify(`${f.name} выскользнула!`, 1.6);
        grabbed = null;
      }
    }

    // фонарик
    torchLevel = damp(torchLevel, torchOn && world.pointer.active ? 1 : 0, 6, dt);
    const lp = world.pointer.pos;
    torch.intensity = 520 * torchLevel;
    _dir.copy(lp).sub(camera.position).normalize();
    torch.position.copy(lp).addScaledVector(_dir, -0.85);
    torch.target.position.copy(lp).addScaledVector(_dir, 5.0);
    torch.target.updateMatrixWorld();
    torchGlow.position.copy(lp).addScaledVector(_dir, -0.12);
    torchGlow.material.opacity = 0.55 * torchLevel;
    world.torch = { pos: lp, level: torchLevel };

    // слежение за рыбой
    if (api.follow) {
      const f = api.follow;
      controls.target.lerp(f.pos, 1 - Math.exp(-3.2 * dt));
      const want = f.len * 5.2 + 1.2;
      _tmp.copy(camera.position).sub(f.pos);
      const d = _tmp.length();
      if (d > want * 1.05 || d < want * 0.5) {
        _tmp.normalize().multiplyScalar(damp(d, want, 1.6, dt));
        camera.position.copy(f.pos).add(_tmp);
      }
    } else {
      controls.target.x = clamp(controls.target.x, -TANK.hx - 1, TANK.hx + 1);
      controls.target.y = clamp(controls.target.y, 0.2, TANK.hy + 1);
      controls.target.z = clamp(controls.target.z, -TANK.hz - 1, TANK.hz + 1);
    }
    controls.update();

    // тряска камеры
    if (api.shake > 0) {
      api.shake = Math.max(0, api.shake - dt);
      const a = api.shakeAmp * api.shake;
      shakeOff.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      camera.position.add(shakeOff);
    }
  };

  api.shells = shells;
  api.torch = torch;
  api.net = net;
  return api;
}

/* анимация ударных волн — вызывается из main */
export function updateShells(shells, dt) {
  for (const e of shells) {
    if (!e.active) continue;
    e.t += dt;
    const t = e.t / e.dur;
    if (t >= 1) { e.active = false; e.mesh.visible = false; continue; }
    const k = 1 - Math.pow(1 - t, 2.4);
    e.mesh.scale.setScalar(e.r0 + (e.r1 - e.r0) * k);
    e.mesh.material.uniforms.uA.value = (1 - t) * 0.9 * e.strength;
  }
}
