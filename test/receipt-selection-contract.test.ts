import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,existsSync,rmSync}from'node:fs';import{join}from'node:path';import{canonical}from'@lapxo/topos/wire';import{actingRootFixture}from'./support/acting-root.ts';
const fixture=JSON.parse(readFileSync(new URL('../vectors/contracts/receipt-output-selection.json',import.meta.url),'utf8'));
const row=(scope:string,measure:string,value:string,more:Record<string,string>={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:fixture',...more});
for(const domain of fixture.domains)test(`native receipt selection: ${domain}`,()=>{
 const f=actingRootFixture(domain,[],{fields:'scope|role|form|measure|value|by|at|epoch|sig|about|shape|needs',extraBootstrapRows:[row('wire/receipt-fields','id','scope|role|form|measure|value|by|at'),row('view/receipts','id','receipts@8|receipts@0|receipts@1',{role:'demands',shape:'receipts.bound',needs:'receipts.bound'}),row('view/optional','id','lines@8',{role:'demands',shape:'optional.txt'}),row('view/required','id','lines@8',{role:'demands',shape:'required.txt',needs:'required.txt'})]});
 const ok=(args:string[])=>{const got=f.run(args);assert.equal(got.status,0,got.stderr+got.stdout);return got;};
 const results=[];
 try{
  const full=ok(['fold']);assert.match(full.stdout,/PASS\s+closed/);assert.equal(existsSync(join(f.root,'optional.txt')),false);
  ok(['fold','--as','receipts']);ok(['fold','--check']);results.push({id:'nonmaterializing',status:0});results.push({id:'rendered',status:0});
  for(const id of ['missing','altered','stale']){
   const before=readFileSync(join(f.root,'required.txt'),'utf8');
   if(id==='missing')rmSync(join(f.root,'required.txt'));
   else if(id==='altered')writeFileSync(join(f.root,'required.txt'),'altered bytes');
   else{const proposal=join(f.temp,'revision.proposal');writeFileSync(proposal,row('sample/edition','id','second')+'\n');ok(['land',proposal,'--key','owner','--key-file',f.key]);assert.equal(readFileSync(join(f.root,'required.txt'),'utf8'),before)}
   ok(['fold','--as','receipts']);const result=f.run(['fold','--check']);assert.notEqual(result.status,0,id);assert.doesNotMatch(result.stdout,/PASS\s+closed/);assert.equal(JSON.parse(result.stderr.trim().split('\n').at(-1)!).code,'receipts/open');results.push({id,status:result.status,stderr:result.stderr.replaceAll(f.root,'[place]')});
   ok(['fold']);ok(['fold','--check']);
  }
  const proposal=join(f.temp,'unrendered.proposal');writeFileSync(proposal,row('view/unrendered','id','missing-region@1',{role:'demands',shape:'unrendered.txt',needs:'unrendered.txt'})+'\n');ok(['land',proposal,'--key','owner','--key-file',f.key]);
  writeFileSync(join(f.root,'unrendered.txt'),'\n');
  ok(['fold','--as','receipts']);const result=f.run(['fold','--check']);assert.notEqual(result.status,0);assert.doesNotMatch(result.stdout,/PASS\s+closed/);const fold=f.run(['fold']);assert.notEqual(fold.status,0);assert.match(fold.stderr,/missing-region/);results.push({id:'failed-render',status:result.status,stderr:result.stderr.replaceAll(f.root,'[place]')});
  console.log(JSON.stringify({domain,node:process.version,results}));
 }finally{f.close()}
});
