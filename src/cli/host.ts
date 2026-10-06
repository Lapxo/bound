import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { respond } from '@lapxo/topos/contract';
import { provide } from '../host/provide.ts';

/**
 * The host end of the contract, a process of its own: it loads the one module a lock names, or the blob built from it
 * with the module named beside it, hands it the requests on its standard input and prints on its last line what the
 * contract answers. The instrument never loads a reader or a
 * capsule into itself; this process is theirs, and the only one that reads a request off standard input.
 */
void (async (): Promise<void> => {
  try {
    provide();
    const loaded = (await import(pathToFileURL(resolve(process.argv[2] ?? '')).href)) as Record<string, unknown>;
    const self = resolve(process.argv[3] ?? process.argv[2] ?? '');
    process.stdout.write(`\n${respond(typeof loaded['load'] === 'function' ? await (loaded['load'] as () => Promise<Record<string, unknown>>)() : loaded, readFileSync(0, 'utf8'), self)}\n`);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').trim();
    process.stderr.write(`LOAD     index · module error · ${message}\n`);
    process.exitCode = 1;
  }
})();
