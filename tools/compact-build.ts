import {readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {join,dirname,relative,resolve} from 'node:path';
import ts from 'typescript';
import {buildSync,transformSync} from 'esbuild';
import {generateDtsBundle} from 'dts-bundle-generator';
import {sha256} from '../src/host/hash.ts';

const relativeModule=(from:string,to:string)=>{const value=relative(dirname(from),to).split('\\').join('/');return value.startsWith('.')?value:'./'+value};
/** Consolidate only build artifacts. Public wrappers preserve each entry's export set.
 * The host's calculated loading port stays separate from the portable library. */
export function compactBuild(root:string):readonly string[]{
 const dist=join(root,'dist'),vendor=join(dist,'vendor');
 const own=(readdirSync(dist,{recursive:true}) as string[]).filter(p=>p.endsWith('.js')&&!p.startsWith('vendor/'));
 const requests=new Map<string,string>();
 for(const file of own){const at=join(dist,file),tree=ts.createSourceFile(at,readFileSync(at,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const visit=(node:ts.Node)=>{let value:ts.Node|undefined;if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))value=node.moduleSpecifier;else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)value=node.arguments[0];
   if(value&&ts.isStringLiteral(value)){const target=resolve(dirname(at),value.text);if(target.startsWith(vendor+'/'))requests.set(target,'library'+requests.size)}ts.forEachChild(node,visit)};visit(tree);
 }
 // Stable names and export enumeration come from the compiler, never execution.
 const entries=[...requests.keys()].sort();requests.clear();entries.forEach((p,i)=>requests.set(p,'library'+i));
 const program=ts.createProgram(entries,{allowJs:true,checkJs:false,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext});
 const checker=program.getTypeChecker(),exportsOf=(file:string)=>{const source=program.getSourceFile(file);if(!source)throw Error('Compact source absent '+file);const symbol=checker.getSymbolAtLocation(source);return symbol?checker.getExportsOfModule(symbol).filter(s=>((s.flags&ts.SymbolFlags.Alias)?checker.getAliasedSymbol(s):s).flags&ts.SymbolFlags.Value).map(s=>s.name).sort():[]};
 const output=join(vendor,'runtime.js'),input=join(vendor,'entry.js'),host=new Map<string,string>(),names=new Map<string,string[]>();let entry='';
 for(const file of entries){const prefix=requests.get(file)!,exported=exportsOf(file);names.set(file,exported);
  if(file.endsWith('/object-provider.js')){const target=join(vendor,'object-provider.js');writeFileSync(target,readFileSync(file));host.set(file,target);continue}
  entry+=`export {${exported.map(n=>`${n} as ${prefix}_${n}`).join(',')}} from ${JSON.stringify(relativeModule(input,file))};\n`;
 }
 writeFileSync(input,entry);
 const result=buildSync({entryPoints:[input],outfile:output,absWorkingDir:root,bundle:true,format:'esm',platform:'neutral',target:'es2022',minify:true,keepNames:true,metafile:true,write:true,legalComments:'inline'});
 const facade=new Map<string,string>();
 for(const file of own){const at=join(dist,file),source=readFileSync(at,'utf8'),tree=ts.createSourceFile(at,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits:{start:number;end:number;text:string}[]=[];
  const facadeOf=(target:string)=>{if(host.has(target))return host.get(target)!;if(facade.has(target))return facade.get(target)!;const path=join(vendor,requests.get(target)!+'.js');writeFileSync(path,`export {${names.get(target)!.map(n=>`${requests.get(target)}_${n} as ${n}`).join(',')}} from './runtime.js';\n`);facade.set(target,path);return path};
  const visit=(node:ts.Node)=>{
   if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
    const target=resolve(dirname(at),node.moduleSpecifier.text);if(requests.has(target)){
     const clause=node.importClause;
     if(!host.has(target)&&clause&&!clause.name&&clause.namedBindings&&ts.isNamedImports(clause.namedBindings)){
      const spec=clause.namedBindings.elements.map(e=>`${requests.get(target)}_${e.propertyName?.text??e.name.text} as ${e.name.text}`).join(',');
      edits.push({start:node.getStart(tree),end:node.end,text:`import {${spec}} from ${JSON.stringify(relativeModule(at,output))};`});return;
     }
     edits.push({start:node.moduleSpecifier.getStart(tree),end:node.moduleSpecifier.end,text:JSON.stringify(relativeModule(at,facadeOf(target)))});
    }
   }else if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
    const target=resolve(dirname(at),node.moduleSpecifier.text);if(requests.has(target))edits.push({start:node.moduleSpecifier.getStart(tree),end:node.moduleSpecifier.end,text:JSON.stringify(relativeModule(at,facadeOf(target)))});
   }else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){
    const literal=node.arguments[0],target=resolve(dirname(at),literal.text);if(requests.has(target))edits.push({start:literal.getStart(tree),end:literal.end,text:JSON.stringify(relativeModule(at,facadeOf(target)))});
   }ts.forEachChild(node,visit);
  };visit(tree);let next=source;for(const e of edits.sort((a,b)=>b.start-a.start))next=next.slice(0,e.start)+e.text+next.slice(e.end);writeFileSync(at,transformSync(next,{format:'esm',target:'es2022',minify:true,keepNames:true,legalComments:'inline',sourcefile:file}).code);
 }
 // One shared type identity across all public routes, with route-specific exports.
 const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8')),roots=new Set<string>([pkg.types]);
 const collect=(x:unknown)=>{if(!x||typeof x!=='object')return;for(const[k,v]of Object.entries(x)){if(k==='types'&&typeof v==='string')roots.add(v.replace(/^\.\//,''));else collect(v)}};collect(pkg.exports);
 const typeFiles=[...roots].sort(),typeProgram=ts.createProgram(typeFiles.map(f=>join(root,f)),{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,skipLibCheck:true});
 const typeChecker=typeProgram.getTypeChecker(),publicNames=new Map<string,string[]>(),typeEntry=join(dist,'public-entry.d.ts');let declaration='';
 for(const[fileIndex,file]of typeFiles.entries()){const source=typeProgram.getSourceFile(join(root,file))!,symbol=typeChecker.getSymbolAtLocation(source),names=symbol?typeChecker.getExportsOfModule(symbol).map(s=>s.name).sort():[];publicNames.set(file,names);if(names.length)declaration+=`export {${names.map(n=>`${n} as public${fileIndex}_${n}`).join(',')}} from ${JSON.stringify(relativeModule(typeEntry,join(root,file)).replace(/\.d\.ts$/,'.js'))};\n`}
 writeFileSync(typeEntry,declaration);
 const bundled=generateDtsBundle([{filePath:typeEntry,output:{noBanner:true,exportReferencedTypes:false,sortNodes:true}}],{preferredConfigPath:join(root,'tsconfig.json')})[0]!;
 const shared=join(dist,'public-types.d.ts');writeFileSync(shared,bundled);
 for(const[i,file]of typeFiles.entries())writeFileSync(join(root,file),`export {${publicNames.get(file)!.map(n=>`public${i}_${n} as ${n}`).join(',')}} from ${JSON.stringify(relativeModule(join(root,file),shared).replace(/\.d\.ts$/,'.js'))};\n`);
 rmSync(typeEntry);rmSync(input);
 // The verified originals remain in vendor/package-sources.json, outside delivery.
 for(const name of readdirSync(vendor)){if(/^[0-9a-f]{64}$/.test(name)){const base=join(vendor,name);const license=readFileSync(join(base,'LICENSE'),'utf8');writeFileSync(join(vendor,name+'.LICENSE'),license);rmSync(base,{recursive:true})}}
 writeFileSync(join(vendor,'bundle.json'),JSON.stringify({format:'compact-vendor-build/1',runtime:sha256(readFileSync(output)),sources:JSON.parse(readFileSync(join(vendor,'sources.json'),'utf8')),inputs:Object.keys(result.metafile!.inputs).sort(),publicTypes:sha256(bundled)})+'\n');
 return [...typeFiles,'dist/public-types.d.ts'];
}
