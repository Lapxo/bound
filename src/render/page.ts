import { fieldOf } from '../fold/claims.ts';
import type { PlaceFold } from '../cli/place.ts';
import { ownLock } from '../observe/runner.ts';
import { steps } from '@lapxo/topos/wire';

const own = (scope: string, measure?: string): string => fieldOf(ownLock().find((line) => fieldOf(line, 'scope') === scope && (!measure || fieldOf(line, 'measure') === measure) && fieldOf(line, 'value') !== 'withdraw') ?? '', 'value');
export const secondName = (): string => steps(own('head/second'))[0] ?? '';
export const nameOf = (fold: Pick<PlaceFold, 'standing' | 'under'>): string => (fold.under ?? '').replace(/\/$/, '')
  || fieldOf(fold.standing.find((line) => fieldOf(line, 'scope') === 'publish/bootstrap' && fieldOf(line, 'value') !== 'withdraw') ?? '', 'value');
