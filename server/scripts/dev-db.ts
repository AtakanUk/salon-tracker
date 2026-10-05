/**
 * Starts a local PostgreSQL instance for development (no Docker needed).
 *
 * The postgres binaries shipped in node_modules are copied to ~/.friseur-pg
 * first: initdb embeds its install path into the bootstrap SQL, and a project
 * path with non-ASCII characters (a localized Windows Desktop folder, say)
 * breaks UTF8 clusters. Data lives in ~/.friseur-pgdata, outside any synced folder.
 *
 * Stop with Ctrl+C.
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceNative = path.join(
  serverDir,
  '..',
  'node_modules',
  '@embedded-postgres',
  process.platform === 'win32' ? 'windows-x64' : `${process.platform}-${process.arch}`,
  'native',
);
const exe = process.platform === 'win32' ? '.exe' : '';

const pgHome = path.join(os.homedir(), '.friseur-pg');
const dataDir = path.join(os.homedir(), '.friseur-pgdata');
const binDir = path.join(pgHome, 'bin');
const PORT = 5433;

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (res.status !== 0) {
    throw new Error(`${path.basename(cmd)} exited with code ${res.status}`);
  }
}

if (!existsSync(binDir)) {
  console.log(`Copying PostgreSQL binaries to ${pgHome} ...`);
  if (!existsSync(sourceNative)) {
    throw new Error(`PostgreSQL binaries not found at ${sourceNative}. Run npm install first.`);
  }
  cpSync(sourceNative, pgHome, { recursive: true });
}

if (!existsSync(dataDir)) {
  console.log('Initialising PostgreSQL data directory (UTF8)...');
  const pwFile = path.join(os.tmpdir(), `friseur-pw-${Date.now()}.txt`);
  writeFileSync(pwFile, 'postgres');
  try {
    run(path.join(binDir, `initdb${exe}`), [
      '-D', dataDir,
      '-U', 'postgres',
      '-A', 'password',
      `--pwfile=${pwFile}`,
      '--encoding=UTF8',
      '--locale=C',
    ]);
  } finally {
    rmSync(pwFile, { force: true });
  }
}

console.log('Starting PostgreSQL...');
const server = spawn(
  path.join(binDir, `postgres${exe}`),
  ['-D', dataDir, '-p', String(PORT)],
  { stdio: ['ignore', 'inherit', 'pipe'] },
);

let ready = false;
server.stderr.on('data', (chunk: Buffer) => {
  const text = chunk.toString();
  process.stderr.write(text);
  if (!ready && text.includes('ready to accept connections')) {
    ready = true;
    // the Windows binary package has no createdb/psql;
    // `prisma migrate dev` creates the "friseur" database itself when missing
    console.log(`PostgreSQL running at postgresql://postgres:postgres@127.0.0.1:${PORT}/friseur`);
    console.log('Press Ctrl+C to stop.');
  }
});

const stop = () => {
  spawnSync(path.join(binDir, `pg_ctl${exe}`), ['stop', '-D', dataDir, '-m', 'fast']);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => {
  console.log(`postgres exited with code ${code}`);
  process.exit(code ?? 0);
});
