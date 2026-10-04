/* ============================================================
   ui.js — интерфейс: инструменты, состояние банки, подсказки.
   Всё на русском, собирается программно.
   ============================================================ */
import { clamp } from './config.js';

const CSS = `
:root{
  --ink:#e6f4ff; --dim:#9fc0d4; --edge:rgba(150,220,255,.20);
  --bg:rgba(6,20,28,.58); --bg2:rgba(10,30,40,.72); --hot:#7fd8ff;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:#05131b;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink)}
canvas{display:block;touch-action:none}
.hud{position:fixed;inset:0;pointer-events:none;z-index:10;user-select:none}
.hud .card{pointer-events:auto}
.card{background:var(--bg);border:1px solid var(--edge);border-radius:14px;
  backdrop-filter:blur(9px) saturate(1.2);-webkit-backdrop-filter:blur(9px) saturate(1.2);
  box-shadow:0 10px 34px rgba(0,0,0,.35)}
#top{position:absolute;left:16px;top:14px;padding:11px 14px 12px;max-width:min(46vw,430px)}
#top h1{margin:0 0 2px;font-size:15px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--hot);font-weight:650;display:flex;gap:8px;align-items:center}
#top h1 .bub{font-size:13px;animation:bub 3.2s infinite ease-in-out}
@keyframes bub{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
#top .sub{font-size:11.5px;color:var(--dim);margin-bottom:9px}
#stats{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;font-size:12px;align-items:center}
#stats .k{color:var(--dim);white-space:nowrap}
#stats .bar{position:relative;height:7px;border-radius:6px;background:rgba(255,255,255,.10);overflow:hidden;min-width:120px}
#stats .bar i{position:absolute;inset:0 auto 0 0;border-radius:6px;transition:width .35s ease}
#stats .v{font-variant-numeric:tabular-nums;color:var(--ink)}
#tools{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);
  display:flex;gap:8px;padding:9px;align-items:center}
.btn{pointer-events:auto;cursor:pointer;border:1px solid var(--edge);background:var(--bg2);color:var(--ink);
  border-radius:11px;padding:8px 12px;font-size:12.5px;line-height:1.15;display:flex;flex-direction:column;
  align-items:center;gap:3px;min-width:66px;transition:transform .12s ease,border-color .2s,background .2s,box-shadow .2s}
.btn .i{font-size:19px;line-height:1}
.btn .l{font-size:11px;letter-spacing:.02em;opacity:.9}
.btn .k{font-size:9.5px;color:var(--dim);border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:0 4px}
.btn:hover{transform:translateY(-2px);border-color:rgba(160,230,255,.5);box-shadow:0 6px 18px rgba(0,120,190,.28)}
.btn.on{background:linear-gradient(180deg,rgba(60,150,200,.42),rgba(20,60,90,.5));
  border-color:rgba(160,235,255,.85);box-shadow:0 0 0 1px rgba(160,235,255,.25),0 8px 22px rgba(0,140,210,.35)}
.btn.mini{min-width:auto;flex-direction:row;gap:7px;padding:7px 11px}
#right{position:absolute;right:16px;top:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
#right .row{display:flex;gap:8px}
#toast{position:absolute;left:50%;top:16px;transform:translate(-50%,-16px);opacity:0;
  padding:9px 16px;font-size:13.5px;border-radius:999px;transition:opacity .25s,transform .25s;
  background:rgba(10,34,46,.82);border:1px solid rgba(160,230,255,.35);white-space:nowrap}
#toast.show{opacity:1;transform:translate(-50%,0)}
#tip{position:absolute;opacity:0;transition:opacity .18s;padding:8px 11px;font-size:12px;max-width:250px;
  background:rgba(6,22,30,.86);border:1px solid var(--edge);border-radius:10px;pointer-events:none}
#tip .n{font-size:13.5px;font-weight:650;color:var(--hot)}
#tip .s{color:var(--dim);font-size:11px;margin-top:1px}
#tip .m{margin-top:5px;font-size:11.5px}
#tip .sat{height:5px;border-radius:4px;background:rgba(255,255,255,.12);margin-top:6px;overflow:hidden}
#tip .sat i{display:block;height:100%;background:linear-gradient(90deg,#ffb35a,#7fe08a)}
#help{position:absolute;right:16px;bottom:18px;width:min(380px,42vw);padding:14px 16px;display:none;
  font-size:12.5px;line-height:1.6}
#help.show{display:block}
#help h2{margin:0 0 8px;font-size:13px;color:var(--hot);letter-spacing:.1em;text-transform:uppercase}
#help table{width:100%;border-collapse:collapse}
#help td{padding:2.5px 0;vertical-align:top}
#help td.k{width:118px;color:var(--dim);white-space:nowrap;font-variant-numeric:tabular-nums}
#help .close{position:absolute;right:10px;top:8px;cursor:pointer;opacity:.7;font-size:15px}
#help .close:hover{opacity:1}
#hint{position:absolute;left:16px;bottom:18px;font-size:11.5px;color:var(--dim);padding:8px 12px}
#hint b{color:var(--ink);font-weight:600}
#load{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(120% 100% at 50% 30%,#0d3245,#04101a 70%);transition:opacity .6s;
  font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#8fd0f0}
#load.gone{opacity:0;pointer-events:none}
#load .spin{width:38px;height:38px;border-radius:50%;border:2px solid rgba(140,220,255,.22);
  border-top-color:#8fd0f0;animation:sp 1s linear infinite;margin:0 auto 14px}
@keyframes sp{to{transform:rotate(360deg)}}
.warn{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:40;max-width:520px;
  padding:18px 22px;font-size:13px;line-height:1.6;background:rgba(40,10,10,.85);
  border:1px solid rgba(255,140,120,.4);border-radius:14px;display:none}
@media (max-width:760px){
  #top{max-width:64vw} #hint{display:none} #tools{bottom:10px;flex-wrap:wrap;justify-content:center}
  .btn{min-width:56px;padding:6px 8px} #help{width:70vw}
}
`;

