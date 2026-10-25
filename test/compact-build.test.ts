import assert from 'node:assert/strict';
import{test}from'node:test';
import{readFileSync,readdirSync}from'node:fs';
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
 assert.equal(roots.size,10,'the admitted public API declares ten type roots');
 // The compiler's input graph and delivered licenses preserve provenance.
 const graph=JSON.parse(readFileSync(join(root,'vendor/inputs.json'),'utf8'));
 assert.ok(Object.keys(graph.inputs).length>1);
 for(const name of ['topos','obligations']){
  const original=readFileSync(join(root,'node_modules/@lapxo',name,'LICENSE'));
  assert.deepEqual(readFileSync(join(root,'vendor',name+'.LICENSE')),original);
  assert.ok(pkg.files.includes('vendor/'+name+'.LICENSE'));
 }
 assert.ok(pkg.files.includes('vendor/inputs.json'));
 assert.ok(!Object.keys(graph.inputs).some(p=>p.startsWith('/')||p.startsWith('../')));


});

test('WASM notice selection retains every attribution and exact original license',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),dir=join(root,'licenses/wasm'),names=readdirSync(dir).filter(n=>n.endsWith('.txt')&&n!=='NOTICE.txt').sort(),notice=readFileSync(join(dir,'NOTICE.txt'),'utf8');
 const verify=(text:string)=>{for(const name of names){assert.ok(text.includes(name),'missing attribution '+name);assert.ok(text.includes(readFileSync(join(dir,name),'utf8')),'changed license '+name)}};
 verify(notice);assert.equal(names.length,7);
 assert.throws(()=>verify(notice.replace('bound.txt','removed attribution')));
 assert.throws(()=>verify(notice.replaceAll('Permission is hereby granted','Altered license text')));
 const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));assert.ok(pkg.files.includes('licenses/wasm/NOTICE.txt'));assert.ok(!pkg.files.includes('licenses/wasm/*'));
});
