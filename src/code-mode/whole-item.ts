import {videoCodeV2Schema,initialVideoV2} from "./video-v2";
import {z} from "zod";
import {defineCodeAdapter} from "./core";
const uuid=z.string().uuid();
const dated=z.string().datetime({offset:true});
const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const version=z.literal(1);
const website=z.object({tool:z.literal("website"),version,id:uuid.optional(),kind:z.enum(["article","answer","topic"]),title:z.string().min(3).max(180),slug:slug.max(180),
 summary:z.string().min(10).max(500),body:z.string().min(10).max(100000),expectedUpdatedAt:dated.optional()}).strict();
const editorial=z.object({tool:z.literal("content_engine"),version,productionDate:z.string().regex(/^\d{4}-\d\d-\d\d$/),
 expectedStateVersion:z.number().int().min(1),title:z.string().min(3).max(180),caption:z.string().max(10000),
 artDirection:z.string().max(10000),frames:z.array(z.unknown()).min(1).max(20),newsletter:z.record(z.string(),z.unknown()).nullable()}).strict();
const episode=z.object({tool:z.literal("episode"),version,kind:z.enum(["script","article"]),id:uuid,title:z.string().min(1).max(220),body:z.string().max(100000),
 premise:z.string().max(6000).optional(),expectedUpdatedAt:dated.optional()}).strict();
const audio=z.object({tool:z.literal("audio"),version,pathwaySlug:slug,scriptText:z.string().min(100).max(4096),expectedUpdatedAt:dated.optional()}).strict();
const teleprompter=z.object({tool:z.literal("teleprompter"),version,id:uuid.optional(),title:z.string().min(1).max(180),scriptText:z.string().min(1).max(75000),notes:z.string().max(5000).default(""),expectedUpdatedAt:dated.optional()}).strict();
const cue=z.object({id:z.string().min(1).max(120),start:z.number().finite().min(0).max(3600),kind:z.enum(["question","brand","scripture","statement","recap","cta"]),eyebrow:z.string().max(120),title:z.string().max(220),body:z.string().max(500),reference:z.string().max(120)});
const video=z.discriminatedUnion("kind",[
 z.object({tool:z.literal("video"),version,kind:z.literal("studio"),id:slug,timeline:z.array(cue).min(1).max(80),style:z.record(z.string(),z.unknown()),expectedUpdatedAt:dated.optional()}).strict(),
 z.object({tool:z.literal("video"),version,kind:z.literal("producer"),id:uuid,title:z.string().min(1).max(180),directorMetadata:z.record(z.string(),z.unknown()),expectedUpdatedAt:dated.optional()}).strict()
]);
export const wholeItemSchema=z.union([z.discriminatedUnion("tool",[website,editorial,episode,audio,teleprompter,video]),videoCodeV2Schema]);
export type WholeItemCode=z.infer<typeof wholeItemSchema>;
export const wholeItemAdapter=defineCodeAdapter({tool:"website",version:1,schema:wholeItemSchema,fromJson:d=>d,toJson:value=>wholeItemSchema.parse(value)});
export function initialWholeItem(tool:WholeItemCode["tool"]):unknown{
 const shared={tool,version:1};
 if(tool==="website")return {...shared,kind:"article",title:"",slug:"",summary:"",body:""};
 if(tool==="content_engine")return {...shared,productionDate:"",expectedStateVersion:1,title:"",caption:"",artDirection:"",frames:[],newsletter:null};
 if(tool==="episode")return {...shared,kind:"script",id:"",title:"",body:""};
 if(tool==="audio")return {...shared,pathwaySlug:"",scriptText:""};
 if(tool==="teleprompter")return {...shared,title:"",scriptText:"",notes:""};
 return initialVideoV2();
}
