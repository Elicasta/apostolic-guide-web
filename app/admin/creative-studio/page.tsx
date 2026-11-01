import { redirect } from "next/navigation";

export default async function AdminCreativeStudioPage({ searchParams }: { searchParams: Promise<{ project?: string; view?: string }> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.project) params.set("project", query.project);
  if (query.view) params.set("view", query.view);
  const suffix = params.toString();
  redirect(`/admin/carousel-studio${suffix ? `?${suffix}` : ""}`);
}
