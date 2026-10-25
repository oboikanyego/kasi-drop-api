import {createHash,timingSafeEqual} from 'node:crypto';

/** Encode values in the same way as PHP's urlencode() used by PayFast. */
export function payfastUrlEncode(value:string):string{
 return encodeURIComponent(value.trim())
  .replace(/[!'()*~]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase())
  .replace(/%20/g,'+');
}
/** Preserve posted field order. For ITNs, signature terminates the signed fields. */
export function payfastSignature(fields:Record<string,string>,passphrase:string):string{
 const pairs:string[]=[];
 for(const [key,value] of Object.entries(fields)){
  if(key==='signature')break;
  if(value!=='')pairs.push(key+'='+payfastUrlEncode(value));
 }
 if(passphrase)pairs.push('passphrase='+payfastUrlEncode(passphrase));
 return createHash('md5').update(pairs.join('&')).digest('hex');
}
/** Uses the original form body to avoid reordering fields in middleware. */
export function verifyPayfastItn(rawBody:string,passphrase:string):boolean{
 const params=new URLSearchParams(rawBody);
 const fields:Record<string,string>=Object.create(null);
 for(const [key,value] of params){
  if(Object.hasOwn(fields,key))return false;
  fields[key]=value;
 }
 const received=fields.signature?.toLowerCase()||'';
 if(!/^[a-f0-9]{32}$/.test(received))return false;
 const candidate=payfastSignature(fields,passphrase);
 return timingSafeEqual(Buffer.from(received,'ascii'),Buffer.from(candidate,'ascii'));
}
