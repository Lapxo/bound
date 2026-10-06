import {verdictDemand} from '@lapxo/topos/authority';
import type {VerdictDemand,VerdictObservation} from '@lapxo/topos/authority';
import { matches, parse } from '@lapxo/topos/wire';

type CeilingReading = {
  readonly read: readonly string[];
  readonly unread: readonly string[];
  readonly vacuous: readonly string[];
  readonly over: readonly { readonly ceiling: string; readonly question: string; readonly got: string; readonly side: 'short' | 'over' }[];
};

export interface ReleasePolicyInput {
  /** Standing already admitted by the same fold. This function does not admit lines. */
  readonly verdicts?: readonly VerdictObservation[];
  readonly standing: readonly string[];
  readonly demands: readonly string[];
  readonly paid: readonly string[];
  readonly ceilings: readonly string[];
  readonly readings: CeilingReading;
  readonly snapshot: { readonly fold: string; readonly instrument: string };
  readonly faults?: readonly { readonly kind: string; readonly evidence: readonly string[]; readonly obligation?: string }[];
}

export interface ReleasePolicyResult {
  readonly gates?: readonly VerdictDemand[];
  readonly status: 'absent' | 'incomplete' | 'blocked' | 'ready';
  readonly snapshot: ReleasePolicyInput['snapshot'];
  readonly policy: readonly string[];
  readonly categories: readonly { readonly name: string; readonly links: readonly string[]; readonly selected: readonly string[]; readonly failures: readonly { readonly line: string; readonly reason: string; readonly evidence: readonly string[] }[] }[];
  readonly unresolved: readonly string[];
  /** All obligations, including those not selected; the normal fold keeps their verdicts. */
  readonly debt: readonly string[];
}

const fields = (line: string): Readonly<Record<string, string>> => {
  const got = parse(line);
  return got.kind === 'fact' ? got.value.fields : {};
};
const f = (line: string, name: string): string => fields(line)[name] ?? '';
const words = (value: string): readonly string[] => [...new Set(value.split('|').filter(Boolean))];
const active = (line: string): boolean => f(line, 'value') !== 'withdraw';
const declaration = (line: string): boolean => active(line) && f(line, 'role') === 'writes' && f(line, 'form') === 'alphabet' && f(line, 'measure') === 'id';

/** Preserve actual fold faults; none gets a release category from its spelling. */
export function releaseFaults(fold: {
  readonly forks: readonly { readonly key: string; readonly lines: readonly string[] }[];
  readonly refused: readonly string[];
  readonly grey: readonly string[];
  readonly orphans: readonly string[];
  readonly second: { readonly verdict: string };
}): NonNullable<ReleasePolicyInput['faults']> {
  return [
    ...fold.forks.map((one) => ({ kind: 'fork', evidence: [one.key, ...one.lines] })),
    ...fold.refused.map((line) => ({ kind: 'refused', evidence: [line] })),
    ...fold.grey.map((line) => ({ kind: 'grey', evidence: [line] })),
    ...fold.orphans.map((line) => ({ kind: 'orphan', evidence: [line] })),
    ...(fold.second.verdict === 'forks' ? [{ kind: 'second-fork', evidence: [fold.second.verdict] }] : []),
  ];
}

