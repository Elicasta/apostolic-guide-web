import {readFile} from "node:fs/promises";
import {resolve,relative,sep,extname} from "node:path";
const MIME:Record<string,string>={".woff2":"font/woff2",".woff":"font/woff",".ttf":"font/ttf",".png":"image/png",".jpeg":"image/jpeg",".jpg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml"};
const cache=new Map<string,string>();
export async function inlineCodeAssets(document:string,root=resolve(process.cwd(),"public")):Promise<string>{
 const matches=[...new Set(document.match(/\/(?:fonts|brand)\/[a-zA-Z0-9._/-]+/g)||[])];
 let result=document;
 for(const url of matches){
  const file=resolve(root,"."+url),rel=relative(root,file);
  if(!rel||rel===".."||rel.startsWith(".."+sep)||rel.startsWith("/")||url.split("/").includes(".."))throw new Error("Unsafe asset path");
  const mime=MIME[extname(file).toLowerCase()];if(!mime)throw new Error("Unsupported local asset: "+url);
  let data=cache.get(file);
  if(!data){const bytes=await readFile(file);if(bytes.length>5*1024*1024)throw new Error("Asset too large: "+url);
   data="data:"+mime+";base64,"+bytes.toString("base64");cache.set(file,data);}
  result=result.split(url).join(data);
 }
 return result;
}
