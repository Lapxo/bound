#![deny(unsafe_op_in_unsafe_fn)]
//! Pure foldClaims projection. Lexical decoding belongs to the pinned Topos port.
//! Signatures are opaque envelopes here; this function grants no authority.
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
pub mod object;
pub mod admission;
pub mod persistence;
pub mod recovery;
mod byte_port;
#[cfg_attr(not(target_arch="wasm32"),allow(dead_code))]
mod abi;
pub mod views;
#[cfg(target_arch="wasm32")]
mod history_transport;

pub const INPUT_BYTES: usize = 65536;
pub const RECORDS: usize = 64;
pub const RESPONSE_BYTES: usize = 65536;
const ENVELOPE: [&str; 5] = ["sig", "expires", "repo", "by", "epoch"];

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Record {
    pub line: String,
    pub fields: BTreeMap<String, String>,
    pub is_config: bool,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipt { pub scope: String, pub moved: Vec<String> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    profile: String,
    records: Vec<Record>,
    #[serde(default)] receipts: Option<Vec<Receipt>>,
    #[serde(default)] placed: bool,
}
#[derive(Debug, Serialize, PartialEq)]
pub struct Fork {
    pub key: String,
    pub lines: Vec<String>,
    #[serde(skip_serializing_if="Option::is_none")] pub state: Option<String>,
}
#[derive(Debug, Serialize, PartialEq)]
pub struct Fold {
    pub standing: Vec<String>,
    pub superseded: Vec<String>,
    pub retracted: Vec<String>,
    pub forks: Vec<Fork>,
    pub vacuous: Vec<String>,
}
fn field<'a>(r: &'a Record, key: &str) -> &'a str {
    r.fields.get(key).map(String::as_str).unwrap_or("")
}
fn content(r: &Record, include_value: bool) -> String {
    let mut keys: Vec<_> = r.fields.keys().filter(|k|
        !ENVELOPE.contains(&k.as_str()) && (include_value || k.as_str() != "value")
    ).collect();
    // Native JS uses UTF-16 ordering here, not the wire canonicalizer's UTF-8 order.
    keys.sort_by(|a,b| a.encode_utf16().cmp(b.encode_utf16()));
    keys.into_iter().map(|k| format!("{}={}", k, r.fields[k])).collect::<Vec<_>>().join(" ")
}
fn key(r: &Record) -> String {
    format!("{} {} {}", field(r,"scope"), field(r,"role"), field(r,"measure"))
}
fn who(r: &Record) -> String { format!("{} {}",field(r,"by"),content(r,false)) }
fn retracts(w: &Record, r: &Record) -> bool {
    w.fields.iter().filter(|(k,_)| !ENVELOPE.contains(&k.as_str()) && k.as_str() != "value")
        .all(|(k,v)| r.fields.get(k) == Some(v))
}
fn unique(lines: impl IntoIterator<Item=String>) -> Vec<String> {
    let mut seen=BTreeSet::new();
    lines.into_iter().filter(|s| seen.insert(s.clone())).collect()
}

