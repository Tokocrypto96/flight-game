// main.js — Sky Courier: Meridian Isles.
// One job: boot the game, run the loop, and hold the state machine together.
// Menu → fly → (crash | land | complete) → fly again. Missions run in order;
// the score, the fuel and the mountain decide how the day ends.

import { newPlane, stepFlight, forwardVector, hardLandingDamage } from './flight.js';
import { renderFrame, resetCamera } from './render3d.js';
import { drawHud, drawMenu, drawEndScreen } from './hud.js';
import { missionState, updateMission, currentTarget, MISSIONS } from './missions.js';
import { newInput, bindInput, clearEdges } from './input.js';
import { ensureAudio, updateAudio, toggleMute, chime, thud, splash, alarm, click, fanfare } from './audio.js';
import { newParticles, spawnBurst, spawnTrail, stepParticles, particleColor } from './particles.js';
import { heightAt, updateClouds, RUNWAY } from './terrain.js';

window.__skyCourierBooted = true;
window.__skyCourier = null; // set below, once the game object exists

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const SCENE = params.get('scene') || '';

const BEST_KEY = 'sky-courier-best';
const best = Number(localStorage.getItem(BEST_KEY) || 0);

const game = {
  state: 'menu',           // menu | fly | paused | crashed | landed | complete | gameover
  plane: newPlane(),
  mission: missionState(0),
  score: 0,
  best,
  time: 0,
  missionTime: 0,
  shake: 0,
  message: '', messageUntil: 0,
  subMessage: '', subMessageUntil: 0,
  parcel: null,            // {x,y,z,vx,vy,vz,falling,landed}
  particles: newParticles(),
  autopilot: false,
  endLines: [],
  endTitle: '',
  endHint: '',
  fuelWarned: false,
  dt: 0.016,
};
window.__skyCourier = game;

const input = newInput();
bindInput(input, canvas, () => ensureAudio());

