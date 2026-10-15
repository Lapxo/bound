/** Fixed Root native preload. One parent custodian holds generated provenance
 * and counters. Original child APIs execute actual programs; nothing synthesizes
 * their results. This privileged native profile is not an adversarial sandbox. */
import nativeChildProcess from 'node:child_process';
import fs from 'node:fs';
import {traverseGeneratedClosure} from './generated.ts';
import nativeWorkerThreads from 'node:worker_threads';
import { readFileSync, realpathSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as nativeModule from "node:module";
import { syncBuiltinESMExports, builtinModules } from 'node:module';
import { nodeLaunch, projectNativeProgramLaunch, selectNativeProgramParent,nativeEvalParent,actualNodeEvalOptions,type NativeEvalParent } from './node-launch.ts';
import { readBoundedFile } from './bounded-file.ts';
import{createFixedControlBridge}from'./control-bridge.ts';
import {installNativeResolutionReuse} from './loader.ts';
const childProcess:any = nativeChildProcess, workerThreads:any = nativeWorkerThreads;
const registerHooks=(nativeModule as unknown as {registerHooks?:(hooks:any)=>unknown}).registerHooks;
export function installDescendantBoundary(config: any) {
    const sha = (b: any) => 'sha256:' + createHash('sha256').update(b).digest('hex'), originalSync = childProcess.spawnSync;
    let red:any, transport:any, reporting = false;
    const fail:(why:string)=>never = (why: any) => { red ??= 'REFUSE·native descendant ' + why; if (transport && !reporting) {
        reporting = true;
        try {
            transport({ operation: 'violation', token: endpoint.token, why: red });
        }
        catch { }
        finally {
            reporting = false;
        }
    } throw Error(red); };
    const { contextFile, client, runtime, preload, runtimeDigest, clientDigest } = config.custodian ?? {};
    let execution;
    try {
        execution = JSON.parse(readBoundedFile(contextFile, config.contextBytes, contextFile).toString('utf8'));
    }
    catch {
        fail('Root execution custody absent');
    }
    const { endpoint, parentExecution } = execution;
    const programs = execution.programs ?? [];
    if (!parentExecution?.identity || endpoint?.parent !== parentExecution.identity)
        fail('Root custody parent differs');
    if (!endpoint || !runtime || !preload || !client || sha(readBoundedFile(runtime, config.runtimeBytes, runtime)) !== runtimeDigest || sha(readBoundedFile(client, config.clientBytes, client)) !== clientDigest)
        fail('Root custodian binding absent/different');
    // File validity is checked only at an actual disk-execution boundary, never cached.
    const runtimeForExecution = (path: string, why: string) => {
        let valid = false;
        try { valid = realpathSync(path) === realpathSync(runtime) && sha(readBoundedFile(path, config.runtimeBytes, path)) === runtimeDigest; }
        catch { return fail(why); }
        if (!valid) fail(why);
    };
    const known = new Map<string,string>(config.members.map((m: any) => [realpathSync(m.path), m.digest])), executableDigests = new Set<string>(config.executableDigests ?? []), metadataDigests = new Set(config.metadataDigests ?? config.members.filter((m: any) => m.path.endsWith('.json')).map((m: any) => m.digest)), native = new Set(config.builtins.map((n: any) => n.startsWith('node:') ? n : 'node:' + n)), library = new Map<string,any>(config.libraries.map((l: any) => [l.name, l]));
    // Reuse this fixed resolver only after comparing every required library
    // member with the instrument's pins. The inherited input resource also
    // bounds metadata prepared for that comparison; no world supplies a checker.
    let resolutionBytes=0;
    const resolutionMembers=config.members.map((member:any)=>{const path=realpathSync(member.path),stat=statSync(path);if(!stat.isFile()||!Number.isSafeInteger(config.inputBytes)||config.inputBytes<1||(resolutionBytes+=stat.size)>config.inputBytes)fail('fixed library resolution resource exceeded');return{path,digest:member.digest,bytes:stat.size}});
    installNativeResolutionReuse({members:resolutionMembers,libraries:config.libraries,builtins:config.builtins,entry:resolutionMembers[0]?.path??'',platform:config.platform});
    let controlBridge:ReturnType<typeof createFixedControlBridge>|undefined;
    if(config.control&&config.control.realm!=='main-thread')fail('unknown Root control realm');
    // The signed host profile selects retention only in the actual main realm.
    // WorldWorker realms keep the same bounded fixed-client/checks, not a SAB verifier.
    if(config.control&&nativeWorkerThreads.isMainThread){const c=config.control;controlBridge=createFixedControlBridge({endpoint,workerBytes:readBoundedFile(c.worker.path,c.worker.bytes,c.worker.coordinate),worker:c.worker,runtime:{path:runtime,digest:runtimeDigest,bytes:config.runtimeBytes},resources:c.resources,deadlineMs:endpoint.deadlineMs});process.once('exit',()=>{void controlBridge?.close()});process.once('beforeExit',()=>{void controlBridge?.close()});}
    const exchange = (body: any) => {
        const frame = JSON.stringify({ protocol: 'command-lot/1', coordinate: endpoint.coordinate, implementation: endpoint.implementation, identity: endpoint.identity, requests: [JSON.stringify(body)] });
        if (Buffer.byteLength(frame) > endpoint.responseBytes)
            fail('custodian request bytes');
        let stdout:string;if(controlBridge){try{stdout=controlBridge.exchange(frame)}catch(error){void controlBridge.close();return fail(error instanceof Error?error.message:String(error));}}else{
        // This branch executes disk bytes now; retention never stands in for this check.
        runtimeForExecution(runtime, 'Root sync bridge runtime bytes differ');
        let clientValid = false;
        try { clientValid = sha(readBoundedFile(client, config.clientBytes, client)) === clientDigest; } catch { /* A missing or oversized executable is a refusal too. */ }
        if (!clientValid) fail('Root sync bridge bytes differ');
        const got:any = Reflect.apply(originalSync, childProcess, [runtime, [client,String(config.contextBytes)], { input: JSON.stringify({ endpoint, frame }), encoding: 'utf8', timeout: endpoint.timeoutMs, maxBuffer: endpoint.responseBytes, env: { ...process.env }, shell: false }]);
        if (got.error || got.signal || got.status !== 0 || got.stderr)
            fail('custodian client interrupted/refused ' + (got.error?.message ?? got.stderr ?? got.signal ?? got.status));stdout=got.stdout;}
        let reply;
        try {
            reply = JSON.parse(stdout);
        }
        catch {
            return fail('custodian response malformed');
        }
        if (reply.protocol !== 'command-lot/1' || reply.coordinate !== endpoint.coordinate || reply.implementation !== endpoint.implementation || reply.identity !== endpoint.identity || !Array.isArray(reply.responses) || reply.responses.length !== 1)
            fail('custodian response identity/count');
        return reply.responses[0];
    };
    transport = exchange;
    const verifiedEdges = new Map<string,string>();
    let candidateHandoff=()=>[] as any[],candidateHanded=(_groups:readonly any[])=>{};
    const request = (entry: any, operation: any = 'entry') => { if (red)
        throw Error(red);const candidates=operation==='entry'?candidateHandoff():[];const one = exchange({ operation, token: endpoint.token, request: candidates.length?{...entry,candidates}:entry }); if (one.kind === 'refuse')
        fail(one.why); if (one.kind !== 'entry-context' || !one.context?.identity)
        fail('custodian context absent'); if (one.context.parent !== parentExecution.identity || one.context.producer !== endpoint.identity)
        fail('custodian context parent differs');candidateHanded(candidates); if (operation === 'entry' && Array.isArray(one.context.edges)) {
        for (const edge of one.context.edges) {
            if (typeof edge.target === 'string' && edge.target.startsWith('/') && /^sha256:[0-9a-f]{64}$/.test(edge.digest ?? '')) {
                const prior = verifiedEdges.get(edge.target);
                if (prior && prior !== edge.digest)
                    fail('verified edge bytes changed ' + edge.target);
                verifiedEdges.set(edge.target, edge.digest);
            }
        }
    } return one.context; };
    const invocation = (args: any, cwd: any, env: any, options: any = {}) => ({ cwd: realpathSync(resolve(cwd ?? process.cwd())), argv: [...args], environment: Object.entries(env ?? process.env).sort(), runtime, timeoutMs: Math.min(options.timeout ?? endpoint.timeoutMs, endpoint.timeoutMs), responseBytes: Math.min(options.maxBuffer ?? endpoint.responseBytes, endpoint.responseBytes) });
    let evalParent:NativeEvalParent|undefined;
    const actualEval=nativeWorkerThreads.isMainThread&&actualNodeEvalOptions(process.execArgv);
    if(actualEval){if(realpathSync(process.execPath)!==realpathSync(runtime))fail('actual eval runtime differs from Root selection');const actual={argv:[...process.execArgv,...process.argv.slice(1)],rootPrefix:['--import',preload],cwd:process.cwd(),environment:Object.entries(process.env).sort() as [string,string][],runtime};const retained=request(actual,'eval-context');evalParent=nativeEvalParent(retained,actual);}
    let flushEmissions = (_paths:readonly string[] = []) => { };
    let flushExecutable = (_path:string,_mode:'module'|'commonjs',_source?:Uint8Array) => { };
    const interpretedMetadata = new Map<string,any>();
    const modeOf = (path: any, call: any) => { const ext = extname(path); if (ext === '.mjs' || ext === '.mts')
        return 'module'; if (ext === '.cjs' || ext === '.cts')
        return 'commonjs'; if (ext !== '' && ext !== '.js' && ext !== '.ts')
        fail('executable extension unsupported ' + ext); let directory = dirname(path); for (;;) {
        const manifest = resolve(directory, 'package.json');
        if (existsSync(manifest)) {
            flushEmissions([realpathSync(manifest)]);
            if (statSync(manifest).size > (config.inputBytes ?? endpoint.responseBytes))
                fail('package interpretation bytes');
            const raw = readBoundedFile(manifest, config.inputBytes, manifest);
            const digest = sha(raw);
            if (!metadataDigests.has(digest)) {
                const key = JSON.stringify([manifest, digest, call]);
                if (!interpretedMetadata.has(key)) {
                    const held = request({ path: manifest, interpretation: 'node-package-json@1', invocation: call }, 'interpretation');
                    if (held.kind !== 'derived-interpretation/1' || held.path !== realpathSync(manifest) || held.digest !== digest || held.interpretation !== 'node-package-json@1' || sha(readBoundedFile(manifest, config.inputBytes, manifest)) !== digest)
                        fail('package interpretation changed after custody');
                    interpretedMetadata.set(key, held.identity);
                }
            }
            let pkg;
            try {
                pkg = JSON.parse(raw.toString('utf8'));
            }
            catch {
                fail('package interpretation invalid');
            }
            if (pkg.type === undefined || pkg.type === 'commonjs')
                return 'commonjs';
            if (pkg.type === 'module')
                return 'module';
            fail('package interpretation type unknown');
        }
        const parent = dirname(directory);
        if (parent === directory)
            return 'commonjs';
        directory = parent;
    } };
    const sealFile = (path: any, call: any, forceCustody: any = false, loaded: any=undefined) => { let actual; try {
        actual = realpathSync(path);
    }
    catch {
        return fail('executable target absent ' + path);
    } flushEmissions([actual]);const expected = known.get(actual); if (statSync(actual).size > (config.inputBytes ?? endpoint.responseBytes))
        fail('input bytes before hash'); const bytes = readBoundedFile(actual, config.inputBytes, actual), digest = sha(bytes); if (actual.endsWith('.json')) {
        if (forceCustody)
            fail('JSON executable entry unsupported');
        if (!metadataDigests.has(digest))
            fail('JSON interpretation not Root-selected ' + actual);
        return actual;
    } if (expected && digest !== expected)
        fail('retained target bytes differ ' + actual); const priorEdge = verifiedEdges.get(actual); if (priorEdge && digest !== priorEdge)
        fail('verified edge bytes differ ' + actual); if (!forceCustody && priorEdge === digest && !(extname(actual) === '' && !loaded))
        return actual; if (extname(actual) === '' && !loaded)
        return actual; if (!forceCustody && !loaded && (executableDigests.has(digest) || (expected && extname(actual) === '.json')))
        return actual; const selectedMode=loaded?.format ?? modeOf(actual, call);flushExecutable(actual,selectedMode,bytes);const context = request({ kind: 'file', path: actual, mode: selectedMode, ...(loaded ? { interpretation: 'node-ambiguous-javascript@1' } : {}), invocation: call }); if (context.path !== actual && context.target?.path !== actual)
        fail('custodian target changed'); if (context.digest !== sha(readBoundedFile(actual, config.inputBytes, actual)))
        fail('derived target changed after seal'); return actual; };
    const prepare = (program: any, args: any, options: any = {}) => {
        if (red)
            throw Error(red);
        if (options.shell)
            fail('shell target undeclared');
        let command = program;
        const native = programs.filter((p: any) => p.alias === program && p.kind === 'native-binary');
        if (native.length) {
            if (native.length !== 1)
                fail('native binary alias ambiguous');
            const selected = native[0], call = invocation(args, options.cwd, options.env, options), held = request({ alias: program, path: selected.entry, invocation: call }, 'native-program');
            if (held.kind !== 'native-program-transaction/1' || held.target !== selected.entry || held.digest !== selected.entryDigest || sha(readBoundedFile(selected.entry, selected.entryBytes, selected.entry)) !== held.digest)
                fail('native binary changed before entry');
            return { command: selected.entry, args: [...args], options: { ...options, timeout: call.timeoutMs, maxBuffer: call.responseBytes, shell: false } };
        }
        if (programs.some((p: any) => p.alias === program)) {
            let declared;
            try {
                declared = projectNativeProgramLaunch(programs, program, args, { path: realpathSync(runtime), digest: runtimeDigest });
            }
            catch (error) {
                return fail(error instanceof Error?error.message:String(error));
            }
            command = declared.interpreter;
            args = [declared.entry, ...declared.args];
        }
        let selected;
        try {
            selected = realpathSync(command);
        }
        catch {
            return fail('native program undeclared ' + program);
        }
        runtimeForExecution(selected, 'native runtime target undeclared ' + program);
        const launch = nodeLaunch(args), call = invocation(args, options.cwd, options.env, options);
        // Root bootstrap prefix is instrumentation; the original argv/text stays exact.
        if (launch.kind === 'eval'){
            flushExecutable(resolve(call.cwd,launch.mode==='module'?'[eval1].js':'[eval].cjs'),launch.mode,Buffer.from(launch.text));
            request({ kind: 'eval', argv: ['--import', preload, ...args], rootPrefix: ['--import', preload], mode: launch.mode, invocation: call });
        }else
            sealFile(resolve(call.cwd, launch.entry), call, true);
        for (const input of launch.imports)
            sealFile(input.startsWith('file:') ? fileURLToPath(input) : resolve(call.cwd, input), call);
        return { command, args: ['--import', preload, ...args], options: { ...options, timeout: call.timeoutMs, maxBuffer: call.responseBytes, shell: false } };
    };
    for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
        const original = childProcess[name];
        childProcess[name] = function (program: any, args: any, options: any, ...tail: any) { if (!Array.isArray(args) || typeof options === 'function')
            fail('native call shape unsupported ' + name); const checked = prepare(program, args, options); return Reflect.apply(original, this, [checked.command, checked.args, checked.options, ...tail]); };
    }
    childProcess.exec = childProcess.execSync = () => fail('shell native profile absent');
    const originalFork = childProcess.fork;
    childProcess.fork = function (module: any, args: any = [], options: any = {}) { if (!Array.isArray(args))
        fail('fork argv shape'); if (options.execPath && realpathSync(options.execPath) !== realpathSync(runtime))
        fail('fork runtime undeclared'); const originalArgv = options.execArgv ?? process.execArgv, withoutRoot = originalArgv[0] === '--import' && originalArgv[1] === preload ? originalArgv.slice(2) : originalArgv; const launch = nodeLaunch([...withoutRoot, module, ...args]); if (launch.kind !== 'file' || launch.entry !== module)
        fail('fork executable mode unsupported'); for (const input of launch.imports)
        sealFile(input.startsWith('file:') ? fileURLToPath(input) : resolve(options.cwd ?? process.cwd(), input), invocation([module, ...args], options.cwd, options.env, options)); sealFile(resolve(options.cwd ?? process.cwd(), module), invocation([module, ...args], options.cwd, options.env, options), true);
        // Fork executes a runtime from disk, unlike a retained control message.
        const forkRuntime = options.execPath ?? process.execPath;
        runtimeForExecution(forkRuntime, 'fork runtime bytes differ from Root selection');
        return Reflect.apply(originalFork, this, [module, args, { ...options, execArgv: ['--import', preload, ...withoutRoot] }]); };
    const OriginalWorker = workerThreads.Worker;
    workerThreads.Worker = class extends OriginalWorker {
        constructor(target: any, options: any = {}) { const args = options.execArgv ?? process.execArgv, withoutRoot = args[0] === '--import' && args[1] === preload ? args.slice(2) : args; if (options.eval)
            fail('Worker string-eval profile absent'); sealFile(target instanceof URL ? fileURLToPath(target) : resolve(target), invocation([String(target), ...withoutRoot], process.cwd(), options.env), true); super(target, { ...options, execArgv: ['--import', preload, ...withoutRoot] }); }
    };
    // This fixed host observer is enabled only by the actual Root producer grant.
    // The original write completes first; failed writes produce no output evidence.
    if (endpoint.interpretations?.includes('host-file-emission@1')) {
        const write = fs.writeFileSync, append = fs.appendFileSync, acknowledged = new Set(), pending = new Map();
        const sentCandidates=new Map<string,string>();
        candidateHandoff=()=>{const groups=new Map<string,{invocation:any;outputs:any[]}>();for(const row of pending.values()){const identity=JSON.stringify(row);if(sentCandidates.get(row.path)===identity)continue;const key=JSON.stringify(row.call),group=groups.get(key)??{invocation:row.call,outputs:[]};group.outputs.push({path:row.path,...(row.digest?{digest:row.digest}:{reason:row.reason})});groups.set(key,group)}return[...groups.values()]};
        candidateHanded=groups=>{for(const group of groups)for(const output of group.outputs){const row=pending.get(output.path);if(row&&JSON.stringify(row.call)===JSON.stringify(group.invocation)&&row.digest===output.digest&&row.reason===output.reason)sentCandidates.set(output.path,JSON.stringify(row))}};
        const limits=endpoint.limits;
        if(!limits||!['members','bytes','work','argvBytes','argvItems'].every(name=>Number.isSafeInteger(limits[name])&&limits[name]>=0))fail('producer selection limits absent');
        flushEmissions = (paths:readonly string[] = []) => {
            const required=[...new Set(paths)].flatMap(path=>{const row=pending.get(path);if(!row)return[];if(row.reason)fail('required emission unmeasured '+path+' '+row.reason);return[row]});
            const groups=new Map<string,any[]>();for(const row of required){const key=JSON.stringify(row.call),group=groups.get(key)??[];group.push(row);groups.set(key,group)}
            for(const rows of groups.values()){
                const outputs=rows.map(({path,digest}:any)=>({path,digest})),held=request({outputs,invocation:rows[0].call},'emission-batch');
                if(held.kind!=='producer-emission-batch/1'||held.parent!==parentExecution.identity||held.producer!==endpoint.identity||!Array.isArray(held.outputs)||held.outputs.length!==outputs.length)fail('emission batch provenance differs');
                for(let i=0;i<outputs.length;i++){if(held.outputs[i].path!==outputs[i].path||held.outputs[i].digest!==outputs[i].digest||!held.outputs[i].identity)fail('emission batch output differs');acknowledged.add(outputs[i].digest);pending.delete(outputs[i].path)}
            }
        };
        flushExecutable = (path:string,mode:'module'|'commonjs',source?:Uint8Array) => {
            if(!pending.size||(source&&executableDigests.has(sha(source))))return;
            const required=new Set<string>(),readPaths=new Set<string>(),derivedPaths=new Set<string>();let bytes=0,derivedBytes=0,work=0;
            const step=()=>{if(++work>limits.work)fail('emission selection work exhausted '+path)};
            const verify=(target:string)=>{step();const real=realpathSync(target),candidate=pending.get(real);if(candidate?.reason)fail('required emission unmeasured '+real+' '+candidate.reason);const raw=readBoundedFile(real,config.inputBytes,real),digest=sha(raw);if(!readPaths.has(real)){readPaths.add(real);bytes+=raw.length;if(bytes>config.inputBytes)fail('emission selection input bytes '+real);if(!known.has(real)&&!executableDigests.has(digest)&&!metadataDigests.has(digest)){derivedPaths.add(real);derivedBytes+=raw.length;if(derivedPaths.size>limits.members||derivedBytes>limits.bytes)fail('emission selection derived resources '+real)}}if(candidate){if(candidate.digest!==digest)fail('observed emission bytes differ '+real);required.add(real)}return{real,bytes:raw,digest}};
            const entry=source?{real:path,bytes:source,digest:sha(source)}:verify(path);
            // The hint stops at sealed executable content. Root's custodian
            // still independently verifies the complete selected closure.
            if(!executableDigests.has(entry.digest))traverseGeneratedClosure({source:entry.bytes,path:entry.real,mode,libs:new Map<string,string>(config.libraries.map((l:any)=>[l.name,l.manifest])),native:new Set<string>(config.builtins.map((n:string)=>n.startsWith('node:')?n:'node:'+n)),platform:config.platform,nativeImplementations:executableDigests,verify,step});
            flushEmissions([...required]);
        };
        const writtenDigest = (path: any) => { const fd = fs.openSync(path, 'r'); try {
            const stat = fs.fstatSync(fd), size = stat.size, limit = Math.min(config.inputBytes ?? parentExecution.responseBytes, parentExecution.responseBytes);
            if (!stat.isFile() || !Number.isSafeInteger(size) || size < 0 || size > limit)
                throw Error('emission bytes before hash '+path);
            const bytes = Buffer.alloc(size), tail = Buffer.alloc(1);
            let got = 0;
            while (got < size) {
                const n = fs.readSync(fd, bytes, got, size - got, got);
                if (!n)
                    break;
                got += n;
            }
            if (got !== size || fs.readSync(fd, tail, 0, 1, size) !== 0)
                throw Error('emission changed during bounded read '+path);
            return sha(bytes);
        }
        finally {
            fs.closeSync(fd);
        } };
        const observeWrite = (operation: typeof write | typeof append) => function (this:any,file: any, ...args: any) {
            const call = invocation([...process.execArgv, ...process.argv.slice(1)], process.cwd(), process.env);
            if(typeof file!=='string'&&!(file instanceof URL))fail('emission write route unsupported');
            const named=file instanceof URL?fileURLToPath(file):resolve(file);
            const result = Reflect.apply(operation, this, [file, ...args]);
            const actual=realpathSync(named);let digest:string|undefined,reason:string|undefined;
            try{digest=writtenDigest(actual)}catch(error){reason=error instanceof Error?error.message:String(error)}
            // Unstable operational data is an unmeasured candidate, never a
            // successful emission. Actual executable use must close it first.
            if(digest&&(executableDigests.has(digest)||acknowledged.has(digest))){pending.delete(actual);return result}
            pending.set(actual,{path:actual,digest,reason,call});
            if(Buffer.byteLength(JSON.stringify([...pending.values()].map(({path,digest,reason}:any)=>({path,digest,reason}))))>parentExecution.responseBytes)fail('pending emission provenance bytes');
            return result;
        };
        fs.writeFileSync = observeWrite(write);
        fs.appendFileSync = observeWrite(append);

    }
    syncBuiltinESMExports();
    // Exact libraries are already verified by Root. Node supplies resolution, then
    // the actual target is checked BEFORE it executes. Computed ordinary code is
    // still screened by the custodian's strict generated-code gate.
    if(typeof registerHooks!=='function')fail('runtime hooks absent');
    registerHooks!({ resolve(specifier: any, context: any, next: any) {
            if (red)
                throw Error(red);
            const builtin = specifier.startsWith('node:') ? specifier : 'node:' + specifier;
            if (builtinModules.includes(specifier) || specifier.startsWith('node:')) {
                if (!native.has(builtin))
                    fail('native ABI undeclared ' + specifier);
                return next(builtin, context);
            }
            let selected = context, programParent;
            if (context.parentURL?.startsWith('file:')&&context.parentURL!==evalParent?.url) {
                const parent = realpathSync(fileURLToPath(context.parentURL)), expected = known.get(parent);
                if (programs.some((p: any) => p.kind !== 'native-binary' && p.members.some((m: any) => m.path === parent))) {
                    if (!expected || sha(readBoundedFile(parent, config.inputBytes, parent)) !== expected)
                        fail('program parent bytes differ');
                    try {
                        programParent = selectNativeProgramParent(programs.filter((p: any) => p.kind !== 'native-binary'), { path: parent, digest: expected });
                    }
                    catch (error) {
                        fail(error instanceof Error?error.message:String(error));
                    }
                }
            }
            if (!programParent && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':')) {
                const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0], lib = library.get(name);
                if (!lib)
                    fail('library undeclared ' + name);
                selected = { ...context, parentURL: pathToFileURL(lib.manifest).href };
            }
            const got = next(specifier, selected);
            if (!got.url.startsWith('file:'))
                fail('module scheme undeclared ' + got.url);
            sealFile(fileURLToPath(got.url), invocation([...process.execArgv, ...process.argv.slice(1)], process.cwd(), process.env));
            return got;
        }, load(url: any, context: any, nextLoad: any) {
            if (!url.startsWith('file:'))
                return nextLoad(url, context);
            const actual = realpathSync(fileURLToPath(url));
            if (statSync(actual).size > (config.inputBytes ?? endpoint.responseBytes))
                fail('ambiguous input bytes before load');
            const call = invocation([...process.execArgv, ...process.argv.slice(1)], process.cwd(), process.env);
            // Seal controlling package interpretation before Node reads it. Its returned
            // default is deliberately ignored: only Node's actual load result supplies mode.
            const ambiguous=extname(actual)==='';if(ambiguous)modeOf(actual, call);
            const before = readBoundedFile(actual, config.inputBytes, actual), digest = sha(before), loaded = nextLoad(url, context);
            if (ambiguous&&!['module', 'commonjs'].includes(loaded.format))
                fail('ambiguous Node interpretation unsupported ' + loaded.format);
            if (loaded.source === null || loaded.source === undefined)
                fail('ambiguous Node source absent before execution');
            const source = typeof loaded.source === 'string' ? Buffer.from(loaded.source, 'utf8') : loaded.source instanceof ArrayBuffer ? Buffer.from(loaded.source) : Buffer.from(loaded.source.buffer, loaded.source.byteOffset, loaded.source.byteLength);
            if (sha(source) !== digest || sha(readBoundedFile(actual, config.inputBytes, actual)) !== digest)
                fail('ambiguous Node source differs before execution');
            const processEntry = process.argv[1] && realpathSync(resolve(process.argv[1])) === actual;
            sealFile(actual, call, Boolean(processEntry)&&ambiguous, ambiguous?loaded:undefined);
            return loaded;
        } });
    if (process.argv[1])
        sealFile(resolve(process.argv[1]), invocation([...process.execArgv, ...process.argv.slice(1)], process.cwd(), process.env), true);
    process.once('beforeExit', () => { if (red)
        throw Error(red); });
}
