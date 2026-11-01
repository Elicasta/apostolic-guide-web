export const AUTO_TRANSCRIBE_MAX_ATTEMPTS=3;
export function readAutoTranscribe(value:unknown):{enabled:boolean;attempts:number;nextAttemptAt:string|null}{
 const record=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const current=record.autoTranscribe&&typeof record.autoTranscribe==="object"?record.autoTranscribe as Record<string,unknown>:{};
 return {enabled:current.enabled===true,
  attempts:Number.isSafeInteger(current.attempts)&&Number(current.attempts)>=0?Number(current.attempts):0,
  nextAttemptAt:typeof current.nextAttemptAt==="string"?current.nextAttemptAt:null};
}
export function autoTranscribeDue(value:unknown,now:Date=new Date()):boolean{
 const state=readAutoTranscribe(value);
 if(!state.enabled||state.attempts>=AUTO_TRANSCRIBE_MAX_ATTEMPTS)return false;
 const future=state.nextAttemptAt?Date.parse(state.nextAttemptAt):0;
 return Number.isFinite(future)&&future<=now.getTime();
}
export function nextAutoRetryAt(attempts:number,now:Date=new Date()):string{
 const delay=[60,120,300][Math.min(Math.max(0,Math.floor(attempts)-1),2)];
 return new Date(now.getTime()+delay*1000).toISOString();
}
