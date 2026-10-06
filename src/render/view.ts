import {receiptRegion} from './receipts.ts';
import { releasePolicyLines } from '../fold/release-policy.ts';
import { join } from '../host/io.ts';
import { observeText } from '../observe/files.ts';
import { secondName } from './page.ts';
import { capsuleAnswers, capsuleRegions, capsuleViews } from './capsule.ts';
import { declaredBy } from '../observe/regions.ts';
import type { RegionName } from './names.ts';
import { readersBehind } from '../fold/observed.ts';
import { LOCK, canonical, matches } from '@lapxo/topos/wire';
import { STATES } from '@lapxo/obligations';
import type { PlaceFold } from '../cli/place.ts';
import type { View } from '../fold/views.ts';
import { fieldOf, foldClaims, selfName } from '../fold/claims.ts';
import { keepRender, keptRender } from '../fold/kept.ts';
import { bytesDigest } from '../fold/digests.ts';
import { writerFor } from '../fold/signers.ts';
import { lockLines } from '../fold/keys.ts';
import { horizonOf, moved, shapeLines } from './shape.ts';
import { rankLines } from '../fold/rank.ts';
import { differing, regionsOf } from '../fold/region.ts';
import { verdictsFor } from '../fold/paid.ts';
import { field } from './field.ts';
import { helpLines } from '../cli/names.ts';

type Region = (fold: PlaceFold) => readonly string[];

const block = (name: string, lines: readonly string[]): readonly string[] => (lines.length ? [`## ${name}`, '', '```', ...lines, '```'] : []);
const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

const statesOf = (fold: PlaceFold): readonly string[] => {
  const held = new Map<string, number>();
  for (const one of Object.values(verdictsFor(fold))) held.set(one, (held.get(one) ?? 0) + 1);
  return STATES.flatMap((one) => (held.get(one) ? [`${one} ${held.get(one)}`] : []));
};

const programs: Region = (fold) => {
  const median = fold.costs.length ? [...fold.costs].sort((a, b) => a - b)[Math.floor(fold.costs.length / 2)] ?? 0 : 0;
  const turned = moved(fold);
  const far = horizonOf(fold);
  const refusedByReader = fold.observed.filter((line) => fieldOf(line, 'scope') === 'refuse/reader').length;
  const c = fold.ceilings;
  return block('programs', [
    `PROGRAMS${fold.under ? ` ${fold.under}` : ''} ${[`${fold.claims} claims`, ...statesOf(fold), `${fold.history.length} history`].join(' · ')}`
    + ` · ${fold.forks.length + (fold.second.verdict === 'forks' ? 1 : 0)} forks · ${fold.grey.length} grey · ${fold.refused.length} refused · ${fold.vacuous} vacuous`
    + ` · ${secondName()} ${fold.second.verdict}${fold.second.verdict === 'agrees' && !fold.second.external ? ', never disagreed' : ''}`
    + ` · store ${fold.observed.length} observed${refusedByReader ? ` · ${refusedByReader} refuse·reader` : ''}`
    + (fold.under ? ` · ceilings ${c.read} met here · ${c.short.length} short · ${c.over.length} over`
      : ` · ceilings ${c.read}/${c.total} read · ${c.short.length} short · ${c.over.length} over · ${c.unread.length} unread${c.vacuous.length ? ` · ${c.vacuous.length} vacuous unread` : ''}`)
    + ` · ${fold.effects} · take ${fold.costs.length ? seconds(fold.costs[fold.costs.length - 1] ?? 0) : 'none'} last`
    + (fold.costs.length > 1 ? ` · ${seconds(median)} median of ${fold.costs.length}` : '')
    ,
    ...shapeLines(fold),
    ...rankLines(fold),
    `OPEN     ${(fold.open ?? []).length} unresolved decisions`,
    `MOVED    ${turned.observation + turned.signature} verdicts turned · ${turned.observation} by observation · ${turned.signature} by signature`,
    `HORIZON  ${far.unread} of ${far.sources} sources no reader reaches`,
    ...releasePolicyLines(fold.release),
    ...asCells(fold),
  ]);
};

/**
 * A key and a lock are cells under the one relation: what each has signed is its floor, what it may sign its ceiling,
 * and it stays grey while it is its own only origin. What a place has already been observed to be travels with it as
 * the reader's own lines, digest and all: a clone lands them and runs nothing, since running is how a second head
 * disagrees and not how the first one sees green.
 */
