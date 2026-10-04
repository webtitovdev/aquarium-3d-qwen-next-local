/* ============================================================
   fish.js — рыба как персонаж: стайное поведение, поиск корма,
   страх, любопытство, сытость, характер породы.
   ============================================================ */
import * as THREE from 'three';
import { swimBounds, clamp, lerp, damp, randRange, pick, FISH_NAMES } from './config.js';
import { buildFishMesh } from './fishModel.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0), _right = new THREE.Vector3(), _realUp = new THREE.Vector3();

const NAMES_POOL = FISH_NAMES.slice();

export class Fish {
  constructor(spec, world, rng) {
    this.spec = spec;
    this.world = world;
    this.rng = rng;
    this.len = spec.len;
    this.radius = spec.len * 0.42;
    this.bounds = swimBounds(this.radius);
    this.simple = !!spec.simple;

    const scale = randRange(0.86, 1.14, rng);
    this.scale = scale;
    this.maxSpeed = spec.speed * scale * 1.25;
    this.minSpeed = this.maxSpeed * 0.16;
    this.turnRate = (2.4 / Math.max(0.3, spec.len)) * 1.15;
    this.eatRadius = this.radius * 0.75 + 0.06;

    this.root = buildFishMesh(spec, rng);
    this.root.scale.setScalar(scale);

    // характер и состояние
    this.satiety = randRange(0.35, 0.8, rng);
    this.stress = 0;
    this.state = 'wander';
    this.stateTimer = randRange(0.5, 3, rng);
    this.thinkTimer = rng() * 0.4;
    this.phase = rng() * 6.283;
    this.puff = 1; this.puffTarget = 1; this.puffTimer = 0;
    this.wanderDir = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    this.target = new THREE.Vector3();
    this.homeSpot = null;
    this.caught = false;
    this.poopTimer = randRange(4, 11, rng);

    const layer = spec.layer || [0.25, 0.8];
    this.yMin = this.bounds.yMin + (this.bounds.yMax - this.bounds.yMin) * layer[0];
    this.yMax = this.bounds.yMin + (this.bounds.yMax - this.bounds.yMin) * layer[1];

    const y = randRange(this.yMin, this.yMax, rng);
    this.pos = new THREE.Vector3(
      randRange(this.bounds.xMin, this.bounds.xMax, rng), y,
      randRange(this.bounds.zMin, this.bounds.zMax, rng));
    this.vel = new THREE.Vector3(randRange(-0.3, 0.3, rng), 0, randRange(-0.3, 0.3, rng));
    this.quat = new THREE.Quaternion();
    this._lo = new THREE.Vector3(this.bounds.xMin - 0.15, this.bounds.yMin - 0.15, this.bounds.zMin - 0.15);
    this._hi = new THREE.Vector3(this.bounds.xMax + 0.15, this.bounds.yMax + 0.15, this.bounds.zMax + 0.15);

    this.name = NAMES_POOL.length ? NAMES_POOL.splice(Math.floor(rng() * NAMES_POOL.length), 1)[0]
      : 'Рыба ' + Math.floor(rng() * 90 + 10);
    this.mood = 'спокойна';

    this.uniforms = this.root.userData.uniforms;
    this.eyes = this.root.userData.eyes || null;
    this.isSchool = !!spec.school;
  }

