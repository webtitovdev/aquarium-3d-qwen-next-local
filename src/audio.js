/* ============================================================
   audio.js — процедурный звук: гул воды, бульканье, стук по стеклу,
   всплеск, «чмоканье» рыб при кормёжке. Без внешних файлов.
   ============================================================ */

export function createAudio() {
  let ctx = null, master = null, ambGain = null, noiseBuf = null;
  let muted = false, bubbleTimer = 0;

  function noise(seconds = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;   // почти коричневый
      d[i] = last * 3.2 + w * 0.12;
    }
    return b;
  }

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    noiseBuf = noise(2.5);

    // фоновый гул воды
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 60;
    ambGain = ctx.createGain();
    ambGain.gain.value = 0.30;
    src.connect(lp); lp.connect(hp); hp.connect(ambGain); ambGain.connect(master);
    src.start();

    // едва слышный «гул» компрессора
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 54;
    const og = ctx.createGain(); og.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(og.gain);
    osc.connect(og); og.connect(master);
    osc.start(); lfo.start();
    return true;
  }

  function burst({ t0, dur, type = 'bandpass', f0 = 800, f1 = 1400, q = 1.2, gain = 0.3, curve = 'exp' }) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (curve === 'exp') f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    else f.frequency.linearRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0, Math.random() * 1.5, dur + 0.05);
    s.stop(t0 + dur + 0.1);
  }

  function tone({ t0, dur, f0 = 400, f1 = f0, gain = 0.2, type = 'sine' }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function play(name, intensity = 1) {
    if (!ensure() || muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.001;
    const v = Math.max(0.05, Math.min(1, intensity));
    switch (name) {
      case 'knock':
        tone({ t0, dur: 0.22, f0: 170, f1: 62, gain: 0.34 * v, type: 'triangle' });
        burst({ t0, dur: 0.16, f0: 1800, f1: 300, q: 0.8, gain: 0.22 * v });
        break;
      case 'splash':
        burst({ t0, dur: 0.34, f0: 3200, f1: 500, q: 0.7, gain: 0.30 * v });
        burst({ t0: t0 + 0.03, dur: 0.2, f0: 900, f1: 2600, q: 2.5, gain: 0.12 * v });
        break;
      case 'swish':
        burst({ t0, dur: 0.42, f0: 400, f1: 2600, q: 1.4, gain: 0.2 * v });
        break;
      case 'munch':
        burst({ t0, dur: 0.07, f0: 1500 + Math.random() * 900, f1: 600, q: 4, gain: 0.13 * v });
        break;
      case 'blip':
        tone({ t0, dur: 0.12, f0: 900, f1: 1500, gain: 0.12 * v });
        break;
      case 'chime':
        tone({ t0, dur: 0.9, f0: 523, gain: 0.10 * v });
        tone({ t0: t0 + 0.12, dur: 0.9, f0: 784, gain: 0.07 * v });
        break;
      case 'plop':
        tone({ t0, dur: 0.14, f0: 620, f1: 180, gain: 0.14 * v, type: 'sine' });
        break;
      case 'alarm':
        tone({ t0, dur: 0.18, f0: 300, f1: 900, gain: 0.08 * v, type: 'sawtooth' });
        break;
    }
  }

  // редкие пузырьки в фоне
  function update(dt) {
    if (!ctx || muted) return;
    bubbleTimer -= dt;
    if (bubbleTimer <= 0) {
      bubbleTimer = 0.35 + Math.random() * 1.4;
      const t0 = ctx.currentTime + 0.001;
      burst({ t0, dur: 0.09 + Math.random() * 0.08, f0: 700 + Math.random() * 900,
        f1: 2200 + Math.random() * 1200, q: 6, gain: 0.045 });
    }
  }

  return {
    play, update,
    resume() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.6; },
    get muted() { return muted; }
  };
}
