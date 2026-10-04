/* ============================================================
   species.js — 10 пород рыб. Всё рисуется процедурно: профиль
   тела, плавники, узор чешуи, характер.
   ============================================================ */

/* Профили: 9 точек от носа (u=0) к основанию хвоста (u=1),
   значения — доли от длины тела L. */
const P = {
  fusiform: {
    top: [.09, .25, .33, .35, .32, .26, .17, .09, .03],
    bottom: [.08, .21, .30, .32, .29, .22, .13, .06, .02],
    width: [.055, .14, .20, .22, .20, .16, .10, .055, .022],
    center: [.02, .03, .02, -.01, -.03, -.03, -.02, -.01, .0]
  },
  oval: {
    top: [.10, .28, .40, .44, .40, .32, .20, .10, .03],
    bottom: [.09, .26, .38, .41, .37, .28, .17, .08, .03],
    width: [.06, .14, .19, .21, .19, .15, .10, .05, .025],
    center: [.02, .03, 0, -.03, -.05, -.04, -.02, -.01, 0]
  },
  disc: { // скалярия / хирург — высокое плоское тело
    top: [.08, .30, .50, .54, .48, .36, .20, .09, .03],
    bottom: [.07, .27, .46, .50, .44, .32, .17, .08, .03],
    width: [.05, .10, .13, .14, .13, .10, .07, .04, .02],
    center: [.02, .02, -.02, -.05, -.06, -.04, -.02, -.01, 0]
  },
  chubby: { // золотая рыбка, фугу
    top: [.12, .32, .42, .44, .40, .32, .20, .10, .04],
    bottom: [.12, .34, .46, .48, .44, .34, .20, .10, .04],
    width: [.08, .20, .28, .30, .27, .21, .13, .07, .03],
    center: [.03, .04, .01, -.03, -.05, -.04, -.02, -.01, 0]
  },
  puffer: {
    top: [.16, .38, .46, .44, .40, .32, .20, .10, .05],
    bottom: [.16, .40, .48, .46, .41, .32, .19, .09, .05],
    width: [.12, .30, .37, .36, .32, .25, .15, .08, .04],
    center: [.04, .03, 0, -.02, -.03, -.03, -.02, -.01, 0]
  },
  flat: { // сомик-прилипала
    top: [.10, .26, .32, .30, .26, .20, .12, .06, .02],
    bottom: [.06, .13, .16, .15, .13, .10, .06, .03, .01],
    width: [.10, .22, .26, .25, .22, .17, .10, .05, .02],
    center: [-.02, -.02, -.04, -.06, -.07, -.06, -.04, -.02, 0]
  },
  slender: { // данио
    top: [.08, .22, .28, .29, .27, .22, .14, .07, .02],
    bottom: [.07, .19, .25, .26, .24, .19, .11, .05, .02],
    width: [.05, .12, .16, .17, .15, .12, .07, .04, .018],
    center: [.02, .02, .01, -.02, -.03, -.03, -.02, -.01, 0]
  }
};

