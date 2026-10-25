import { createHash, gzipSync, join } from '../host/io.ts';
import { canonical, LOCK } from '@lapxo/topos/wire';
import { fieldOf, isWire } from './claims.ts';
import { memoized } from './digests.ts';
import { rolesOf } from './roles.ts';
import { said } from './wire.ts';
import { releasesOf } from '../host/release.ts';
import { land, landBlob, ledgerLines } from '../land/ledger.ts';
import { coordinatesUnder, observeFile, observeText, stampOf } from '../observe/files.ts';
import { ownLock } from '../observe/runner.ts';

const RECEIPT = 'laid/';
const DIGEST = '{digest}';

/** The host's marks, named by the lock: `release/asset` on this place, else the asset and archive the tree already writes. */
const assetsOf = (_store: string): readonly string[] => said(ownLock(), 'release/asset');

const marked = (coordinate: string, tokens: readonly string[]): boolean => tokens.some((token) => {
  const at = token.indexOf(DIGEST);
  if (at < 0) return !token.includes('{') && coordinate === token;
  const head = token.slice(0, at);
  const tail = token.slice(at + DIGEST.length);
  return coordinate.startsWith(head) && coordinate.endsWith(tail)
    && coordinate.length === head.length + tail.length + 64
    && /^[0-9a-f]{64}$/.test(coordinate.slice(head.length, coordinate.length - tail.length));
});

const coordinatesOf = (store: string, place: string): readonly string[] => {
  const roleOf = rolesOf(store);
  const written = new Set((observeText(join(place, LOCK)) ?? '').split('\n').filter(isWire)
    .map((line) => fieldOf(line, 'shape').split('/')[0] ?? ''));
  const held = (coordinate: string): boolean => !coordinate || (roleOf(coordinate) !== 'foreign' && (!coordinate.startsWith('.') || written.has(coordinate.split('/')[0] ?? '')));
  const marks = assetsOf(store);
  return coordinatesUnder(place, place, held).filter((coordinate) => held(coordinate) && !marked(coordinate, marks)).sort();
};

const stateOf = (place: string, files: readonly string[]): string =>
  createHash('sha256').update(files.map((coordinate) => `${coordinate} ${stampOf(join(place, coordinate))?.stamp ?? ''}`).join('\n')).digest('hex');

/**
 * A release is named by the digest of its folder, and what is laid is read again from its bytes by the same method: every
 * coordinate but those the tree's roles call foreign, a dotted one only where the folder's own lock writes into it, sorted, each a
 * ustar entry of mode 0644, owner 0 and time 0, then two empty blocks, gzipped at level nine. The mark the host writes is
 * none of those coordinates, so the digest of a place is the digest of the release laid there, or it is not that release.
 */
export function releaseDigest(store: string, place: string): { readonly state: string; readonly digest: string } {
  const files = coordinatesOf(store, place);
  const state = stateOf(place, files);
  return { state, digest: memoized(store, `laid ${state}`, () => {
    const blocks: Buffer[] = [];
    for (const coordinate of files) {
      const bytes = Buffer.from(observeFile(join(place, coordinate)) ?? new Uint8Array());
      const header = Buffer.alloc(512);
      const cut = coordinate.length <= 100 ? -1 : coordinate.lastIndexOf('/');
      header.write(cut < 0 ? coordinate : coordinate.slice(cut + 1), 0, 100, 'utf8');
      header.write('0000644\0', 100, 8, 'utf8');
      header.write('0000000\0', 108, 8, 'utf8');
      header.write('0000000\0', 116, 8, 'utf8');
      header.write(`${bytes.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8');
      header.write('00000000000\0', 136, 12, 'utf8');
      header.write('        ', 148, 8, 'utf8');
      header.write('0', 156, 1, 'utf8');
      header.write('ustar\0', 257, 6, 'utf8');
      header.write('00', 263, 2, 'utf8');
      header.write(cut < 0 ? '' : coordinate.slice(0, cut), 345, 155, 'utf8');
      header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
      blocks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
    }
    blocks.push(Buffer.alloc(1024));
    const archive = gzipSync(Buffer.concat(blocks), { level: 9 });
    const digest = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
    landBlob(store, digest, archive);
    return digest;
  }) };
}

/**
 * What the pass lands after it lays: for each release the own lock lays where it needs it, the digest its bytes give, by
 * the stamps of the bytes it read. What is read is the receipt of the bytes as they lie now: none is a count, and one
 * whose digest is not the one the lock names is a count.
 */
export function landLaid(store: string, own: string, lock: readonly string[], folder: string | undefined): void {
  if (folder === undefined) return;
  land(store, folder, releasesOf(lock).filter((line) => fieldOf(line, 'needs')).map((line) => ((got) => canonical({
    scope: `${RECEIPT}${fieldOf(line, 'scope').slice('dep/'.length)}/digest`, role: 'writes', form: 'alphabet', measure: 'digest',
    value: got.digest, by: folder, at: `place:${got.state}`,
  }))(releaseDigest(store, join(own, fieldOf(line, 'needs'))))));
}

export const laidDiffers = (store: string, own: string, lock: readonly string[], folder: string | undefined): number => {
  const said = new Map((folder === undefined ? [] : ledgerLines(store, folder)).filter((line) => fieldOf(line, 'scope').startsWith(RECEIPT))
    .map((line) => [`${fieldOf(line, 'scope')} ${fieldOf(line, 'at')}`, fieldOf(line, 'value')] as const));
  return releasesOf(lock).filter((line) => fieldOf(line, 'needs')).filter((line) => {
    const place = join(own, fieldOf(line, 'needs'));
    return said.get(`${RECEIPT}${fieldOf(line, 'scope').slice('dep/'.length)}/digest place:${stateOf(place, coordinatesOf(store, place))}`) !== fieldOf(line, 'value');
  }).length;
};
