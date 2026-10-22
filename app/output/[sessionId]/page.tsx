import StudioOutputClient from "./studio-output-client";
import "./studio-output.css";

export const dynamic = "force-dynamic";

export default async function StudioOutputPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ token?: string; venue?: string; mute?: string }> }) {
  const { sessionId } = await params;
  const { token = "", venue, mute } = await searchParams;
  return <StudioOutputClient sessionId={sessionId} token={token} venueMode={venue === "1"} muteProgramAudio={venue === "1" && mute === "1"} />;
}
