import { notFound } from "next/navigation";
import { getEpisode } from "@/studio/repository";
import LiveAudience from "./live-audience";
import "./live.css";
export const dynamic="force-dynamic";
export default async function LivePage({params}:{params:Promise<{episodeId:string}>}){const {episodeId}=await params;const snapshot=await getEpisode(episodeId).catch(()=>null);if(!snapshot||snapshot.episode.access_mode==="private")notFound();return <LiveAudience episodeId={episodeId} title={snapshot.episode.title} youtubeUrl={snapshot.episode.youtube_url}/>;}
