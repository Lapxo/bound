//! Shared WASM byte transport. The selected trusted host must allocate replies
//! through fold_alloc; this is not a memory-isolation boundary against that host.
#[cfg(target_arch="wasm32")]
pub fn invoke(request:serde_json::Value,call:unsafe extern "C" fn(u32,u32)->u64)->Result<serde_json::Value,super::object::PortError>{
 use super::object::PortError;
 let request=serde_json::to_vec(&request).map_err(|_|PortError::context())?;
 // SAFETY: only the receiver-selected WASM function import is invoked. No Rust
 // pointer ownership is reconstructed from its response; handles are validated.
 let packed=unsafe{call(request.as_ptr()as u32,request.len()as u32)};
 let handle=(packed>>32)as u32;let length=packed as u32;
 let bytes=super::abi::take(handle,length).ok_or_else(PortError::context)?;
 let response:serde_json::Value=serde_json::from_slice(&bytes).map_err(|_|PortError::context())?;
 if response["ok"]==true{Ok(response["value"].clone())}else{Err(PortError{code:response["code"].as_str().unwrap_or("host-port/failed").into()})}
}
