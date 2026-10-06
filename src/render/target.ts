import { claimKey, foldClaims } from '../fold/claims.ts';
import type { Fork } from '../fold/claims.ts';
import { PROTOCOL } from '@lapxo/topos/wire';

const scopeOf = (line: string): string => /(?:^|\s)scope=([^\s]+)/.exec(line)?.[1] ?? '';

/** A root policy line: signed by a key the authority reads, or one of the few scopes that bind unsigned. */
function isRootPolicyLine(line: string): boolean {
  if (!line.startsWith(PROTOCOL)) return false;
  return /\bsig=/.test(line);
}

const isExpired = (line: string, today: string): boolean => ((expires) => expires !== undefined && expires < today)(/(?:^|\s)expires=(\d{4}-\d{2}-\d{2})/.exec(line)?.[1]);

/** TARGET is a render of the fold of the owner's ledger: a fork shows every signed line that stands, under a note. */
export function renderTarget(
  ownerLines: readonly string[],
  today = new Date().toISOString().slice(0, 10),
  authority?: (line: string) => { readonly kind: string; readonly why?: string },
  receipts?: readonly { readonly scope: string; readonly moved: readonly string[] }[],
): {
  readonly text: string;
  readonly standing: number;
  readonly superseded: readonly string[];
  readonly retracted: readonly string[];
  readonly forks: readonly Fork[];
  readonly grey: readonly string[];
  readonly refused: readonly string[];
  readonly vacuous: readonly string[];
} {
  const folded = foldClaims(ownerLines.filter((line) => isRootPolicyLine(line) && !isExpired(line, today)), receipts);
  const forked = new Map(folded.forks.map((f) => [f.key, f]));
  const sorted = folded.standing.slice().sort((a, b) => {
    const left = `${scopeOf(a)} ${claimKey(a)}`;
    const right = `${scopeOf(b)} ${claimKey(b)}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const body: string[] = [];
  const announced = new Set<string>();
  const grey: string[] = [];
  const refused: string[] = [];
  for (const line of sorted) {
    const key = claimKey(line);
    const fork = forked.get(key);
    if (fork && !announced.has(key)) {
      announced.add(key);
      body.push(`# fork ${key} · ${fork.lines.length} signed lines stand; narrow or withdraw one`);
    }
    const verdict = authority?.(line);
    if (verdict?.kind === 'grey') {
      grey.push(line);
      body.push(`# grey ${scopeOf(line)} · ${verdict.why ?? ''}`);
    } else if (verdict?.kind === 'refuse') {
      refused.push(line);
      body.push(`# refuse ${scopeOf(line)} · ${verdict.why ?? ''}`);
    }
    body.push(line);
  }
  return {
    text: `# rendered from ledger/owner\n${body.join('\n')}${body.length ? '\n' : ''}`,
    standing: folded.standing.length,
    superseded: folded.superseded,
    retracted: folded.retracted,
    forks: folded.forks,
    grey,
    refused,
    vacuous: folded.vacuous,
  };
}
