import{mkdtempSync,mkdirSync,copyFileSync,readFileSync,rmSync}from'node:fs';import{join,dirname,resolve}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';import{installedHostInstrument}from'@lapxo/bound/host';
/** Test installation uses npm's declared file selection, never a copied authority store. */
export function pinnedHostInstrument(source:string){
 const stage=mkdtempSync(join(tmpdir(),'bound-host-package-')),cache=mkdtempSync(join(tmpdir(),'bound-host-pack-cache-'));
 try{const pack=spawnSync('npm',['pack','--dry-run','--json','--ignore-scripts'],{cwd:source,encoding:'utf8',env:{...process.env,npm_config_cache:cache},timeout:15000,maxBuffer:2097152});if(pack.status!==0)throw Error(pack.stderr);const rows=JSON.parse(pack.stdout)[0].files,members=[];
 for(const row of rows){const from=resolve(source,row.path),to=join(stage,row.path);if(!from.startsWith(resolve(source)+'/'))throw Error('package path escapes');mkdirSync(dirname(to),{recursive:true});copyFileSync(from,to);members.push({coordinate:row.path,digest:'sha256:'+createHash('sha256').update(readFileSync(to)).digest('hex')})}
 const request={directory:stage,shape:'package',members,exports:[['exports','./engine','default']],pins:[],limits:{members:4096,bytes:134217728,responseBytes:4194304}};
 const instrument=installedHostInstrument(request,join(stage,'dist/cli/verb.js'));return {instrument,entry:instrument.runtime.entry,close:()=>rmSync(stage,{recursive:true,force:true})};
 }catch(error){rmSync(stage,{recursive:true,force:true});throw error}finally{rmSync(cache,{recursive:true,force:true})}
}