fn js_space(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}' |
        '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' |
        '\u{205f}' | '\u{3000}' | '\u{feff}')
}
fn radix_number(text: &str, radix: u32) -> Option<f64> {
    let digits: Vec<_> = text.chars().map(|c|c.to_digit(radix)).collect::<Option<_>>()?;
    if digits.is_empty() { return None; }
    let width=radix.trailing_zeros();
    let mut bits=Vec::new();
    for d in digits { for shift in (0..width).rev() { bits.push((d>>shift)&1); } }
    let first=bits.iter().position(|b|*b==1).unwrap_or(bits.len());
    let bits=&bits[first..];
    if bits.is_empty() { return Some(0.0); }
    if bits.len()>1024 { return Some(f64::INFINITY); }
    let n=bits.len().min(53);let mut head=0u64;
    for bit in &bits[..n] { head=(head<<1)|u64::from(*bit); }
    if bits.len()>53 && bits[53]==1 && (head&1==1 || bits[54..].contains(&1)) { head+=1; }
    Some((head as f64)*2f64.powi((bits.len()-n)as i32))
}
/// Exact Number(string)||0 behavior used by the native epoch comparison.
fn epoch(text: &str) -> f64 {
    let s=text.trim_matches(js_space);
    if s.is_empty() { return 0.0; }
    match s {"Infinity"|"+Infinity"=>return f64::INFINITY,"-Infinity"=>return f64::NEG_INFINITY,_=>{}}
    if s.starts_with("0x")||s.starts_with("0X") {return radix_number(&s[2..],16).unwrap_or(0.0);}
    if s.starts_with("0o")||s.starts_with("0O") {return radix_number(&s[2..],8).unwrap_or(0.0);}
    if s.starts_with("0b")||s.starts_with("0B") {return radix_number(&s[2..],2).unwrap_or(0.0);}
    let bytes=s.as_bytes();let mut i=usize::from(matches!(bytes[0],b'+'|b'-'));let mut digits=0;
    while i<bytes.len() && bytes[i].is_ascii_digit() {i+=1;digits+=1;}
    if i<bytes.len() && bytes[i]==b'.' {i+=1;while i<bytes.len()&&bytes[i].is_ascii_digit(){i+=1;digits+=1;}}
    if digits==0 {return 0.0;}
    if i<bytes.len() && matches!(bytes[i],b'e'|b'E') {
        i+=1;if i<bytes.len()&&matches!(bytes[i],b'+'|b'-'){i+=1;}
        let start=i;while i<bytes.len()&&bytes[i].is_ascii_digit(){i+=1;}
        if i==start{return 0.0;}
    }
    if i!=bytes.len(){return 0.0;}
    s.parse::<f64>().ok().filter(|n|!n.is_nan()).unwrap_or(0.0)
}

// Port of the selected Obligations field primitives; no filesystem/glob API.
fn coordinate(name: &str) -> Vec<&str> {
    let mut steps:Vec<_>=name.split('/').filter(|s|!s.is_empty()).collect();
    while matches!(steps.last(),Some(&"*")|Some(&"**")){steps.pop();}
    steps
}
fn within(inner: &[&str], outer: &[&str]) -> bool {
    // Iterative equivalent of the native prefix/globstar recursion: no stack growth.
    let close=|states:&mut Vec<bool>|{for j in 0..outer.len(){if states[j]&&outer[j]=="**"{states[j+1]=true;}}};
    let mut state=vec![false;outer.len()+1];state[0]=true;close(&mut state);
    if state[outer.len()]{return true;}
    for step in inner {
        let mut next=vec![false;outer.len()+1];
        for j in 0..outer.len(){if state[j]{
            if outer[j]=="**" {next[j]=true;}
            else if outer[j]=="*"||outer[j]==*step{next[j+1]=true;}
        }}
        close(&mut next);if next[outer.len()]{return true;}state=next;
    }
    state[outer.len()]
}
fn contracted(r: &Record, sides: &[&Record], receipts: &[Receipt]) -> bool {
    let named:Vec<_>=field(r,"needs").split('|').filter(|s|!s.is_empty()).map(coordinate).collect();
    if named.is_empty(){return false;}
    let others:Vec<_>=sides.iter().filter(|s|s.line!=r.line)
        .flat_map(|s|field(s,"needs").split('|').filter(|s|!s.is_empty()).map(coordinate)).collect();
    let mine:Vec<_>=named.iter().filter(|one|!others.iter().any(|other|
        other.len()==one.len()&&within(one,other))).collect();
    !mine.iter().any(|one|receipts.iter().filter(|p|p.scope==field(r,"scope"))
        .flat_map(|p|p.moved.iter()).any(|p|within(&coordinate(p),one)))
}

