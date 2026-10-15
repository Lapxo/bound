import { resolve } from 'node:path';
import { observedClaims } from '../fold/observed.ts';
import { storeOf } from '../land/ledger.ts';
import {withContentStore} from '../host/content-store.ts';
import {lockStanding} from '../fold/keys.ts';
import {underRootAuthority} from '../land/act.ts';

/** One reader, run to the end behind a fold that did not wait for it: what it lands, the next fold reads. */
const args = process.argv.slice(2);
if (args.length > 3 || (args[2] !== undefined && (args[1] === undefined || !/^sha256:[a-f0-9]{64}$/.test(args[2])))) throw Error('REFUSE·reader invalid internal background arguments');
const [root = '.', only, selected] = args;
const place=resolve(root),store=storeOf(place);
await underRootAuthority(store,'reader authority',()=>withContentStore(store,()=>observedClaims(place,store,{ wait:true, ...(only === undefined ? {} : { only }), ...(selected === undefined ? {} : { selected }) }),()=>lockStanding(store)));