function say(text, seconds = 2.5, sub = '') {
  game.message = text; game.messageUntil = game.time + seconds;
  game.subMessage = sub; game.subMessageUntil = game.time + seconds;
}
function fmtClock(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function startMission(idx, keepScore) {
  game.mission = missionState(idx);
  game.missionTime = 0;
  game.parcel = null;
  game.particles = newParticles();
  if (!keepScore) game.score = 0;
  const p = game.plane;
  if (idx === 0) { p.x = -900; p.y = 150; p.z = -200; p.heading = Math.PI / 2; p.pitch = 0; p.roll = 0; p.speed = 42; p.throttle = 0.62; p.fuel = 100; p.damage = 0; p.onGround = false; p.engineOut = false; }
  if (idx === 1) { p.x = -900; p.y = 170; p.z = 300; p.heading = Math.PI / 2.4; p.speed = 46; p.throttle = 0.65; }
  if (idx === 2) { p.x = -260; p.y = 60; p.z = -60; p.heading = Math.PI / 2; p.speed = 40; p.throttle = 0.5; }
  p.onGround = false;
  resetCamera();
  say(game.mission.def.name, 3, game.mission.def.briefing);
}

function startGame() {
  game.state = 'fly';
  game.score = 0;
  game.time = 0;
  game.plane = newPlane();
  startMission(0, true);
  ensureAudio();
  click();
}

function endRun(title, lines, hint) {
  game.endTitle = title; game.endLines = lines; game.endHint = hint;
  if (game.score > game.best) {
    game.best = game.score;
    localStorage.setItem(BEST_KEY, String(game.best));
  }
}

// --- autopilot: flies the plane toward the current target (menu backdrop + photo scenes)
function autopilot(dt) {
  const p = game.plane;
  const t = currentTarget(game.mission);
  if (!t) return;
  const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
  const wantHeading = Math.atan2(dx, -dz);
  let diff = wantHeading - p.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // roll > 0 banks left (heading decreases), so a target to the right
  // (diff > 0) needs a negative roll. Gentle banks: they look better and
  // bleed less speed.
  const wantRoll = Math.max(-0.55, Math.min(0.55, -diff * 1.4));
  p.roll += (wantRoll - p.roll) * Math.min(1, 2.4 * dt);
  p.heading += -Math.sin(p.roll) * 0.85 * Math.min(1.4, p.speed / 42) * dt;
  let wantPitch, wantThrottle;
  if (game.mission.index === 2) {
    // Landing: hold 70 until x=-200, then ride a 5-degree slope to the
    // strip. The slope pitch is feed-forward; the proportional term only
    // corrects the error around it, so the descent stays near -3 m/s.
    wantThrottle = 0.3;
    if (p.x < -200) {
      wantPitch = Math.max(-0.12, Math.min(0.12, (70 - p.y) * 0.004));
    } else {
      const targetAlt = 14 + Math.max(0, 430 - p.x) * 0.089;
      wantPitch = -0.089 + Math.max(-0.06, Math.min(0.06, (targetAlt - p.y) * 0.004));
    }
  } else {
    wantThrottle = p.y < t.y - 20 ? 0.8 : 0.62;
    wantPitch = Math.max(-0.3, Math.min(0.3, (t.y - p.y) * 0.004));
  }
  p.pitch += (wantPitch - p.pitch) * Math.min(1, 2 * dt);
  p.throttle += (wantThrottle - p.throttle) * Math.min(1, dt);
  // Drop the parcel automatically when lined up over the zone. The parcel
  // keeps the plane's forward speed while it falls, so drop early: when
  // the distance to the zone equals the distance the parcel will travel
  // forward while falling, it lands on the circle.
  if (game.mission.index === 1 && !game.parcel) {
    const groundY = heightAt(t.x, t.z);
    const fallTime = Math.sqrt(2 * Math.max(5, p.y - groundY) / 9.8);
    const lead = p.speed * fallTime;
    if (Math.hypot(dx, dz) <= lead + 5) dropParcel();
  }
}

function dropParcel() {
  if (game.mission.index !== 1 || game.parcel) return;
  const p = game.plane;
  const f = forwardVector(p);
  game.parcel = {
    x: p.x, y: p.y - 2, z: p.z,
    vx: f.x * p.speed, vy: 0, vz: f.z * p.speed,
    falling: true, landed: false,
  };
  click();
}

function stepParcel(dt) {
  const q = game.parcel;
  if (!q || !q.falling) return;
  q.vy -= 9.8 * dt;
  q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
  const g = heightAt(q.x, q.z);
  if (q.y <= g + 0.5) {
    q.y = g + 0.5;
    q.falling = false; q.landed = true;
    spawnBurst(game.particles, q.x, q.y, q.z, 'smoke', 8);
  }
}

// --- per-frame update ---------------------------------------------------------
function update(dt) {
  game.dt = dt;
  updateClouds(dt);
  stepParticles(game.particles, dt);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 14);

  if (input.mute) { const m = toggleMute(); say(m ? 'SOUND OFF' : 'SOUND ON', 1.2); }
  if (game.state === 'menu') {
    if (input.start) { startGame(); clearEdges(input); return; }
    // Attract mode: the plane flies the ring course behind the title.
    game.autopilot = true;
    autopilot(dt);
    const ev = stepFlight(game.plane, { ...input, throttleUp: false, throttleDown: false, autopilot: true }, dt);
    void ev;
    if (game.plane.y < heightAt(game.plane.x, game.plane.z) + 20) startMission(0, true);
    stepParcel(dt);
    return;
  }
  if (game.state === 'paused') {
    if (input.pause || input.start) { game.state = 'fly'; say('RESUMED', 1); }
    if (input.restart) { startGame(); }
    clearEdges(input);
    return;
  }
  if (game.state === 'fly') {
    if (input.pause) { game.state = 'paused'; say('PAUSED — P to resume', 60); clearEdges(input); return; }
    if (input.restart) { startGame(); clearEdges(input); return; }
    if (input.action) dropParcel();
    if (game.autopilot) autopilot(dt);

    const p = game.plane;
    input.autopilot = game.autopilot;
    const ev = stepFlight(p, input, dt);
    game.missionTime += dt;
    stepParcel(dt);
    updateAudio(p);

    // Wing-tip smoke trail at full throttle, for the screenshots and the feel.
    if (p.throttle > 0.9 && Math.random() < 0.5) {
      spawnTrail(game.particles, p.x, p.y - 0.4, p.z);
    }
    // Low-fuel warning, once.
    if (p.fuel < 25 && !game.fuelWarned) { game.fuelWarned = true; alarm(); say('LOW FUEL — FINISH THE SORTIE', 3); }
    if (p.fuel <= 0 && p.onGround) { /* glided in: mission 3 may still count */ }

    // Mission scoring.
    const scored = updateMission(game.mission, p, game.parcel, ev.event ? [ev.event] : []);
    if (scored) {
      game.score += scored.points;
      chime();
      if (scored.type === 'ring') say(`RING ${scored.count}/${scored.total}  +${scored.points}`, 2);
      if (scored.type === 'drop') say(`PARCEL DOWN  +${scored.points}`, 2.5, scored.dist <= 34 ? 'Dead on the circle!' : `${scored.dist}m from the centre`);
      if (scored.type === 'landing') {
        game.state = 'landed';
        const fuelBonus = Math.round(p.fuel * 2);
        game.score += fuelBonus;
        say(`TOUCHDOWN  +${scored.points}`, 2.5, `Vertical speed ${scored.vspeed} ft/min — fuel bonus +${fuelBonus}`);
        setTimeout(() => advanceOrFinish(), 1800);
      }
      if (scored.type === 'ring' && game.mission.nextRing >= game.mission.rings.length) {
        setTimeout(() => advanceOrFinish(), 1200);
      }
      if (scored.type === 'drop' && game.mission.parcelScored) {
        setTimeout(() => advanceOrFinish(), 1600);
      }
    }

    // Crashes.
    if (ev.event === 'crash' || ev.event === 'ditch') {
      p.damage = 100;
      game.shake = 10;
      spawnBurst(game.particles, p.x, p.y, p.z, ev.event === 'ditch' ? 'spray' : 'fire', 40);
      if (ev.event === 'ditch') splash(); else thud();
      game.state = 'crashed';
      // Bank the best score first, so the end screen quotes the new best.
      if (game.score > game.best) {
        game.best = game.score;
        localStorage.setItem(BEST_KEY, String(game.best));
      }
      const lines = [
        `${game.mission.def.name} — sortie failed.`,
        `Score ${game.score}   •   Best ${game.best}`,
        ev.event === 'ditch' ? 'She went into the sea. The isles are patient; the sea is not.' : 'Terrain wins again. Watch the mountain on the north-west leg.',
      ];
      endRun(ev.event === 'ditch' ? 'DITCHED IN THE SEA' : 'CRASHED', lines, 'PRESS R TO FLY AGAIN');
    }
    // Fuel out over open ground with no runway in reach: a forced landing ends the day.
    if (p.fuel <= 0 && p.speed < 8 && !p.onGround && p.y < heightAt(p.x, p.z) + 30) {
      game.state = 'gameover';
      endRun('OUT OF FUEL', [`Score ${game.score}   •   Best ${game.best}`, 'The tanks ran dry over the isles. Throttle discipline is a courier’s first skill.'], 'PRESS R TO FLY AGAIN');
    }
    clearEdges(input);
    return;
  }
  // crashed / landed / complete / gameover: wait for R or Enter.
  if (input.restart || input.start) {
    if (game.state === 'complete') { game.state = 'menu'; game.plane = newPlane(); game.mission = missionState(0); }
    else startGame();
  }
  clearEdges(input);
}

