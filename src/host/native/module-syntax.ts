import{stringLiteral}from'../adapters/modules/javascript.ts';
import type {parse as Parser} from 'acorn';
import * as nodeModule from 'node:module';
import {extname} from 'node:path';

/** Host module syntax, never wire or domain interpretation. Reading imports executes no module. */
// The package's minimum Node runtime provides this API; older build-only Node types do not.
const require=nodeModule.createRequire(import.meta.url);
const {parse}=require('acorn') as {parse:typeof Parser};
const stripTypeScriptTypes=(nodeModule as unknown as {stripTypeScriptTypes:(source:string,options:{mode:'transform'})=>string}).stripTypeScriptTypes;
export interface ModuleImportSyntax { readonly imports: readonly string[]; readonly unresolved: readonly string[] }

/** Syntax inventory is not an execution-closure certificate: unresolved expressions stay explicit. */
export function moduleImportSyntax(source: string, coordinate: string, options?: {readonly esmOnly: boolean}): ModuleImportSyntax {
 const code=extname(coordinate)==='.ts'?stripTypeScriptTypes(source,{mode:'transform'}):source;
 let tree: unknown;
 try{tree=parse(code,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true,allowHashBang:true})}
 catch{throw Error('REFUSE·source module syntax cannot be read: '+coordinate)}
 const found=new Set<string>(),unresolved=new Set<string>();
 const literal=stringLiteral;
 const visit=(node:unknown,parent?:Record<string,unknown>,key?:string,reexportSource=false):void=>{
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const child of node)visit(child,parent,key,reexportSource);return;}
  const n=node as Record<string,unknown>;
  // Escaped loader references do not become an empty inventory. This is
  // conservative syntax, not a complete JavaScript alias/data-flow proof.
  if(n['type']==='Identifier'&&n['name']==='require'){
   const direct=parent?.['type']==='CallExpression'&&key==='callee';
   const namedProperty=(parent?.['type']==='MemberExpression'&&key==='property'&&!parent['computed'])||((parent?.['type']==='Property'||parent?.['type']==='MethodDefinition')&&key==='key'&&!parent['computed']&&!parent['shorthand']);
   // Declaration names are not loader references. This does not resolve shadowing:
   // references to a binding named require remain conservative, including local calls.
   const declarationName=((parent?.['type']==='ImportSpecifier'||parent?.['type']==='ImportDefaultSpecifier'||parent?.['type']==='ImportNamespaceSpecifier')&&(key==='imported'||key==='local'))||(parent?.['type']==='FunctionDeclaration'&&key==='id');
   const reexportName=parent?.['type']==='ExportSpecifier'&&(key==='exported'||(key==='local'&&reexportSource));
   if(!direct&&!namedProperty&&!declarationName&&!reexportName)unresolved.add('require reference at '+String(n['start']));
  }
  let specifier:string|undefined;
  if(n['type']==='ImportDeclaration'||n['type']==='ExportNamedDeclaration'||n['type']==='ExportAllDeclaration'||n['type']==='ImportExpression'){
   specifier=literal(n['source']);
   if(n['type']==='ImportExpression'&&specifier===undefined)unresolved.add('import expression at '+String(n['start']));
  }
  if(n['type']==='CallExpression'){
   const callee=n['callee'] as Record<string,unknown>|undefined;
   if(callee?.['type']==='Identifier'&&callee['name']==='require'){
    if(options?.esmOnly)throw Error('REFUSE·module closure CommonJS load in ESM delivery '+coordinate);
    specifier=literal((n['arguments'] as unknown[])[0]);
    if(specifier===undefined)unresolved.add('require expression at '+String(n['start']));
   }
  }
  if(specifier!==undefined)found.add(specifier);
  for(const [childKey,child] of Object.entries(n))visit(child,n,childKey,n['type']==='ExportNamedDeclaration'?n['source']!==null&&n['source']!==undefined:reexportSource);
 };
 visit(tree);
 return {imports:[...found],unresolved:[...unresolved]};
}

/** Existing inventory keeps its meaning; callers requiring closure must inspect unresolved edges. */
export function moduleImports(source: string, coordinate: string): readonly string[] {
 return moduleImportSyntax(source,coordinate).imports;
}
