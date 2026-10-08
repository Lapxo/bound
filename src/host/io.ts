/** The host's node surface: kernel folders import here, never `node:`. World reads still go through observeFile. */
export { spawn, spawnSync } from 'node:child_process';
export { createHash } from 'node:crypto';
export {
  appendFileSync, closeSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
export { tmpdir } from 'node:os';
export { basename, dirname, join, relative, resolve } from 'node:path';
export { fileURLToPath } from 'node:url';
export { parentPort, workerData } from 'node:worker_threads';
export { gzipSync } from 'node:zlib';