function asCells(fold: PlaceFold): readonly string[] {
  const signed = fold.signed;
  const coverage = new Map<string, string>();
  for (const line of fold.standing) {
    const key = /^keys\/([^/]+)$/.exec(fieldOf(line, 'scope'))?.[1];
    if (key && fieldOf(line, 'measure') === 'coverage') coverage.set(key, fieldOf(line, 'value'));
  }
  const colour = fold.second.verdict === 'agrees' ? 'green' : fold.second.verdict === 'forks' ? 'fork' : 'grey';
  const alone = fold.second.verdict === 'agrees' ? 0 : fold.claims;
  return [
    ...[...coverage].sort().map(([key, covers]) => `KEY      keys/${key} · floor ${signed.get(key) ?? 0} lines signed · ceiling ${covers} · ${signed.get(key) ? colour : 'grey'}`),
    `LOCK     ${fold.under ?? ''}${LOCK} · floor ${fold.landed} sources vouched · ceiling ${fold.lock} lines · ${colour}`,
    `BLIND    ${alone} lines stand on one origin · second head ${fold.second.verdict === 'stale' && fold.second.epoch ? `agreed at epoch ${fold.second.epoch}, elsewhere` : fold.second.verdict}`,
  ];
}

const whyAt = new WeakMap<PlaceFold, string>();
export const askWhy = (fold: PlaceFold, coord: string): void => { whyAt.set(fold, coord); };

const why: Region = (fold) => {
  const coord = whyAt.get(fold);
  if (coord) {
    const hits = fold.standing.filter((line) => fieldOf(line, 'needs').split('|').includes(coord) || fieldOf(line, 'shape') === coord);
    return block('why', hits.length ? hits.map((line) => `WHY      ${fieldOf(line, 'scope')} · ${fieldOf(line, 'at')} · ${fieldOf(line, 'value')}`) : [`OPEN     ${coord}`]);
  }
  const named = fold.standing.find((line) => fieldOf(line, 'scope') === `${fold.under ?? ''}view/why` || fieldOf(line, 'scope') === 'view/why');
  const at = fieldOf(named ?? '', 'shape') || fieldOf(named ?? '', 'needs').split('|').find(Boolean) || '';
  const held = at ? observeText(join(fold.root, fold.under ?? '', at)) : undefined;
  if (held === undefined) return [];
  const prose = held.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n\n')
    .map((part) => part.trim()).filter((part) => part && !part.startsWith('#'))
    .map((part) => part.split('\n').join(' '));
  return prose.length ? ['## why', '', ...prose.flatMap((part) => [part, ''])].slice(0, -1) : [];
};

const sign: Region = (fold) => {
  const keys = fold.standing
    .filter((line) => /^keys\/[^/]+$/.test(fieldOf(line, 'scope')) && fieldOf(line, 'measure') === 'class')
    .map((line) => `KEY      ${fieldOf(line, 'scope').slice('keys/'.length)} · ${fieldOf(line, 'value')}`);
  return block('sign', [
    `SIGN     write the lines you propose as by=target, then: ${selfName()} sign <file> --key-file <pem of an admitted key>`,
    'SIGN     a line is never edited in place: withdraw the old content in the same batch, or the fold forks',
    ...keys,
  ]);
};

const take: Region = (fold) => block('take', [
  `TAKE     ${selfName()} land <batch> --key-file <pem> · the land that takes a demand pays it by moving what it asks about`,
  ...fold.missing.map((line) => `TAKE     ${fieldOf(line, 'scope')} · open: sign it again in a batch`),
]);

const red: Region = (fold) => block('red', [
  ...readersBehind().map((one) => `GREY     reading: ${one.module} · ${one.places} places · lands behind this fold`),
  ...fold.ceilings.short.map((s) => `SHORT    ${s}`),
  ...fold.ceilings.over.map((o) => `OVER     ${o}`),
  ...fold.missing.map((line) => `MISSING  ${fieldOf(line, 'scope')}`),
  ...fold.orphans.map((file) => `ORPHAN   ${file}`),
  ...(fold.under ? [] : [
    ...(fold.ceilings.unread.length ? [`UNREAD   ${fold.ceilings.unread.join(' · ')}`] : []),
    ...(fold.ceilings.vacuous.length ? [`VACUOUS  ${fold.ceilings.vacuous.join(' · ')}`] : []),
    ...fold.refused.map((line) => `REFUSED  ${fieldOf(line, 'scope')}`),
  ]),
]);

const forks: Region = (fold) => block('forks', [
  ...fold.forks.map((fork) => `FORK     ${fork.key}`),
  ...(fold.second.verdict === 'forks' ? [`FORK     ${secondName()}/target · the second head finds other lines standing`] : []),
]);

