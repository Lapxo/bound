import { point, region, within } from '@lapxo/obligations/field';
import type { Point } from '@lapxo/obligations/field';
import { fieldOf } from './claims.ts';
import { wordOf, wordsOf } from './wire.ts';
import { lockStanding } from './keys.ts';
import { ownLock, ownStore } from '../observe/runner.ts';
import { ALPHABETS, idsOf, INTERVALS, spanOf } from '@lapxo/topos/forms';
import { placedReadings } from './observed.ts';
import { combine, matches } from '@lapxo/topos/wire';

/** What one reader answered for one question at one place, with both read as points once. */
interface Reading {
  readonly question: string;
  readonly measure: string;
  readonly value: string;
  readonly asked: Point;
  readonly where: Point;
}

function meeting(scope: string): (reading: Reading) => boolean {
  const whole = region(scope);
  const steps = scope.split('/');
  const cuts = steps.slice(1).map((_, i) => ({ head: region(steps.slice(0, i + 1).join('/')), tail: region(steps.slice(i + 1).join('/')) }));
  const globbed = steps.some((step) => step.includes('*') && step !== '*' && step !== '**');
  return (reading) => within(reading.asked, whole)
    || cuts.some(({ head, tail }) => (within(reading.asked, head) && within(reading.where, tail))
      || (within(reading.where, head) && within(reading.asked, tail)))
    || (globbed && steps.slice(1).some((_, i) => matches(steps.slice(0, i + 1).join('/'), reading.question) && matches(steps.slice(i + 1).join('/'), reading.where.at.join('/'))));
}

type Side = 'short' | 'over';

export interface CeilingFold {
  readonly read: readonly string[];
  readonly over: readonly { readonly ceiling: string; readonly question: string; readonly got: string; readonly side: Side }[];
  readonly unread: readonly string[];
  readonly vacuous: readonly string[];
  readonly readings: ReadonlyMap<string, readonly string[]>;
}

export const answersElsewhere = (ceiling: string, own: Readonly<Record<string, number>>, under?: string, places?: ReadonlySet<string>): boolean => {
  const measure = fieldOf(ceiling, 'measure');
  const step = fieldOf(ceiling, 'scope').split('/')[0] ?? '';
  const here = under?.split('/')[0];
  return here !== undefined && step !== here && (places?.has(step) ?? false) && (own[measure] ?? (measure === 'count' ? own[fieldOf(ceiling, 'scope')] : undefined)) !== undefined;
};