  /* ---------------- решения ---------------- */
  think() {
    const w = this.world, spec = this.spec;
    const hunger = 1 - this.satiety;

    if (this.caught) { this.state = 'caught'; this.stateTimer = 1; return; }

    // испуг от волны / сачка / резкого света
    if (this.stateTimer > 0 && this.state === 'flee') return;

    const threat = w.threat;
    if (threat && threat.pos) {
      const d = this.pos.distanceTo(threat.pos);
      const radius = threat.radius + (1 - spec.skittish) * 1.5;
      if (d < radius) {
        this.startFlee(threat.pos, threat.strength * (0.55 + spec.skittish));
        return;
      }
    }

    // сачок — все уплывают независимо от настроения
    if (w.net && w.net.active) {
      const d = this.pos.distanceTo(w.net.pos);
      if (d < 2.2) { this.startFlee(w.net.pos, 1.5); return; }
    }

    // кормёжка: тонущие хлопья тоже едят, но охотнее берут то, что в воде
    const detect = 3.2 + hunger * 5.5 + spec.greed * 2.2;
    let best = null, bestD = detect;
    for (const f of w.foods) {
      if (f.eaten) continue;
      if (spec.bottomFeeder && f.pos.y > w.sandTop + 0.9) continue;   // сомик ждёт, пока упадёт
      let d = this.pos.distanceTo(f.pos);
      if (!spec.bottomFeeder && f.resting) d += 1.1;
      if (d < bestD) { bestD = d; best = f; }
    }
    if (best && hunger > 0.05 && this.satiety < 0.9) {
      this.state = 'seek';
      this.target.copy(best.pos);
      this.foodTarget = best;
      this.stateTimer = 3.5;
      return;
    }

    // любопытство к лучу фонарика / палец у стекла
    if (w.pointer && w.pointer.active && hunger > 0.25) {
      const d = this.pos.distanceTo(w.pointer.pos);
      if (d < 6 && spec.curiosity > 0.45 && this.rng() < spec.curiosity * 0.7) {
        this.state = 'curious';
        this.target.copy(w.pointer.pos);
        this.stateTimer = randRange(1.2, 3.0, this.rng);
        return;
      }
    }

    // ночью рыбы медленнее и чаще отдыхают у укрытий
    const night = w.night || 0;
    if (night > 0.5 && hunger < 0.55 && this.rng() < 0.3 * night) {
      this.state = 'rest';
      this.target.copy(spec.home && w.homeOf ? w.homeOf(spec.home) : this.pos);
      this.stateTimer = randRange(2.5, 6.5, this.rng);
      return;
    }

    // отдых / дом
    if (spec.home && this.rng() < 0.35) {
      this.state = 'home';
      this.target.copy(w.homeOf(spec.home));
      this.stateTimer = randRange(2, 6, this.rng);
      return;
    }
    if (spec.bottomFeeder && this.rng() < 0.5) {
      this.state = 'suck';
      this.target.copy(this.pickWallSpot());
      this.stateTimer = randRange(3, 8, this.rng);
      return;
    }

    this.state = 'wander';
    this.stateTimer = randRange(1.5, 4.5, this.rng);
    this.foodTarget = null;
  }

  pickWallSpot() {
    const r = this.rng, b = this.bounds;
    const side = Math.floor(r() * 4);
    if (side === 0) return new THREE.Vector3(b.xMin + 0.25, randRange(b.yMin, b.yMax * 0.8, r), randRange(b.zMin, b.zMax, r));
    if (side === 1) return new THREE.Vector3(b.xMax - 0.25, randRange(b.yMin, b.yMax * 0.8, r), randRange(b.zMin, b.zMax, r));
    if (side === 2) return new THREE.Vector3(randRange(b.xMin, b.xMax, r), randRange(b.yMin, b.yMax * 0.8, r), b.zMin + 0.25);
    return new THREE.Vector3(randRange(b.xMin, b.xMax, r), randRange(b.yMin, b.yMax * 0.8, r), b.zMax - 0.25);
  }

  startFlee(from, strength) {
    this.state = 'flee';
    this.stateTimer = randRange(1.4, 3.2, this.rng) * (0.7 + strength);
    this.fleeFrom = from.clone();
    this.stress = Math.min(1, this.stress + 0.45 * strength);
    this.mood = 'в панике';
    if (this.spec.puffer) { this.puffTarget = 1.55; this.puffTimer = randRange(2.5, 4.5, this.rng); }
    // мгновенный рывок
    _a.copy(this.pos).sub(from);
    _a.y += 0.15;
    if (_a.lengthSq() < 1e-6) _a.set(this.rng() - 0.5, 0.2, this.rng() - 0.5);
    _a.normalize().multiplyScalar(this.maxSpeed * (1.4 + strength));
    this.vel.lerp(_a, 0.85);
  }

