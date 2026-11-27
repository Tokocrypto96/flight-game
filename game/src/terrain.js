// terrain.js — the Meridian Isles heightmap, runway, trees and clouds.
// One job: answer "how high is the ground here?" and "what sits on it?"
// Everything is deterministic (seeded noise), so every flight sees the same isles.

export const ISLAND_RADIUS = 1500;   // metres from the isle centre to open sea
export const SEA_LEVEL = 0;
export const RUNWAY = {
  // A flat grass strip on the east isle, heading east-west.
  cx: 420, cz: 0, length: 520, width: 42, height: 12, heading: 0,
};
export const DROP_ZONE = { x: -420, z: 520, radius: 34 };

// --- deterministic value noise --------------------------------------------
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = smooth(fx), v = smooth(fz);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, z) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp; amp *= 0.5; freq *= 2.13;
  }
  return sum / norm;
}

// --- heights ----------------------------------------------------------------
function islandProfile(x, z) {
  const d = Math.hypot(x, z) / ISLAND_RADIUS;
  // 1 near the centre, 0 past the shore, with a soft beach band.
  if (d >= 1) return 0;
  return smooth(1 - d * d);
}
function rawHeight(x, z) {
  const land = islandProfile(x, z);
  if (land <= 0) return -6; // seabed
  let h = 6 + land * 46 + fbm(x * 0.004 + 7.3, z * 0.004 + 2.9) * 52 * land;
  // The big peak in the far north-west corner, snow-capped — kept clear
  // of the ring course so the route itself is always flyable.
  const peak = Math.hypot(x + 700, z + 700);
  h += Math.max(0, 170 - peak * 0.5) * land;
  // A low hill belt on the south isle for the ring course to weave through.
  const belt = Math.hypot(x + 180, z - 760);
  h += Math.max(0, 55 - belt * 0.16) * land;
  return h;
}
function onRunway(x, z) {
  return Math.abs(x - RUNWAY.cx) <= RUNWAY.length / 2 + 30 &&
         Math.abs(z - RUNWAY.cz) <= RUNWAY.width / 2 + 30;
}
// The airfield apron: a flat approach corridor west of the strip and the
// strip itself, so a final approach never meets a surprise hill.
function onAirfield(x, z) {
  return x >= -480 && x <= RUNWAY.cx + RUNWAY.length / 2 + 30 &&
         Math.abs(z - RUNWAY.cz) <= 90;
}
export function heightAt(x, z) {
  const h = rawHeight(x, z);
  if (onAirfield(x, z)) {
    // Blend the airfield flat, with a soft edge (edge 0 inside, 1 at the rim).
    const ex = Math.min(1, Math.min(x + 480, RUNWAY.cx + RUNWAY.length / 2 + 30 - x) / 60);
    const ez = Math.min(1, (90 - Math.abs(z - RUNWAY.cz)) / 30);
    const edge = 1 - Math.min(ex, ez);
    return h + (RUNWAY.height - h) * (1 - edge);
  }
  if (!onRunway(x, z)) return h;
  // Blend the strip flat so the runway sits level.
  const dx = Math.min(1, (Math.abs(x - RUNWAY.cx) - RUNWAY.length / 2) / 30 + 1);
  const dz = Math.min(1, (Math.abs(z - RUNWAY.cz) - RUNWAY.width / 2) / 30 + 1);
  const edge = Math.max(0, Math.min(dx, dz));
  return h + (RUNWAY.height - h) * (1 - edge);
}
export function isWater(x, z) { return heightAt(x, z) < SEA_LEVEL; }

// --- ground colour by height / slope ---------------------------------------
export function groundColor(x, z, h) {
  if (h < 1.5) return '#d9c27a';            // sand
  if (h < 7) return '#c9b06a';              // dry beach grass
  if (h < 55) return '#5d8a46';             // meadow
  if (h < 110) return '#4a7a3c';            // forest floor
  if (h < 165) return '#6b6f66';            // rock
  return '#e8eef2';                          // snow on the peak
}

// --- trees, clouds ----------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const TREES = (() => {
  const rnd = mulberry32(20261126);
  const out = [];
  for (let i = 0; i < 260; i++) {
    const x = (rnd() * 2 - 1) * 1350;
    const z = (rnd() * 2 - 1) * 1350;
    const h = rawHeight(x, z);
    if (h < 8 || h > 68 || onRunway(x, z)) continue;
    out.push({ x, z, h, s: 5 + rnd() * 7 });
  }
  return out;
})();
export const CLOUDS = (() => {
  const rnd = mulberry32(777);
  const out = [];
  for (let i = 0; i < 16; i++) {
    out.push({
      x: (rnd() * 2 - 1) * 1600,
      z: (rnd() * 2 - 1) * 1600,
      y: 260 + rnd() * 130,
      s: 40 + rnd() * 70,
      drift: 2 + rnd() * 3,
    });
  }
  return out;
})();
export function updateClouds(dt) {
  for (const c of CLOUDS) {
    c.x += c.drift * dt;
    if (c.x > 1750) c.x = -1750;
  }
}