function advanceOrFinish() {
  if (game.state !== 'fly' && game.state !== 'landed') return;
  if (game.mission.index < MISSIONS.length - 1) {
    game.state = 'fly';
    startMission(game.mission.index + 1, true);
    fanfare();
  } else if (game.state === 'landed' || game.mission.index === MISSIONS.length - 1) {
    game.state = 'complete';
    fanfare();
    endRun('ALL SORTIES COMPLETE', [
      `Final score ${game.score}   •   Best ${game.best}`,
      'Rings threaded, parcel delivered, wheels on the strip.',
      'The Meridian Isles mail is safe — thanks to you, courier.',
    ], 'PRESS ENTER FOR THE MENU');
  }
}

// --- scene hooks (photo mode for screenshots; also the menu attract mode) ------
function applyScene() {
  if (SCENE === 'ring') {
    game.autopilot = true;
    startGame();
    game.plane.x = -820; game.plane.y = 135; game.plane.z = -300;
    game.plane.heading = 1.05; game.plane.speed = 48; game.plane.throttle = 0.7;
  } else if (SCENE === 'landing') {
    game.autopilot = true;
    startMission(2, true);
    game.state = 'fly';
    game.plane.x = -350; game.plane.y = 110; game.plane.z = -20;
    game.plane.heading = Math.PI / 2; game.plane.speed = 40; game.plane.throttle = 0.45;
    game.score = 1250;
  } else if (SCENE === 'cruise') {
    game.autopilot = true;
    startGame();
    game.plane.x = -300; game.plane.y = 210; game.plane.z = 500;
    game.plane.heading = 2.4; game.plane.speed = 55; game.plane.throttle = 0.75;
  } else if (SCENE === 'drop') {
    game.autopilot = true;
    startMission(1, true);
    game.state = 'fly';
    game.plane.x = -950; game.plane.y = 175; game.plane.z = 260;
    game.plane.heading = 1.9; game.plane.speed = 48; game.plane.throttle = 0.68;
    game.score = 820;
  } else if (SCENE === 'menu') {
    game.autopilot = true;
  }
}

