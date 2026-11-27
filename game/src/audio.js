// audio.js — the engine, wind and bells, all synthesized.
// One job: every sound the game makes, from WebAudio oscillators and
// filtered noise. No audio files, no network — the whole soundtrack is math.

let ctx = null;
let master = null;
let engineOsc = null, engineOsc2 = null, engineGain = null;
let windSrc = null, windGain = null, windFilter = null;
let muted = false;

export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Engine: a low sawtooth plus a sub sine, through a lowpass.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 62;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sine';
    engineOsc2.frequency.value = 31;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped noise through a bandpass that opens with speed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf; windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();
  } catch (e) {
    ctx = null; // audio is garnish; the game plays on without it
  }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

// Called every frame while flying: engine note follows throttle, wind follows speed.
export function updateAudio(plane) {
  if (!ctx || !engineOsc) return;
  const t = ctx.currentTime;
  const rpm = 55 + plane.throttle * 95 + plane.speed * 0.25;
  engineOsc.frequency.setTargetAtTime(plane.engineOut ? 0 : rpm, t, 0.08);
  engineOsc2.frequency.setTargetAtTime(plane.engineOut ? 0 : rpm / 2, t, 0.08);
  engineGain.gain.setTargetAtTime(plane.onGround ? 0.02 : 0.05 + plane.throttle * 0.075, t, 0.1);
  windGain.gain.setTargetAtTime(Math.min(0.16, plane.speed * 0.0021), t, 0.15);
  windFilter.frequency.setTargetAtTime(300 + plane.speed * 9, t, 0.15);
}

function blip(freq, dur, type = 'sine', vol = 0.25, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
export function chime() { blip(880, 0.35); blip(1318, 0.5, 'sine', 0.2, 0.09); }
export function thud() { blip(70, 0.4, 'triangle', 0.5); blip(48, 0.55, 'sine', 0.5, 0.02); }
export function splash() { blip(300, 0.5, 'sine', 0.3); blip(180, 0.7, 'sine', 0.25, 0.1); }
export function alarm() { blip(620, 0.16, 'square', 0.12); blip(620, 0.16, 'square', 0.12, 0.22); }
export function click() { blip(1200, 0.06, 'square', 0.12); }
export function fanfare() {
  [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.5, 'triangle', 0.22, i * 0.12));
}