const history: Region = (fold) => {
  const lines = lockLines(fold.store);
  const at = (epoch: number): readonly string[] => foldClaims(lines.filter((line) => (Number(fieldOf(line, 'epoch')) || 0) <= epoch)).standing;
  const moved = differing(regionsOf(at(fold.epoch - 1), at(fold.epoch - 1), []), regionsOf(at(fold.epoch), at(fold.epoch), []));
  return block('history', [
    ...fold.history.map((line) => `HISTORY  ${fieldOf(line, 'scope')} · ${fieldOf(line, 'at')}`),
    ...moved.regions.map((region) => `MOVED    ${region || '.'} · at epoch ${fold.epoch} · ${moved.compared} regions compared`),
  ]);
};

const REGIONS: Readonly<Record<string, Region>> = {
  receipts: (fold) => receiptRegion(fold, 1),
  help: () => helpLines(),
  lines: (fold) => fold.standing,
  red, forks, programs, why, sign, take, history,
  field: (fold) => field(fold, 3),
} satisfies Record<RegionName, Region>;

const AT: Readonly<Record<string, (fold: PlaceFold, at: number) => readonly string[]>> = {field, receipts: receiptRegion};

export const unrendered = (fold: PlaceFold, view: { readonly regions: readonly { readonly name: string }[] }): readonly string[] =>
  ((declared) => view.regions.map((asked) => asked.name).filter((name) => REGIONS[name] === undefined && !declared.some((glob) => matches(glob, name))))(declaredBy(fold));

export function render(fold: PlaceFold, regions: readonly { readonly name: string; readonly at: number }[], shape = ''): string {
  const out: string[] = [];
  const capsules = capsuleRegions(fold, regions.filter((asked) => REGIONS[asked.name] === undefined), shape);
  for (const asked of regions) {
    const region: Region | undefined = REGIONS[asked.name];
    const resolving = AT[asked.name];
    const body = resolving !== undefined ? resolving(fold, asked.at) : region !== undefined ? read(region(fold), asked.at) : capsules.get(asked.name) ?? [];
    if (body.length) out.push(...body, '');
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

function read(body: readonly string[], at: number): readonly string[] {
  if (at >= 3 || !body.length) return body;
  const head = body.findIndex((line) => line.startsWith('```'));
  if (head < 0) return at > 1 ? body : body.slice(0, 3);
  const lines = body.slice(head + 1, body.lastIndexOf('```'));
  const kept = at <= 1 ? lines.slice(0, 1) : lines.map((line) => line.split(' · ').slice(0, at).join(' · '));
  return [...body.slice(0, head + 1), ...kept, '```'];
}

export function prerender(fold: PlaceFold, views: readonly View[]): void {
  const due = views.filter((view) => 'regions' in view && !(fold.key && keptRender(fold.store, fold.key, view.name) !== undefined));
  capsuleViews(fold, due.map((view) => ({ asking: view.regions.filter((asked) => REGIONS[asked.name] === undefined), shape: view.shape })));
}

export function viewOf(fold: PlaceFold, view: View): string {
  const live = !view.shape;
  const kept = !live && fold.key ? keptRender(fold.store, fold.key, view.name) : undefined;
  if (kept !== undefined) return kept;
  const text = render(fold, view.regions, view.shape);
  const folder = writerFor(fold.standing, 'fold');
  if (!live && fold.key && folder !== undefined) keepRender(fold.store, folder, fold.key, view.name, fold.epoch, text);
  return text;
}

export function renderedOf(fold: PlaceFold, view: { readonly name: string; readonly shape: string; readonly regions: readonly { readonly name: string; readonly at: number }[] }): readonly string[] {
  const answers = capsuleAnswers(fold, [{ asking: view.regions.filter((asked) => REGIONS[asked.name] === undefined), shape: view.shape }])[0];
  const cone = view.shape ? bytesDigest(fold.store, new TextEncoder().encode(fold.standing.filter((line) => fieldOf(line, 'shape') === view.shape || fieldOf(line, 'needs').split('|').includes(view.shape)).join('\n'))) : '';
  const head = cone ? [canonical({ scope: `rendered/${view.name}/cone`, role: 'writes', form: 'alphabet', measure: 'digest', value: cone, at: `place:${view.shape}`, by: 'target' })] : [];
  return [...head, ...view.regions.flatMap((asked) => {
    const answer = answers?.get(asked.name);
    const by = REGIONS[asked.name] !== undefined ? fold.instrument : answer?.by;
    if (!by) return [];
    const line = (measure: string, value: string): string => canonical({ scope: `rendered/${view.name}/${asked.name}`, role: 'writes', form: 'alphabet', measure, value, at: `place:${by}`, by: 'target' });
    return [line('digest', by), ...(answer ? [line('pin', `uses/${by}`)] : [])];
  })];
}
