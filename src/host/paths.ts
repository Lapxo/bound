/** Physical paths belong to the receiving host. Wire coordinates always use '/'.
 * These are lexical checks over host-resolved paths, not filesystem identity,
 * symlink/junction verification or authority admission.
 */
import * as native from 'node:path';
export interface PathSyntax {
 readonly sep:string;
 relative(from:string,to:string):string;
 isAbsolute(path:string):boolean;
}
export function relativeCoordinate(root:string,path:string,syntax:PathSyntax=native):string {
 return syntax.relative(root,path).split(syntax.sep).join('/');
}
/** A parent component is '..', never every filename starting with two dots. */
export function insideDirectory(root:string,path:string,syntax:PathSyntax=native,allowRoot=false):boolean {
 if(!syntax.isAbsolute(root)||!syntax.isAbsolute(path))return false;
 const step=syntax.relative(root,path);
 return (allowRoot||step!=='')&&!syntax.isAbsolute(step)&&step!=='..'&&!step.startsWith('..'+syntax.sep);
}
