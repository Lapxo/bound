import { answers, point, region, within } from '@lapxo/obligations/field';
import { alphabetForm } from '@lapxo/obligations/forms';
import { cell, mark, observe, state } from '@lapxo/obligations/views/field';
import type { Obligatory } from '@lapxo/obligations/views/field';
import { fieldOf } from './claims.ts';
import { boundOf, regionsNamed } from './region.ts';
import type { SecondHead } from './second.ts';
import { wordFrom } from './wire.ts';
import { lockStanding } from './keys.ts';
import type { PlaceFold } from '../cli/place.ts';
import { ledgerLines, storeAt } from '../land/ledger.ts';
import { observeText } from '../observe/files.ts';
import { memoized } from './digests.ts';

/** Where a case lies: a demand is judged only over a cone that holds one, by a take or read from a landed cone alike. */
export const holdsCases = (location: string): boolean => {
  const steps = location.split('/');
  return steps.includes('yes') || steps.includes('no');
};

interface Answer {
  readonly value: string;
  readonly cone: string;
  readonly judged?: readonly string[];
  readonly read: boolean;
}

/**
 * A cone answers for a region it covers as much as for one it lies inside: the same region read at two resolutions
 * (L09). A fact about a region a demand never asked about pays nothing, a demand every asked coordinate of which was
 * judged is paid even when the take that judged it reached further, and an answer pays only what its take judged.
 */
function pays(demand: string, answer: Answer, views: string): boolean {
  if (answer.value !== (fieldOf(demand, 'value') || 'present')) return false;
  const needs = fieldOf(demand, 'needs').split('|').filter(Boolean);
  if (answer.read && !fieldOf(demand, 'scope').startsWith(views) && !needs.some(holdsCases)) return false;
  const asked = needs.map((need) => region(need));
  if (answer.judged && !asked.every((where) => answer.judged?.some((judged) => within(where, region(judged))))) return false;
  const moved = answer.cone.split('|').filter(Boolean).map((coordinate) => point(coordinate));
  if (!moved.length) return true;
  return answers(moved, asked) || (asked.length > 0 && asked.every((where) => moved.some((coordinate) => within(coordinate, where))));
}

function judgedBy(store: string, scope: string, at: string): readonly string[] | undefined {
  if (!at.startsWith('receipt:sha256:')) return undefined;
  const held = memoized(store, `judged ${at}`, () => {
    const text = observeText(storeAt(store, 'cas', 'envelopes', `${at.replace(/^receipt:sha256:/, '')}.json`));
    const got = text === undefined ? {} : JSON.parse(text) as { readonly scope?: string; readonly cone?: readonly string[] };
    return JSON.stringify(Array.isArray(got.cone) ? [got.scope ?? '', ...got.cone] : []);
  });
  const [said, ...cone] = JSON.parse(held) as readonly string[];
  return said === scope ? cone : undefined;
}

export function paidOf(store: string, demands: readonly string[], observed: readonly string[], views: string): { readonly paid: readonly string[]; readonly missing: readonly string[]; readonly answered: ReadonlySet<string> } {
  const wanted = new Set(demands.map((line) => fieldOf(line, 'scope')));
  const seen = [...ledgerLines(store, 'judge'), ...observed].filter((line) => wanted.has(fieldOf(line, 'scope')));
  const cones = new Map<string, string>();
  for (const line of seen) if (fieldOf(line, 'measure') === 'cone') cones.set(`${fieldOf(line, 'scope')} ${fieldOf(line, 'at')}`, fieldOf(line, 'value'));
  const answered = new Map<string, Answer[]>();
  for (const line of seen) {
    const scope = fieldOf(line, 'scope');
    if (!scope || fieldOf(line, 'measure') === 'cone') continue;
    const judged = judgedBy(store, scope, fieldOf(line, 'at'));
    (answered.get(scope) ?? answered.set(scope, []).get(scope)!).push({
      value: fieldOf(line, 'value'), cone: cones.get(`${scope} ${fieldOf(line, 'at')}`) ?? '', read: fieldOf(line, 'at').startsWith('cone:'), ...(judged ? { judged } : {}),
    });
  }
  const paid = demands.filter((line) => (answered.get(fieldOf(line, 'scope')) ?? []).some((answer) => pays(line, answer, views)));
  return { paid, missing: demands.filter((line) => !paid.includes(line)), answered: new Set(answered.keys()) };
}

export type Verdict = ReturnType<typeof state>;
const HELD = { tokens: ['absent', 'present'] };
const heldAs = (holds: boolean): ReturnType<typeof alphabetForm.parse> => alphabetForm.parse(HELD, { want: [holds ? 'present' : 'absent'] });

/**
 * The judge's verdict on each demand, as the object judges a cell: the demand is the floor its place requires, and the
 * two heads are the origins that speak on it — the take, holding it or not where it answered or paid it, and the second
 * head, holding what the take holds where it agrees, the other where the demand's region stands apart, and silent where
 * its word is stale, grey or missing. Both holding it is FREE, one alone REQUIRED, their disagreeing CONFLICT, and
 * neither admitting it FORBIDDEN.
 */
function verdictsOf(demands: readonly string[], paid: readonly string[], answered: ReadonlySet<string>, second: SecondHead, standing: readonly string[]): Readonly<Record<string, Verdict>> {
  const named = regionsNamed(standing);
  const apart = new Set((second.apart ?? []).map((one) => (one === '.' ? '' : one)));
  const heard = second.verdict === 'agrees' || second.verdict === 'forks';
  return Object.fromEntries(demands.map((line) => {
    const scope = fieldOf(line, 'scope');
    const holds = paid.includes(line);
    const spoke = holds || answered.has(scope);
    const differs = second.verdict === 'forks' && (second.apart === undefined || apart.has(boundOf(named, line).region));
    let one: Obligatory<ReturnType<typeof heldAs>> = { ...cell<ReturnType<typeof heldAs>>(scope), marks: [mark({ pole: 'floor', reach: 'local', span: heldAs(true) })] };
    if (spoke) one = observe(one, { origin: 'take', span: heldAs(holds), id: 'take' });
    if (spoke && heard) one = observe(one, { origin: 'second', span: heldAs(differs ? !holds : holds), id: 'second' });
    return [scope, state(alphabetForm.lattice(HELD), one)] as const;
  }));
}

export const verdictsFor = (fold: PlaceFold): Readonly<Record<string, Verdict>> =>
  verdictsOf(fold.demands, fold.paid, paidOf(fold.store, fold.demands, fold.observed, `${wordFrom(fold.standing, 'families', 'view', lockStanding(fold.store))}/`).answered, fold.second, fold.standing);
