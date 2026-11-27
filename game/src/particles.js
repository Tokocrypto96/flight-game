// particles.js — smoke, spray and wreckage.
// One job: little bursts that make landings, splashes and crashes read.

export function newParticles() { return []; }

export function spawnBurst(list, x, y, z, kind, n = 24) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * (kind === 'smoke' ? 10 : 22);
    list.push({
      x, y, z,
      vx: Math.cos(a) * sp, vy: Math.random() * sp * 0.8 + 2, vz: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.9, age: 0,
      size: kind === 'smoke' ? 3 + Math.random() * 5 : 2 + Math.random() * 3,
      kind,
    });
  }
}
export function spawnTrail(list, x, y, z) {
  list.push({
    x, y, z, vx: 0, vy: 0.4, vz: 0,
    life: 0.7, age: 0, size: 2.5, kind: 'smoke',
  });
  if (list.length > 220) list.splice(0, list.length - 220);
}
export function stepParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    if (p.age >= p.life) { list.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy -= p.kind === 'smoke' ? -0.4 * dt : 9 * dt;
  }
}
// Particles are drawn in screen space by the caller, which projects them.
export function particleColor(p) {
  if (p.kind === 'fire') return `rgba(255,${120 + Math.floor(100 * (1 - p.age / p.life))},20,${1 - p.age / p.life})`;
  if (p.kind === 'spray') return `rgba(190,225,245,${0.9 * (1 - p.age / p.life)})`;
  return `rgba(120,120,120,${0.45 * (1 - p.age / p.life)})`;
}
