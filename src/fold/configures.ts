import { isWireClaim, parse } from '@lapxo/topos/wire';
import { fieldOf, isConfig } from './claims.ts';
import { isReaderLock } from './observed.ts';
import { isRoleLock } from './roles.ts';
import { isSignerLock } from './signers.ts';
import {isReleaseBinding} from '../host/release.ts';

function isEffectLock(line: string): boolean {
  const got = parse(line);
  return got.kind === 'fact' && got.value.fields['measure'] === 'effect';
}

/** A lock line the instrument itself consumes — an effect it runs, a reader it loads, a role it walks by, a signer it admits, the wire it reads by. */
function configures(line: string): boolean {
  const got = parse(line);
  return isReleaseBinding(line) || isEffectLock(line) || isReaderLock(line) || isRoleLock(line) || isSignerLock(line) || (got.kind === 'fact' && isWireClaim(got.value.fields));
}

/** Every reads line that configures nothing is a ceiling: a bound some reading has to meet. */
export function isCeiling(line: string): boolean {
  return isConfig(line) && fieldOf(line, 'role') === 'reads' && fieldOf(line, 'value') !== 'withdraw' && !configures(line);
}

/** A demand that names no place asks nothing of the tree: it tells a render what to write, and no take pays it. */
export function asksThePlace(line: string): boolean {
  return fieldOf(line, 'role') === 'demands' && fieldOf(line, 'needs') !== '';
}
