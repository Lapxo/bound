import { existsSync, join, readdirSync } from '../host/io.ts';
import { LOCK } from '@lapxo/topos/wire';
import { fieldOf, isWire } from './claims.ts';
import { observeText } from '../observe/files.ts';

/** A clone that holds a lock and no ledger: receipts none, one place opened, the needs the lock names, each uses/ pin still open, and README.md to render. Nothing is folded and nothing is written. */
export function emptyLedger(store: string): boolean {
  const dir = join(store, 'ledger');
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

export function sayStranger(root: string): void {
  const lines = (observeText(join(root, LOCK)) ?? '').split('\n').filter(isWire);
  const needs = [...new Set(lines.flatMap((line) => fieldOf(line, 'needs').split('|').filter(Boolean)))].sort();
  const uses = lines.filter((line) => {
    const scope = fieldOf(line, 'scope');
    return scope.startsWith('uses/') && !scope.slice('uses/'.length).includes('/') && fieldOf(line, 'value') !== 'withdraw';
  }).map((line) => fieldOf(line, 'scope'));
  const shape = fieldOf(lines.find((line) => fieldOf(line, 'scope').startsWith('view/') && fieldOf(line, 'shape') !== '' && fieldOf(line, 'value') !== 'withdraw') ?? '', 'shape');
  process.stdout.write('RECEIPTS 0 read · 1 opened\n');
  process.stdout.write(`NEEDS    ${needs.join(' ')}\n`);
  for (const scope of uses) process.stdout.write(`OPEN     ${scope}/\n`);
  if (shape) process.stdout.write(`RENDER   ${shape}\n`);
}
