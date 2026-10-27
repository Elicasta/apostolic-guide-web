import "server-only";
import type {ServiceClient} from "./video-producer-server";
import {
 createPrivateBlobDownloadUrl,createWorkerCallbackToken,dispatchVideoProducerWorker,
 videoProducerRendererCredentials,videoProducerWorkerRef
} from "./video-producer-server";
import {AUTO_TRANSCRIBE_MAX_ATTEMPTS,autoTranscribeDue,nextAutoRetryAt,readAutoTranscribe} from "./video-producer-upload-queue";

function record(value:unknown):Record<string,unknown>{
 return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
export type TranscriptionStart={state:"started"|"already_running"|"not_ready"|"already_complete"|"not_due";projectId:string;workerRef?:string};
export async function startVideoProducerTranscription(args:{
 service:ServiceClient;projectId:string;callbackOrigin:string;
 ownerUserId?:string;autoOnly?:boolean;
}):Promise<TranscriptionStart>{
 const {service,projectId,callbackOrigin,ownerUserId,autoOnly=false}=args;
 const projectResult=await service.from("video_producer_projects")
 .select("id,status,source_provider,source_locator,source_filename,director_metadata,transcript_text")
 .eq("id",projectId).is("deleted_at",null).maybeSingle();
 if(projectResult.error)throw new Error(projectResult.error.message);
 const project=projectResult.data;
 if(!project)throw new Error("Video project not found");
 if(project.transcript_text)return {state:"already_complete",projectId};
 if(project.status==="transcribing")return {state:"already_running",projectId};
 if(!project.source_locator||project.source_provider!=="vercel_blob"
   ||!["uploaded","failed"].includes(String(project.status)))return {state:"not_ready",projectId};
 const metadata=record(project.director_metadata);
 if(autoOnly && !autoTranscribeDue(metadata))return {state:"not_due",projectId};
 const auto=readAutoTranscribe(metadata);
 const attempt=auto.attempts+1;
 const {token,repository}=await videoProducerRendererCredentials(service);
 if(!token)throw new Error("Video worker is not connected");
 const sourceUrl=await createPrivateBlobDownloadUrl(project.source_locator,4*60*60*1000);
 const callback=createWorkerCallbackToken();
 const timestamp=new Date().toISOString();
 const workerRef=videoProducerWorkerRef();
 const nextMetadata={
  ...metadata, transcriptionError:null,
  autoTranscribe:{enabled:auto.enabled,attempts:attempt,nextAttemptAt:null,startedAt:timestamp},
  transcriptionBridge:{callbackTokenHash:callback.hash,dispatchedAt:timestamp,model:"whisper-1",
   sourceLocator:project.source_locator,workerRef}
 };
 const data={
  status:"transcribing",
  transcript_text:null,
  transcript:{words:[],segments:[]},
  edit_plan:null,
  approval_fingerprint:null,
  approved_at:null,
  director_metadata:nextMetadata,
  ...(ownerUserId?{updated_by:ownerUserId}:{})
 };
 // Atomic compare-and-swap: browser and Blob callback may race. Only one wins.
 const claimed=await service.from("video_producer_projects").update(data)
 .eq("id",projectId).eq("source_locator",project.source_locator)
 .in("status",["uploaded","failed"]).is("transcript_text",null)
 .select("id").maybeSingle();
 if(claimed.error)throw new Error(claimed.error.message);
 if(!claimed.data)return {state:"already_running",projectId};
 try{
  await dispatchVideoProducerWorker({
   token,repository,eventType:"video-producer-transcribe",
   payload:{project_id:projectId,worker_ref:workerRef,source_url:sourceUrl,
    source_filename:project.source_filename||"source.mp4",
    callback_url:new URL("/api/admin/video-producer/transcribe-callback",callbackOrigin).toString(),
    callback_token:callback.token,transcription_model:"whisper-1"}
  });
  return {state:"started",projectId,workerRef};
 }catch(error){
  const message=error instanceof Error?error.message:"Transcription dispatch failed";
  const retry=auto.enabled && attempt<AUTO_TRANSCRIBE_MAX_ATTEMPTS;
  const retryMetadata={...metadata,transcriptionError:message.slice(0,800),
   autoTranscribe:{enabled:retry,attempts:attempt,
    nextAttemptAt:retry?nextAutoRetryAt(attempt):null,lastError:message.slice(0,800)},
   transcriptionBridge:{callbackTokenHash:null,failedAt:new Date().toISOString()}};
  // Do not overwrite progress/completion belonging to a newer dispatch.
  const rollback=await service.from("video_producer_projects")
   .update({status:"uploaded",director_metadata:retryMetadata})
   .eq("id",projectId).eq("status","transcribing")
   .contains("director_metadata",{transcriptionBridge:{callbackTokenHash:callback.hash}});
  if(rollback.error)console.error("Video transcription claim rollback failed",projectId,rollback.error.message);
  throw error;
 }
}
