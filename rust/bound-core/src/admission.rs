//! Bound's admission orchestration; Topos owns authority rules and the receiver
//! owns cryptographic verification. Neither keys nor policy come from a carrier.
use serde::Deserialize;
use serde_json::{json,Value};
use std::collections::BTreeMap;
use super::object::{AlgebraPort as AdmissionPort,PortError};
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
pub struct Record{pub fields:Option<BTreeMap<String,String>>,pub epoch:f64}
#[derive(Deserialize)]#[serde(deny_unknown_fields)]
pub struct Request{pub profile:String,pub operation:String,pub records:Vec<Record>,pub history:Vec<usize>,pub queries:Vec<usize>,pub place:String,pub family:String}
fn boolean(port:&mut impl AdmissionPort,request:Value)->Result<bool,PortError>{port.call(request)?.as_bool().ok_or_else(PortError::context)}
fn window_number(value:&Value)->Result<f64,PortError>{
 let text=value.as_str().ok_or_else(PortError::context)?;
 match text{"Infinity"=>Ok(f64::INFINITY),"-Infinity"=>Ok(f64::NEG_INFINITY),"NaN"=>Ok(f64::NAN),_=>text.parse::<f64>().map_err(|_|PortError::context())}
}
fn covered(r:&Request,index:usize,signer:&Value,port:&mut impl AdmissionPort)->Result<bool,PortError>{
 let Some(fields)=&r.records[index].fields else{return Ok(false)};
 let epoch=r.records[index].epoch;
 let window=port.call(json!({"op":"window","signer":signer,"epoch":epoch}))?;
 let start=window_number(&window["start"])?;
 let close=if window["close"].is_null(){None}else{Some(window_number(&window["close"])?)};
 if !(epoch>=start&&close.map(|end|epoch<=end).unwrap_or(true)){return Ok(false);}
 let coverage=signer["coverage"].as_array().ok_or_else(PortError::context)?;
 let scope=format!("{}/{}/{}",r.family,r.place,fields.get("scope").map(String::as_str).unwrap_or(""));
 for prefix in coverage{
  let prefix=prefix.as_str().ok_or_else(PortError::context)?;
  if prefix=="*"||boolean(port,json!({"op":"within","scope":scope,"prefix":prefix}))?{return Ok(true);}
 }Ok(false)
}
fn project(r:&Request,port:&mut impl AdmissionPort)->Result<String,PortError>{
 if r.operation=="verify"{let mut values=vec![];for index in &r.queries{values.push(boolean(port,json!({"op":"verify-root","index":index}))?);}return Ok(format!("[\"fact\",{}]\n",serde_json::to_string(&values).unwrap()));}
 // The selected Topos implementation performs its own fixed-point/quorum rules.
 // Its signature predicate uses only fresh exact-byte verification results.
 let selected=port.call(json!({"op":"select","history":r.history}))?;
 let raw=selected.as_str().ok_or_else(PortError::context)?;
 let lock:Value=serde_json::from_str(raw).map_err(|_|PortError::context())?;
 let admitted=lock["admitted"].as_array().ok_or_else(PortError::context)?;
 if lock.as_object().map(|o|o.len())!=Some(2)||!lock["potential"].is_array(){return Err(PortError::context());}
 if r.operation=="authority"{
  let mut verdicts=vec![];for index in &r.queries{
   let value=port.call(json!({"op":"verdict","index":index}))?;
   let raw=value.as_str().ok_or_else(PortError::context)?;
   let parsed:Value=serde_json::from_str(raw).map_err(|_|PortError::context())?;
   if !matches!(parsed["kind"].as_str(),Some("admitted"|"grey"|"refuse")){return Err(PortError::context());}
   verdicts.push(raw.to_owned());
  }
  return Ok(format!("[\"fact\",{{\"lock\":{},\"verdicts\":[{}]}}]\n",raw,verdicts.join(",")));
 }
 if !["own","covered"].contains(&r.operation.as_str()){return Err(PortError{code:"admission/operation".into()});}
 let mut answers=vec![];
 for index in &r.queries{
  let Some(fields)=&r.records[*index].fields else{answers.push(false);continue};
  let by=fields.get("by").map(String::as_str).unwrap_or("");
  let Some(signer)=admitted.iter().find(|s|s["id"].as_str()==Some(by))else{answers.push(false);continue};
  if r.operation=="own"&&(!fields.contains_key("sig")||!boolean(port,json!({"op":"verify","index":index,"key":signer["publicKey"]}))?){answers.push(false);continue;}
  answers.push(covered(r,*index,signer,port)?);
 }
 Ok(format!("[\"fact\",{}]\n",serde_json::to_string(&answers).unwrap()))
}
pub fn evaluate_admission(input:&[u8],port:&mut impl AdmissionPort)->Vec<u8>{
 if input.len()>super::INPUT_BYTES{return super::refusal("fold/input-budget");}
 let r:Request=match serde_json::from_slice(input){Ok(r)=>r,Err(_)=>return super::refusal("admission/prepared-input")};
 if r.profile!="bound-admission-prepared@1"{return super::refusal("admission/profile");}
 if r.records.len()>super::RECORDS||r.history.len()>super::RECORDS||r.queries.len()>super::RECORDS{return super::refusal("fold/record-budget");}
 if r.records.iter().any(|record|!record.epoch.is_finite())||r.history.iter().chain(&r.queries).any(|i|*i>=r.records.len()){return super::refusal("admission/prepared-input");}
 match project(&r,port){Ok(out)if out.len()<=super::RESPONSE_BYTES=>out.into_bytes(),Ok(_)=>super::refusal("fold/response-budget"),Err(e)=>super::refusal(&e.code)}
}
#[cfg(all(target_arch="wasm32",feature="admission-port"))]
mod wasm_port{
 use super::*;
 #[link(wasm_import_module="bound_admission")]extern "C"{fn call(pointer:u32,length:u32)->u64;}
 struct ReceiverPort;
 impl AdmissionPort for ReceiverPort{fn call(&mut self,request:Value)->Result<Value,PortError>{super::super::byte_port::invoke(request,call)}}
 #[no_mangle]pub extern "C" fn admission_eval(handle:u32,length:u32)->u64{super::super::abi::evaluate(handle,length,|input|evaluate_admission(input,&mut ReceiverPort))}

}
#[cfg(test)]mod tests{
 use super::*;struct NoPort;impl AdmissionPort for NoPort{fn call(&mut self,_:Value)->Result<Value,PortError>{panic!("unexpected host call")}}
 #[test]fn malformed_request_stops_before_port(){assert_eq!(evaluate_admission(b"{}",&mut NoPort),b"[\"refuse\",\"admission/prepared-input\"]\n");}
 #[test]fn oversized_request_stops_before_port(){assert_eq!(evaluate_admission(&vec![0;65537],&mut NoPort),b"[\"refuse\",\"fold/input-budget\"]\n");}
}