export const SPECIES = [
  {
    id: 'neon', ru: 'Неон', latin: 'Paracheirodon', seed: 12,
    len: 0.40, simple: true, school: 'neons', count: 15,
    profile: P.slender, paintEyes: true, scales: 0,
    colors: { back: '#12303f', mid: '#7f93a6', belly: '#dfe6e6' },
    pattern: { type: 'neon', band: [0.44, 0.55], bandColor: '#54e0ff', glow: 'rgba(60,205,255,0.95)',
      rear: [0.55], rearColor: 'rgba(226,52,52,0.9)' },
    fins: {
      caudal: { kind: 'fork', h: 0.20, len: 0.24, tint: 0.75 },
      dorsal: { a0: 0.02, a1: 0.16, h: 0.10 },
      anal: { a0: -0.14, a1: -0.02, h: 0.07 },
      pectoral: { size: 0.10, splay: 55 }
    },
    speed: 1.15, skittish: 1.0, curiosity: 0.1, greed: 0.6,
    layer: [0.30, 0.75], restless: 0.6
  },
  {
    id: 'guppy', ru: 'Гуппи', latin: 'Poecilia reticulata', seed: 31,
    len: 0.32, simple: false, count: 3,
    profile: P.slender, paintEyes: false, scales: 0.15,
    colors: { back: '#2f4a6b', mid: '#6fa8c8', belly: '#f0e4c8' },
    pattern: { type: 'mottle', count: 26, color: 'rgba(255,150,60,0.75)' },
    fins: {
      caudal: { kind: 'veil', h: 0.26, len: 0.36, tex: { root: '#ffb054', edge: 'rgba(255,90,90,0.35)', rays: 'rgba(255,255,255,0.35)', rayCount: 14, spots: { count: 22, color: '#ff5a5a' } } },
      dorsal: { a0: -0.02, a1: 0.12, h: 0.10, tex: { root: '#ffcf8a', edge: 'rgba(255,140,80,0.3)' } },
      anal: { a0: -0.12, a1: 0.0, h: 0.06 },
      pectoral: { size: 0.09, splay: 60 }
    },
    speed: 0.85, skittish: 0.6, curiosity: 0.55, greed: 1.0,
    layer: [0.35, 0.8]
  },
  {
    id: 'clown', ru: 'Рыбка-клоун', latin: 'Amphiprion ocellaris', seed: 7,
    len: 0.52, simple: false, count: 3,
    profile: P.oval, paintEyes: false, scales: 0.18,
    colors: { back: '#e06a12', mid: '#f4841c', belly: '#ffb15c' },
    pattern: { type: 'bands', bands: [
      { u: 0.20, w: 0.075, color: '#f7f3ea', edge: 'rgba(20,20,20,0.55)' },
      { u: 0.52, w: 0.115, color: '#f7f3ea', edge: 'rgba(20,20,20,0.55)' },
      { u: 0.80, w: 0.06, color: '#f7f3ea', edge: 'rgba(20,20,20,0.55)' }
    ] },
    fins: {
      caudal: { kind: 'round', h: 0.19, len: 0.19, tex: { root: '#f79a3a', edge: 'rgba(247,243,234,0.6)' } },
      dorsal: { a0: 0.06, a1: -0.24, h: 0.14, tex: { root: '#f4841c', edge: 'rgba(250,240,220,0.55)' } },
      anal: { a0: -0.04, a1: -0.24, h: 0.10, tex: { root: '#f4841c', edge: 'rgba(250,240,220,0.55)' } },
      pectoral: { size: 0.13, splay: 62 }
    },
    speed: 0.75, skittish: 0.75, curiosity: 0.4, greed: 0.8,
    layer: [0.18, 0.55], home: 'anemone'
  },
  {
    id: 'tang', ru: 'Хирург', latin: 'Paracanthurus', seed: 88,
    len: 0.72, simple: false, count: 2,
    profile: P.disc, paintEyes: false, scales: 0.22,
    colors: { back: '#114a8f', mid: '#2f7fd6', belly: '#6fb2ea' },
    pattern: { type: 'gradientU', at: [0.62, 0.95], color: '#ffd21f' },
    fins: {
      caudal: { kind: 'spade', h: 0.22, len: 0.24, tex: { root: '#ffd21f', edge: 'rgba(255,210,31,0.55)' } },
      dorsal: { a0: 0.10, a1: -0.30, h: 0.16, tex: { root: '#1c5fae', edge: 'rgba(30,70,140,0.5)' } },
      anal: { a0: 0.02, a1: -0.32, h: 0.14, tex: { root: '#12386e', edge: 'rgba(20,50,110,0.5)' } },
      pectoral: { size: 0.16, splay: 58 }
    },
    speed: 1.0, skittish: 0.6, curiosity: 0.9, greed: 0.7,
    layer: [0.35, 0.8]
  },
  {
    id: 'angel', ru: 'Скалярия', latin: 'Pterophyllum', seed: 55,
    len: 0.78, simple: false, count: 2,
    profile: P.disc, paintEyes: false, scales: 0.25,
    colors: { back: '#5f6a74', mid: '#c8ccd0', belly: '#eef0f2' },
    pattern: { type: 'bands', bands: [
      { u: 0.14, w: 0.07, color: '#14161a' },
      { u: 0.42, w: 0.13, color: '#14161a' },
      { u: 0.72, w: 0.09, color: 'rgba(20,22,26,0.75)' }
    ] },
    fins: {
      caudal: { kind: 'spade', h: 0.26, len: 0.26, tex: { root: '#8c949c', edge: 'rgba(230,235,240,0.45)' } },
      dorsal: { a0: 0.14, a1: -0.34, h: 0.34, tex: { root: '#7d858d', edge: 'rgba(240,245,250,0.4)' } },
      anal: { a0: 0.06, a1: -0.36, h: 0.30, tex: { root: '#6d757d', edge: 'rgba(240,245,250,0.4)' } },
      pectoral: { size: 0.15, splay: 64 },
      ventral: { a0: -0.02, a1: -0.30, h: 0.42, tex: { root: '#d8dce0', edge: 'rgba(255,255,255,0.2)' } }
    },
    speed: 0.62, skittish: 0.5, curiosity: 0.6, greed: 0.5,
    layer: [0.25, 0.7]
  },
  {
    id: 'betta', ru: 'Петушок', latin: 'Betta splendens', seed: 3,
    len: 0.56, simple: false, count: 1,
    profile: P.fusiform, paintEyes: false, scales: 0.3,
    colors: { back: '#1b1a5e', mid: '#3a2f9e', belly: '#7b3fbf' },
    pattern: { type: 'mottle', count: 18, color: 'rgba(220,60,120,0.55)' },
    fins: {
      caudal: { kind: 'veil', h: 0.42, len: 0.52, tex: { root: '#4a2fae', edge: 'rgba(180,60,200,0.32)', rays: 'rgba(255,180,255,0.28)', rayCount: 20 } },
      dorsal: { a0: 0.10, a1: -0.26, h: 0.30, tex: { root: '#3a2f9e', edge: 'rgba(150,60,190,0.35)' } },
      anal: { a0: 0.02, a1: -0.34, h: 0.32, tex: { root: '#331f8a', edge: 'rgba(160,60,190,0.32)' } },
      pectoral: { size: 0.16, splay: 70, tex: { root: '#6a4fc0', edge: 'rgba(200,120,255,0.3)' } },
      ventral: { a0: 0.0, a1: -0.26, h: 0.30, tex: { root: '#3a2f9e', edge: 'rgba(190,80,210,0.3)' } }
    },
    speed: 0.55, skittish: 0.35, curiosity: 0.75, greed: 0.9, aggression: 1.0,
    layer: [0.45, 0.9]
  },
  {
    id: 'gold', ru: 'Золотая рыбка', latin: 'Carassius auratus', seed: 21,
    len: 0.66, simple: false, count: 2,
    profile: P.chubby, paintEyes: false, scales: 0.3,
    colors: { back: '#c2560c', mid: '#f28c1c', belly: '#fde7c4' },
    pattern: { type: 'mottle', count: 16, color: 'rgba(255,255,255,0.55)' },
    fins: {
      caudal: { kind: 'double', h: 0.34, len: 0.40, tex: { root: '#f08a24', edge: 'rgba(255,225,180,0.35)' } },
      dorsal: { a0: 0.12, a1: -0.26, h: 0.24, tex: { root: '#ef8a22', edge: 'rgba(255,220,170,0.4)' } },
      anal: { a0: -0.02, a1: -0.24, h: 0.16 },
      pectoral: { size: 0.16, splay: 62 }
    },
    speed: 0.9, skittish: 0.25, curiosity: 0.95, greed: 1.4, tame: true,
    layer: [0.25, 0.7]
  },
  {
    id: 'puffer', ru: 'Фугу', latin: 'Takifugu', seed: 66,
    len: 0.58, simple: false, count: 1,
    profile: P.puffer, paintEyes: false, scales: 0,
    colors: { back: '#6b5a38', mid: '#c9b98d', belly: '#f2ead6' },
    pattern: { type: 'spots', count: 44, color: 'rgba(60,48,30,0.8)' },
    fins: {
      caudal: { kind: 'round', h: 0.20, len: 0.20, tex: { root: '#c9b98d', edge: 'rgba(220,210,180,0.4)' } },
      dorsal: { a0: -0.10, a1: -0.26, h: 0.12 },
      anal: { a0: -0.14, a1: -0.28, h: 0.11 },
      pectoral: { size: 0.15, splay: 72 }
    },
    speed: 0.55, skittish: 0.9, curiosity: 0.85, greed: 0.8, puffer: true,
    layer: [0.3, 0.75]
  },
  {
    id: 'zebra', ru: 'Данио', latin: 'Danio rerio', seed: 44,
    len: 0.34, simple: true, school: 'zebras', count: 9,
    profile: P.slender, paintEyes: true, scales: 0,
    colors: { back: '#25404f', mid: '#8fa6ad', belly: '#e2ebe8' },
    pattern: { type: 'sideStripes', stripes: [
      { v: 0.06, w: 0.045, color: '#1e6f8f' }, { v: 0.16, w: 0.04, color: '#1e6f8f' },
      { v: 0.30, w: 0.045, color: '#1e6f8f' }, { v: 0.42, w: 0.04, color: '#1e6f8f' },
      { v: 0.56, w: 0.045, color: '#1e6f8f' }, { v: 0.68, w: 0.04, color: '#1e6f8f' },
      { v: 0.82, w: 0.045, color: '#1e6f8f' }
    ] },
    fins: {
      caudal: { kind: 'fork', h: 0.18, len: 0.22, tint: 0.7 },
      dorsal: { a0: 0.0, a1: 0.12, h: 0.09 },
      anal: { a0: -0.12, a1: -0.02, h: 0.08 },
      pectoral: { size: 0.08, splay: 55 }
    },
    speed: 1.35, skittish: 1.0, curiosity: 0.25, greed: 0.9,
    layer: [0.68, 0.95]
  },
  {
    id: 'pleco', ru: 'Анциструс', latin: 'Pterygoplichthys', seed: 99,
    len: 0.70, simple: false, count: 2,
    profile: P.flat, paintEyes: false, scales: 0.35,
    colors: { back: '#221c18', mid: '#3d322b', belly: '#6a5b4c' },
    pattern: { type: 'spots', count: 60, color: 'rgba(220,200,160,0.55)' },
    fins: {
      caudal: { kind: 'fan', h: 0.26, len: 0.26, tex: { root: '#3d322b', edge: 'rgba(120,100,80,0.4)' } },
      dorsal: { a0: 0.04, a1: -0.16, h: 0.18, tex: { root: '#33291f', edge: 'rgba(110,95,75,0.4)' } },
      anal: { a0: -0.12, a1: -0.24, h: 0.10 },
      pectoral: { size: 0.19, splay: 82 }
    },
    speed: 0.4, skittish: 0.4, curiosity: 0.3, greed: 1.6, bottomFeeder: true,
    layer: [0.0, 0.14]
  }
];

export function speciesById(id) { return SPECIES.find((s) => s.id === id); }