// --- render ---------------------------------------------------------------------
function render() {
  const W = canvas.width, H = canvas.height;
  const p = game.plane;
  // Rings belong to Mission 1 only; other sorties hide them.
  const showRings = game.mission.index === 0;
  renderFrame(ctx, W, H, {
    plane: p, rings: showRings ? game.mission.rings : [], nextRing: game.mission.nextRing,
    parcel: game.parcel, time: game.time, shake: game.shake, dt: game.dt,
  });
  // Particles in screen space: re-project each one (cheap — few dozen).
  // We approximate by reusing the frame's projection via a second pass here:
  // particles are drawn as simple screen dots relative to the plane's depth.
  // (Kept minimal: bursts are visible as expanding rings at the event point.)
  if (game.particles.length) {
    ctx.save();
    for (const pt of game.particles) {
      const a = 1 - pt.age / pt.life;
      ctx.fillStyle = particleColor(pt);
      const sx = W / 2 + (pt.x - p.x) * 1.1 - (pt.z - p.z) * 0.4;
      const sy = H * 0.55 - (pt.y - p.y) * 1.6 - (pt.z - p.z) * 0.2;
      ctx.beginPath();
      ctx.arc(sx, sy, pt.size * (0.5 + a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const groundBelow = heightAt(p.x, p.z);
  if (game.state === 'menu') {
    drawMenu(ctx, W, H, game.best);
  } else if (game.state === 'paused') {
    drawHud(ctx, W, H, hudState(groundBelow));
    drawEndScreen(ctx, W, H, 'PAUSED', ['Take a breath. The isles will wait.'], 'P TO RESUME  •  R TO RESTART');
  } else if (game.state === 'crashed' || game.state === 'gameover') {
    drawHud(ctx, W, H, hudState(groundBelow));
    drawEndScreen(ctx, W, H, game.endTitle, game.endLines, game.endHint);
  } else if (game.state === 'complete') {
    drawHud(ctx, W, H, hudState(groundBelow));
    drawEndScreen(ctx, W, H, game.endTitle, game.endLines, game.endHint);
  } else {
    drawHud(ctx, W, H, hudState(groundBelow));
  }
}
function hudState(groundBelow) {
  return {
    plane: game.plane,
    mission: game.mission.def,
    rings: game.mission.index === 0 ? game.mission.rings : [],
    nextRing: game.mission.nextRing,
    score: game.score,
    best: game.best,
    clock: fmtClock(game.missionTime),
    target: currentTarget(game.mission),
    groundBelow,
    state: game.state,
    message: game.time < game.messageUntil ? game.message : '',
    subMessage: game.time < game.subMessageUntil ? game.subMessage : '',
  };
}

// --- main loop --------------------------------------------------------------------
function resize() {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Keep the logical size at CSS pixels for the HUD math.
  canvas.width = w; canvas.height = h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
window.addEventListener('resize', resize);
resize();
applyScene();

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  game.time += dt;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