/// Complete native foldClaims semantics on lexically prepared UTF-8 records.
/// No memo, authority lookup, I/O, clocks, signatures or algebraic verdict is added.
pub fn fold(records: &[Record], receipts: Option<&[Receipt]>) -> Result<Fold,String> {
    let mut groups:Vec<(String,Vec<&Record>)>=Vec::new();let mut indices=BTreeMap::new();
    for r in records.iter().filter(|r|r.is_config){
        let k=key(r);let index=*indices.entry(k.clone()).or_insert_with(||{groups.push((k,Vec::new()));groups.len()-1});
        if !groups[index].1.iter().any(|old|old.line==r.line){groups[index].1.push(r);}
    }
    let mut result=Fold{standing:unique(records.iter().filter(|r|!r.is_config).map(|r|r.line.clone())),superseded:vec![],retracted:vec![],forks:vec![],vacuous:vec![]};
    let mut spent=Vec::new();
    for (key,group) in groups {
        let withdrawals:Vec<_>=group.iter().copied().filter(|r|field(r,"value")=="withdraw").collect();
        let mut kept=Vec::new();
        for r in group.iter().copied().filter(|r|field(r,"value")!="withdraw"){
            if withdrawals.iter().any(|w|retracts(w,r)){result.retracted.push(r.line.clone());}else{kept.push(r);}
        }
        if kept.is_empty(){
            let mut shown:Vec<(String,String)>=Vec::new();
            for w in &withdrawals {
                let content=content(w,false);
                if let Some(old)=shown.iter_mut().find(|(k,_)|k==&content){old.1=w.line.clone();}
                else{shown.push((content,w.line.clone()));}
            }
            let lines:Vec<_>=shown.into_iter().map(|(_,line)|line).collect();
            spent.extend(withdrawals.iter().filter(|w|!lines.contains(&w.line)).map(|w|w.line.clone()));
            result.standing.extend(lines);continue;
        }
        spent.extend(withdrawals.iter().map(|w|w.line.clone()));
        let mut latest:BTreeMap<String,f64>=BTreeMap::new();
        for r in &kept {let value=epoch(field(r,"epoch"));let max=latest.entry(who(r)).or_insert(0.0);*max=max.max(value);}
        let mut values=Vec::new();
        for r in kept {if epoch(field(r,"epoch"))<latest[&who(r)]{spent.push(r.line.clone());}else{values.push(r);}}
        let mut sayings:BTreeMap<String,BTreeSet<String>>=BTreeMap::new();
        for r in &values {
            let set=sayings.entry(who(r)).or_default();set.insert(content(r,true));
            if set.len()>1{return Err(format!("REFUSE·document {} · {} has two live inscriptions without withdrawal",key,field(r,"by")));}
        }
        for r in &values {
            if receipts.is_some_and(|rs|values.len()>1&&contracted(r,&values,rs)){result.vacuous.push(r.line.clone());}
            else{result.standing.push(r.line.clone());}
        }
    }
    let accounted:BTreeSet<_>=result.standing.iter().chain(&result.retracted).chain(&spent).chain(&result.vacuous).collect();
    let mut superseded=spent.clone();superseded.extend(records.iter().filter(|r|!accounted.contains(&r.line)).map(|r|r.line.clone()));
    result.superseded=unique(superseded);Ok(result)
}

fn refusal(code: &str)->Vec<u8>{let mut out=serde_json::to_vec(&("refuse",code)).unwrap();out.push(b'\n');out}
pub fn evaluate(bytes: &[u8]) -> Vec<u8> {
    evaluate_fold(bytes, RESPONSE_BYTES, Some(RECORDS))
}
fn evaluate_fold(bytes: &[u8], output_limit:usize, record_limit:Option<usize>) -> Vec<u8> {
    if record_limit.is_some() && bytes.len()>INPUT_BYTES{return refusal("fold/input-budget");}
    let Ok(request)=serde_json::from_slice::<Request>(bytes)else{return refusal("fold/prepared-input");};
    if request.profile!="bound-fold-prepared@1"{return refusal("fold/profile");}
    if record_limit.is_some_and(|limit|request.records.len()>limit){return refusal("fold/record-budget");}
    let _=request.placed; // Native foldClaims deliberately ignores this parameter.
    let mut out=match fold(&request.records,request.receipts.as_deref()){
        Ok(result)=>serde_json::to_vec(&("fact",result)).unwrap(),
        Err(_)=>return refusal("host-port/failed"),
    };
    out.push(b'\n');if out.len()>output_limit{return refusal("fold/response-budget");}out
}
#[cfg(target_arch="wasm32")]#[no_mangle]
pub extern "C" fn fold_abi_version()->u32{2}
#[cfg(target_arch="wasm32")]#[no_mangle]
pub extern "C" fn fold_alloc(len:u32)->u32{abi::allocate(len)}
#[cfg(target_arch="wasm32")]#[no_mangle]
pub extern "C" fn fold_length(handle:u32)->u32{abi::length(handle)}
#[cfg(target_arch="wasm32")]#[no_mangle]
pub extern "C" fn fold_pointer(handle:u32)->u32{abi::pointer(handle)as u32}
#[cfg(target_arch="wasm32")]#[no_mangle]
pub extern "C" fn fold_free(handle:u32,len:u32)->u32{abi::free(handle,len)}
#[cfg(target_arch="wasm32")]#[no_mangle]
pub extern "C" fn fold_eval(handle:u32,len:u32)->u64{abi::evaluate(handle,len,evaluate)}

