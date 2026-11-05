//! Mutation sequencing over receiver-owned storage. Names are bundle members,
//! never native paths. A failed publish may already have renamed the bundle.
use serde::Deserialize;
use serde_json::{json,Value};
use std::collections::BTreeSet;
use super::object::{AlgebraPort as StoragePort,PortError};
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
pub struct Member{pub name:String,pub bytes:String}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
pub struct Request{pub profile:String,pub files:Vec<Member>}
pub fn member_error(files:&[Member])->Option<&'static str>{
 if files.is_empty()||files.len()>super::RECORDS{return Some("persistence/member-budget");}
 let mut names=BTreeSet::new();
 if files.iter().any(|m|m.name.is_empty()||m.name=="."||m.name==".."||m.name.contains(['\\','/','\0'])||!names.insert(&m.name)){Some("persistence/member")}else{None}
}
fn frame(status:&str,visibility:&str,phase:&str,code:Option<&str>,cleanup:Option<&str>,files:usize)->Vec<u8>{
 let mut out=serde_json::to_vec(&json!(["bound-persistence-result@1",{"status":status,"visibility":visibility,"phase":phase,"code":code,"cleanup":cleanup,"files":files}])).unwrap();out.push(b'\n');if out.len()>super::RESPONSE_BYTES{return frame("refused",visibility,phase,Some("fold/response-budget"),cleanup.map(|_|"persistence/cleanup-response-budget"),files);}out
}
fn invoke(port:&mut impl StoragePort,request:Value)->Result<(),PortError>{if port.call(request)?.is_null(){Ok(())}else{Err(PortError{code:"persistence/port-response".into()})}}
pub fn evaluate_persistence(input:&[u8],port:&mut impl StoragePort)->Vec<u8>{
 if input.len()>super::INPUT_BYTES{return frame("refused","not-published","input",Some("fold/input-budget"),None,0);}
 let r:Request=match serde_json::from_slice(input){Ok(r)=>r,Err(_)=>return frame("refused","not-published","input",Some("persistence/input"),None,0)};
 if r.profile!="bound-persistence-prepared@1"{return frame("refused","not-published","input",Some("persistence/profile"),None,0);}
 if let Some(code)=member_error(&r.files){return frame("refused","not-published","input",Some(code),None,0);}
 let capability=port.call(json!({"op":"preflight","members":r.files.iter().map(|m|&m.name).collect::<Vec<_>>()}));
 match capability{
  Ok(c)if c["fileFlush"]==true&&c["directoryFlush"]==true&&c["atomicPublish"]==true=>{},
  Ok(_)=>return frame("refused","not-published","preflight",Some("persistence/capability"),None,0),
  Err(e)=>return frame("refused","not-published","preflight",Some(&e.code),None,0),
 }
 let mut phase="prepare";let mut visibility="not-published";let mut written=0;
 let result=(||{
  invoke(port,json!({"op":"prepare"}))?;
  for(index,member)in r.files.iter().enumerate(){phase="write";invoke(port,json!({"op":"write","index":index,"name":member.name,"bytes":member.bytes}))?;written+=1;}
  phase="flush-stage";invoke(port,json!({"op":"flush-stage"}))?;
  phase="publish";visibility="unknown";invoke(port,json!({"op":"publish"}))?;visibility="durable";Ok::<(),PortError>(())
 })();
 // Cleanup is attempted after any mutation attempt, even prepare failure.
 // It may remove only this invocation's private staging handle, never committed.
 let cleanup=invoke(port,json!({"op":"cleanup"})).err().map(|e|e.code);
 match result{
  Err(e)=>frame("refused",visibility,phase,Some(&e.code),cleanup.as_deref(),written),
  Ok(())=>match cleanup{Some(code)=>frame("refused",visibility,"cleanup",Some(&code),Some(&code),written),None=>frame("durable",visibility,"complete",None,None,written)},
 }
}
#[cfg(all(target_arch="wasm32",feature="persistence-port"))]mod wasm_port{
 use super::*;
 #[link(wasm_import_module="bound_storage")]extern "C"{fn call(pointer:u32,length:u32)->u64;}
 struct ReceiverPort;impl StoragePort for ReceiverPort{fn call(&mut self,request:Value)->Result<Value,PortError>{super::super::byte_port::invoke(request,call)}}
 #[no_mangle]pub extern "C" fn persistence_eval(handle:u32,length:u32)->u64{super::super::abi::evaluate(handle,length,|input|evaluate_persistence(input,&mut ReceiverPort))}

}
#[cfg(test)]mod tests{
 use super::*;struct Never;impl StoragePort for Never{fn call(&mut self,_:Value)->Result<Value,PortError>{panic!("unexpected I/O")}}
 #[test]fn invalid_input_has_no_effects(){for input in [b"{}".as_slice(),br#"{"profile":"bound-persistence-prepared@1","files":[{"name":"../outside","bytes":"x"}]}"#]{let value:Value=serde_json::from_slice(&evaluate_persistence(input,&mut Never)).unwrap();assert_eq!(value[1]["visibility"],"not-published");}}
 #[test]fn input_budget_precedes_port(){let value:Value=serde_json::from_slice(&evaluate_persistence(&vec![0;65537],&mut Never)).unwrap();assert_eq!(value[1]["code"],"fold/input-budget");}
}
