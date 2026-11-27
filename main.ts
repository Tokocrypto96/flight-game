// main.ts — Sky Courier's hand-in program (make.fun program/v1, Node 22).
// One job: copy game/ and screenshots/ into the output directory and write
// /output/dossier.json with buildDossier from vendor/makefun-game.ts,
// exactly as the bounty gate rebuilds it. No network, no build step,
// standard library only. Run twice, it writes the same bytes twice.
// NOTE: /output is a mounted volume in the grader — never remove the
// output directory itself (EBUSY); only its contents are cleared.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = dirname(fileURLToPath(import.meta.url));
// Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output.
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The gate's caps, from the bounty rules: game/ at most 993 entries and
// 48 MiB, index.html at most 1 MiB, 3–4 screenshots at most 256 KiB each,
// the dossier text at most 160 KiB.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

function copyTree(name: string): void {
  const from = join(repoRoot, name);
  const to = join(outDir, name);
  if (!existsSync(from)) {
    throw new Error(`main.ts: ${name}/ is missing from the repository`);
  }
  cpSync(from, to, { recursive: true });
}

// A fresh, empty output directory, so a second run writes the same bytes.
// Clear only what this program writes INSIDE the output directory, never
// the directory itself: in the grader /output is a mounted volume and
// removing the mount point fails with EBUSY (rmdir), which killed the
// previous submission with exit 1. The kit's starter does the same:
// mkdir + copy, no recursive remove of the output root.
for (const name of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(outDir, name), { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

copyTree('game');
copyTree('screenshots');

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

// Self-check: the dossier must be byte-for-byte reproducible — the grader
// runs this program twice and compares, so a second build from the same
// output directory has to write the same bytes.
const rebuilt = buildDossier(outDir, CAPS);
if (!Buffer.from(dossier).equals(Buffer.from(rebuilt))) {
  throw new Error('main.ts: dossier is not reproducible (second build differs)');
}

console.log(`main.ts: wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
