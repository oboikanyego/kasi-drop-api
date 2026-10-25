import {randomUUID} from 'node:crypto';
import {z} from 'zod';

export const provinces=['Gauteng','Western Cape','KwaZulu-Natal','Eastern Cape','Free State','Limpopo','Mpumalanga','North West','Northern Cape'] as const;
const tidy=(s:string)=>s.trim().replace(/\s+/g,' ');
const text=(min:number,max:number)=>z.string().trim().min(min).max(max).transform(tidy);
const optionalText=(max:number)=>z.string().trim().max(max).transform(tidy).default('');
export const profileUpdateSchema=z.object({
 name:text(2,80).optional(),
 phone:z.union([z.literal(''),z.string().trim().regex(/^\+?[0-9][0-9\s()-]{6,19}$/).max(24)]).optional(),
 about:optionalText(250).optional(),
 preferredLanguage:z.enum(['English','isiZulu','isiXhosa','Sesotho','Setswana','Afrikaans','Sepedi','Other']).optional(),
 marketingOptIn:z.boolean().optional()
}).strict().refine(data=>Object.keys(data).length>0,{message:'No profile changes provided'});

export const addressInputSchema=z.object({
 label:z.enum(['Home','Work','Other']),
 nickname:optionalText(32),
 recipientName:text(2,80),
 phone:z.string().trim().regex(/^\+?[0-9][0-9\s()-]{6,19}$/).max(24),
 street:text(5,150),
 unit:optionalText(80),
 suburb:optionalText(100),
 city:text(2,100),
 province:z.enum(provinces),
 postalCode:z.string().trim().regex(/^[A-Za-z0-9 -]{3,10}$/),
 deliveryNotes:optionalText(180),
 isDefault:z.boolean().default(false)
}).strict();
export type AddressInput=z.infer<typeof addressInputSchema>;
export type SavedAddress=AddressInput&{id:string};

/** Exactly one default whenever the user has at least one address. */
export function normalizeAddressDefaults(addresses:SavedAddress[],preferredId?:string):SavedAddress[]{
 if(!addresses.length)return [];
 const selected=addresses.find(a=>a.id===preferredId)||
  addresses.find(a=>a.isDefault)||addresses[0];
 return addresses.map(a=>({...a,isDefault:a.id===selected.id}));
}
export function appendAddress(addresses:SavedAddress[],input:AddressInput,max=10):SavedAddress[]{
 if(addresses.length>=max)throw Error('Maximum of '+max+' saved addresses reached');
 const next={...input,id:randomUUID(),isDefault:input.isDefault||addresses.length===0};
 return normalizeAddressDefaults([...addresses,next],next.isDefault?next.id:undefined);
}
export function editAddress(addresses:SavedAddress[],id:string,input:AddressInput):SavedAddress[]|null{
 if(!addresses.some(a=>a.id===id))return null;
 const next=addresses.map(a=>a.id===id?{...input,id,isDefault:input.isDefault||a.isDefault}:a);
 return normalizeAddressDefaults(next,input.isDefault?id:undefined);
}
export function removeAddress(addresses:SavedAddress[],id:string):SavedAddress[]|null{
 if(!addresses.some(a=>a.id===id))return null;
 return normalizeAddressDefaults(addresses.filter(a=>a.id!==id));
}
export function setDefaultAddress(addresses:SavedAddress[],id:string):SavedAddress[]|null{
 if(!addresses.some(a=>a.id===id))return null;
 return normalizeAddressDefaults(addresses,id);
}

export const maxAvatarBytes=512*1024;
/** Reject SVGs and arbitrary files; browser uploads are reduced to JPEG/PNG/WebP. */
export function detectAvatarMime(buf:Buffer):'image/png'|'image/jpeg'|'image/webp'|null{
 if(buf.length>=8&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buf.length>=4&&buf[0]===255&&buf[1]===216&&buf[2]===255)return 'image/jpeg';
 if(buf.length>=12&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return 'image/webp';
 return null;
}
