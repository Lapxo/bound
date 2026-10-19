import {hasContextualPlace,contextualStanding} from '../host/contextual-place.ts';
import {publicStandingLines} from '../host/admitted-place.ts';
import {assertStandingView} from '../host/standing-projection.ts';
import {lockStanding} from '../fold/keys.ts';
import {storeOf} from '../land/ledger.ts';

/** An evidence projection, never a new authority lock. Authentication uses
 * the admission snapshot at each local epoch; the existing fold applies
 * supersessions and withdrawals across all declared classes. Storage layout
 * and delivery mode do not enter this public boundary. */
export function printStandingResult(root:string):void {
  const store=storeOf(root);assertStandingView(lockStanding(store));
  if(hasContextualPlace(root)){process.stdout.write(JSON.stringify(contextualStanding(root))+'\n');return}
  const standing=publicStandingLines(root);
  process.stdout.write(standing.length?standing.join('\n')+'\n':'');
}
