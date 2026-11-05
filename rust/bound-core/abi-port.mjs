// ABI-v2 handles are not linear-memory offsets. All buffers must be live,
// nonzero and bounded; the selected host can still access all guest memory.
export function abiBuffer(exports,handle,length){
 const pointer=exports.fold_abi_version?.()===2&&Number.isInteger(handle)&&handle>0&&Number.isInteger(length)&&length>0&&length<=65536&&exports.fold_length(handle)===length?exports.fold_pointer(handle):0;
 if(!pointer||pointer+length>exports.memory.buffer.byteLength)throw Object.assign(Error('fold/abi-buffer'),{code:'fold/abi-buffer'});
 return new Uint8Array(exports.memory.buffer,pointer,length);
}