  /* ---------------- силы steering ---------------- */
  steer(dt) {
    const w = this.world, b = this.bounds, spec = this.spec;
    const acc = _b.set(0, 0, 0);
    const calm = clamp(1 - 0.45 * (w.night || 0) - (this.state === 'rest' ? 0.5 : 0), 0.18, 1);
    const maxSpeed = this.maxSpeed * (this.state === 'flee' ? 1.9 : 1) *
      (this.caught ? 0.3 : 1) * calm;

    // --- цель состояния ---
    let want = null;
    if (this.state === 'seek' && this.foodTarget && !this.foodTarget.eaten) {
      want = _a.copy(this.foodTarget.pos).sub(this.pos);
      const dd = want.length();
      if (dd > 0.0001) {
        const k = Math.min(1, dd / 2);
        // на финальном подходе рыба «втягивается» в кусочек
        acc.addScaledVector(want.normalize(), this.maxSpeed * (2.6 + (dd < 0.6 ? 3.4 : 0)) * (0.4 + k));
      }
    } else if (this.state === 'flee' && this.fleeFrom) {
      want = _a.copy(this.pos).sub(this.fleeFrom);
      if (want.lengthSq() < 1e-6) want.copy(this.wanderDir);
      acc.addScaledVector(want.normalize(), this.maxSpeed * 3.4);
    } else if (this.state === 'curious' || this.state === 'home' || this.state === 'suck') {
      want = _a.copy(this.target).sub(this.pos);
      const d = want.length();
      if (d > 0.05) acc.addScaledVector(want.normalize(), this.maxSpeed * (d > 1 ? 1.5 : 0.8) * Math.min(1, d));
    } else if (this.state === 'wander' || this.state === 'rest') {
      // блуждание: медленно меняющееся направление
      const r = this.rng;
      this.wanderDir.x += (r() - 0.5) * 1.6 * dt;
      this.wanderDir.y += (r() - 0.5) * 0.8 * dt;
      this.wanderDir.z += (r() - 0.5) * 1.6 * dt;
      if (this.wanderDir.lengthSq() < 1e-5) this.wanderDir.set(r() - 0.5, 0, r() - 0.5);
      this.wanderDir.normalize();
      acc.addScaledVector(this.wanderDir, this.maxSpeed * 0.85);
    }

    if (this.caught) {
      want = _a.copy(this.target).sub(this.pos);
      acc.addScaledVector(want.normalize(), this.maxSpeed * 6);
    }

    // --- слой глубины ---
    const yMid = (this.yMin + this.yMax) / 2;
    let yWant = yMid;
    if (this.state === 'seek' && this.foodTarget) yWant = clamp(this.foodTarget.pos.y, this.bounds.yMin, this.bounds.yMax);
    if (this.state === 'flee') yWant = clamp(this.pos.y + (this.pos.y > yMid ? 0.6 : -0.6), this.yMin, this.yMax);
    const dy = yWant - this.pos.y;
    acc.y += clamp(dy, -1.2, 1.2) * this.maxSpeed * 1.15;

    // --- стены ---
    const push = 2.6 * this.maxSpeed;
    const mg = 0.9;
    if (this.pos.x < b.xMin + mg) acc.x += push * (1 - (this.pos.x - b.xMin) / mg);
    if (this.pos.x > b.xMax - mg) acc.x -= push * (1 - (b.xMax - this.pos.x) / mg);
    if (this.pos.z < b.zMin + mg) acc.z += push * (1 - (this.pos.z - b.zMin) / mg);
    if (this.pos.z > b.zMax - mg) acc.z -= push * (1 - (b.zMax - this.pos.z) / mg);
    if (this.pos.y < b.yMin + 0.45) acc.y += push * 1.2 * (1 - (this.pos.y - b.yMin) / 0.45);
    if (this.pos.y > b.yMax - 0.45) acc.y -= push * 1.2 * (1 - (b.yMax - this.pos.y) / 0.45);

    // --- стая ---
    if (spec.school) {
      let sepX = 0, sepY = 0, sepZ = 0, aliX = 0, aliY = 0, aliZ = 0, cohX = 0, cohY = 0, cohZ = 0, n = 0;
      const sepR = this.len * 1.5, nR = this.len * 6;
      for (const o of w.fishes) {
        if (o === this || o.spec.school !== spec.school) continue;
        const dx = this.pos.x - o.pos.x, dy = this.pos.y - o.pos.y, dz = this.pos.z - o.pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > nR * nR || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        if (d < sepR) { const k = (sepR - d) / sepR / d; sepX += dx * k; sepY += dy * k; sepZ += dz * k; }
        aliX += o.vel.x; aliY += o.vel.y; aliZ += o.vel.z;
        cohX += o.pos.x; cohY += o.pos.y; cohZ += o.pos.z;
        n++;
      }
      if (n) {
        const s = this.maxSpeed;
        acc.x += sepX * s * 2.4; acc.y += sepY * s * 1.6; acc.z += sepZ * s * 2.4;
        aliX /= n; aliY /= n; aliZ /= n;
        acc.x += (aliX - this.vel.x) * 1.6; acc.y += (aliY - this.vel.y) * 1.2; acc.z += (aliZ - this.vel.z) * 1.6;
        cohX = cohX / n - this.pos.x; cohY = cohY / n - this.pos.y; cohZ = cohZ / n - this.pos.z;
        acc.x += cohX * 0.55; acc.y += cohY * 0.35; acc.z += cohZ * 0.55;
      }
    } else {
      // личная дистанция для одиночных рыб
      for (const o of w.fishes) {
        if (o === this) continue;
        const dx = this.pos.x - o.pos.x, dy = this.pos.y - o.pos.y, dz = this.pos.z - o.pos.z;
        const rr = this.radius + o.radius + 0.22;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) {
          const d = Math.sqrt(d2), k = (rr - d) / rr / d * this.maxSpeed * 2.2;
          acc.x += dx * k; acc.y += dy * k; acc.z += dz * k;
        }
      }
    }

