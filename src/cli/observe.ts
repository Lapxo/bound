import { resolve } from 'node:path';
import { observedClaims } from '../fold/observed.ts';
import { storeOf } from '../land/ledger.ts';

/** One reader, run to the end behind a fold that did not wait for it: what it lands, the next fold reads. */
const [root = '.', only] = process.argv.slice(2);
observedClaims(resolve(root), storeOf(resolve(root)), { wait: true, ...(only === undefined ? {} : { only }) });
