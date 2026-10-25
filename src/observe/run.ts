import {executeCapsule} from '../host/capsule-process.ts';
import {BoundRefusal} from '../host/refusals.ts';
import type {topos_wire_ReaderLifetime as ReaderLifetime} from "../../vendor/library.js";
import { existsSync } from 'node:fs';
import { topos_wire_PROTOCOL as PROTOCOL } from "../../vendor/library.js";
import type { topos_contract_Request as Request } from "../../vendor/library.js";
import { processOf, readerOf } from './runner.ts';

export type Kind = 'js' | 'process';

/** The kinds this host starts. A reader of any other kind is signed and stays potential: nothing here runs it. */
export const runs = (kind: string): kind is Kind => kind === 'js' || kind === 'process';

interface Row {
  readonly scope: string;
  readonly measure: string;
  readonly role: string;
  readonly bound: { readonly kind: string; readonly values?: readonly string[]; readonly lo?: number; readonly hi?: number };
}

interface Input {
  readonly place: string;
  readonly text?: string;
  readonly held?: readonly (readonly [string, string])[];
  readonly region?: string;
}

/** The host end of the contract, beside the command that started this process: a module runs in a process of its own. */
export const hostOf = (): string => processOf('host');

/**
 * A reader runs as a process of its own, started by the runtime from the module its lock names, in the root its places
 * are named from: the instrument loads no capsule into itself. It is asked through the one contract, each place with
 * the file it is handed or alone when it reads the place by running it, as the region it was matched for when its
 * capsule reads with several, and answers one list of claims per place.
 */
export function runReader(module: string, root: string, inputs: readonly Input[], limits?:ReaderLifetime): readonly (readonly Row[])[] {
  if (!inputs.length) return [];
  const requests: readonly Request[] = inputs.map((input) => ({
    protocol: PROTOCOL, verb: 'read', rootScope: input.place, files: input.text === undefined ? [] : [{ place: input.place, text: input.text }], ...(input.held ? { held: input.held } : {}),
    ...(input.region ? { region: input.region } : {}),
  }));
  const reader = readerOf(module);
  if (!existsSync(reader.path)) throw new Error(`REFUSE·reader ${module} unavailable; its declared capability needs an admitted provider`);
  const args=[...reader.flags, hostOf(), reader.path, module];
  let answers;
  try{answers=executeCapsule(process.execPath,args,requests,{cwd:root,maxBuffer:1<<28},limits);}
  catch(error){throw new BoundRefusal('reader/response',`REFUSE·reader ${module} · ${error instanceof Error?error.message:String(error)}`);}
  return answers.map(answer=>{
    if(answer.kind!=='fact')throw new BoundRefusal('reader/response',`REFUSE·reader ${module} · ${answer.why??'no reading answered'}`);
    return answer.claims as readonly Row[];
  });
}
