import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { createPoll, getLiveAudience, setPollState, setQuestionStatus } from "@/studio/live-repository";
async function producer(){const access=await getAdminAccess();return access.state==="allowed"&&access.user?.id&&["owner","admin","editor"].includes(access.role??"")?access:null;}
export async function GET(_r:Request,{params}:{params:Promise<{episodeId:string}>}){if(!await producer())return NextResponse.json({error:"Forbidden"},{status:403});const {episodeId}=await params;try{return NextResponse.json(await getLiveAudience(episodeId));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to load audience"},{status:500});}}
const Action=z.discriminatedUnion("type",[
 z.object({type:z.literal("question.status"),questionId:z.string().uuid(),status:z.enum(["approved","queued","live","answered","dismissed"])}),
 z.object({type:z.literal("poll.create"),question:z.string().trim().min(1).max(300),options:z.array(z.string().trim().min(1).max(160)).min(2).max(8)}),
 z.object({type:z.literal("poll.state"),pollId:z.string().uuid(),status:z.enum(["draft","scheduled","open","closed","archived"]).optional(),showResults:z.boolean().optional()})
]);
export async function POST(request:Request,{params}:{params:Promise<{episodeId:string}>}){const access=await producer();if(!access)return NextResponse.json({error:"Forbidden"},{status:403});const parsed=Action.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid audience action"},{status:400});try{const {episodeId}=await params;const a=parsed.data;if(a.type==="question.status")return NextResponse.json({question:await setQuestionStatus(a.questionId,a.status)});if(a.type==="poll.create")return NextResponse.json({poll:await createPoll({episodeId,userId:access.user!.id,question:a.question,options:a.options})},{status:201});return NextResponse.json({poll:await setPollState(a.pollId,{status:a.status,showResults:a.showResults})});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to update audience"},{status:500});}}
