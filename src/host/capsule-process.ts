import {boundedProcess} from './process-lifetime.ts';
import type {ReaderLifetime} from '@lapxo/topos/wire';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { PROTOCOL } from '@lapxo/topos/wire';
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

export function validResponse(value: unknown, request: Request): value is Response {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const one = value as Record<string, unknown>;
  if (one['protocol'] !== PROTOCOL) return false;
  if (one['kind'] === 'refuse' || one['kind'] === 'abstain') return typeof one['why'] === 'string';
  if (one['kind'] !== 'fact') return false;
  if (request.verb === 'render') return Array.isArray(one['lines']) && one['lines'].every((line) => typeof line === 'string');
  if (request.verb === 'read') return Array.isArray(one['claims']);
  return true;
}

/** Last-line JSON is the wire framing. No partial batch, failed exit or synthetic missing response is accepted. */
export function executeCapsule(command: string, args: readonly string[], requests: readonly Request[], limits: Pick<SpawnSyncOptionsWithStringEncoding, 'timeout' | 'maxBuffer'> = {}, lifetime?:ReaderLifetime): readonly Response[] {
  const run = lifetime===undefined?spawnSync(command, args, { input: JSON.stringify(requests), encoding: 'utf8', maxBuffer: 1 << 26, ...limits }):boundedProcess(command,args,JSON.stringify(requests),lifetime);
  if ('error' in run && run.error) throw new CapsuleProcessError(`failed: ${run.error.message}`, run);
  if (run.signal !== null || run.status !== 0) throw new CapsuleProcessError(`exited ${run.status ?? `with signal ${run.signal}`}`, run);
  const last = /(?:^|\n)([^\n]*)$/.exec(run.stdout.trimEnd())?.[1] ?? '';
  let values: unknown;
  try { values = JSON.parse(last); }
  catch (error) { throw new CapsuleProcessError('returned malformed or absent JSON', { ...run, error }); }
  if (!Array.isArray(values) || values.length !== requests.length || !values.every((value, i) => validResponse(value, requests[i]!))) {
    throw new CapsuleProcessError(`returned an invalid batch; expected ${requests.length} responses`, run);
  }
  if (run.stderr) process.stderr.write(run.stderr);
  return values as readonly Response[];
}
