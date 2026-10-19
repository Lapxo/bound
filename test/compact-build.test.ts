import assert from 'node:assert/strict';
import{test}from'node:test';
import{readFileSync}from'node:fs';
import{fileURLToPath}from'node:url';
import{join}from'node:path';
import ts from'typescript';

test('compacted public declarations retain the exact export set of every source API',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8')),roots=new Set<string>([pkg.types]);
 const collect=(x:unknown)=>{if(!x||typeof x!=='object')return;for(const[k,v]of Object.entries(x)){if(k==='types'&&typeof v==='string')roots.add(v.replace(/^\.\//,''));else collect(v)}};collect(pkg.exports);
 const files=[...roots],sources=files.map(f=>f.replace(/^dist\//,'src/').replace(/\.d\.ts$/,'.ts'));
 const program=ts.createProgram([...files,...sources].map(f=>join(root,f)),{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,skipLibCheck:true}),checker=program.getTypeChecker();
 const names=(file:string)=>{const source=program.getSourceFile(join(root,file))!;const symbol=checker.getSymbolAtLocation(source);return symbol?checker.getExportsOfModule(symbol).map(s=>s.name).sort():[]};
 for(const[i,file]of files.entries())assert.deepEqual(names(file),names(sources[i]!),file);
 assert.equal(roots.size,7);
});
