import {spawnSync} from 'node:child_process';
import {cpSync,mkdtempSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {publicationOf} from '@lapxo/topos/wire';
import {ownLock} from '../../src/observe/runner.ts';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const source=process.cwd();
const root=mkdtempSync(join(tmpdir(),'source-vector-'));
try {
 for(const name of ['src','test','samples','package.json']) cpSync(join(source,name),join(root,name),{recursive:true});
 // A portable instrument carries published standing, never delivery history
 // whose authority exists only in the source checkout's private ledger.
 writeFileSync(join(root,'TARGET.bound'),publicationOf(ownLock()).join('\n')+'\n');
 symlinkSync(join(source,'node_modules'),join(root,'node_modules'),'dir');
 const run=spawnSync(process.execPath,['--import','./test/setup.ts','--test','--test-reporter=tap',...process.argv.slice(2)],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
 if(run.error||run.signal||run.status===null) throw run.error??new Error(run.signal??'No process status');
 process.stdout.write(run.stdout);process.stderr.write(run.stderr);process.exitCode=run.status;
} finally {rmSync(root,{recursive:true,force:true});}
