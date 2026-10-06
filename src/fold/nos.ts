import { existsSync, join } from '../host/io.ts';
import { fieldOf } from './claims.ts';
import { lockLines } from './keys.ts';
import { wordsOf } from './wire.ts';
import { entriesIn } from '../observe/files.ts';

const sampleWord = (standing: readonly string[], root: string, place: string): string | undefined =>
  wordsOf(standing, 'families').find((one) => [one, `${one}s`].some((name) => existsSync(join(root, place, name))));

const noOf = (need: string, word: string): string | undefined => {
  const steps = need.split('/');
  const i = steps.findIndex((step) => step === word || step === `${word}s`);
  if (i < 0 || steps[i + 2] !== 'no') return undefined;
  const file = steps[i + 3];
  return file === undefined || file.includes('*') ? undefined : file.replace(/\.[^.]+$/, '');
};

/**
 * A bug found lands as a no of the law it broke. From the epoch the lock asks for it on — the next one while no line
 * asks yet, the epoch an accept would sign it at — every law of the place a witness names, a demand or a ceiling, holds
 * its bug in a no: a need under the wire's sample family /<area>/no/, or a no of the place named after the law. What this
 * counts is each law witnessed since then that holds none. When the lock lists no sample family, every such law is a
 * demand: the folder is not guessed.
 */
export function bugsWithoutANo(root: string, store: string, standing: readonly string[], place: string, measure: string): number {
  const epoch = (line: string): number => Number(fieldOf(line, 'epoch'));
  const asking = standing.filter((line) => fieldOf(line, 'measure') === measure && fieldOf(line, 'value') !== 'withdraw').map(epoch);
  const from = asking.length ? Math.min(...asking) : lockLines(store).reduce((most, line) => Math.max(most, epoch(line)), 0) + 1;
  const word = sampleWord(standing, root, place);
  const nos = new Set<string>();
  for (const line of standing) for (const need of fieldOf(line, 'needs').split('|').filter(Boolean)) {
    const name = word === undefined ? undefined : noOf(need, word);
    if (name) nos.add(name);
  }
  if (word !== undefined) {
    const dir = [word, `${word}s`].map((name) => join(root, place, name)).find((at) => existsSync(at));
    if (dir !== undefined) for (const area of entriesIn(dir).filter((one) => one.dir)) {
      for (const one of entriesIn(join(dir, area.name, 'no'))) nos.add(one.name.replace(/\.[^.]+$/, ''));
    }
  }
  const named = (scope: string): string => scope.slice(scope.lastIndexOf('/') + 1);
  const holds = (line: string): boolean => nos.has(named(fieldOf(line, 'scope')))
    || (word !== undefined && fieldOf(line, 'needs').split('|').some((need) => noOf(need, word) !== undefined && existsSync(join(root, need))));
  return standing.filter((line) => fieldOf(line, 'at').startsWith('witness:') && fieldOf(line, 'value') !== 'withdraw' && epoch(line) >= from
    && fieldOf(line, 'scope').startsWith(`${place}/`)
    && (fieldOf(line, 'role') === 'demands' || fieldOf(line, 'form') === 'interval') && !holds(line)).length;
}
