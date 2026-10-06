import { basename } from '../host/io.ts';
import { contracts, exclusive, point, region } from '@lapxo/obligations/field';
import { ENVELOPE, PROTOCOL, recordKind, signedBytes, parse } from '@lapxo/topos/wire';
export { CAPSULE, EXTENSION, LOCK, RECEIPTS } from '@lapxo/topos/wire';
import { ownRoot } from '../observe/runner.ts';
import type { Region } from '@lapxo/obligations/field';

const decoded = new Map<string, Readonly<Record<string, string>>>();

/** Field access uses the Topos wire parser; decoding is shared for this CLI process. */
function wireFields(line: string): Readonly<Record<string, string>> {
  const held = decoded.get(line);
  if (held !== undefined) return held;
  const got = parse(line);
  const fields = got.kind === 'fact' ? got.value.fields : {};
  decoded.set(line, fields);
  return fields;
}

export const fieldOf = (line: string, name: string): string => wireFields(line)[name] ?? '';
export const fieldsOf = (line: string): Record<string, string> => ({ ...wireFields(line) });

export function selfName(): string { return basename(ownRoot()); }
export function isWire(line: string): boolean { return line.startsWith(PROTOCOL); }
export const wireLinesOf = (text: string | undefined): readonly string[] => (text ?? '').split('\n').filter(isWire);
export const isConfig = (line:string):boolean => {const k=recordKind(line);return k.kind==='fact'&&k.value==='config';};
export const sayingOf = (line: string): string => !isConfig(line) ? ((p)=>p.kind==='fact'?signedBytes(p.value.fields):line)(parse(line)) : Object.entries(fieldsOf(line)).filter(([k]) => !ENVELOPE.has(k)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join(' ');

/** One key per claim: scope, role and measure; what a line says, its envelope set aside, is one however often it landed. */
export function claimKey(line: string): string {
  const f = fieldsOf(line);
  return `${f['scope'] ?? ''} ${f['role'] ?? ''} ${f['measure'] ?? ''}`;
}

function contentOf(fields: Readonly<Record<string, string>>, at = true): string {
  return Object.keys(fields)
    .filter((k) => !ENVELOPE.has(k) && k !== 'value' && (at || k !== 'at'))
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join(' ');
}

function regionsOf(line: string): readonly Region[] {
  return (fieldsOf(line)['needs'] ?? '').split('|').filter(Boolean).map((need) => region(need));
}

function contracted(line: string, sides: readonly string[], receipts: readonly { readonly scope: string; readonly moved: readonly string[] }[]): boolean {
  const scope = fieldsOf(line)['scope'] ?? '';
  const mine = exclusive(regionsOf(line), sides.filter((other) => other !== line).map(regionsOf));
  const touched = receipts.filter((r) => r.scope === scope).flatMap((r) => r.moved.map((coordinate) => point(coordinate)));
  return contracts(mine, touched);
}

function retracts(withdraw: Readonly<Record<string, string>>, line: Readonly<Record<string, string>>): boolean {
  return Object.keys(withdraw)
    .filter((k) => !ENVELOPE.has(k) && k !== 'value')
    .every((k) => line[k] === withdraw[k]);
}

export interface Fork {
  readonly key: string;
  readonly lines: readonly string[];
  readonly state?: string;
}

export function foldClaims(lines: readonly string[], receipts?: readonly { readonly scope: string; readonly moved: readonly string[] }[], _placed = false): {
  readonly standing: readonly string[];
  readonly superseded: readonly string[];
  readonly retracted: readonly string[];
  readonly forks: readonly Fork[];
  readonly vacuous: readonly string[];
} {
  const groups = new Map<string, string[]>();
  for (const line of lines.filter(isConfig)) {
    const key = claimKey(line);
    const group = groups.get(key) ?? [];
    if (!group.includes(line)) group.push(line);
    groups.set(key, group);
  }
  const standing: string[] = [...new Set(lines.filter(line=>!isConfig(line)))];
  const retracted: string[] = [];
  const spent: string[] = [];
  const vacuous: string[] = [];
  const forks: Fork[] = [];
  for (const [key, group] of groups) {
    const parsed = group.map((line) => ({ line, fields: fieldsOf(line) }));
    const withdraws = parsed.filter((p) => p.fields['value'] === 'withdraw');
    const claims = parsed.filter((p) => p.fields['value'] !== 'withdraw');
    const stands = new Set(claims.flatMap((p, i) => withdraws.some(w => retracts(w.fields, p.fields)) ? [] : [String(i)]));
    retracted.push(...claims.filter((_, i) => !stands.has(String(i))).map((p) => p.line));
    const kept = claims.filter((_, i) => stands.has(String(i)));
    if (!kept.length) {
      const lastByContent = new Map<string, string>();
      for (const w of withdraws) lastByContent.set(contentOf(w.fields), w.line);
      const shownWithdraws = [...lastByContent.values()];
      standing.push(...shownWithdraws);
      spent.push(...withdraws.map((w) => w.line).filter((line) => !shownWithdraws.includes(line)));
      continue;
    }
    spent.push(...withdraws.map((w) => w.line));
    const epochOf = (p: { readonly fields: Readonly<Record<string, string>> }): number => Number(p.fields['epoch']) || 0;
    const latestOf = new Map<string, number>();
    const who = (p: { readonly fields: Readonly<Record<string, string>> }): string => `${p.fields['by'] ?? ''} ${contentOf(p.fields)}`;
    for (const p of kept) latestOf.set(who(p), Math.max(latestOf.get(who(p)) ?? 0, epochOf(p)));
    const revised = kept.filter((p) => epochOf(p) < (latestOf.get(who(p)) ?? 0));
    spent.push(...revised.map((p) => p.line));
    // Epoch revisions are host history. Distinct origins remain separate inscriptions.
    const values = kept.filter(p => !revised.includes(p));
    const bySigner = new Map<string, Set<string>>();
    for (const p of values) {
      const by = p.fields['by'] ?? '';
      const identity = who(p);
      const sayings = bySigner.get(identity) ?? new Set<string>();
      sayings.add(sayingOf(p.line));
      bySigner.set(identity, sayings);
      if (sayings.size > 1) throw Error(`REFUSE·document ${key} · ${by} has two live inscriptions without withdrawal`);
    }
    const shown = [...new Set(values.map(p => p.line))];
    const resting = receipts && shown.length > 1 ? shown.filter((line) => !contracted(line, shown, receipts)) : shown;
    vacuous.push(...shown.filter((line) => !resting.includes(line)));
    standing.push(...resting);
  }
  const accounted = new Set([...standing, ...retracted, ...spent, ...vacuous]);
  return { standing, superseded: [...new Set([...spent, ...lines.filter((l) => !accounted.has(l))])], retracted, forks, vacuous };
}
