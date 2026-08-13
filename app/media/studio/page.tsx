import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SongStudioApp } from "@/song-studio/song-studio-app";
import { getSongStudioBootstrap, requireSongStudioAccess } from "@/song-studio/server";
import type { SongProject, SongStyleProfile } from "@/song-studio/types";
import "./studio.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Song Studio",
  description: "Private Apostolic Guide songwriting and production workspace.",
  robots: { index: false, follow: false }
};

export default async function SongStudioPage() {
  const auth = await requireSongStudioAccess();
  if (auth.access.state === "signed_out") redirect("/login");
  if (auth.access.state === "forbidden") redirect("/");

  let projects: SongProject[] = [];
  let styles: SongStyleProfile[] = [];
  let setupError: string | null = null;

  if (!auth.ok) {
    setupError = auth.access.state === "unconfigured"
      ? "Song Studio needs the existing Supabase configuration before it can save projects."
      : "Song Studio service access is not configured.";
  } else {
    try {
      const bootstrap = await getSongStudioBootstrap();
      projects = bootstrap.projects;
      styles = bootstrap.styles;
    } catch (error) {
      setupError = error instanceof Error
        ? `Song Studio database is not ready: ${error.message}. Apply the Apostolic Song Studio migration on this branch.`
        : "Song Studio database is not ready. Apply the Apostolic Song Studio migration on this branch.";
    }
  }

  return (
    <SongStudioApp
      initialProjects={projects}
      initialStyles={styles}
      userLabel={auth.user?.email ?? "Local setup mode"}
      setupError={setupError}
    />
  );
}
