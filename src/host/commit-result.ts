import {BoundRefusal} from './refusals.ts';

/** Visibility may precede a failed publication response; never asserts rollback. */
export class ActCommitUnknown extends BoundRefusal {
 readonly identity:string;
 constructor(identity:string,cause:unknown){super('host/commit-unknown',`REFUSE·act publication uncertain · ${cause instanceof Error?cause.message:'storage failure'}`);this.identity=identity;}
}
