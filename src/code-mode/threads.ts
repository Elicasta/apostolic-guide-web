import {z} from "zod";
import {defineCodeAdapter} from "./core";
export const threadsPostSchema=z.object({
 id:z.string().uuid().optional(),
 category:z.enum(["oneness","scripture","witty","question","prayer-news","app","response"]),
 body:z.string().trim().min(1).max(500),
 position:z.number().int().min(1).max(30),
 sourceTitle:z.string().max(300).optional(),sourceUrl:z.string().url().max(1500).optional(),
 sourceSummary:z.string().max(1000).optional(),mirrorToX:z.boolean().default(false)
}).strict();
export const threadsCodeSchema=z.object({
 tool:z.literal("threads"),version:z.literal(1),mode:z.enum(["single","weekly"]),batchId:z.string().uuid().optional(),
 weekStart:z.string().regex(/^\d{4}-\d\d-\d\d$/),topic:z.string().min(1).max(300),
 posts:z.array(threadsPostSchema).min(1).max(30)
}).superRefine((value,ctx)=>{
 if(value.mode==="single"&&value.posts.length!==1)ctx.addIssue({code:"custom",path:["posts"],message:"Single mode must contain exactly one post"});
 if(new Set(value.posts.map(p=>p.position)).size!==value.posts.length)ctx.addIssue({code:"custom",path:["posts"],message:"Positions must be unique"});
 if(new Set(value.posts.filter(p=>p.id).map(p=>p.id)).size!==value.posts.filter(p=>p.id).length)ctx.addIssue({code:"custom",path:["posts"],message:"Post IDs must be unique"});
});
export type ThreadsCodeDocument=z.infer<typeof threadsCodeSchema>;
export const threadsCodeAdapter=defineCodeAdapter({tool:"threads",version:1,schema:threadsCodeSchema,fromJson:doc=>doc,toJson:value=>threadsCodeSchema.parse(value)});
export function emptyThreadsCode():unknown{
 return {tool:"threads",version:1,mode:"single",weekStart:new Date().toISOString().slice(0,10),topic:"Apostolic Guide posts",posts:[{position:1,category:"oneness",body:"",mirrorToX:false}]};
}
