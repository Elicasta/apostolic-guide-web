"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, KeyRound, Loader2, Save } from "lucide-react";

type RendererStatus = {
  configured: boolean;
  source: "environment" | "secret_store" | "missing";
  tokenStored: boolean;
  repositoryStored: boolean;
  repository: string;
  updatedAt: string | null;
};

export function VideoRendererCredentials() {
  const [status, setStatus] = useState<RendererStatus | null>(null);
  const [token, setToken] = useState("");
  const [repository, setRepository] = useState("Elicasta/apostolic-guide-web");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/setup/video-renderer", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Renderer status could not be loaded.");
      const next = data.renderer as RendererStatus;
      setStatus(next);
      setRepository(next.repository || "Elicasta/apostolic-guide-web");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Renderer status could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/setup/video-renderer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, repository })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Renderer credentials could not be saved.");
      const next = data.renderer as RendererStatus;
      setStatus(next);
      setToken("");
      setRepository(next.repository || repository);
      setMessage("Video renderer credentials saved. The token was not returned to this browser.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Renderer credentials could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-card social-publishing-credentials" id="video-renderer">
    <div className="credential-heading">
      <div><span className="section-kicker">Render infrastructure</span><h2>Video renderer</h2><p>Connect Video Studio to the repository_dispatch worker that creates the final MP4. This is separate from your YouTube, Instagram, and TikTok account credentials.</p></div>
      <div className="credential-security"><KeyRound size={16}/><span>Server-only token</span></div>
    </div>

    {message ? <div className="admin-notice credential-notice">{message}</div> : null}

    <article className="credential-platform">
      <div className="credential-platform-head">
        <div className="credential-platform-icon"><KeyRound size={20}/></div>
        <div><h3>GitHub Actions renderer</h3><p>Video Studio dispatches an asynchronous GitHub Actions job, which renders the MP4 with FFmpeg and places the finished file in Apostolic Guide storage.</p></div>
      </div>

      <div className="credential-status-row">
        <span className={status?.configured ? "credential-status is-ready" : "credential-status"}>{status?.configured ? <CheckCircle2 size={14}/> : <CircleAlert size={14}/>} Renderer {status?.configured ? "connected" : "not connected"}</span>
        {status?.source === "environment" ? <span className="credential-status is-ready"><CheckCircle2 size={14}/> Vercel environment</span> : null}
      </div>

      <div className="credential-fields">
        <label>
          <span>GitHub Actions token{status?.tokenStored ? <em>Stored</em> : null}</span>
          <input type="password" autoComplete="off" value={token} placeholder={status?.tokenStored ? "Stored securely · enter a value only to replace it" : "Fine-grained GitHub token with Actions/repository dispatch access"} onChange={(event) => setToken(event.target.value)}/>
          <small>The token must be able to dispatch the <code>pathway-video-render</code> workflow in the Apostolic Guide repository. It is never returned after saving.</small>
        </label>
        <label>
          <span>Renderer repository{status?.repositoryStored ? <em>Stored</em> : null}</span>
          <input type="text" autoComplete="off" value={repository} placeholder="Elicasta/apostolic-guide-web" onChange={(event) => setRepository(event.target.value)}/>
        </label>
      </div>

      <div className="credential-platform-footer">
        <small>{busy ? "Checking renderer…" : status?.updatedAt ? `Last updated ${new Date(status.updatedAt).toLocaleString()}` : status?.source === "environment" ? "Configured through the deployment environment." : "A renderer token is required before Render can queue a job."}</small>
        <button type="button" className="button primary" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="spin" size={15}/> : <Save size={15}/>} Save renderer</button>
      </div>
    </article>
  </section>;
}
