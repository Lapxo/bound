/** Environment identity is not permission to bootstrap arbitrary executable
 * preloads. The fixed native entry currently has no ambient loader contract.
 */
export function assertNativeRuntime(environment:Readonly<Record<string,string|undefined>>,flags:readonly string[]):void{
 if((environment.NODE_OPTIONS??'').trim()!=='')throw Error('REFUSE·native runtime NODE_OPTIONS has no fixed verified loader configuration');
 if(flags.length)throw Error('REFUSE·native runtime startup flags differ from the fixed dispatcher');
}
