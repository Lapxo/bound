import { createHash, dirname, join } from '../host/io.ts';
import { parse, roleClaimsOf } from '@lapxo/topos/wire';
import type { RoleClaim } from '@lapxo/topos/wire';
import { namesAt, roleAt } from './wire.ts';
import type { CoordinateRole } from './wire.ts';
import { lockStanding } from './keys.ts';
import { placesIn } from './places.ts';
import { ownLockOf } from './signed.ts';
import { observeText } from '../observe/files.ts';
import { fieldOf, isWire } from './claims.ts';

/** A lock line that gives a coordinate its role: every walk of the tree reads it. */
export function isRoleLock(line: string): boolean {
  const got = parse(line);
  return got.kind === 'fact' && roleClaimsOf([got.value.fields]).length > 0;
}

/** A lock the owner signs by digest and a capsule writes: its lines stand while the bytes are the ones that were signed. */
export function inheritedRoles(store: string): { readonly claims: readonly RoleClaim[]; readonly stale: readonly string[] } {
  const root = dirname(store);
  const claims: Readonly<Record<string, string>>[] = [];
  const stale: string[] = [];
  for (const line of lockStanding(store)) {
    if (fieldOf(line, 'measure') !== 'role' || !fieldOf(line, 'scope').startsWith('roles/')) continue;
    const at = fieldOf(line, 'needs');
    const held = at ? observeText(join(root, at)) : undefined;
    const digest = held === undefined ? '' : `sha256:${createHash('sha256').update(held).digest('hex')}`;
    if (held === undefined || digest !== fieldOf(line, 'restsOn')) {
      stale.push(fieldOf(line, 'scope'));
      continue;
    }
    for (const one of held.split('\n').filter(isWire).map((row) => parse(row))) {
      if (one.kind === 'fact') claims.push(one.value.fields);
    }
  }
  return { claims: roleClaimsOf(claims), stale };
}

/**
 * What each coordinate of the tree is: the capsule that knows a world writes the roles of that world, the owner signs the
 * capsule's lock by digest, and this fold reads both. The instrument reads claims and never a name, and a coordinate no
 * standing claim names is source. The steps a walk must not enter are read the same way: the claims that name a whole
 * folder foreign or derived, as a set the walk can ask in one step instead of matching every claim at every step.
 */
export function stepsOutside(store: string): ReadonlySet<string> {
  const own = roleClaimsOf(lockStanding(store)
    .map((line) => parse(line))
    .flatMap((got) => (got.kind === 'fact' ? [got.value.fields] : [])));
  return new Set([...own, ...inheritedRoles(store).claims]
    .filter((claim) => (claim.role === 'foreign' || claim.role === 'derived') && !claim.name.includes('/') && !claim.name.includes('*'))
    .map((claim) => claim.name));
}

export function rolesOf(store: string): (coordinate: string) => CoordinateRole {
  const fields = (lines: readonly string[]): Readonly<Record<string, string>>[] => lines.map((line) => parse(line)).flatMap((got) => (got.kind === 'fact' ? [got.value.fields] : []));
  const claims = [...roleClaimsOf(fields(lockStanding(store))), ...inheritedRoles(store).claims];
  const root = dirname(store);
  const placed = new Map(placesIn(root).map((place) => [place, roleClaimsOf(fields(ownLockOf(root, place)))] as const));
  return (coordinate) => {
    const own = coordinate.includes('/') ? placed.get(coordinate.slice(0, coordinate.indexOf('/'))) ?? [] : [];
    return roleAt(coordinate, own.some((claim) => namesAt(coordinate, claim.name)) ? own : claims);
  };
}
