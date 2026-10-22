import {readPhysicalLines,PHYSICAL_LINES_PROFILE} from '@lapxo/topos/contract';
const fixtureDigest='sha256:'+'1'.repeat(64);
// The native host owns real input digests. This pure count projection delegates text/count semantics to Topos.
export const render=()=>['bound-lock/1 at=receipt:1 by=world form=alphabet measure=reads role=reads scope=physical value=src/input.txt'];
export const receipt=asked=>{
 const file=asked.lines.find(line=>line.scope==='src/input.txt');
 if(!file)throw Error('actual handed input absent');
 const bytes=new TextEncoder().encode(file.about);
 const read=readPhysicalLines({profile:PHYSICAL_LINES_PROFILE,snapshot:fixtureDigest,files:[{name:'src/input.txt',digest:fixtureDigest,bytes}],regions:[{scope:'core/lines',selectors:['src/*.txt']}],policy:{byteBudget:'65536',rowBudget:'65536'}},()=>fixtureDigest);
 if(read.status!=='read'||read.regions[0].status!=='measured')throw Error('actual physical input unmeasured');
 const n=Number(read.regions[0].value.numerator);
 return [{scope:'core/lines',measure:'lines',role:'reads',bound:{kind:'interval',lo:n,hi:n}}];
};
