import {compareEvidence} from '@lapxo/topos/authority';
import type {VerdictObservation} from '@lapxo/topos/authority';
/** The instrument maps an abstract relation to its declared snapshot vocabulary. Topos has no actor or origin policy. */
export interface SnapshotInput {
  readonly declared: boolean;
  readonly expected: {readonly set?: string; readonly standing: string; readonly epoch: number};
  readonly statement?: {readonly admitted: boolean; readonly set: string; readonly standing: string; readonly epoch: number};
  readonly priorDisagreement?: boolean;
  readonly comparison?: {readonly admitted: boolean; readonly set: string; readonly verdict: 'agrees' | 'forks'; readonly epoch: number};
}
export function snapshotVerdict(input: SnapshotInput) {
  const statement = input.declared ? input.statement : undefined;
  const comparison = input.comparison;
  const result = compareEvidence({
    expected: {reference: input.expected.set, value: input.expected.standing},
    ...(statement ? {statement: {admitted: statement.admitted, reference: statement.set, value: statement.standing}} : {}),
    ...(comparison ? {comparison: {admitted: comparison.admitted, reference: comparison.set, equal: comparison.verdict === 'agrees'}} : {}),
  });
  const words = {absent: 'none', unadmitted: 'grey', unresolved: 'stale', stale: 'stale', equal: 'agrees', different: 'forks'} as const;
  return {verdict: words[result.relation], external: result.relation !== 'absent' && (input.priorDisagreement === true || result.relation === 'different'),
    epoch: result.source === 'comparison' ? comparison!.epoch : statement?.epoch ?? 0};
}
/** This selector belongs to the instrument, not the SDK's abstract evidence contract. */
export function attestationObservations(configuration: readonly Readonly<Record<string, string>>[], result: {readonly verdict: string}): readonly VerdictObservation[] {
  const values = [...new Set(configuration.filter(f => ['wire/attestation-result', 'audit/wire/attestation-result'].includes(f.scope ?? '') && f.value !== 'withdraw').map(f => f.value))];
  if (!values.length) return [];
  if (values.length !== 1 || !values[0] || /[|=\s\\*]/.test(values[0]) || values[0].startsWith('/') || values[0].split('/').some(s => !s || s === '.' || s === '..')) throw Error('REFUSE·authority conflicting or invalid attestation result coordinate');
  return [{coordinate: values[0], value: result.verdict}];
}
