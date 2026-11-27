// render3d.js — the chase camera and everything it sees.
// One job: project the 3D world onto the 2D canvas and paint it — sky, sea,
// terrain mesh, runway, rings, trees, clouds and the plane itself.
// No libraries: a small hand-rolled perspective projector.

import { heightAt, groundColor, RUNWAY, DROP_ZONE, TREES, CLOUDS, ISLAND_RADIUS } from './terrain.js';
import { forwardVector } from './flight.js';

const GRID_STEP = 75;
const GRID_N = Math.ceil((ISLAND_RADIUS * 2 + 300) / GRID_STEP); // cells across
const GRID_MIN = -ISLAND_RADIUS - 150;

// Precomputed terrain heights, so the frame loop never calls heightAt per vertex.
const gridH = new Float32Array((GRID_N + 1) * (GRID_N + 1));
for (let j = 0; j <= GRID_N; j++) {
  for (let i = 0; i <= GRID_N; i++) {
    gridH[j * (GRID_N + 1) + i] = heightAt(GRID_MIN + i * GRID_STEP, GRID_MIN + j * GRID_STEP);
  }
}
function gridHeight(i, j) { return gridH[j * (GRID_N + 1) + i]; }

// --- camera -----------------------------------------------------------------
function makeCamera(plane, dt, shake) {
  const f = forwardVector(plane);
  // Chase position: behind and above the tail, easing so the camera never snaps.
  const back = 15, up = 5.2;
  const tx = plane.x - f.x * back, ty = plane.y - f.y * back + up, tz = plane.z - f.z * back;
  const cam = makeCamera.last || { x: tx, y: ty, z: tz };
  const k = Math.min(1, 6 * dt);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k;
  makeCamera.last = cam;
  // Look ahead of the nose; the camera banks a third of the plane's roll.
  const look = {
    x: plane.x + f.x * 60, y: plane.y + f.y * 60, z: plane.z + f.z * 60,
  };
  return { pos: cam, look, roll: plane.roll * 0.35, shake };
}
makeCamera.last = null;
export function resetCamera() { makeCamera.last = null; }

// Project a world point into screen space. Returns null when behind the camera.
function projectFactory(cam, W, H) {
  const fov = 1.15; // ~66 degrees
  const focal = (H / 2) / Math.tan(fov / 2);
  // Camera basis: forward, right, up (with roll applied).
  let fx = cam.look.x - cam.pos.x, fy = cam.look.y - cam.pos.y, fz = cam.look.z - cam.pos.z;
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, ry = 0, rz = fx; // right = forward x world-up
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  let ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  // Roll the camera around its forward axis.
  const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
  const r2x = rx * cr + ux * sr, r2y = ry * cr + uy * sr, r2z = rz * cr + uz * sr;
  const u2x = ux * cr - rx * sr, u2y = uy * cr - ry * sr, u2z = uz * cr - rz * sr;
  const shx = (Math.random() - 0.5) * (cam.shake || 0);
  const shy = (Math.random() - 0.5) * (cam.shake || 0);
  return function project(x, y, z) {
    const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
    const cz = dx * fx + dy * fy + dz * fz;
    if (cz < 1.5) return null;
    const cx = dx * r2x + dy * r2y + dz * r2z;
    const cy = dx * u2x + dy * u2y + dz * u2z;
    return {
      x: W / 2 + (cx * focal) / cz + shx,
      y: H / 2 - (cy * focal) / cz + shy,
      d: cz,
    };
  };
}

function hexLerp(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
  return `rgb(${r},${g},${bl})`;
}
const FOG_COLOR = '#b8d4e8';

// --- the plane model ----------------------------------------------------------
 // A bush plane, built from a few flat-shaded polygons in local space:
 // +x right wing, +y up, -z nose. Points are transformed by the plane's
 // heading / pitch / roll, then projected.
