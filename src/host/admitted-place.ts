import{hashText}from'./hash.ts';
import {admissionAnchor,admissionHistoryAt} from '../fold/admission-history.ts';
import {projectAuthenticatedStanding,publishedStandingLines} from './standing-projection.ts';
import {createHash} from 'node:crypto';

// One bounded historical projection, never a current authority/lease verdict.
// Its complete inputs are reread before lookup, including original signatures.
let historicalProjection:{readonly identity:string;readonly standing:readonly string[]}|undefined;
const historicalDigests=new WeakMap<readonly string[],{readonly anchor:string;readonly identity:string}>();
function historicalIdentity(history:readonly string[],anchor:ReturnType<typeof admissionAnchor>):string{
 const anchorBytes=JSON.stringify(anchor),held=Object.isFrozen(history)?historicalDigests.get(history):undefined;
 if(held?.anchor===anchorBytes)return held.identity;
 const hash=createHash('sha256'),text=hashText.bind(undefined,hash);
 text('authenticated-root-history/1');text(String(history.length));for(const line of history)text(line);text(anchorBytes);
 const identity=hash.digest('hex');
 if(Object.isFrozen(history))historicalDigests.set(history,{anchor:anchorBytes,identity});
 return identity;
}

/** Existing admission-snapshot authentication and folded live projection.
 * Consumer configuration evidence only; never a new authority lock. */
export function authenticatedRootStanding(root:string):readonly string[]{
  const history=admissionHistoryAt(root,Number.MAX_SAFE_INTEGER),anchor=admissionAnchor(root);
  const identity=historicalIdentity(history,anchor);
  if(historicalProjection?.identity===identity)return historicalProjection.standing;
  const standing=projectAuthenticatedStanding(history,anchor);
  historicalProjection={identity,standing:Object.freeze([...standing])};
  return historicalProjection.standing;
}

/** Legacy Root lines remain unchanged; contextual public output has its own carrier. */
export const authenticatedStanding=authenticatedRootStanding;

/** Public current configuration omits withdrawal markers; typed effective history
 * remains intact for the existing typed-object projection. Internal readers keep
 * authenticatedStanding, including its historical markers. */
export function publicStandingLines(root:string):readonly string[]{
 return publishedStandingLines(authenticatedRootStanding(root));
}
