// Pure host namespace validation; no filesystem, clock, environment or authority.
const fail=code=>{throw Object.assign(Error(code),{code})};
export function createMemberNamespace(platform){
 if(typeof platform!=='string'||!platform)fail('persistence/namespace-selection');
 return Object.freeze({check(names){
  if(!Array.isArray(names)||!names.length||names.length>64)fail('persistence/member');
  const exact=new Set();for(const name of names){if(typeof name!=='string'||!name||name==='.'||name==='..'||/[\\/\0]/.test(name)||exact.has(name))fail('persistence/member');exact.add(name)}
  // Same fixed Windows rules as the earlier adapter, now shared by every path.
  if(platform==='win32'){const seen=new Set();for(const name of names){if(/[<>:\x00-\x1f"|?*]/.test(name)||/[. ]$/.test(name)||/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(name)||seen.has(name.toUpperCase()))fail('persistence/namespace');seen.add(name.toUpperCase())}}
 }});
}
