import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
// Rebuild from source so removed modules cannot survive into a release archive.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--build', '--force'], { cwd: root, stdio: 'inherit' });

// A forced build does not reuse the compiler cache; leave only the build outputs.
const config = JSON.parse(readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'));
const cache = config.compilerOptions?.tsBuildInfoFile;
if (cache) {
  const at = new URL(cache, new URL('../', import.meta.url));
  if (!fileURLToPath(at).startsWith(root)) throw new Error('Compiler cache is outside the project');
  rmSync(at, { force: true });
}
