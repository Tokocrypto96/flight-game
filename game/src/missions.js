// missions.js — the three-sortie campaign.
// One job: define each mission's goal, watch for it, and score it.
// Ring Run → Supply Drop → Island Landing. Finish all three and the
// courier's day is done; the score is rings + drop accuracy + landing
// smoothness + the fuel still in the tanks.

import { DROP_ZONE } from './terrain.js';

export const RING_COURSE = [
  { x: -620, y: 170, z: -420, radius: 20, face: 0.6 },
  { x: -140, y: 165, z: -820, radius: 20, face: 1.1 },
  { x: 220, y: 175, z: -880, radius: 20, face: 1.7 },
  { x: 620, y: 160, z: -560, radius: 20, face: 2.2 },
  { x: 780, y: 150, z: -40, radius: 20, face: 2.8 },
  { x: 560, y: 140, z: 420, radius: 20, face: 3.4 },
];

export const MISSIONS = [
  {
    id: 'rings',
    name: 'Mission 1 — Ring Run',
    objective: 'Thread all 6 rings in order',
    briefing: 'The mail route is marked with rings. Fly through each one — clean and centred scores best.',
  },
  {
    id: 'drop',
    name: 'Mission 2 — Supply Drop',
    objective: 'Drop the parcel on the circle (SPACE)',
    briefing: 'A clinic on the south isle needs supplies. Line up over the orange circle and press SPACE.',
  },
  {
    id: 'landing',
    name: 'Mission 3 — Island Landing',
    objective: 'Land on the runway — gently',
    briefing: 'Bring her home. Slow to under 110 kt, flare, and touch down on the strip, not the grass.',
  },
];

export function missionState(idx) {
  const rings = RING_COURSE.map((r) => ({ ...r, done: false }));
  return {
    index: idx,
    def: MISSIONS[idx],
    rings,
    nextRing: 0,
    parcelDropped: false,
    parcelScored: false,
    landed: false,
  };
}

// Returns an event object when something scored, else null.
export function updateMission(m, plane, parcel, events) {
  if (m.index === 0) {
    const ring = m.rings[m.nextRing];
    if (!ring) return null;
    const d = Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
    if (d < ring.radius) {
      ring.done = true;
      m.nextRing++;
      const centred = Math.max(0, 1 - d / ring.radius);
      return { type: 'ring', points: Math.round(200 + centred * 100), count: m.nextRing, total: m.rings.length };
    }
    return null;
  }
  if (m.index === 1) {
    if (parcel && parcel.landed && !m.parcelScored) {
      m.parcelScored = true;
      const d = Math.hypot(parcel.x - DROP_ZONE.x, parcel.z - DROP_ZONE.z);
      const points = d <= DROP_ZONE.radius
        ? Math.round(500 - (d / DROP_ZONE.radius) * 200)
        : Math.max(0, Math.round(180 - (d - DROP_ZONE.radius) * 1.5));
      return { type: 'drop', points, dist: Math.round(d) };
    }
    return null;
  }
  if (m.index === 2) {
    if (events.includes('touchdown') || events.includes('stopped')) {
      if (!m.landed) {
        m.landed = true;
        const smooth = Math.max(0, 1 + plane.vspeed / 7); // vspeed is negative
        const points = Math.round(400 + smooth * 300 + Math.max(0, plane.fuel) * 2);
        return { type: 'landing', points, vspeed: Math.round(plane.vspeed * 3.281) };
      }
    }
    return null;
  }
  return null;
}

export function currentTarget(m) {
  if (m.index === 0) {
    const ring = m.rings[m.nextRing];
    return ring ? { x: ring.x, y: ring.y, z: ring.z, label: `RING ${m.nextRing + 1}/${m.rings.length}` } : null;
  }
  if (m.index === 1) {
    // The clinic's field sits ~44 m up; approach 60 m above it to drop.
    return { x: DROP_ZONE.x, y: 105, z: DROP_ZONE.z, label: 'DROP ZONE' };
  }
  return { x: 420, y: 14, z: 0, label: 'RUNWAY' };
}