    // --- ограничение ---
    this.vel.addScaledVector(acc, dt);
    let sp = this.vel.length();
    const cap = this.caught ? this.maxSpeed * 0.8 : maxSpeed;
    if (sp > cap) { this.vel.multiplyScalar(cap / sp); sp = cap; }
    const floor = this.caught ? 0 : this.minSpeed * calm * (this.state === 'rest' ? 0.35 : 1);
    if (sp < floor) {
      if (sp < 1e-5) this.vel.copy(this.wanderDir).multiplyScalar(floor);
      else this.vel.multiplyScalar(floor / sp);
      sp = floor;
    }
    return sp;
  }

  /* ----------------Orientация ---------------- */
  orient(dt, camera) {
    const sp = this.vel.length();
    if (sp > 1e-4) {
      _c.copy(this.vel).normalize();
      // крен в повороте
      _right.crossVectors(_up, _c);
      if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
      _right.normalize();
      _realUp.crossVectors(_c, _right).normalize();
      const turn = _right.dot(this.lastDir || _up);
      this.bank = damp(this.bank || 0, clamp(-turn * 1.4, -0.55, 0.55) + Math.sin(this.phase * 2) * 0.03, 3.2, dt);
      const ca = Math.cos(this.bank), sa = Math.sin(this.bank);
      const rx = _right.x * ca + _realUp.x * sa, ry = _right.y * ca + _realUp.y * sa, rz = _right.z * ca + _realUp.z * sa;
      const ux = _realUp.x * ca - _right.x * sa, uy = _realUp.y * ca - _right.y * sa, uz = _realUp.z * ca - _right.z * sa;
      _m.makeBasis(
        _a.set(rx, ry, rz),
        _b.set(ux, uy, uz),
        _c
      );
      _q.setFromRotationMatrix(_m);
      const k = 1 - Math.exp(-Math.min(6, this.turnRate * 1.4) * dt);
      this.quat.slerp(_q, k);
      if (!this.lastDir) this.lastDir = new THREE.Vector3();
      this.lastDir.copy(_c);
    }
    this.root.quaternion.copy(this.quat);
  }

  animateEyes(camera) {
    if (!this.eyes) return;
    _a.copy(camera.position).sub(this.pos).applyQuaternion(_q.copy(this.quat).invert());
    for (const e of this.eyes) e.pupil.position.copy(_a).normalize().multiplyScalar(e.r * 0.52);
  }

  /* ---------------- главный шаг ---------------- */
  update(dt, w, camera) {
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) { this.thinkTimer = 0.35 + this.rng() * 0.3; this.think(); }
    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0 && (this.state === 'seek' || this.state === 'curious' || this.state === 'home' || this.state === 'suck' || this.state === 'rest')) {
        this.state = 'wander'; this.foodTarget = null;
      }
      if (this.stateTimer <= 0 && this.state === 'flee') { this.fleeFrom = null; this.state = 'wander'; }
      if (this.foodTarget && (this.foodTarget.eaten || !this.foodTarget.active)) this.foodTarget = null;
    }

    const sp = this.steer(dt);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.clamp(this._lo, this._hi);

    // сытость и дефекация
    this.satiety = clamp(this.satiety - dt * 0.0022 * (1 + 0.6 * (sp / this.maxSpeed)), 0, 1);
    this.stress = Math.max(0, this.stress - dt * 0.16);
    if (this.state === 'flee' || this.stress > 0.55) this.mood = 'в панике';
    else if (this.caught) this.mood = 'в сачке!';
    else if (this.state === 'seek') this.mood = 'гонится за кормом';
    else if (this.satiety > 0.86) this.mood = 'объелась';
    else if (this.satiety < 0.22) this.mood = 'голодна';
    else if (this.state === 'rest') this.mood = 'дремлет на дне';
    else if (this.state === 'curious') this.mood = 'разглядывает тебя';
    else if (this.state === 'suck') this.mood = 'скребёт стекло';
    else this.mood = 'спокойна';

    this.poopTimer -= dt * (this.satiety > 0.2 ? 1 : 0.15);
    if (this.poopTimer <= 0) {
      this.poopTimer = randRange(13, 28, this.rng) / Math.max(0.25, this.satiety);
      if (this.satiety > 0.18) w.spawnPoop(this.pos, this.len);
    }

    // надувание фугу
    if (this.puffTimer > 0) { this.puffTimer -= dt; if (this.puffTimer <= 0) this.puffTarget = 1; }
    this.puff = damp(this.puff, this.puffTarget, this.puffTarget > 1 ? 4.5 : 1.2, dt);
    this.uniforms.uPuff.value = this.puff;

    // анимация плавания
    const ratio = clamp(sp / this.maxSpeed, 0, 2);
    const beat = (1.1 + ratio * 2.0) * (0.9 / Math.max(0.28, this.len));
    this.phase += dt * beat;
    this.uniforms.uTime.value = this.phase;
    this.uniforms.uSwim.value = (0.28 + ratio * 0.85) * (1 + this.stress * 0.45);
    this.uniforms.uAmp.value = this.spec.len * (0.13 + 0.05 * this.stress);

    this.orient(dt, camera);
    this.root.position.copy(this.pos);

    // поедание корма
    if (this.satiety < 0.95) {
      const er = (this.state === 'seek' ? this.eatRadius * 1.8 : this.eatRadius * 1.15);
      const e2 = er * er;
      let fed = false;
      for (const f of w.foods) {
        if (f.eaten) continue;
        if (f.pos.distanceToSquared(this.pos) < e2) {
          w.eat(f, this);
          fed = true;
          if (!this.spec.bottomFeeder) break;
        }
      }
      // донные обитатели подбирают и мусор — работают санитарками
      if (!fed && this.spec.bottomFeeder && w.scavenge && this.satiety < 0.9) {
        for (const d of w.scavenge) {
          if (d.eaten) continue;
          if (d.pos.distanceToSquared(this.pos) < e2 * 1.4) {
            w.eatScavenge && w.eatScavenge(d, this);
            break;
          }
        }
      }
    }
  }
}

/* ---------- стая/набор рыб ---------- */
export function populate(world, rng) {
  for (const spec of world.species) {
    for (let i = 0; i < spec.count; i++) {
      const f = new Fish(spec, world, rng);
      world.fishes.push(f);
      world.scene.add(f.root);
    }
  }
}
