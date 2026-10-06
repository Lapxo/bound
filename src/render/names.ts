/** The regions bound renders itself, by name: a view that asks any other is answered by a capsule that declares it, or refused whole. */
export const REGION_NAMES = [
  'receipts', 'help', 'lines', 'red', 'forks', 'programs', 'why', 'sign', 'take', 'history', 'field',
] as const;

export type RegionName = (typeof REGION_NAMES)[number];
