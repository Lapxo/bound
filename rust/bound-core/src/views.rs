//! Pure view selection. Wire word and numeric spelling come from the selected
//! lexical host codec, not a filesystem or a second implementation of Number.
use serde::Deserialize;
use std::collections::BTreeMap;
#[derive(Clone,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Record{pub fields:BTreeMap<String,String>}
fn field<'a>(r:&'a Record,key:&str)->&'a str{r.fields.get(key).map(String::as_str).unwrap_or("")}
#[derive(Clone,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Asked{pub name:String,pub at:String,#[serde(default)]pub called:bool}
#[derive(Clone,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct View{pub name:String,pub regions:Vec<Asked>,pub shape:String}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request{
 pub profile:String,pub operation:String,pub standing:Vec<Record>,pub own:Vec<Record>,
 pub family:Option<String>,pub family_error:Option<String>,pub numbers:BTreeMap<String,String>,pub tree:Vec<(String,View)>,
 pub world_names:Vec<String>,pub present_shapes:Vec<String>,pub place:String,pub view:Option<View>,
}
fn words(records:&[Record],list:&str)->Vec<String>{
 let at=format!("wire/{list}");let old=format!("audit/wire/{list}");
 records.iter().find(|r|field(r,"scope")==at&&field(r,"value")!="withdraw")
 .or_else(||records.iter().find(|r|field(r,"scope")==old&&field(r,"value")!="withdraw"))
 .map(|r|field(r,"value").split('|').filter(|s|!s.is_empty()).map(str::to_owned).collect()).unwrap_or_default()
}
fn family(r:&Request)->Result<&str,String>{r.family.as_deref().ok_or_else(||r.family_error.clone().unwrap_or_else(||"host-port/failed".into()))}
fn views(r:&Request)->Result<Vec<View>,String>{
 let held=words(&r.standing,"families");let prefix=format!("{}/",if held.is_empty()||held.iter().any(|s|s=="view"){"view"}else{family(r)?});
 let mut out:Vec<View>=vec![];
 for record in &r.standing{
  let scope=field(record,"scope");let value=field(record,"value");
  if !scope.starts_with(&prefix)||field(record,"role")!="demands"||value=="withdraw"{continue;}
  let name=&scope[prefix.len()..];if out.iter().any(|v|v.name==name){continue;}
  let mut regions=vec![];
  for token in value.split('|').filter(|s|!s.is_empty()){
   let mut pieces=token.split('@');let name=pieces.next().unwrap_or("").to_owned();
   let at=match pieces.next(){None=>"3".into(),Some(text)=>r.numbers.get(text).cloned().ok_or("views/prepared-number")?};
   regions.push(Asked{name,at,called:token.ends_with("@*")});
  }
  out.push(View{name:name.into(),regions,shape:field(record,"shape").into()});
 }
 Ok(out)
}
fn shared(r:&Request)->Vec<String>{
 let mut named:Vec<(String,Vec<String>)>=vec![];
 for record in &r.standing{
  let scope=field(record,"scope");let shape=field(record,"shape");
  if !scope.starts_with("view/")||field(record,"role")!="demands"||field(record,"value")=="withdraw"||shape.is_empty(){continue;}
  if let Some((_,names))=named.iter_mut().find(|(s,_)|s==shape){if !names.iter().any(|n|n==&scope[5..]){names.push(scope[5..].into());}}
  else{named.push((shape.into(),vec![scope[5..].into()]));}
 }
 named.into_iter().filter(|(_,n)|n.len()>1).map(|(s,n)|format!("{} · view/{}",s,n.join(" · view/"))).collect()
}
fn places(r:&Request,v:&View)->Result<Vec<String>,String>{
 let scope=format!("{}/{}",family(r)?,v.name);
 let selected:Vec<_>=r.standing.iter().filter(|one|field(one,"scope")==scope&&field(one,"value")!="withdraw").collect();
 let value=selected.first().map(|one|field(one,"value")).unwrap_or("");let mut out=vec![];
 if !v.shape.is_empty(){for one in selected.iter().filter(|one|field(one,"value")==value&&field(one,"shape")==v.shape){
  for need in field(one,"needs").split('|'){
   if need==v.shape||need.ends_with(&format!("/{}",v.shape)){
    let place=need[..need.len()-v.shape.len()].to_owned();if !out.contains(&place){out.push(place);}
   }
  }
 }}Ok(out)
}
fn defaulted(r:&Request,v:&View)->Result<bool,String>{
 let prefix=format!("{}/",family(r)?);
 let writes=!v.shape.is_empty()&&r.own.iter().any(|one|field(one,"scope").starts_with(&prefix)&&field(one,"shape")==v.shape&&field(one,"value")!="withdraw");
 let owns=r.own.iter().any(|one|field(one,"scope")==format!("{}{}",prefix,v.name)&&field(one,"value")!="withdraw");
 // Map construction keeps the last value for a repeated tree key.
 let shape=r.tree.iter().rev().find(|(name,_)|name==&v.name).map(|(_,one)|&one.shape);
 Ok(!writes&&words(&r.standing,"views/world").contains(&v.name)&&shape==Some(&v.shape)&&!owns)
}
fn quote(s:&str)->String{serde_json::to_string(s).unwrap()}
fn view_json(v:&View)->Result<String,String>{
 let mut regions=vec![];
 for region in &v.regions{
  let parsed:serde_json::Number=serde_json::from_str(&region.at).map_err(|_|"views/prepared-number")?;
  if !parsed.as_f64().map(|n|n.is_finite()).unwrap_or(false){return Err("views/prepared-number".into());}
  regions.push(format!("{{\"name\":{},\"at\":{}{}}}",quote(&region.name),region.at,if region.called{",\"called\":true"}else{""}));
 }
 Ok(format!("{{\"name\":{},\"regions\":[{}],\"shape\":{}}}",quote(&v.name),regions.join(","),quote(&v.shape)))
}
pub fn evaluate_views(bytes:&[u8])->Vec<u8>{
 if bytes.len()>super::INPUT_BYTES{return super::refusal("fold/input-budget");}
 let r:Request=match serde_json::from_slice(bytes){Ok(r)=>r,Err(_)=>return super::refusal("views/prepared-input")};
 if r.profile!="bound-views-prepared@1"{return super::refusal("views/profile");}
 if r.standing.len()+r.own.len()>super::RECORDS{return super::refusal("fold/record-budget");}
 let output=project(&r);match output{Ok(out)if out.len()<=super::RESPONSE_BYTES=>out.into_bytes(),Ok(_)=>super::refusal("fold/response-budget"),Err(code)=>super::refusal(&code)}
}
fn project(r:&Request)->Result<String,String>{
 let value=match r.operation.as_str(){
  "views"=>{let list=views(r)?;format!("[{}]",list.iter().map(|v|Ok(format!("[{},{}]",quote(&v.name),view_json(v)?))).collect::<Result<Vec<_>,String>>()?.join(","))},
  "shared"=>serde_json::to_string(&shared(r)).unwrap(),
  "places"=>serde_json::to_string(&places(r,r.view.as_ref().ok_or("views/input")?)?).unwrap(),
  "defaulted"=>defaulted(r,r.view.as_ref().ok_or("views/input")?)?.to_string(),
  "materialized"=>{
   let mine:Vec<_>=views(r)?.into_iter().filter(|v|!v.shape.is_empty()).collect();let mut selected=vec![];
   for v in &mine{
    let named=places(r,v)?;
    let mut keep=named.contains(&r.place);
    if !keep&&!r.own.is_empty(){keep=defaulted(r,v)?;}
    if !keep&&!r.world_names.contains(&v.name)&&named.is_empty()&&r.present_shapes.contains(&v.shape){
     let mut shadowed=false;for other in &mine{if other.shape==v.shape&&places(r,other)?.contains(&r.place){shadowed=true;break;}}
     keep=!shadowed;
    }
    if keep{selected.push(view_json(v)?);}
   }format!("[{}]",selected.join(","))
  },_=>return Err("views/operation".into()),
 };Ok(format!("[\"fact\",{}]\n",value))
}
#[cfg(target_arch="wasm32")]
#[no_mangle]
pub extern "C" fn views_eval(handle:u32,length:u32)->u64{super::abi::evaluate(handle,length,evaluate_views)}

#[cfg(test)]mod tests{
 use super::*;
 #[test]fn request_budget(){assert_eq!(evaluate_views(&vec![0;65537]),b"[\"refuse\",\"fold/input-budget\"]\n");}
 #[test]fn malformed_request(){assert_eq!(evaluate_views(b"{}"),b"[\"refuse\",\"views/prepared-input\"]\n");}
 #[test]fn number_text_cannot_inject_output(){let v=View{name:"safe".into(),regions:vec![Asked{name:"r".into(),at:"1],false".into(),called:false}],shape:"".into()};assert!(view_json(&v).is_err());}
}
