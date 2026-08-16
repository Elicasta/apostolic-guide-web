import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { CreativeLibraryClient } from "@/creative-library-client";

export default async function AdminCreativeLibraryPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return <CreativeLibraryClient/>;
}
