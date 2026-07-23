#!/usr/bin/env node
/**
 * Package a portable mentor-agent runtime for the macOS app.
 *
 * Output: macos/SevenHabitsMentor/Resources/MentorAgent.tgz
 * Layout inside the archive:
 *   VERSION
 *   index.cjs          — esbuild bundle of server/ + mentor decision logic
 *   bin/node           — official Node.js binary for the target darwin arch
 *   run                — executable launcher
 *
 * The app extracts this on first launch into Application Support and spawns
 * `run`, so end users need neither a git checkout nor a system Node install.
 *
 * Usage:
 *   node scripts/package-mentor-agent.mjs
 *   MENTOR_AGENT_ARCH=arm64 node scripts/package-mentor-agent.mjs
 *   MENTOR_AGENT_ARCH=x64 node scripts/package-mentor-agent.mjs
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outTgz = join(root, 'macos/SevenHabitsMentor/Resources/MentorAgent.tgz');
const NODE_VERSION = process.env.MENTOR_AGENT_NODE_VERSION?.trim() || '22.14.0';
/** Prefer Apple Silicon; allow override. Cross-builds from Linux default to arm64. */
const arch = (() => {
  const forced = process.env.MENTOR_AGENT_ARCH?.trim();
  if (forced === 'x64' || forced === 'arm64') return forced;
  if (process.platform === 'darwin' && process.arch === 'x64') return 'x64';
  return 'arm64';
})();
const platform = 'darwin';

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const staging = join(tmpdir(), `sevenhabits-mentor-agent-${process.pid}`);

async function download(url, dest) {
  console.log(`[package-agent] download ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function main() {
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(join(staging, 'bin'), { recursive: true });
  mkdirSync(dirname(outTgz), { recursive: true });

  console.log('[package-agent] esbuild server/index.ts → index.cjs');
  await build({
    entryPoints: [join(root, 'server/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: join(staging, 'index.cjs'),
    packages: 'bundle',
    logLevel: 'info',
  });

  const distName = `node-v${NODE_VERSION}-${platform}-${arch}`;
  const distUrl = `https://nodejs.org/dist/v${NODE_VERSION}/${distName}.tar.gz`;
  const distTgz = join(tmpdir(), `${distName}.tar.gz`);
  if (!existsSync(distTgz)) {
    await download(distUrl, distTgz);
  } else {
    console.log(`[package-agent] reuse cached ${distTgz}`);
  }

  const extractDir = join(tmpdir(), `node-extract-${process.pid}`);
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  console.log(`[package-agent] extract Node ${NODE_VERSION} (${platform}-${arch})`);
  execFileSync('tar', ['-xzf', distTgz, '-C', extractDir], { stdio: 'inherit' });
  const nodeBin = join(extractDir, distName, 'bin', 'node');
  if (!existsSync(nodeBin)) {
    throw new Error(`Node binary missing after extract: ${nodeBin}`);
  }
  copyFileSync(nodeBin, join(staging, 'bin', 'node'));
  chmodSync(join(staging, 'bin', 'node'), 0o755);

  const runScript = `#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export MENTOR_AGENT_PORT="\${MENTOR_AGENT_PORT:-8787}"
exec "$ROOT/bin/node" "$ROOT/index.cjs"
`;
  writeFileSync(join(staging, 'run'), runScript, { mode: 0o755 });
  chmodSync(join(staging, 'run'), 0o755);

  const indexHash = createHash('sha256')
    .update(readFileSync(join(staging, 'index.cjs')))
    .digest('hex')
    .slice(0, 12);
  const version = `${pkg.version}+${indexHash}-node${NODE_VERSION}-${arch}`;
  writeFileSync(join(staging, 'VERSION'), `${version}\n`, 'utf8');
  writeFileSync(
    join(staging, 'manifest.json'),
    JSON.stringify(
      {
        name: 'seven-habits-mentor-agent',
        version,
        node: NODE_VERSION,
        arch,
        platform,
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`[package-agent] tar → ${outTgz}`);
  rmSync(outTgz, { force: true });
  execFileSync(
    'tar',
    ['-czf', outTgz, '-C', staging, 'VERSION', 'manifest.json', 'index.cjs', 'bin', 'run'],
    { stdio: 'inherit' },
  );

  const sizeMb = (readFileSync(outTgz).byteLength / (1024 * 1024)).toFixed(1);
  console.log(`[package-agent] done: ${outTgz} (${sizeMb} MB), version=${version}`);

  rmSync(staging, { recursive: true, force: true });
  rmSync(extractDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