const PLANE_POLYS = [
  { pts: [[0, 0.5, -4.6], [0.9, 0.1, -1.5], [0.9, 0.1, 2.6], [0, 0.5, 3.4]], color: '#e8442e' }, // fuselage right
  { pts: [[0, 0.5, -4.6], [0, 0.5, 3.4], [-0.9, 0.1, 2.6], [-0.9, 0.1, -1.5]], color: '#c93320' }, // fuselage left
  { pts: [[0, 1.15, -1.2], [0.9, 0.1, -1.5], [0.9, 0.1, 2.6], [0, 0.9, 2.6]], color: '#f2f2f2' }, // cabin right
  { pts: [[0, 1.15, -1.2], [0, 0.9, 2.6], [-0.9, 0.1, 2.6], [-0.9, 0.1, -1.5]], color: '#d8d8d8' }, // cabin left
  { pts: [[-4.6, 0.15, -0.4], [-4.6, 0.15, 0.9], [4.6, 0.15, 0.9], [4.6, 0.15, -0.4]], color: '#f5f0e6' }, // wing
  { pts: [[-4.6, 0.15, -0.4], [4.6, 0.15, -0.4], [4.6, 0.35, -0.9], [-4.6, 0.35, -0.9]], color: '#e8442e' }, // wing leading edge
  { pts: [[-1.5, 0.2, 3.2], [-1.5, 0.2, 4.1], [1.5, 0.2, 4.1], [1.5, 0.2, 3.2]], color: '#f5f0e6' }, // tailplane
  { pts: [[0, 0.4, 3.4], [0, 1.7, 3.9], [0, 1.7, 4.6], [0, 0.4, 4.4]], color: '#e8442e' }, // fin
  { pts: [[0, -0.5, -1.8], [0.55, -0.5, -1.2], [0.55, -0.5, 1.6], [0, -0.5, 2.0]], color: '#3a3f44' }, // belly
  { pts: [[-0.8, -0.9, -0.6], [0.8, -0.9, -0.6], [0.8, -0.9, 0.4], [-0.8, -0.9, 0.4]], color: '#2c2f33' }, // gear
];
function drawPlane(ctx, project, plane, time) {
  const ch = Math.cos(plane.heading), sh = Math.sin(plane.heading);
  const cp = Math.cos(plane.pitch), sp = Math.sin(plane.pitch);
  const cr = Math.cos(plane.roll), sr = Math.sin(plane.roll);
  // Local -> world: roll, then pitch, then heading (yaw around Y).
  function xform(lx, ly, lz) {
    // roll around Z (forward axis)
    let x1 = lx * cr - ly * sr, y1 = lx * sr + ly * cr, z1 = lz;
    // pitch around X
    let y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp, x2 = x1;
    // yaw around Y: local -z (the nose) must map to the forward vector
    // (sin h, 0, -cos h), and local +x (right wing) to (cos h, 0, sin h).
    const x3 = x2 * ch - z2 * sh, z3 = x2 * sh + z2 * ch, y3 = y2;
    return [plane.x + x3, plane.y + y3, plane.z + z3];
  }
  for (const poly of PLANE_POLYS) {
    ctx.beginPath();
    let ok = true, depth = 0;
    poly.pts.forEach(([lx, ly, lz], i) => {
      const [wx, wy, wz] = xform(lx, ly, lz);
      const s = project(wx, wy, wz);
      if (!s) { ok = false; return; }
      depth += s.d;
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    if (!ok) continue;
    ctx.closePath();
    ctx.fillStyle = poly.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,30,40,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Spinning prop disc at the nose.
  const [px, py, pz] = xform(0, 0.4, -4.9);
  const ps = project(px, py, pz);
  if (ps) {
    const r = Math.max(2, 260 / ps.d);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#cfd8dc';
    ctx.beginPath(); ctx.ellipse(ps.x, ps.y, r * 0.28, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9;
    const a = time * 22;
    ctx.strokeStyle = '#37474f'; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(ps.x - Math.cos(a) * r, ps.y - Math.sin(a) * r);
    ctx.lineTo(ps.x + Math.cos(a) * r, ps.y + Math.sin(a) * r);
    ctx.stroke();
    ctx.restore();
  }
}

// --- rings --------------------------------------------------------------------
function drawRing(ctx, project, ring, isNext, time) {
  const R = ring.radius;
  const pulse = isNext ? 1 + Math.sin(time * 5) * 0.12 : 1;
  ctx.beginPath();
  let first = true;
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    // Ring stands vertical, facing along the course heading.
    const lx = Math.cos(a) * R * pulse;
    const ly = Math.sin(a) * R * pulse;
    const wx = ring.x + lx * Math.cos(ring.face) - 0;
    const wz = ring.z + lx * Math.sin(ring.face);
    const wy = ring.y + ly;
    const s = project(wx, wy, wz);
    if (!s) { first = true; continue; }
    if (first) { ctx.moveTo(s.x, s.y); first = false; }
    else ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.strokeStyle = isNext ? '#ffb300' : 'rgba(255,179,0,0.45)';
  ctx.lineWidth = isNext ? 5 : 3;
  ctx.stroke();
  ctx.strokeStyle = isNext ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// --- main frame -----------------------------------------------------------------
export function renderFrame(ctx, W, H, state) {
  const { plane, rings, nextRing, parcel, time, shake } = state;
  const cam = makeCamera(plane, state.dt, shake);
  const project = projectFactory(cam, W, H);

  // Sky gradient + sun.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2f6fb4'); sky.addColorStop(0.45, '#7fb2dd');
  sky.addColorStop(0.62, '#cfe4f2'); sky.addColorStop(1, '#dcecf5');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const sun = project(cam.pos.x + 900, cam.pos.y + 420, cam.pos.z - 1400);
  if (sun) {
    const g = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 90);
    g.addColorStop(0, 'rgba(255,244,200,0.95)');
    g.addColorStop(0.25, 'rgba(255,230,150,0.55)');
    g.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sun.x - 90, sun.y - 90, 180, 180);
  }

  // Sea: everything below the horizon line.
  const horizon = project(cam.pos.x, 0, cam.pos.z - 3000);
  const hy = horizon ? horizon.y : H * 0.55;
  const sea = ctx.createLinearGradient(0, hy, 0, H);
  sea.addColorStop(0, '#2b6f9e'); sea.addColorStop(1, '#174a6e');
  ctx.fillStyle = sea; ctx.fillRect(0, Math.max(0, hy), W, H - Math.max(0, hy));

  // Terrain mesh: quads, far to near, fog-blended.
  const quads = [];
  const camX = cam.pos.x, camZ = cam.pos.z;
  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) {
      const x0 = GRID_MIN + i * GRID_STEP, z0 = GRID_MIN + j * GRID_STEP;
      const cx = x0 + GRID_STEP / 2, cz = z0 + GRID_STEP / 2;
      const dx = cx - camX, dz = cz - camZ;
      const dist = dx * dx + dz * dz;
      if (dist > 1500 * 1500) continue;
      const h00 = gridHeight(i, j), h10 = gridHeight(i + 1, j);
      const h01 = gridHeight(i, j + 1), h11 = gridHeight(i + 1, j + 1);
      if (Math.max(h00, h10, h01, h11) < 0.5) continue; // open sea: the sea fill covers it
      quads.push({ i, j, x0, z0, h00, h10, h01, h11, dist, hm: (h00 + h10 + h01 + h11) / 4 });
    }
  }
  quads.sort((a, b) => b.dist - a.dist);
  for (const q of quads) {
    const p00 = project(q.x0, q.h00, q.z0);
    const p10 = project(q.x0 + GRID_STEP, q.h10, q.z0);
    const p11 = project(q.x0 + GRID_STEP, q.h11, q.z0 + GRID_STEP);
    const p01 = project(q.x0, q.h01, q.z0 + GRID_STEP);
    if (!p00 || !p10 || !p11 || !p01) continue;
    const fog = Math.min(0.85, Math.sqrt(q.dist) / 1600);
    const base = groundColor(q.x0 + GRID_STEP / 2, q.z0 + GRID_STEP / 2, q.hm);
    ctx.fillStyle = hexLerp(base, FOG_COLOR, fog);
    ctx.beginPath();
    ctx.moveTo(p00.x, p00.y); ctx.lineTo(p10.x, p10.y);
    ctx.lineTo(p11.x, p11.y); ctx.lineTo(p01.x, p01.y);
    ctx.closePath(); ctx.fill();
  }

  // Runway strip + centre dashes + threshold bars.
  const rw = RUNWAY;
  const halfL = rw.length / 2, halfW = rw.width / 2;
  const corners = [
    project(rw.cx - halfL, rw.height + 0.4, rw.cz - halfW),
    project(rw.cx + halfL, rw.height + 0.4, rw.cz - halfW),
    project(rw.cx + halfL, rw.height + 0.4, rw.cz + halfW),
    project(rw.cx - halfL, rw.height + 0.4, rw.cz + halfW),
  ];
  if (corners.every(Boolean)) {
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(corners[k].x, corners[k].y);
    ctx.closePath();
    ctx.fillStyle = '#3d4148'; ctx.fill();
    ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 2; ctx.stroke();
    // Centre dashes.
    ctx.fillStyle = '#f5f5f5';
    for (let d = -halfL + 30; d < halfL - 10; d += 46) {
      const a = project(rw.cx + d, rw.height + 0.6, rw.cz - 2.5);
      const b = project(rw.cx + d + 24, rw.height + 0.6, rw.cz + 2.5);
      if (a && b) ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) || 2, Math.abs(b.y - a.y) || 2);
    }
  }

  // Drop-zone target circle.
  const dzR = DROP_ZONE.radius;
  ctx.beginPath();
  let dzFirst = true;
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const s = project(DROP_ZONE.x + Math.cos(a) * dzR, heightAt(DROP_ZONE.x, DROP_ZONE.z) + 1, DROP_ZONE.z + Math.sin(a) * dzR);
    if (!s) { dzFirst = true; continue; }
    if (dzFirst) { ctx.moveTo(s.x, s.y); dzFirst = false; } else ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.strokeStyle = '#ff5722'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = 'rgba(255,87,34,0.18)'; ctx.fill();

  // Trees (near ones only).
  for (const t of TREES) {
    const dx = t.x - camX, dz = t.z - camZ;
    if (dx * dx + dz * dz > 650 * 650) continue;
    const base = project(t.x, t.h, t.z);
    const top = project(t.x, t.h + t.s * 2.2, t.z);
    if (!base || !top) continue;
    const w = Math.max(1.5, (base.y - top.y) * 0.45);
    ctx.fillStyle = '#2f6b2a';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y); ctx.lineTo(base.x - w, base.y); ctx.lineTo(base.x + w, base.y);
    ctx.closePath(); ctx.fill();
  }

  // Clouds: soft white puffs, far to near.
  const cloudList = CLOUDS.map((c) => ({ ...c, d: Math.hypot(c.x - camX, c.z - camZ) }))
    .sort((a, b) => b.d - a.d);
  for (const c of cloudList) {
    const s = project(c.x, c.y, c.z);
    if (!s) continue;
    const r = Math.max(3, (c.s * 900) / s.d);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s.x - r * 0.55, s.y + r * 0.08, r * 0.6, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s.x + r * 0.55, s.y + r * 0.08, r * 0.6, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Rings (next one first in the draw order is fine — they are additive glows).
  rings.forEach((ring, idx) => {
    if (ring.done) return;
    drawRing(ctx, project, ring, idx === nextRing, time);
  });

  // The falling parcel.
  if (parcel && parcel.falling) {
    const s = project(parcel.x, parcel.y, parcel.z);
    if (s) {
      const r = Math.max(3, 500 / s.d);
      ctx.fillStyle = '#8d5a2b';
      ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x - r, s.y - r * 0.3, r * 2, r * 0.6);
    }
  }

  // The plane, in frame, centre-low.
  drawPlane(ctx, project, plane, time);
}
