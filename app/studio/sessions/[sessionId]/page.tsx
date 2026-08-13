import { redirect, notFound } from "next/navigation";
import { getAdminAccess } from "@/auth";
import { getSession } from "@/studio/repository";
import { getRunCues } from "@/studio/run-repository";
import LiveConsole from "./live-console";
import "../../studio.css";
import "./live-console.css";

export const dynamic = "force-dynamic";

export default async function StudioSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const access = await getAdminAccess();
  if (access.state === "signed_out") redirect("/login");
  if (access.state !== "allowed" || !["owner", "admin", "editor"].includes(access.role ?? "")) redirect("/");
  const { sessionId } = await params;
  const snapshot = await getSession(sessionId).catch(() => null);
  if (!snapshot?.state || !snapshot.session) notFound();
  const cues = await getRunCues(snapshot.session.active_run_id).catch(() => []);
  return <LiveConsole initialState={snapshot.state} initialCues={cues} />;
}