#[cfg(test)]
mod tests {
    use super::*;
    fn row(by:&str,value:&str,epoch:&str)->Record{Record{line:format!("{by}:{value}:{epoch}"),fields:[("scope","s"),("role","writes"),("measure","id"),("form","alphabet"),("at","origin:a"),("by",by),("value",value),("epoch",epoch)].map(|(k,v)|(k.to_owned(),v.to_owned())).into(),is_config:true}}
    #[test] fn revisions(){let a=row("a","old","1");let b=row("a","new","2");let f=fold(&[a.clone(),b.clone()],None).unwrap();assert_eq!(f.standing,vec![b.line]);assert_eq!(f.superseded,vec![a.line]);}
    #[test] fn conflict(){assert_eq!(fold(&[row("a","x","1"),row("a","y","1")],None).unwrap_err(),"REFUSE·document s writes id · a has two live inscriptions without withdrawal");}
    #[test] fn different_origins(){assert_eq!(fold(&[row("a","x","1"),row("b","y","1")],None).unwrap().standing.len(),2);}
    #[test] fn withdrawal(){let a=row("a","x","1");let w=row("b","withdraw","2");let f=fold(&[a.clone(),w.clone()],None).unwrap();assert_eq!(f.retracted,vec![a.line]);assert_eq!(f.standing,vec![w.line]);}
    #[test] fn globstar(){assert!(within(&coordinate("a/x/y/z"),&coordinate("a/**/z")));assert!(within(&coordinate("a/z"),&coordinate("a/**/z")));assert!(!within(&coordinate("a/x"),&coordinate("a/**/z")));}
    #[test] fn number_compatibility(){for(s,n)in[("0xff",255.),("0b11",3.),("0o10",8.),(".5e2",50.),("NaN",0.),("inf",0.),("+0x1",0.),("\u{feff}2\u{a0}",2.)]{assert_eq!(epoch(s),n,"{s}");}}
    #[test] fn radix_rounding(){assert_eq!(epoch("0x20000000000001"),9007199254740992.);assert_eq!(epoch("0x20000000000003"),9007199254740996.);}
    #[test] fn unknown_profile(){assert_eq!(evaluate(br#"{"profile":"other","records":[]}"#),b"[\"refuse\",\"fold/profile\"]\n");}
    #[test] fn extra_fields(){assert_eq!(evaluate(br#"{"profile":"bound-fold-prepared@1","records":[],"owner":"no"}"#),b"[\"refuse\",\"fold/prepared-input\"]\n");}
    #[test] fn input_budget(){assert_eq!(evaluate(&vec![b'x';INPUT_BYTES+1]),b"[\"refuse\",\"fold/input-budget\"]\n");}
    #[test] fn record_budget(){let records=vec![row("a","x","1");RECORDS+1];let fields:Vec<_>=records.iter().map(|r|serde_json::json!({"line":r.line,"fields":r.fields,"is_config":r.is_config})).collect();let input=serde_json::json!({"profile":"bound-fold-prepared@1","records":fields});assert_eq!(evaluate(&serde_json::to_vec(&input).unwrap()),b"[\"refuse\",\"fold/record-budget\"]\n");}
}
