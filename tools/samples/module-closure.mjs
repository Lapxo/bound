import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// A sample host adapter: every imported module is an artifact with its own hash.
// Rewriting module specifiers removes installation paths from the offered bytes.
// This is not standing identity; Topos still encodes the folded standing.
export function moduleClosure(entry) {
  const complete = new Map(), active = new Set(), blobs = new Map();
  function visit(url) {
    const path = fileURLToPath(url);
    if (complete.has(path)) return complete.get(path);
    if (active.has(path)) throw Error('Sample closure does not support cyclic module imports');
    active.add(path);
    const require = createRequire(url);
    const text = readFileSync(url, 'utf8').replace(/(\bfrom\s*|\bimport\s*)(['"])([^'"\n]+)\2/g,
      (match, prefix, quote, specifier) => {
        if (specifier.startsWith('node:')) return match;
        const dependency = specifier.startsWith('.') ? new URL(specifier, url) : new URL(`file://${require.resolve(specifier)}`);
        return `${prefix}${quote}./${visit(dependency)}${quote}`;
      });
    const hex = createHash('sha256').update(text).digest('hex');
    blobs.set(`sha256:${hex}`, text); complete.set(path, hex); active.delete(path);
    return hex;
  }
  const digest = `sha256:${visit(entry)}`;
  return {digest, blobs};
}
