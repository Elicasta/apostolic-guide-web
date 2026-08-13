"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Radio, Route } from "lucide-react";
import Link from "next/link";

export default function NewEpisodeForm({ pathways }: { pathways: Array<{ slug: string; title: string; summary: string }> }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("solo");
  const [accessMode, setAccessMode] = useState("public");
  const [pathwayId, setPathwayId] = useState("jesus-is-god");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/studio/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, accessMode, pathwayId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to create episode");
      router.push(`/studio/episodes/${payload.episode.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create episode");
    } finally { setSaving(false); }
  }

  return <main className="ag-studio ag-studio-new">
    <header className="ag-studio-topbar"><Link href="/studio" className="ag-studio-back"><ArrowLeft size={17}/> Studio</Link><span className="ag-studio-status">New episode</span></header>
    <section className="ag-studio-hero"><div><span className="ag-studio-eyebrow">Episode setup</span><h1>Create the production once.</h1><p>Link a pathway now so its Scriptures and teaching sequence are immediately available as production assets.</p></div></section>
    <form className="ag-studio-form" onSubmit={submit}>
      <label><span>Episode title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Who Is Jesus Christ?" autoFocus /></label>
      <div className="ag-studio-form-grid">
        <label><span>Format</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="solo">Solo teaching</option><option value="interview">Interview</option><option value="panel">Panel</option><option value="live_qa">Live Q&A</option></select></label>
        <label><span>Audience access</span><select value={accessMode} onChange={(e) => setAccessMode(e.target.value)}><option value="public">Public</option><option value="account">AG account</option><option value="members">Members only</option><option value="private">Private</option></select></label>
      </div>
      <label><span><Route size={15}/> Primary pathway</span><select value={pathwayId} onChange={(e) => setPathwayId(e.target.value)}>{pathways.map((pathway) => <option value={pathway.slug} key={pathway.slug}>{pathway.title}</option>)}</select><small>{pathways.find((item) => item.slug === pathwayId)?.summary}</small></label>
      {error ? <div className="ag-studio-error">{error}</div> : null}
      <button className="ag-studio-primary" type="submit" disabled={saving || !title.trim()}><Radio size={17}/>{saving ? "Creating…" : "Create episode"}</button>
    </form>
  </main>;
}
