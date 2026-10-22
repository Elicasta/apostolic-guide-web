import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveGuestInvite } from "@/studio/guest-repository";
import VenueConsole from "./venue-console";
import "./venue.css";

export const dynamic = "force-dynamic";
export const metadata:Metadata = {
  title:"Remote Venue | Apostolic Guide Live",
  robots:{index:false,follow:false},
  referrer:"no-referrer"
};
type Guest={id:string;episode_id:string;is_remote_venue?:boolean;display_name:string};
export default async function VenuePage({params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  if(!token||token.length<20||token.length>200)notFound();
  const invite=await resolveGuestInvite(token).catch(()=>null);
  const guest=invite?.studio_episode_guests as Guest|undefined;
  if(!guest?.is_remote_venue||guest.episode_id!==invite?.episode_id)notFound();
  return <VenueConsole token={token} venueName={guest.display_name}/>;
}
