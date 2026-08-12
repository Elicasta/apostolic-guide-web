import { redirect, notFound } from "next/navigation";
import { getAdminAccess } from "@/auth";
import { getSession } from "@/studio/repository";
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
  if (!snapshot?.state) notFound();
  return <LiveConsole initialState={snapshot.state} />;
}