export function createUI({ world, actions }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div class="card" id="top">
      <h1><span class="bub">🫧</span> Аквариум</h1>
      <div class="sub">Живая банка: рыбы кормятся, пугаются, прячутся и пачкают воду.</div>
      <div id="stats"></div>
    </div>
    <div class="card" id="tools"></div>
    <div id="right">
      <div class="row" id="row1"></div>
      <div class="row" id="row2"></div>
    </div>
    <div id="toast"></div>
    <div id="tip"></div>
    <div class="card" id="help">
      <div class="close" id="helpClose">✕</div>
      <h2>Как этим управлять</h2>
      <table>
        <tr><td class="k">Левая кнопка</td><td>выбранный инструмент: бросить корм, стукнуть по стеклу, посветить, зачерпнуть сачком</td></tr>
        <tr><td class="k">Правая кнопка</td><td>вращение камеры</td></tr>
        <tr><td class="k">Колесо мыши</td><td>приближение — можно подлететь прямо в воду</td></tr>
        <tr><td class="k">Двойной клик</td><td>следить камерой за рыбкой (Esc — отпустить)</td></tr>
        <tr><td class="k">1 2 3 4</td><td>Корм · Стук · Фонарик · Сачок</td></tr>
        <tr><td class="k">Пробел</td><td>пугнуть по стеклу там, где курсор</td></tr>
        <tr><td class="k">D</td><td>смена дня и ночи</td></tr>
        <tr><td class="k">C</td><td>подменить воду</td></tr>
        <tr><td class="k">+ / −</td><td>подселить / убрать рыбку</td></tr>
        <tr><td class="k">P</td><td>фото банки (PNG)</td></tr>
        <tr><td class="k">M</td><td>звук вкл/выкл</td></tr>
        <tr><td class="k">H</td><td>эта справка</td></tr>
      </table>
    </div>
    <div class="card" id="hint">Корми умеренно: мутная вода рыбам не нравится. Стучать по стеклу — <b>не стоит</b>, но рыбы реагируют красиво.</div>
  `;
  document.body.appendChild(hud);
  document.getElementById('hint').innerHTML =
    'Корми умеренно: от объедков вода мутнеет. Стучать по стеклу — <b>жестокость</b>, но рыбы реагируют красиво.';

  /* ---------- инструменты ---------- */
  const TOOLS = [
    { id: 'feed', key: '1', icon: '🍤', label: 'Корм' },
    { id: 'scare', key: '2', icon: '👊', label: 'Пугнуть' },
    { id: 'light', key: '3', icon: '🔦', label: 'Фонарик' },
    { id: 'net', key: '4', icon: '🥅', label: 'Сачок' }
  ];
  const toolsEl = document.getElementById('tools');
  const toolBtns = {};
  for (const t of TOOLS) {
    const b = document.createElement('div');
    b.className = 'btn';
    b.innerHTML = `<span class="i">${t.icon}</span><span class="l">${t.label}</span><span class="k">${t.key}</span>`;
    b.onclick = () => selectTool(t.id);
    toolsEl.appendChild(b);
    toolBtns[t.id] = b;
  }
  function selectTool(id) {
    world.tool = id;
    actions.setTool && actions.setTool(id);
    for (const k in toolBtns) toolBtns[k].classList.toggle('on', k === id);
  }

  /* ---------- правая колонка ---------- */
  const MINI = [
    { row: 'row1', id: 'daynight', icon: '🌗', label: 'День/ночь', key: 'D' },
    { row: 'row1', id: 'water', icon: '💧', label: 'Подмена', key: 'C' },
    { row: 'row2', id: 'add', icon: '＋', label: 'Рыбка', key: '+' },
    { row: 'row2', id: 'del', icon: '－', label: 'Убрать', key: '-' },
    { row: 'row2', id: 'shot', icon: '📷', label: 'Фото', key: 'P' },
    { row: 'row2', id: 'mute', icon: '🔊', label: 'Звук', key: 'M' }
  ];
  for (const m of MINI) {
    const b = document.createElement('div');
    b.className = 'btn mini';
    b.innerHTML = `<span class="i">${m.icon}</span><span class="l">${m.label}</span><span class="k">${m.key}</span>`;
    b.onclick = () => actions[m.id] && actions[m.id]();
    document.getElementById(m.row).appendChild(b);
    if (m.id === 'mute') toolBtns.__mute = b;
  }

  const statsEl = document.getElementById('stats');
  statsEl.innerHTML = `
    <span class="k">Рыб</span><span class="v" id="sFish">—</span>
    <span class="k">Сытость</span><span class="bar"><i id="sSat" style="width:50%;background:linear-gradient(90deg,#ffb35a,#7fe08a)"></i></span>
    <span class="k">Чистота</span><span class="bar"><i id="sCl" style="width:90%;background:linear-gradient(90deg,#e0795a,#6fd0ff)"></i></span>
    <span class="k">Время</span><span class="v" id="sCl2">—</span>
  `;
  const sFish = document.getElementById('sFish'), sSat = document.getElementById('sSat'),
    sCl = document.getElementById('sCl'), sCl2 = document.getElementById('sCl2');

  /* ---------- всплывающие подсказки ---------- */
  const toast = document.getElementById('toast');
  let toastTimer = 0;
  function notify(text, dur = 2) {
    toast.textContent = text;
    toast.classList.add('show');
    toastTimer = dur;
  }
  const tip = document.getElementById('tip');
  let lastHtml = '';
  function showTip(f, x, y) {
    if (!f) { tip.style.opacity = 0; lastHtml = ''; return; }
    const html = `<div class="n">${f.name}</div><div class="s">${f.spec.ru} · ${f.len.toFixed(2)} м</div>
      <div class="m">Настроение: <b>${f.mood}</b></div>
      <div class="sat"><i style="width:${Math.round(f.satiety * 100)}%"></i></div>`;
    if (html !== lastHtml) { tip.innerHTML = html; lastHtml = html; }
    tip.style.transform = `translate(${Math.min(x + 16, window.innerWidth - 260)}px,${Math.min(y + 14, window.innerHeight - 120)}px)`;
    tip.style.left = '0px'; tip.style.top = '0px';
    tip.style.opacity = 1;
  }

  const help = document.getElementById('help');
  document.getElementById('helpClose').onclick = () => help.classList.remove('show');

  /* ---------- клавиатура ---------- */
  window.addEventListener('keydown', (ev) => {
    if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;
    const k = ev.key.toLowerCase();
    if (ev.key >= '1' && ev.key <= '4') selectTool(TOOLS[+ev.key - 1].id);
    else if (k === 'f') selectTool('feed');
    else if (ev.key === ' ') { ev.preventDefault(); actions.scareAtPointer && actions.scareAtPointer(); }
    else if (k === 'd') actions.daynight();
    else if (k === 'c') actions.water();
    else if (k === 'p') actions.shot();
    else if (k === 'm') actions.mute();
    else if (k === 'h' || ev.key === '?') help.classList.toggle('show');
    else if (ev.key === '+' || ev.key === '=' || k === 'л') actions.add();
    else if (ev.key === '-' || ev.key === '_' || k === 'ф') actions.del();
  });

  /* ---------- курсорная подсказка ---------- */
  let mx = 0, my = 0;
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; });

  /* ---------- шаг ---------- */
  let acc = 0;
  function update(dt) {
    toastTimer -= dt;
    if (toastTimer <= 0) toast.classList.remove('show');
    acc += dt;
    if (acc > 0.2) {
      acc = 0;
      const fish = world.fishes;
      let sat = 0;
      for (const f of fish) sat += f.satiety;
      sat = fish.length ? sat / fish.length : 0;
      sFish.textContent = String(fish.length);
      sSat.style.width = Math.round(sat * 100) + '%';
      sSat.style.filter = sat < 0.3 ? 'hue-rotate(-25deg) saturate(1.6)' : 'none';
      const clean = clamp(1 - world.turbidity, 0, 1);
      sCl.style.width = Math.round(clean * 100) + '%';
      const h = (12 + world.phase * 24) % 24;
      sCl2.textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} · ${world.night > 0.55 ? 'ночь' : world.night > 0.25 ? 'сумерки' : 'день'}`;
      if (toolBtns.__mute) toolBtns.__mute.querySelector('.i').textContent = world.muted ? '🔇' : '🔊';
    }
    showTip(world.hoverFish, mx, my);
  }

  selectTool('feed');
  return { update, notify, selectTool, toolBtns };
}
