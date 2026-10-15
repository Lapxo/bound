import {hasContextualPlace,contextualStanding} from '../host/contextual-place.ts';
import {authenticatedStanding} from '../host/admitted-place.ts';
import {viewsOf} from '../fold/views.ts';
import {lockStanding} from '../fold/keys.ts';
import {storeOf} from '../land/ledger.ts';

/** An evidence projection, never a new authority lock. Authentication uses
 * the admission snapshot at each local epoch; the existing fold applies
 * supersessions and withdrawals across all declared classes. Storage layout
 * and delivery mode do not enter this public boundary. */
export function printStandingResult(root:string):void {
  const store=storeOf(root),view=viewsOf(lockStanding(store)).get('standing');
  if(!view||view.shape||!view.regions.some(region=>region.name==='standing'))
    throw Error('REFUSE·view standing requires a declared standing view');
  if(hasContextualPlace(root)){process.stdout.write(JSON.stringify(contextualStanding(root))+'\n');return}
  const standing=authenticatedStanding(root);
  process.stdout.write(standing.length?standing.join('\n')+'\n':'');
}
