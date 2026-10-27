import {findNodeAtLocation,parseTree,printParseErrorCode,type ParseError} from "jsonc-parser";
import {z} from "zod";
export const codeTool=z.enum(["carousel","broadcast","threads","website","content_engine","episode","audio","teleprompter","video"]);
export const envelope=z.object({tool:codeTool,version:z.literal(1)});
export type CodeAdapter<T>={tool:z.infer<typeof codeTool>;version:1;schema:z.ZodType<T>;fromJson:(value:T)=>unknown;toJson:(draft:unknown)=>T};
export function defineCodeAdapter<T>(adapter:CodeAdapter<T>){return adapter;}
export function parseCodeDocument<T>(raw:string,fromJson:(value:unknown)=>T):T {
 const errors:ParseError[]=[];const tree=parseTree(raw,errors,{disallowComments:true,allowTrailingComma:false});
 const line=(offset:number)=>raw.slice(0,offset).split("\n").length;
 if(errors.length)throw new Error("Line "+line(errors[0].offset)+": "+printParseErrorCode(errors[0].error));
 if(!tree)throw new Error("Line 1: Empty JSON document.");
 try{return fromJson(JSON.parse(raw));}catch(error){
  const path=error instanceof z.ZodError?error.issues[0]?.path:[];
  const found=findNodeAtLocation(tree,(path||[]) as (string|number)[]);
  throw new Error("Line "+line(found?.offset??0)+": "+(error instanceof Error?error.message:String(error)));
 }
}
export function escapeCodeText(value:string){
 return value.replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
}
export function expandCodePlaceholders(template:string,fields:Record<string,string>,trusted:string[]=[]){
 const allow=new Set(trusted);
 return template.replace(/(?<!\{)\{\{(?!\{)([a-zA-Z][a-zA-Z0-9_]*)\}\}(?!\})/g,(match,key:string)=>{
  if(!(key in fields))return match;
  return allow.has(key)?fields[key]:escapeCodeText(fields[key]||"");
 });
}