/** Select declared obligations, never categories inferred from their names or paths. */
export function releasePolicy(input: ReleasePolicyInput): ReleasePolicyResult {
  const policy = [...new Set(input.standing.filter((line) => f(line, 'scope') === 'release/blocks' && declaration(line)))];
  const debt = [...new Set([...input.demands, ...input.ceilings])];
  const gateLines=input.standing.filter(line=>active(line)&&f(line,'role')==='demands'&&f(line,'form')==='alphabet'&&f(line,'measure')==='verdict');
  const gates=gateLines.map(line=>verdictDemand(fields(line),input.verdicts??[]));
  const base = { snapshot: input.snapshot, policy, debt, gates };
  if (!policy.length) return { ...base, status: 'absent', categories: [], unresolved: [] };
  const values = new Set(policy.map((line) => [...words(f(line, 'value'))].sort().join('|')));
  const unresolved: string[] = [];
  for (const fault of input.faults ?? []) {
    if (fault.obligation === undefined || !debt.includes(fault.obligation)) unresolved.push(`unclassified ${fault.kind}: ${fault.evidence.join(' | ')}`);
  }
  if (values.size !== 1) unresolved.push('release/blocks has conflicting standing values');
  const labels = words(f(policy[0]!, 'value'));
  if (!labels.length) unresolved.push('release/blocks selects no category');
  const categories = labels.map((name) => {
    const links = [...new Set(input.standing.filter((line) => f(line, 'scope') === `release/category/${name}` && declaration(line)))];
    if (!links.length) unresolved.push(`release/category/${name} has no admitted link`);
    if (new Set(links.map((line) => [...words(f(line, 'value'))].sort().join('|'))).size > 1) unresolved.push(`release/category/${name} has conflicting standing values`);
    const selected = new Set<string>();
    for (const selector of words(f(links[0] ?? '', 'value'))) {
      const met = debt.filter((line) => matches(selector, f(line, 'scope')));
      if (!met.length) unresolved.push(`release/category/${name} selector ${selector} names no obligation`);
      met.forEach((line) => selected.add(line));
    }
    if (!selected.size) unresolved.push(`release/category/${name} selects no obligation`);
    const failures: { line: string; reason: string; evidence: string[] }[] = [];
    for (const line of selected) {
      for (const fault of input.faults ?? []) if (fault.obligation === line) failures.push({ line, reason: fault.kind, evidence: [...fault.evidence] });
      if (input.demands.includes(line)) {
        const gate=gateLines.includes(line)?verdictDemand(fields(line),input.verdicts??[]):undefined;
        if(gate){if(gate.status!=='met')failures.push({line,reason:gate.status,evidence:gate.evidence.map(e=>`${e.coordinate}=${e.value}`)});continue;}
        if (!input.paid.includes(line)) failures.push({ line, reason: 'missing', evidence: [] });
        continue;
      }
      const scope = f(line, 'scope');
      const over = input.readings.over.filter((one) => one.ceiling === scope);
      if (over.length && input.ceilings.filter((one) => f(one, 'scope') === scope).length !== 1) unresolved.push(`ceiling evidence for ${scope} does not identify one obligation`);
      if (over.length) failures.push({ line, reason: 'outside', evidence: over.map((one) => `${one.side} ${one.question} ${one.got}`) });
      if (input.readings.unread.includes(line)) failures.push({ line, reason: 'unread', evidence: [] });
      if (input.readings.vacuous.includes(line)) failures.push({ line, reason: 'vacuous', evidence: [] });
      if (!input.readings.read.includes(line) && !input.readings.unread.includes(line) && !input.readings.vacuous.includes(line)) {
        unresolved.push(`ceiling ${scope} has no result in this fold`);
      }
    }
    return { name, links, selected: [...selected], failures };
  });
  return { ...base, categories, unresolved: [...new Set(unresolved)], status: unresolved.length ? 'incomplete' : categories.some((one) => one.failures.length) ? 'blocked' : 'ready' };
}

/** Existing fold output can show the policy without a new view or a release action. */
export function releasePolicyLines(result: ReleasePolicyResult | undefined): readonly string[] {
  if (result === undefined) return [];
  const gates=(result.gates??[]).map(g=>`GATE     ${g.scope} ${g.status} · requires=${g.required.join('|')} · ${g.evidence.map(e=>`${e.coordinate}=${e.value}`).join(' | ')||g.reason||'no evidence'}`);
  if(result.status==='absent')return gates;
  return [
    ...gates,
    `RELEASE  policy ${result.status} · fold ${result.snapshot.fold} · instrument ${result.snapshot.instrument}`,
    ...result.unresolved.map((one) => `UNRESOLVED release · ${one}`),
    ...result.categories.flatMap((one) => one.failures.map((failure) => `BLOCK    ${one.name} · ${f(failure.line, 'scope')} · ${failure.reason}${failure.evidence.length ? ` · ${failure.evidence.join(' | ')}` : ''}`)),
  ];
}
