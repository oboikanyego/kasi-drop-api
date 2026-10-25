export const groqConfigured=()=>Boolean(process.env.GROQ_API_KEY?.trim());
export const groqModel=()=>process.env.GROQ_MODEL?.trim()||'llama-3.3-70b-versatile';
export class GroqError extends Error{
 constructor(public status:number){super('Groq provider error ('+status+')');}
}
export async function groqJson(system:string,user:string,fetcher:typeof fetch=fetch):Promise<unknown>{
 const key=process.env.GROQ_API_KEY?.trim();
 if(!key)throw new GroqError(503);
 const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{
  method:'POST',
  headers:{'content-type':'application/json',authorization:'Bearer '+key},
  body:JSON.stringify({model:groqModel(),messages:[
   {role:'system',content:system+' Reply with a valid JSON object only.'},
   {role:'user',content:user}
  ],response_format:{type:'json_object'},temperature:0.2,max_tokens:650}),
  signal:AbortSignal.timeout(9000)
 });
 if(!response.ok)throw new GroqError(response.status);
 const payload=await response.json() as {choices?:Array<{message?:{content?:string}}>} ;
 const answer=payload.choices?.[0]?.message?.content;
 if(!answer)throw Error('Empty Groq response');
 return JSON.parse(answer);
}
