import {z} from "zod";
import postcss from "postcss";
import sanitizeHtml from "sanitize-html";
import {defineCodeAdapter,expandCodePlaceholders,escapeCodeText} from "./core";

export const emailCampaignSchema=z.object({
 type:z.enum(["article","topic","answer","pathway","youtube","podcast","announcement"]),
 subject:z.string().min(3).max(180),previewText:z.string().min(3).max(220),
 eyebrow:z.string().min(2).max(80),title:z.string().min(3).max(220),
 summary:z.string().min(10).max(1200),ctaLabel:z.string().min(2).max(60),
 url:z.string().url().max(2000),
 resources:z.array(z.object({title:z.string().max(220),summary:z.string().max(1200),url:z.string().url().max(2000)})).max(3).optional()
});
export const emailCodeSchema=z.object({
 tool:z.literal("broadcast"),version:z.literal(1),campaign:emailCampaignSchema,
 theme:z.object({html:z.string().min(10).max(100000),css:z.string().max(100000),containerWidth:z.number().int().min(320).max(720).default(600)}),
 overrides:z.record(z.string(),z.string().max(15000)).default({})
}).strict();
export type EmailCodeDocument=z.infer<typeof emailCodeSchema>;
export const emailCodeAdapter=defineCodeAdapter({tool:"broadcast",version:1,schema:emailCodeSchema,fromJson:v=>v,toJson:v=>emailCodeSchema.parse(v)});
export const EMAIL_TEMPLATE='<div style="padding:34px 32px"><p class="eyebrow">{{eyebrow}}</p><h1>{{headline}}</h1><p>{{body}}</p><p class="button">{{button_text}}</p><p>{{resources}}</p></div>';
export const EMAIL_CSS='.eyebrow{font-size:11px;letter-spacing:2px;font-weight:700;color:#a12d3d}.button{color:#fff;background-color:#a12d3d;padding:14px 18px}h1{font-family:Georgia,serif;color:#10202a;font-size:34px;line-height:1.2}p{font-family:Arial,sans-serif;color:#536269;line-height:1.6}';
export function initialEmailCodeDocument(campaign:z.infer<typeof emailCampaignSchema>):EmailCodeDocument{
 return {tool:"broadcast",version:1,campaign,theme:{html:EMAIL_TEMPLATE,css:EMAIL_CSS,containerWidth:600},overrides:{}};
}
function safeUrl(value:string){try{const url=new URL(value);return ["https:","http:"].includes(url.protocol)?url.toString():"https://www.apostolicguide.com";}catch{return "https://www.apostolicguide.com";}}
function safeCss(raw:string){
 const tree=postcss.parse(raw);const head:string[]=[];const selectors:Array<{selector:string;declarations:string}>=[];
 tree.walkAtRules(rule=>{if(rule.name==="import"||rule.name==="charset")throw new Error("Email CSS imports are forbidden.");if(rule.name==="media")head.push(rule.toString());});
 tree.walkRules(rule=>{
  if(rule.parent && rule.parent.type==="atrule")return;
  const selector=rule.selector.trim();
  if(!/^(?:[a-z][\w-]*|[.#][\w-]+)(?:\.[\w-]+)?$/i.test(selector))throw new Error("Email CSS must use tag, class or ID selectors outside media queries.");
  const declarations=rule.nodes?.filter(n=>n.type==="decl").map(n=>n.toString()).join(";")||"";
  if(/(?:expression\s*\(|javascript\s*:|url\s*\(|behavior\s*:|-moz-binding)/i.test(declarations))throw new Error("Unsafe email CSS.");
  selectors.push({selector,declarations});
 });
 return {selectors,head:head.join("\n")};
}
/** Conservative CSS inliner for email-supported simple tag, class and ID selectors.
 * Avoids a new unpinned juice dependency while covering the editable theme selectors.
 * Unsupported selectors fail validation instead of rendering inconsistently across clients.
 */
function inlineCss(html:string,css:ReturnType<typeof safeCss>){
 return html.replace(/<([a-z][\w-]*)([^<>]*)>/gi,(original,tag:string,attributes:string)=>{
  const cls=(attributes.match(/\bclass\s*=\s*["']([^"']+)["']/i)?.[1]||"").split(/\s+/);
  const id=attributes.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1]||"";
  const inline=css.selectors.filter(s=>s.selector.toLowerCase()===tag.toLowerCase()||s.selector==="#"+id||cls.some(c=>s.selector==="."+c||s.selector.toLowerCase()===tag.toLowerCase()+"."+c)).map(s=>s.declarations).filter(Boolean).join(";");
  if(!inline)return original;
  const match=attributes.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
  if(match)return "<"+tag+attributes.replace(match[0],'style="'+escapeCodeText(inline+";"+match[1])+'"')+">";
  return "<"+tag+attributes+' style="'+escapeCodeText(inline)+'">';
 });
}
export function emailCodeRender(doc:EmailCodeDocument){
 const value=emailCodeSchema.parse(doc),c={...value.campaign,...value.overrides};
 const resources=(c.resources||[]).map(resource=>'<p><a href="'+escapeCodeText(safeUrl(resource.url))+'">'+escapeCodeText(resource.title)+'</a> '+escapeCodeText(resource.summary)+'</p>').join("");
 const unsubscribe="{{{RESEND_UNSUBSCRIBE_URL}}}";
 const fields:Record<string,string>={subject:c.subject,preview:c.previewText,eyebrow:c.eyebrow,headline:c.title,body:c.summary,
  button_text:c.ctaLabel,button_url:safeUrl(c.url),resources,unsubscribe_url:unsubscribe};
 const css=safeCss(value.theme.css);
 const expanded=expandCodePlaceholders(value.theme.html,fields,["resources"]);
 const safe=sanitizeHtml(expanded,{allowedTags:["div","table","tbody","thead","tfoot","tr","td","th","p","h1","h2","h3","span","strong","em","b","i","br","a","ul","li","ol","img"],allowedAttributes:{"*":["class","id","style","align","width","height","role"],a:["href","title"],img:["src","width","height","alt"]},
  allowedSchemes:["https","http","data"],allowedSchemesByTag:{img:["https","data"]},allowProtocolRelative:false});
 const rendered=inlineCss(safe,css);
 const width=value.theme.containerWidth;
 // Footer and CTA are outside user templates, so no custom document can suppress legal unsubscribe links.
 const footer='<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 32px;font:13px Arial;color:#68777d"><a href="https://www.apostolicguide.com">Apostolic Guide</a> · <a href="'+unsubscribe+'">Unsubscribe</a></td></tr></table>';
 const link=escapeCodeText(safeUrl(c.url)),label=escapeCodeText(c.ctaLabel);
 const button='<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#a12d3d" style="background:#a12d3d;padding:14px 24px">'+
 '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="'+link+'" arcsize="8%" fillcolor="#a12d3d" strokecolor="#a12d3d" style="height:42px;v-text-anchor:middle;width:220px"><w:anchorlock xmlns:w="urn:schemas-microsoft-com:office:word"/><center style="font-family:Arial;font-size:15px;color:#ffffff;font-weight:bold">'+label+'</center></v:roundrect><![endif]-->'+
 '<!--[if !mso]><!--><a href="'+link+'" style="font:700 15px Arial;color:#fff;text-decoration:none">'+label+'</a><!--<![endif]--></td></tr></table>';
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta name="color-scheme" content="light dark"><title>'+escapeCodeText(c.subject)+'</title><style>@media(max-width:600px){.email-container{width:100%!important;max-width:100%!important}}'+css.head+'</style></head>'+
 '<body style="margin:0;padding:0;background:#eef2f1"><div style="display:none!important;max-height:0;opacity:0;overflow:hidden;font-size:1px">'+escapeCodeText(c.previewText)+'</div>'+
 '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><table class="email-container" role="presentation" width="'+width+'" cellpadding="0" cellspacing="0" border="0" style="max-width:'+width+'px;width:100%;background:#ffffff"><tr><td>'+
 rendered+button+footer+'</td></tr></table></td></tr></table></body></html>';
 // Body is derived from the *rendered* final output, not from editable source HTML.
 const text=sanitizeHtml(html.replace(/<\/(?:p|h[1-6]|div|li|tr|table)>/gi,"\n"),{allowedTags:[],allowedAttributes:{}}).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(?:39|039);/g,"'").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
 if(!html.includes(unsubscribe)||!html.includes('href="https://www.apostolicguide.com"'))throw new Error("Required email footer unavailable.");
 return {html,text};
}
