// flight.js — the bush plane's flight model.
// One job: turn stick + throttle into position, attitude and speed.
// Arcade at heart, but throttle and turn discipline matter: bank too hard and
// you bleed speed, fly too slow and the wing quits, firewall the throttle
// and the fuel gauge is the bill.

import { heightAt, RUNWAY, SEA_LEVEL } from './terrain.js';

export const MAX_SPEED = 82;      // m/s, full throttle in level flight (~160 kt)
export const MIN_FLY_SPEED = 24;  // below this the wing stalls
export const CRASH_VSPEED = 7;    // m/s down at touchdown = a crash, not a landing

export function newPlane() {
  return {
    x: -900, y: 150, z: -200,
    heading: Math.PI / 2,   // east, toward the isles
    pitch: 0, roll: 0,
    speed: 42,
    throttle: 0.62,
    fuel: 100,
    damage: 0,
    vspeed: 0,
    onGround: false,
    engineOut: false,
    stalled: false,
  };
}

// Forward vector from heading + pitch (y up).
export function forwardVector(p) {
  const cp = Math.cos(p.pitch);
  return {
    x: Math.sin(p.heading) * cp,
    y: Math.sin(p.pitch),
    z: -Math.cos(p.heading) * cp,
  };
}

export function stepFlight(p, input, dt) {
  // --- throttle -----------------------------------------------------------
  if (input.throttleUp) p.throttle = Math.min(1, p.throttle + 0.55 * dt);
  if (input.throttleDown) p.throttle = Math.max(0, p.throttle - 0.55 * dt);
  if (p.fuel <= 0) { p.throttle = 0; p.engineOut = true; }

  // --- attitude: the stick eases toward its target, never snaps -----------
  // The autopilot (menu backdrop / photo scenes) steers the attitude itself,
  // so the stick easing is skipped while it flies.
  if (!input.autopilot) {
    const rollTarget = (input.rollLeft ? 1 : 0) * 0.95 - (input.rollRight ? 1 : 0) * 0.95
      - (input.mouseActive ? input.mouseRoll * 0.9 : 0);
    const pitchTarget = (input.pitchDown ? 1 : 0) * 0.34 - (input.pitchUp ? 1 : 0) * 0.34
      + (input.mouseActive ? input.mousePitch * 0.3 : 0);
    const agility = p.speed < MIN_FLY_SPEED ? 0.45 : 1; // mushy controls near the stall
    p.roll += (rollTarget - p.roll) * Math.min(1, 3.2 * agility * dt);
    p.pitch += (pitchTarget - p.pitch) * Math.min(1, 2.6 * agility * dt);
  }
  if (p.onGround) { p.pitch = 0; p.roll *= 0.9; }

  // --- turn: a banked wing turns the nose ----------------------------------
  const turnRate = -Math.sin(p.roll) * 0.85 * Math.min(1.4, p.speed / 42);
  p.heading += turnRate * dt;

  // --- speed: throttle pulls, drag and climbs bleed it ---------------------
  const targetSpeed = 16 + p.throttle * (MAX_SPEED - 16);
  const climbPenalty = Math.max(0, Math.sin(p.pitch)) * 26;
  const bankDrag = Math.abs(Math.sin(p.roll)) * 9;
  const accel = (targetSpeed - climbPenalty - bankDrag - p.speed) * 0.55;
  p.speed = Math.max(0, p.speed + accel * dt);

  // --- stall: too slow and the nose drops on its own ------------------------
  p.stalled = p.speed < MIN_FLY_SPEED && !p.onGround;
  let sink = 0;
  if (p.stalled) {
    sink = (MIN_FLY_SPEED - p.speed) * 0.55;
    p.pitch -= 0.25 * dt;
  }

  // --- move -----------------------------------------------------------------
  const f = forwardVector(p);
  const vx = f.x * p.speed, vy = f.y * p.speed - sink, vz = f.z * p.speed;
  p.vspeed = vy;
  p.x += vx * dt; p.y += vy * dt; p.z += vz * dt;

  // --- fuel ------------------------------------------------------------------
  if (!p.onGround) p.fuel = Math.max(0, p.fuel - (0.16 + p.throttle * 0.62) * dt);

  // --- ground -----------------------------------------------------------------
  const ground = heightAt(p.x, p.z);
  const result = { event: null };
  if (p.y <= ground + 1.1) {
    p.y = ground + 1.1;
    const onStrip = Math.abs(p.x - RUNWAY.cx) <= RUNWAY.length / 2 &&
                    Math.abs(p.z - RUNWAY.cz) <= RUNWAY.width / 2;
    const gentle = vy > -CRASH_VSPEED && p.speed < 58 && Math.abs(p.roll) < 0.35;
    if (onStrip && gentle) {
      // Rolling on the runway: speed bleeds off, steering stays live.
      p.onGround = true;
      p.speed = Math.max(0, p.speed - 26 * dt);
      if (input.rollLeft) p.heading -= 0.5 * dt;
      if (input.rollRight) p.heading += 0.5 * dt;
      result.event = p.speed < 4 ? 'stopped' : 'touchdown';
    } else if (ground < SEA_LEVEL + 0.5) {
      result.event = 'ditch'; // into the sea
    } else {
      result.event = 'crash'; // into the ground
    }
  } else {
    p.onGround = false;
  }
  if (p.y < -2) result.event = 'ditch';
  return result;
}

// Damage from a hard arrival that was not quite a crash (used by the game).
export function hardLandingDamage(p) {
  return Math.min(40, Math.max(0, (-p.vspeed - 3.5) * 8));
}
