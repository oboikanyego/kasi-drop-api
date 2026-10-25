/** An error whose message is safe to show the client, with the HTTP status to send. */
export class HttpError extends Error{
 constructor(public status:number,message:string){super(message);this.name='HttpError';}
}
/** Map any thrown value to a response. Unknown errors never leak their message. */
export function errorResponse(err:unknown):{status:number;body:{error:string}}{
 if(err instanceof HttpError)return {status:err.status,body:{error:err.message}};
 return {status:500,body:{error:'Request could not be completed'}};
}
