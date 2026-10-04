/* ============================================================
   config.js — глобальные константы сцены + мелкие математические
   хелперы и детерминированный ГПСЧ.
   ============================================================ */

export const TANK = {
  // Внутренние полудиаметры аквариума (пол на y = 0).
  hx: 7.1,          // ширина  (x)
  hz: 4.7,          // глубина (z)
  hy: 8.6,          // верх стекла
  waterTop: 7.75,   // уровень воды
  sand: 0.45,       // высота грунта
  glass: 0.14,      // толщина стекла
  frame: 0.34       // ширина металлической рамки
};

// Область, в которой плавают рыбы (с учётом запаса по размерам).
export function swimBounds(fishRadius = 0.3) {
  const m = fishRadius + 0.22;
  const minX = -TANK.hx + m, maxX = TANK.hx - m;
  const minY = TANK.sand + 0.22 + m * 0.6, maxY = TANK.waterTop - 0.30 - m * 0.5;
  const minZ = -TANK.hz + m, maxZ = TANK.hz - m;
  return {
    minX, maxX, minY, maxY, minZ, maxZ,
    xMin: minX, xMax: maxX, yMin: minY, yMax: maxY, zMin: minZ, zMax: maxZ
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Кадронезависимое сглаживание (exponential damp).
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;

// Детерминированный ГПСЧ (mulberry32).
export function makeRng(seed = 1337) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Случайное число в диапазоне. Порядок аргументов терпимый:
   randRange(rng, a, b) или randRange(a, b, rng). */
export function randRange(a, b, c) {
  const rng = typeof a === 'function' ? a : c;
  const lo = typeof a === 'function' ? b : a;
  const hi = typeof a === 'function' ? c : b;
  return lo + (hi - lo) * rng();
}
export function randInt(a, b, c) {
  const rng = typeof a === 'function' ? a : c;
  const lo = typeof a === 'function' ? b : a;
  const hi = typeof a === 'function' ? c : b;
  return Math.floor(lo + (hi - lo + 1) * rng());
}
export function pick(a, b, c) {
  const rng = typeof a === 'function' ? a : c;
  const arr = typeof a === 'function' ? b : a;
  return arr[Math.floor(rng() * arr.length) % arr.length];
}
export function randSphereDir(rngOrOut, out) {
  const rng = typeof rngOrOut === 'function' ? rngOrOut : rngOrOut.rng;
  const o = out || rngOrOut;
  const u = rng() * 2 - 1, th = rng() * TAU, s = Math.sqrt(1 - u * u);
  o.set(s * Math.cos(th), u, s * Math.sin(th));
  return o;
}

// Имена рыб — да, у них у всех есть имена.
export const FISH_NAMES = [
  'Искра', 'Пузырик', 'Бархат', 'Гром', 'Валенок', 'Соня', 'Перчик', 'Тучка',
  'Мохнатик', 'Зефир', 'Комета', 'Бублик', 'Шпрота', 'Мурза', 'Лучик', 'Кузя',
  'Пельмень', 'Капель', 'Шаурма', 'Гарик', 'Норка', 'Плюшка', 'Сироп', 'Ёжик',
  'Клякса', 'Ватрушка', 'Лимон', 'Тень', 'Жасмин', 'Пончик'
];
