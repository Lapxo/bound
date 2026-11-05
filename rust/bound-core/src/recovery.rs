//! Recovery is reconciliation of exact selected bytes, never authority admission.
use serde_json::{json,Value};
use super::{persistence::{Request,member_error,evaluate_persistence},object::AlgebraPort};
fn frame(visibility:&str,phase:&str,code:Option<&str>,files:usize)->Vec<u8>{
 let mut v=serde_json::to_vec(&json!(["bound-persistence-recovery-result@1",{"status":if code.is_none(){"durable"}else{"refused"},"visibility":visibility,"phase":phase,"code":code,"cleanup":null,"files":files,"route":"existing"}])).unwrap();v.push(b'\n');
 if v.len()>super::RESPONSE_BYTES{return frame(visibility,phase,Some("fold/response-budget"),files);}v
}
pub fn evaluate_recovery(input:&[u8],port:&mut impl AlgebraPort)->Vec<u8>{
 if input.len()>super::INPUT_BYTES{return frame("unknown","input",Some("fold/input-budget"),0);}
 let r:Request=match serde_json::from_slice(input){Ok(r)=>r,Err(_)=>return frame("unknown","input",Some("persistence/input"),0)};
 if r.profile!="bound-persistence-recovery-prepared@1"{return frame("unknown","input",Some("persistence/profile"),0);}
 if let Some(code)=member_error(&r.files){return frame("unknown","input",Some(code),0);}
 let files:Vec<Value>=r.files.iter().map(|m|json!({"name":m.name,"bytes":m.bytes})).collect();
 match port.call(json!({"op":"inspect","files":files})){
  Ok(state)if state=="absent"=>{
   let prepared=serde_json::to_vec(&json!({"profile":"bound-persistence-prepared@1","files":files})).unwrap();
   let output=evaluate_persistence(&prepared,port);let mut result:Value=serde_json::from_slice(&output).unwrap();
   result[0]=json!("bound-persistence-recovery-result@1");result[1]["route"]=json!("created");let mut out=serde_json::to_vec(&result).unwrap();out.push(b'\n');if out.len()>super::RESPONSE_BYTES{result[1]["code"]=json!("fold/response-budget");result[1]["status"]=json!("refused");result[1]["cleanup"]=if result[1]["cleanup"].is_null(){Value::Null}else{json!("persistence/cleanup-response-budget")};let mut small=serde_json::to_vec(&result).unwrap();small.push(b'\n');return small;}out
  },
  Ok(state)if state=="matching"=>match port.call(json!({"op":"reconfirm","files":files})){
   Ok(v)if v.is_null()=>frame("durable","complete",None,r.files.len()),
   Ok(_)=>frame("unknown","reconfirm",Some("persistence/port-response"),0),
   Err(e)=>frame("unknown","reconfirm",Some(&e.code),0),
  },
  Ok(state)if state=="conflict"=>frame("unknown","inspect",Some("persistence/conflict"),0),
  Ok(_)=>frame("unknown","inspect",Some("persistence/port-response"),0),
  Err(e)=>frame("unknown","inspect",Some(&e.code),0),
 }
}
#[cfg(all(target_arch="wasm32",feature="persistence-port"))]mod wasm_port{
 use super::*;use super::super::object::PortError;
 #[link(wasm_import_module="bound_storage")]extern "C"{fn call(pointer:u32,length:u32)->u64;}
 struct ReceiverPort;impl AlgebraPort for ReceiverPort{fn call(&mut self,request:Value)->Result<Value,PortError>{super::super::byte_port::invoke(request,call)}}
 #[no_mangle]pub extern "C" fn persistence_recover(handle:u32,length:u32)->u64{super::super::abi::evaluate(handle,length,|input|evaluate_recovery(input,&mut ReceiverPort))}

}
#[cfg(test)]mod tests{
 use super::*;use super::super::object::PortError;
 struct Never;impl AlgebraPort for Never{fn call(&mut self,_:Value)->Result<Value,PortError>{panic!("unexpected port")}}
 #[test]fn invalid_members_precede_inspection(){let out=evaluate_recovery(br#"{"profile":"bound-persistence-recovery-prepared@1","files":[{"name":"../x","bytes":"x"}]}"#,&mut Never);let v:Value=serde_json::from_slice(&out).unwrap();assert_eq!(v[1]["code"],"persistence/member");assert_eq!(v[1]["visibility"],"unknown");}
}
