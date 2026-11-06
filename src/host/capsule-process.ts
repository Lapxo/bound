import {hostOutput} from './call-context.ts';
import {actCosts} from './act-cost.ts';
import {fileURLToPath} from 'node:url';
import {boundedProcess} from './process-lifetime.ts';
import type {ReaderLifetime} from '@lapxo/topos/wire';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { validResponse } from './capsule-response.ts';
export { validResponse } from './capsule-response.ts';
import type { Request, Response } from '@lapxo/topos/contract';

/** Operational process failure, distinct from a valid contract refusal or abstention. */
export class CapsuleProcessError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly cause: unknown;

  constructor(reason: string, result: { stdout?: string; stderr?: string; status: number | null; signal: NodeJS.Signals | null; error?: unknown }) {
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    super(`REFUSE·capsule process ${reason}\n${stderr}${stdout}`);
    this.name = 'CapsuleProcessError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.status = result.status;
    this.signal = result.signal;
    this.cause = result.error;
  }
}

/** Last-line JSON is the wire framing. No partial batch, failed exit or synthetic missing response is accepted. */
export function executeCapsule(command: string, args: readonly string[], requests: readonly Request[], limits: Pick<SpawnSyncOptionsWithStringEncoding, 'timeout' | 'maxBuffer' | 'env' | 'cwd'> = {}, lifetime?:ReaderLifetime): readonly Response[] {
  return actCosts.measure(()=>{
  const cwd=limits.cwd;
  const directory=cwd===undefined?undefined:typeof cwd==='string'?cwd:fileURLToPath(cwd);
  const run = lifetime===undefined?spawnSync(command, args, { input: JSON.stringify(requests), encoding: 'utf8', maxBuffer: 1 << 26, ...limits }):boundedProcess(command,args,JSON.stringify(requests),lifetime,directory,limits.env as Readonly<Record<string,string>>|undefined);
  if ('error' in run && run.error) throw new CapsuleProcessError(`failed: ${run.error.message}`, run);
  if (run.signal !== null || run.status !== 0) throw new CapsuleProcessError(`exited ${run.status ?? `with signal ${run.signal}`}`, run);
  const last = /(?:^|\n)([^\n]*)$/.exec(run.stdout.trimEnd())?.[1] ?? '';
  let values: unknown;
  try { values = JSON.parse(last); }
  catch (error) { throw new CapsuleProcessError('returned malformed or absent JSON', { ...run, error }); }
  if (!Array.isArray(values) || values.length !== requests.length || !values.every((value, i) => validResponse(value, requests[i]!))) {
    throw new CapsuleProcessError(`returned an invalid batch; expected ${requests.length} responses`, run);
  }
  if (run.stderr) hostOutput('error',run.stderr);
  return values as readonly Response[];
  });
}
