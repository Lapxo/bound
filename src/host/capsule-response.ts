import { PROTOCOL } from '@lapxo/topos/wire';
import type { Request, Response } from '@lapxo/topos/contract';

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
