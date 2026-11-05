import {moduleImportSyntax} from './portable_module_syntax.ts';
const fail=code=>{throw Object.assign(Error(code),{code})};
export function digestModuleGraph(members,entry){
 // Members were copied and hashed above. Traverse only the same literal digest
 // edges discovered by the existing AST reader; no import is evaluated.
 const pending=[entry],seen=new Set();
 while(pending.length){const id=pending.pop();if(seen.has(id))continue;const member=members.get(id);if(!member)throw Error('REFUSE·module closure missing member');seen.add(id);const syntax=moduleImportSyntax(member.source,id,{esmOnly:true});if(syntax.unresolved.length)throw Error('REFUSE·module closure unresolved edge');for(const name of syntax.imports){if(!/^\.\/[a-f0-9]{64}$/.test(name))fail('provider-read/nonportable-edge');pending.push(name.slice(2))}}
 if(seen.size!==members.size)fail('provider-read/unused-members');
}
