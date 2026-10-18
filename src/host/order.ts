/** Locale-independent UTF-16 code-unit ordering, shared by host delivery formats. */
export const compareStrings=(a:string,b:string)=>a<b?-1:a>b?1:0;
