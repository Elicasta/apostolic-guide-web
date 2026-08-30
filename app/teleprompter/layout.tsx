import { redirect } from "next/navigation";
import { getAdminAccess } from "@/auth";
import TeleprompterSeedBootstrap from "@/components/teleprompter/TeleprompterSeedBootstrap";
import "./teleprompter.css";
import "./teleprompter-scroll.css";
import "./teleprompter-qr.css";

export const dynamic = "force-dynamic";

export default async function TeleprompterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access = await getAdminAccess();
  if (access.state === "signed_out" || access.state === "unconfigured") redirect("/login");
  if (access.state !== "allowed") redirect("/");
  return <TeleprompterSeedBootstrap>{children}</TeleprompterSeedBootstrap>;
}
