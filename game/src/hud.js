// hud.js — the instruments, lit.
// One job: paint every gauge the pilot reads — speed, altitude, heading,
// artificial horizon, fuel, throttle, damage, mission panel and minimap.

import { RUNWAY, DROP_ZONE, ISLAND_RADIUS } from './terrain.js';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,22,34,0.72)';
  ctx.strokeStyle = 'rgba(140,200,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke();
}
function label(ctx, text, x, y, size = 12, color = '#9fc6e8', align = 'left') {
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}
function bigValue(ctx, text, x, y, size = 26, color = '#eaf6ff', align = 'left') {
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function drawCompass(ctx, cx, y, heading, W) {
  panel(ctx, cx - 190, y - 26, 380, 52);
  const deg = ((heading * 180 / Math.PI) % 360 + 360) % 360;
  ctx.save();
  ctx.beginPath(); ctx.rect(cx - 188, y - 24, 376, 48); ctx.clip();
  const pxPerDeg = 2.2;
  for (let d = -60; d <= 60; d += 5) {
    const a = Math.round((deg + d) / 5) * 5;
    const off = ((a - deg + 540) % 360 - 180) * pxPerDeg;
    const x = cx + off;
    const major = a % 45 === 0;
    ctx.strokeStyle = major ? '#eaf6ff' : 'rgba(160,200,235,0.6)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x, y + (major ? 2 : 8)); ctx.stroke();
    if (major) {
      const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
      label(ctx, names[((a % 360) + 360) % 360] || String(((a % 360) + 360) % 360), x, y - 2, 11, '#eaf6ff', 'center');
    }
  }
  ctx.restore();
  // Centre lubber line + readout.
  ctx.fillStyle = '#ffb300';
  ctx.beginPath(); ctx.moveTo(cx - 7, y - 26); ctx.lineTo(cx + 7, y - 26); ctx.lineTo(cx, y - 16); ctx.closePath(); ctx.fill();
  bigValue(ctx, `${String(Math.round(deg)).padStart(3, '0')}°`, cx, y + 44, 15, '#ffb300', 'center');
}

function drawHorizon(ctx, cx, cy, r, pitch, roll) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(cx, cy);
  // Bank left (roll > 0) rolls the world clockwise in the gauge: the
  // horizon's left end rises. Canvas rotate(+) is clockwise.
  ctx.rotate(roll);
  const pitchPx = pitch * r * 1.6;
  ctx.fillStyle = '#3f8fd2'; ctx.fillRect(-r, -r + pitchPx, r * 2, r);
  ctx.fillStyle = '#7a5a34'; ctx.fillRect(-r, pitchPx, r * 2, r);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-r, pitchPx - 1, r * 2, 2);
  ctx.rotate(-roll);
  ctx.restore();
  // Fixed wings + pitch ladder.
  ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy); ctx.lineTo(cx - r * 0.18, cy);
  ctx.moveTo(cx + r * 0.18, cy); ctx.lineTo(cx + r * 0.55, cy);
  ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(140,200,255,0.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  label(ctx, 'ATT', cx, cy + r + 16, 11, '#9fc6e8', 'center');
}

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.15)') {
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = 'rgba(160,200,235,0.6)'; ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawMinimap(ctx, x, y, size, plane, rings, nextRing) {
  panel(ctx, x - 8, y - 8, size + 16, size + 16);
  const scale = size / (ISLAND_RADIUS * 2 + 300);
  const toMap = (wx, wz) => [x + (wx + ISLAND_RADIUS + 150) * scale, y + (wz + ISLAND_RADIUS + 150) * scale];
  ctx.fillStyle = '#174a6e';
  ctx.beginPath(); ctx.arc(...toMap(0, 0), ISLAND_RADIUS * scale, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d8a46';
  ctx.beginPath(); ctx.arc(...toMap(0, 0), ISLAND_RADIUS * 0.72 * scale, 0, Math.PI * 2); ctx.fill();
  // Runway.
  const [rx, ry] = toMap(RUNWAY.cx, RUNWAY.cz);
  ctx.fillStyle = '#dfe6ea'; ctx.fillRect(rx - 12, ry - 2, 24, 4);
  // Drop zone.
  const [dx, dy] = toMap(DROP_ZONE.x, DROP_ZONE.z);
  ctx.strokeStyle = '#ff5722'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(dx, dy, 5, 0, Math.PI * 2); ctx.stroke();
  // Rings.
  rings.forEach((ring, i) => {
    if (ring.done) return;
    const [gx, gy] = toMap(ring.x, ring.z);
    ctx.fillStyle = i === nextRing ? '#ffb300' : 'rgba(255,179,0,0.55)';
    ctx.beginPath(); ctx.arc(gx, gy, i === nextRing ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
  });
  // Plane arrow.
  const [px, py] = toMap(plane.x, plane.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI - plane.heading);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  label(ctx, 'MAP', x, y + size + 24, 11, '#9fc6e8', 'left');
}

export function drawHud(ctx, W, H, g) {
  const p = g.plane;
  const speedKt = Math.round(p.speed * 1.944);
  const altFt = Math.max(0, Math.round((p.y - 0) * 3.281));

  // Top centre: heading compass.
  drawCompass(ctx, W / 2, 34, p.heading, W);

  // Top left: speed + altitude.
  panel(ctx, 16, 12, 196, 96);
  label(ctx, 'AIRSPEED', 30, 32);
  bigValue(ctx, `${speedKt}`, 30, 62, 30);
  label(ctx, 'KT', 108, 62, 13, '#9fc6e8');
  label(ctx, 'ALTITUDE', 30, 88);
  bigValue(ctx, `${altFt}`, 30, 106, 22);
  label(ctx, 'FT', 118, 106, 13, '#9fc6e8');

  // Top right: mission + score.
  panel(ctx, W - 276, 12, 260, 118);
  label(ctx, g.mission.name.toUpperCase(), W - 262, 34, 13, '#ffb300');
  label(ctx, g.mission.objective, W - 262, 54, 12.5, '#eaf6ff');
  label(ctx, `SCORE  ${g.score}`, W - 262, 78, 13, '#eaf6ff');
  label(ctx, `TIME  ${g.clock}`, W - 262, 100, 13, '#eaf6ff');
  label(ctx, `BEST  ${g.best}`, W - 262, 122, 12, '#9fc6e8');

  // Bottom left: attitude + throttle + fuel + damage.
  panel(ctx, 16, H - 158, 240, 142);
  drawHorizon(ctx, 66, H - 96, 42, p.pitch, p.roll);
  label(ctx, 'THR', 126, H - 138);
  bar(ctx, 126, H - 132, 112, 10, p.throttle, '#58c96b');
  label(ctx, 'FUEL', 126, H - 104);
  bar(ctx, 126, H - 98, 112, 10, p.fuel / 100, p.fuel < 25 ? '#ff5252' : '#ffb300');
  label(ctx, 'DMG', 126, H - 70);
  bar(ctx, 126, H - 64, 112, 10, p.damage / 100, '#ff5252');
  if (p.engineOut) label(ctx, 'ENGINE OUT — GLIDE!', 126, H - 40, 12, '#ff5252');

  // Bottom right: minimap.
  drawMinimap(ctx, W - 176, H - 176, 152, p, g.rings, g.nextRing);

  // Centre: next-target pointer + warnings.
  const target = g.target;
  if (target && g.state === 'fly') {
    const dx = target.x - p.x, dz = target.z - p.z;
    const dist = Math.round(Math.hypot(dx, target.y - p.y, dz));
    const want = Math.atan2(dx, -dz);
    let diff = want - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const cx = W / 2, cy = H / 2 - 90;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(diff);
    ctx.fillStyle = '#ffb300';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    label(ctx, `${target.label}  ${dist}m`, cx, cy + 34, 14, '#ffb300', 'center');
  }
  if (p.stalled && g.state === 'fly') {
    bigValue(ctx, 'STALL — NOSE DOWN, ADD POWER', W / 2, H * 0.42, 20, '#ff5252', 'center');
  }
  const ground = g.groundBelow;
  if (g.state === 'fly' && p.y - ground < 35 && p.vspeed < -2) {
    bigValue(ctx, 'PULL UP!', W / 2, H * 0.36, 26, '#ff5252', 'center');
  }
  if (g.message) {
    bigValue(ctx, g.message, W / 2, H * 0.3, 24, '#ffffff', 'center');
  }
  if (g.subMessage) {
    label(ctx, g.subMessage, W / 2, H * 0.3 + 30, 15, '#cfe8ff', 'center');
  }
}

// --- full-screen screens ------------------------------------------------------
export function drawMenu(ctx, W, H, best) {
  ctx.fillStyle = 'rgba(6,18,30,0.55)'; ctx.fillRect(0, 0, W, H);
  bigValue(ctx, 'SKY COURIER', W / 2, H * 0.3, 64, '#ffffff', 'center');
  label(ctx, 'M E R I D I A N   I S L E S', W / 2, H * 0.3 + 34, 18, '#ffb300', 'center');
  label(ctx, 'Fly the mail plane across the isles: thread the rings, drop the parcel,', W / 2, H * 0.46, 17, '#eaf6ff', 'center');
  label(ctx, 'then bring her home onto the strip. Mind your fuel — and the mountain.', W / 2, H * 0.46 + 26, 17, '#eaf6ff', 'center');
  label(ctx, 'ARROWS pitch & bank   •   W / S throttle   •   SPACE drop parcel', W / 2, H * 0.58, 16, '#cfe8ff', 'center');
  label(ctx, 'P pause   •   R restart   •   M sound', W / 2, H * 0.58 + 26, 16, '#cfe8ff', 'center');
  bigValue(ctx, 'PRESS ENTER TO FLY', W / 2, H * 0.7, 24, '#ffb300', 'center');
  if (best > 0) label(ctx, `BEST SCORE  ${best}`, W / 2, H * 0.7 + 34, 15, '#9fc6e8', 'center');
  label(ctx, 'A tiny original bush-plane game — no real airlines, no real places.', W / 2, H - 28, 12, 'rgba(160,200,235,0.7)', 'center');
}
export function drawEndScreen(ctx, W, H, title, lines, hint) {
  ctx.fillStyle = 'rgba(6,18,30,0.68)'; ctx.fillRect(0, 0, W, H);
  bigValue(ctx, title, W / 2, H * 0.34, 48, '#ffffff', 'center');
  lines.forEach((l, i) => label(ctx, l, W / 2, H * 0.46 + i * 28, 18, '#eaf6ff', 'center'));
  bigValue(ctx, hint, W / 2, H * 0.46 + lines.length * 28 + 26, 20, '#ffb300', 'center');
}
