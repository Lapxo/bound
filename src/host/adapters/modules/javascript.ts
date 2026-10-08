import type {parse as Parser} from 'acorn';
import * as nodeModule from 'node:module';
import {extname} from 'node:path';

/** Host module syntax, never wire or domain interpretation. Reading imports executes no module. */
// The package's minimum Node runtime provides this API; older build-only Node types do not.
const require=nodeModule.createRequire(import.meta.url);
const {parse}=require('acorn') as {parse:typeof Parser};
const stripTypeScriptTypes=(nodeModule as unknown as {stripTypeScriptTypes:(source:string,options:{mode:'transform'})=>string}).stripTypeScriptTypes;
export function moduleImports(source: string, coordinate: string): readonly string[] {
 const code=extname(coordinate)==='.ts'?stripTypeScriptTypes(source,{mode:'transform'}):source;
 let tree: unknown;
 try{tree=parse(code,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true,allowHashBang:true})}
 catch{throw Error('REFUSE·source module syntax cannot be read: '+coordinate)}
 const found=new Set<string>();
 const literal=(node:unknown):string|undefined=>{
  if(!node||typeof node!=='object')return;
  const n=node as Record<string,unknown>;
  return n['type']==='Literal'&&typeof n['value']==='string'?n['value']:undefined;
 };
 const visit=(node:unknown):void=>{
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const child of node)visit(child);return;}
  const n=node as Record<string,unknown>;
  let specifier:string|undefined;
  if(n['type']==='ImportDeclaration'||n['type']==='ExportNamedDeclaration'||n['type']==='ExportAllDeclaration'||n['type']==='ImportExpression')specifier=literal(n['source']);
  if(n['type']==='CallExpression'){
   const callee=n['callee'] as Record<string,unknown>|undefined;
   if(callee?.['type']==='Identifier'&&callee['name']==='require')specifier=literal((n['arguments'] as unknown[])[0]);
  }
  if(specifier!==undefined)found.add(specifier);
  for(const child of Object.values(n))visit(child);
 };
 visit(tree);
 return [...found];
}