export function foldCeilings(input: {
  readonly standing: readonly string[];
  readonly ceilings: readonly string[];
  readonly observed: readonly string[];
  readonly own: Readonly<Record<string, number>>;
  readonly epoch: number;
  readonly under?: string;
  readonly places?: ReadonlySet<string>;
}): CeilingFold {
  const readings = new Map<string, Reading[]>();
  for (const got of placedReadings(input.observed)) {
    const mine = readings.get(got.measure) ?? [];
    mine.push({ question: got.question, measure: got.measure, value: got.value, asked: point(got.question), where: point(got.place) });
    readings.set(got.measure, mine);
  }
  const unreadOf = (standing: readonly string[]): string | undefined => wordsOf(standing, 'states').includes('unread') ? wordOf(standing, 'states', 'unread') : undefined;
  const UNREAD = unreadOf(input.standing) ?? unreadOf(ownLock()) ?? unreadOf(lockStanding(ownStore()));
  const read: string[] = [];
  const over: { ceiling: string; question: string; got: string; side: Side }[] = [];
  const unmet: string[] = [];
  const lines = new Map<string, ReadonlyMap<string, string>>();
  for (const one of readings.get('line') ?? []) {
    lines.set(`${one.question} ${one.where.at.join('/')}`, new Map(one.value.split('|').filter(Boolean).map((pair) => [pair.slice(0, pair.lastIndexOf(':')), pair.slice(pair.lastIndexOf(':') + 1)] as const)));
  }
  const said = new Map<string, string[]>();
  const bound = (ceiling: string, question: string, met: readonly string[], at?: string): void => {
    const scope = fieldOf(ceiling, 'scope');
    const want = fieldOf(ceiling, 'value');
    const heard = (got: string): void => void said.set(scope, [...(said.get(scope) ?? []), question === scope ? got : `${question} ${got}`]);
    if (fieldOf(ceiling, 'form') === 'interval') {
      const span = spanOf(want);
      if (!span) return;
      const lows = met.map((value) => spanOf(value)?.lo ?? 0);
      let total: number;
      try {
        total = combine(fieldOf(ceiling, 'measure'), lows);
      } catch {
        over.push({ ceiling: scope, question, got: `no combination for ${fieldOf(ceiling, 'measure')}, read ${lows.length} times`, side: 'over' });
        return;
      }
      const at = { lo: total, hi: total };
      heard(String(total));
      if (!INTERVALS.leq(at, { lo: span.lo, hi: Infinity })) over.push({ ceiling: scope, question, got: String(total), side: 'short' });
      if (!INTERVALS.leq(at, { lo: -Infinity, hi: span.hi })) over.push({ ceiling: scope, question, got: String(total), side: 'over' });
      return;
    }
    const joined = new Set(met.flatMap((value) => [...idsOf(value).values]));
    heard([...joined].sort().join('|') || 'none');
    const allowed = idsOf(want);
    if (!ALPHABETS.leq({ polarity: 'permit', values: joined }, allowed)) {
      const outside = [...joined].filter((id) => allowed.values.has(id) === (allowed.polarity === 'forbid')).sort();
      const line = (id: string): string => (at === undefined || lines.get(at)?.get(id) === undefined ? id : `${id}:${lines.get(at)!.get(id)}`);
      over.push({ ceiling: scope, question, got: outside.map(line).join('|'), side: 'over' });
    }
  };
  const own = (measure: string): number | undefined => (measure === UNREAD ? undefined : input.own[measure]);
  const literal = (scope: string): number => scope.split('/').filter((step) => !step.includes('*')).length;
  const last: string[] = [];
  for (const ceiling of input.ceilings) {
    const measure = fieldOf(ceiling, 'measure');
    if (measure === UNREAD) {
      last.push(ceiling);
      continue;
    }
    const mine = own(measure) ?? (measure === 'count' ? input.own[fieldOf(ceiling, 'scope')] : undefined);
    if (answersElsewhere(ceiling, input.own, input.under, input.places)) continue;
    if (mine !== undefined) {
      read.push(ceiling);
      bound(ceiling, fieldOf(ceiling, 'scope'), [`${mine}..${mine}`]);
      continue;
    }
    const byQuestion = new Map<string, string[]>();
    const where = new Map<string, string>();
    const meets = meeting(fieldOf(ceiling, 'scope'));
    const alone = measure === 'per-file' || fieldOf(ceiling, 'scope').endsWith('/*') || fieldOf(ceiling, 'form') === 'alphabet';
    const narrower = spanOf(fieldOf(ceiling, 'value')) ? input.ceilings.filter((other) => fieldOf(other, 'measure') === measure && spanOf(fieldOf(other, 'value')) && literal(fieldOf(other, 'scope')) > literal(fieldOf(ceiling, 'scope'))).map((other) => meeting(fieldOf(other, 'scope'))) : [];
    for (const reading of readings.get(measure) ?? []) {
      if (!meets(reading) || narrower.some((one) => one(reading))) continue;
      const question = alone ? reading.where.at.join('/') : reading.question;
      byQuestion.set(question, [...(byQuestion.get(question) ?? []), reading.value]);
      where.set(question, `${reading.question} ${reading.where.at.join('/')}`);
    }
    if (!byQuestion.size) {
      unmet.push(ceiling);
      continue;
    }
    read.push(ceiling);
    for (const [question, met] of byQuestion) bound(ceiling, question, met, where.get(question));
  }
  for (const ceiling of last) {
    read.push(ceiling);
    bound(ceiling, fieldOf(ceiling, 'scope'), [`${unmet.length}..${unmet.length}`]);
  }
  const epochOf = (line: string): number => Number(fieldOf(line, 'epoch')) || 0;
  return {
    read,
    over,
    unread: unmet.filter((line) => epochOf(line) > input.epoch - 3),
    vacuous: unmet.filter((line) => epochOf(line) <= input.epoch - 3),
    readings: said,
  };
}
