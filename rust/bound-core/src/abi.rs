//! Development ABI v2: monotonic opaque handles, never caller-owned pointers.
//! Linear memory is still visible to the trusted host; not isolation from it.
use std::{cell::RefCell,collections::BTreeMap};
const MAX_LIVE:usize=8;
struct Buffers{next:u32,values:BTreeMap<u32,Box<[u8]>>}
thread_local!{static BUFFERS:RefCell<Buffers>=const{RefCell::new(Buffers{next:1,values:BTreeMap::new()})};}
pub fn insert(bytes:Vec<u8>)->u32{
 if bytes.is_empty()||bytes.len()>super::RESPONSE_BYTES{return 0;}
 BUFFERS.with(|cell|{let mut b=cell.borrow_mut();if b.values.len()>=MAX_LIVE||b.next==u32::MAX{return 0;}let handle=b.next;b.next+=1;b.values.insert(handle,bytes.into_boxed_slice());handle})
}
pub fn allocate(length:u32)->u32{if length==0||length as usize>super::INPUT_BYTES{0}else{insert(vec![0;length as usize])}}
pub fn length(handle:u32)->u32{BUFFERS.with(|b|b.borrow().values.get(&handle).map(|v|v.len()as u32).unwrap_or(0))}
pub fn pointer(handle:u32)->usize{BUFFERS.with(|b|b.borrow().values.get(&handle).map(|v|v.as_ptr()as usize).unwrap_or(0))}
pub fn read(handle:u32,length:u32)->Option<Vec<u8>>{BUFFERS.with(|b|b.borrow().values.get(&handle).filter(|v|v.len()==length as usize).map(|v|v.to_vec()))}
pub fn take(handle:u32,length:u32)->Option<Box<[u8]>>{BUFFERS.with(|b|{let mut b=b.borrow_mut();if b.values.get(&handle).is_some_and(|v|v.len()==length as usize){b.values.remove(&handle)}else{None}})}
pub fn free(handle:u32,length:u32)->u32{u32::from(take(handle,length).is_some())}
pub fn evaluate(handle:u32,length:u32,body:impl FnOnce(&[u8])->Vec<u8>)->u64{
 let out=match read(handle,length){Some(bytes)=>body(&bytes),None=>super::refusal("fold/abi-buffer")};let n=out.len()as u64;let h=insert(out);if h==0{0}else{(u64::from(h)<<32)|n}
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn ownership_length_and_generation(){let a=allocate(8);assert_ne!(a,0);assert_eq!(free(a,7),0);assert!(read(a,8).is_some());assert_eq!(free(a,8),1);assert_eq!(free(a,8),0);let b=allocate(8);assert_ne!(a,b);assert_eq!(free(a,8),0);assert!(read(b,8).is_some());assert_eq!(free(b,8),1);}
 #[test]fn unknown_handles_never_enter_core(){let packed=evaluate(0,8,|_|panic!("unexpected evaluation"));let h=(packed>>32)as u32;let n=packed as u32;assert_eq!(&*take(h,n).unwrap(),b"[\"refuse\",\"fold/abi-buffer\"]\n");}
 #[test]fn bounded_registry_and_no_wrap(){assert_eq!(allocate(0),0);assert_eq!(allocate(65537),0);let handles:Vec<_>=(0..MAX_LIVE).map(|_|allocate(1)).collect();assert!(handles.iter().all(|v|*v!=0));assert_eq!(allocate(1),0);for h in handles{assert_eq!(free(h,1),1);}}
}
