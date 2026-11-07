//! Dispatch of already context-validated typed records. All form/field algebra
//! stays in the receiver-selected port. Neither spans nor lattice operations
//! are reimplemented here; handles belong to one evaluation only.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ObjectRecord { pub record: String, pub fields: BTreeMap<String,String> }
#[derive(Debug)]
pub struct PortError { pub code: String }
impl PortError {pub fn context()->Self{Self{code:"engine/context".into()}}}
pub trait AlgebraPort {fn call(&mut self,request:Value)->Result<Value,PortError>;}
fn field<'a>(r:&'a ObjectRecord,key:&str)->Result<&'a str,PortError>{r.fields.get(key).map(String::as_str).ok_or_else(PortError::context)}
fn handle(v:Value)->Result<u32,PortError>{v.as_u64().and_then(|n|u32::try_from(n).ok()).filter(|n|*n>0).ok_or_else(PortError::context)}
type World=Vec<(String,u32)>;
fn put(world:&mut World,name:&str,value:u32){if let Some((_,old))=world.iter_mut().find(|(n,_)|n==name){*old=value;}else{world.push((name.into(),value));}}

pub fn object_fold(records:&[ObjectRecord],port:&mut impl AlgebraPort)->Result<String,PortError>{
    let mut world:World=vec![];
    let mut definitions:Vec<(&str,&ObjectRecord)>=vec![];
    for record in records.iter().filter(|r|r.record=="cell"){
        let scope=field(record,"scope")?;
        if let Some((_,old))=definitions.iter_mut().find(|(name,_)|*name==scope){*old=record;}
        else{definitions.push((scope,record));}
    }
    let mut codecs=BTreeMap::new();
    for(name,record)in definitions{codecs.insert(name,handle(port.call(json!({"op":"resolve","record":record}))?)?);}
    let mut ids=BTreeMap::new();for record in records{ids.insert(field(record,"id")?,record);}
    let mut ordered:Vec<_>=records.iter().collect();
    ordered.sort_by(|a,b|super::epoch(a.fields.get("epoch").map(String::as_str).unwrap_or(""))
        .partial_cmp(&super::epoch(b.fields.get("epoch").map(String::as_str).unwrap_or(""))).unwrap_or(std::cmp::Ordering::Equal));
    for record in ordered{
        let scope=field(record,"scope")?;let at=super::epoch(field(record,"epoch")?);
        if !at.is_finite(){return Err(PortError::context());}
        if record.record=="cell"{
            let cell=handle(port.call(json!({"op":"cell","name":scope,"at":at,"restsOn":field(record,"restsOn")?}))?)?;
            put(&mut world,scope,cell);continue;
        }
        let codec=*codecs.get(scope).ok_or_else(PortError::context)?;
        let held=world.iter().find(|(name,_)|name==scope).map(|(_,h)|*h).ok_or_else(PortError::context)?;
        let negative=record.fields.get("sign").map(String::as_str)==Some("-1");
        let id=field(record,"id")?;
        let target=if negative{*ids.get(field(record,"takes")?).ok_or_else(PortError::context)?}else{record};
        if record.record=="claim"{
            let cell=handle(port.call(json!({"op":"observe","codec":codec,"held":held,"id":id,"at":at,
                "origin":field(target,"origin")?,"value":field(target,"value")?,
                "takes":record.fields.get("takes"),"sign":if negative{-1}else{1}}))?)?;
            put(&mut world,scope,cell);
        }else if negative{
            let cell=handle(port.call(json!({"op":"negative-mark","codec":codec,"held":held,"id":id,"at":at,
                "takes":field(record,"takes")?,"pole":field(target,"pole")?,"value":field(target,"value")?}))?)?;
            put(&mut world,scope,cell);
        }else if let Some(witness)=record.fields.get("widens"){
            let cell=handle(port.call(json!({"op":"join","codec":codec,"held":held,"id":id,"at":at,
                "witness":witness,"value":field(record,"value")?}))?)?;
            put(&mut world,scope,cell);
        }else{
            let response=port.call(json!({"op":if field(record,"pole")?=="floor"{"require"}else{"sign"},
                "codec":codec,"world":world,"name":scope,"id":id,"at":at,"value":field(record,"value")?}))?;
            let next:World=serde_json::from_value(response).map_err(|_|PortError::context())?;
            if next.iter().any(|(_,h)|*h==0){return Err(PortError::context());}world=next;
        }
    }
    let mut readings=Vec::new();
    for(name,held)in &world{
        let codec=*codecs.get(name.as_str()).ok_or_else(PortError::context)?;
        let response=port.call(json!({"op":"read","codec":codec,"held":held,"name":name,"world":world}))?;
        let raw=response.as_str().ok_or_else(PortError::context)?;
        let reading:Value=serde_json::from_str(raw).map_err(|_|PortError::context())?;
        let object=reading.as_object().ok_or_else(PortError::context)?;
        let keys=["cell","state","parts","rest","ownMarks","ownClaims","marks","claims"];
        if object.len()!=keys.len()||keys.iter().any(|k|!object.contains_key(*k))||object["cell"].as_str()!=Some(name){return Err(PortError::context());}
        readings.push(raw.to_owned());
    }
    Ok(format!("[\"fact\",[{}]]\n",readings.join(",")))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ObjectRequest {pub profile:String,pub records:Vec<ObjectRecord>}
pub fn evaluate_object(bytes:&[u8],port:&mut impl AlgebraPort)->Vec<u8>{
    if bytes.len()>super::INPUT_BYTES{return super::refusal("fold/input-budget");}
    let request=match serde_json::from_slice::<ObjectRequest>(bytes){Ok(v)=>v,Err(_)=>return super::refusal("engine/context")};
    if request.profile!="bound-object-prepared@1"{return super::refusal("engine/input");}
    if request.records.len()>super::RECORDS{return super::refusal("fold/record-budget");}
    match object_fold(&request.records,port){
        Ok(output)if output.len()<=super::RESPONSE_BYTES=>output.into_bytes(),
        Ok(_)=>super::refusal("fold/response-budget"),
        Err(e)=>super::refusal(&e.code),
    }
}

#[cfg(all(target_arch="wasm32",feature="object-port"))]
mod wasm_port{
    use super::*;
    #[link(wasm_import_module="bound_algebra")]
    extern "C"{fn call(pointer:u32,length:u32)->u64;}
    struct ReceiverPort;
    impl AlgebraPort for ReceiverPort{
        fn call(&mut self,request:Value)->Result<Value,PortError>{
            super::super::byte_port::invoke(request,call)
        }
    }
    #[no_mangle]
    pub extern "C" fn object_eval(handle:u32,length:u32)->u64{super::super::abi::evaluate(handle,length,|input|evaluate_object(input,&mut ReceiverPort))}

}

#[cfg(test)]
mod tests{
 use super::*;
 struct Reject{calls:usize}
 impl AlgebraPort for Reject{fn call(&mut self,_:Value)->Result<Value,PortError>{self.calls+=1;Err(PortError{code:"test/selected-port-refused".into()})}}
 #[test]fn empty_world_needs_no_algebra(){let mut p=Reject{calls:0};assert_eq!(evaluate_object(br#"{"profile":"bound-object-prepared@1","records":[]}"#,&mut p),b"[\"fact\",[]]\n");assert_eq!(p.calls,0);}
 #[test]fn oversized_input_never_calls_port(){let mut p=Reject{calls:0};assert_eq!(evaluate_object(&vec![b' ';65537],&mut p),b"[\"refuse\",\"fold/input-budget\"]\n");assert_eq!(p.calls,0);}
 #[test]fn malformed_input_never_calls_port(){let mut p=Reject{calls:0};for input in ["{}","null","{\"profile\":\"other\",\"records\":[]}"]{assert!(String::from_utf8(evaluate_object(input.as_bytes(),&mut p)).unwrap().starts_with("[\"refuse\""));}assert_eq!(p.calls,0);}
 #[test]fn selected_port_refusal_is_not_a_fact(){let mut p=Reject{calls:0};let r=ObjectRecord{record:"cell".into(),fields:BTreeMap::from([("scope".into(),"A".into())])};assert_eq!(object_fold(&[r],&mut p).unwrap_err().code,"test/selected-port-refused");assert_eq!(p.calls,1);}
 #[test]fn invalid_codec_handle_refused(){struct Zero;impl AlgebraPort for Zero{fn call(&mut self,_:Value)->Result<Value,PortError>{Ok(json!(0))}}let r=ObjectRecord{record:"cell".into(),fields:BTreeMap::from([("scope".into(),"A".into())])};assert!(object_fold(&[r],&mut Zero).is_err());}
}
