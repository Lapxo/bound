/** The store root is the tree that holds a TARGET.bound beside its .bound store. */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { EXTENSION, LOCK } from '@lapxo/topos/wire';

export function storeRoot(from: string): string {
  const abs = resolve(from || '.');
  let at = abs;
  for (let i = 0; i < 64; i += 1) {
    if (existsSync(join(at, LOCK)) && existsSync(join(at, EXTENSION))) return at;
    const parent = dirname(at);
    if (parent === at) break;
    at = parent;
  }
  return abs;
}

export const storeDirs = (store: string): number => existsSync(store) ? readdirSync(store, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length : 0;
