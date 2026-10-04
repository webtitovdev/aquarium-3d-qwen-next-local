/* ============================================================
   food.js — корм, объедки и «кал»: инстансовые системы частиц
   с простой физикой воды и вкладом в мутность воды.
   ============================================================ */
import * as THREE from 'three';
import { TANK, TAU, clamp, randRange, makeRng } from './config.js';

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();

class CrumbSystem {
  constructor(opts) {
    this.opts = opts;
    this.max = opts.max;
    this.rng = makeRng(opts.seed || 77);
    this.list = [];
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color, roughness: opts.roughness === undefined ? 0.75 : opts.roughness,
      emissive: opts.emissive || 0x000000, emissiveIntensity: opts.emissiveIntensity || 0
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = opts.name;
    this.items = [];
    for (let i = 0; i < this.max; i++) {
      this.items.push({
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.05,
        rot: new THREE.Euler(), spin: new THREE.Vector3(), age: 0, life: 1e9,
        active: false, eaten: false, resting: false, idx: i, float: 0
      });
      _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(pos, opts = {}) {
    const it = this.items.find((x) => !x.active);
    if (!it) return null;
    const rng = this.rng, o = this.opts;
    it.active = true; it.eaten = false; it.resting = false;
    it.age = 0;
    it.pos.copy(pos).add(new THREE.Vector3(randRange(rng, -0.12, 0.12), randRange(rng, -0.05, 0.05), randRange(rng, -0.12, 0.12)));
    it.r = randRange(rng, o.size[0], o.size[1]);
    it.life = randRange(rng, o.life[0], o.life[1]);
    it.float = opts.float ? randRange(rng, 1.2, 3.4) : 0;
    it.vel.set(randRange(rng, -0.25, 0.25), opts.vy === undefined ? 0 : opts.vy, randRange(rng, -0.25, 0.25));
    it.spin.set(randRange(rng, -3, 3), randRange(rng, -3, 3), randRange(rng, -3, 3));
    it.rot.set(rng() * TAU, rng() * TAU, rng() * TAU);
    this.list.push(it);
    return it;
  }

  kill(it) {
    it.active = false; it.eaten = true;
    const k = this.list.indexOf(it);
    if (k >= 0) this.list.splice(k, 1);
    _m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(it.idx, _m);
  }

  update(dt, world) {
    const o = this.opts, rng = this.rng;
    const floor = world.sandTop + (o.floorPad || 0.04);
    for (let i = 0; i < this.list.length; i++) {
      const it = this.list[i];
      it.age += dt;

      if (it.float > 0) {
        // держится у поверхности
        it.float -= dt;
        it.vel.y = damp3(it.vel.y, 0, 2, dt);
        it.pos.x += it.vel.x * dt; it.pos.z += it.vel.z * dt;
        it.pos.y = TANK.waterTop - 0.10 + Math.sin((world.time + it.idx) * 1.7) * 0.03;
      } else if (!it.resting) {
        it.vel.y = damp3(it.vel.y, -o.sink, 1.6, dt);
        // лёгкое течение
        it.vel.x += Math.sin(world.time * 0.3 + it.pos.y) * 0.05 * dt;
        it.vel.z += Math.cos(world.time * 0.24 + it.pos.x * 0.4) * 0.05 * dt;
        it.pos.addScaledVector(it.vel, dt);
        if (it.pos.y <= floor) { it.pos.y = floor; it.resting = true; it.vel.set(0, 0, 0); }
      }
      if (it.resting) {
        // по течению по дну почти не несёт
        it.pos.x += Math.sin(world.time * 0.2) * 0.002;
      }
      // границы
      if (it.pos.x < -TANK.hx + 0.15) it.pos.x = -TANK.hx + 0.15;
      if (it.pos.x > TANK.hx - 0.15) it.pos.x = TANK.hx - 0.15;
      if (it.pos.z < -TANK.hz + 0.15) it.pos.z = -TANK.hz + 0.15;
      if (it.pos.z > TANK.hz - 0.15) it.pos.z = TANK.hz - 0.15;

      it.rot.x += it.spin.x * dt; it.rot.y += it.spin.y * dt; it.rot.z += it.spin.z * dt;
      if (!it.resting) { it.spin.x *= 0.995; it.spin.y *= 0.995; it.spin.z *= 0.995; }

      // растворение
      let scale = it.r;
      const tail = it.life - 6;
      if (it.age > tail) {
        const k = clamp(1 - (it.age - tail) / 6, 0, 1);
        scale = it.r * k;
        if (world.addTurbidity) world.addTurbidity(o.turbidity * dt);
        if (k <= 0.02) { it.dying = true; }
      } else if (it.age > it.life * 0.4 && world.addTurbidity) {
        world.addTurbidity(o.turbidity * dt * 0.35);
      }
      if (it.age >= it.life) it.dying = true;

      _q.setFromEuler(it.rot);
      _s.set(scale, scale * (o.flat ? 0.6 : 1), scale);
      _m.compose(it.pos, _q, _s);
      this.mesh.setMatrixAt(it.idx, _m);
    }
    // удаление отработавших (идём с конца)
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].dying) { this.list[i].dying = false; this.kill(this.list[i]); }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (let i = this.list.length - 1; i >= 0; i--) { this.list[i].dying = false; this.kill(this.list[i]); }
  }
}
const damp3 = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

/* ============================================================ */
export function buildFoodSystem(scene, world) {
  const food = new CrumbSystem({
    max: 70, name: 'food', color: 0xb2703a, emissive: 0x2a1000, emissiveIntensity: 0.5,
    size: [0.045, 0.075], life: [38, 70], sink: 0.34, turbidity: 0.0026, seed: 31337
  });
  const debris = new CrumbSystem({
    max: 45, name: 'debris', color: 0x6b5334, roughness: 0.95,
    size: [0.03, 0.05], life: [40, 75], sink: 0.18, turbidity: 0.0003, flat: true, seed: 4242
  });
  scene.add(food.mesh, debris.mesh);

  return {
    food, debris,
    // бросок корма на поверхность у точки pos
    drop(pos, count = 6) {
      let made = 0, refused = 0;
      for (let i = 0; i < count; i++) {
        const it = food.spawn(pos, { vy: randRange(food.rng, -0.1, 0.15), float: i < count * 0.55 });
        if (it) made++; else refused++;
      }
      // излишек, который не уместился в кадке, сразу расходится мутью
      if (refused && world.addTurbidity) world.addTurbidity(refused * 0.004);
      return made;
    },
    poop(pos, fishLen) {
      const it = debris.spawn(pos, { vy: -0.05 });
      if (it) { it.r *= 0.9; it.pos.y = Math.min(it.pos.y, pos.y); }
      return it;
    },
    update(dt) { food.update(dt, world); debris.update(dt, world); },
    get count() { return food.list.length; }
  };
}
