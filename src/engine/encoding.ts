/** Shared, host-free UTF-8 encoding for protocol byte budgets. */
export const encodeUTF8=(text:string):Uint8Array=>new TextEncoder().encode(text);
