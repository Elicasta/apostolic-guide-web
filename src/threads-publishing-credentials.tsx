"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, KeyRound, Link2, Loader2, Save } from "lucide-react";

const CALLBACK = "https://apostolicguide.com/api/admin/meta/threads/callback";
const UNINSTALL = "https://apostolicguide.com/api/meta/threads/deauthorize";
const DELETE = "https://apostolicguide.com/api/meta/threads/delete";

type Status = {
  appConfigured: boolean;
  accountAuthorized: boolean;
  accountLabel: string | null;
  fields: Record<string, boolean>;
  updatedAt: string | null;
};

function messageFor(code: string | null) {
  if (code === "connected") return "Threads connected. Publishing authorization is stored server-side.";
  if (code === "denied") return "Threads authorization was cancelled or denied.";
  if (code === "invalid_state") return "Threads authorization expired or could not be verified. Try Connect Threads again.";
  if (code === "missing_credentials") return "Save the Threads App ID and App Secret first.";
  if (code === "token_error") return "Meta did not accept the Threads OAuth code. Verify the callback URL and try again.";
  if (code === "server_error") return "Threads authorization reached Apostolic Guide but could not be saved.";
  return "";
}

export function ThreadsPublishingCredentials() {
  const [status,setStatus]=useState<Status>();
  const [appId,setAppId]=useState("");
  const [appSecret,setAppSecret]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>{
    try {
      const r=await fetch("/api/admin/setup/threads-publishing",{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Threads setup could not be loaded.");
      setStatus(d.status);
    } catch(error) { setMessage(error instanceof Error?error.message:"Threads setup could not be loaded."); }
  },[]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const note=messageFor(params.get("threads"));
    if(note){setMessage(note);params.delete("threads");window.history.replaceState({},"",`${window.location.pathname}${params.toString()?`?${params}`:""}${window.location.hash}`);}
    void load();
  },[load]);

  async function save(){
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/admin/setup/threads-publishing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({appId,appSecret})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Threads credentials could not be saved.");
      setStatus(d.status);setAppId("");setAppSecret("");setMessage("Threads app credentials saved securely.");
    }catch(error){setMessage(error instanceof Error?error.message:"Threads credentials could not be saved.");}
    finally{setBusy(false);}
  }

  return <section className="admin-card social-publishing-credentials" id="threads-publishing">
    <div className="credential-heading">
      <div><span className="section-kicker">Threads API</span><h2>Threads publishing</h2><p>Store the Threads App credentials once, then authorize @apostolicguide through Meta OAuth for direct posting and scheduled publishing.</p></div>
      <div className="credential-security"><KeyRound size={16}/><span>Server-only secret store</span></div>
    </div>
    {message?<div className="admin-notice credential-notice">{message}</div>:null}
    <div className="credential-status-row">
      <span className={status?.appConfigured?"credential-status is-ready":"credential-status"}>{status?.appConfigured?<CheckCircle2 size={14}/>:<CircleAlert size={14}/>} App credentials {status?.appConfigured?"stored":"missing"}</span>
      <span className={status?.accountAuthorized?"credential-status is-ready":"credential-status"}>{status?.accountAuthorized?<CheckCircle2 size={14}/>:<CircleAlert size={14}/>} Account {status?.accountAuthorized?"authorized":"not authorized"}</span>
    </div>
    {status?.accountLabel?<div className="credential-account-label">Account: <strong>{status.accountLabel}</strong></div>:null}
    <div className="credential-oauth-note">
      <div><Link2 size={14}/><strong>Meta Threads callback URLs</strong></div>
      <code>{CALLBACK}</code><code>{UNINSTALL}</code><code>{DELETE}</code>
      <small>Use these exact URLs in the Threads use-case settings in Meta Developer.</small>
    </div>
    <div className="credential-fields">
      <label><span>Threads App ID{status?.fields?.appId?<em>Stored</em>:null}</span><input value={appId} onChange={e=>setAppId(e.target.value)} placeholder={status?.fields?.appId?"Stored securely · enter only to replace":"Threads App ID"}/></label>
      <label><span>Threads App Secret{status?.fields?.appSecret?<em>Stored</em>:null}</span><input type="password" autoComplete="off" value={appSecret} onChange={e=>setAppSecret(e.target.value)} placeholder={status?.fields?.appSecret?"Stored securely · enter only to replace":"Threads App Secret"}/></label>
    </div>
    <div className="credential-platform-footer">
      <small>{status?.updatedAt?`Last verified ${new Date(status.updatedAt).toLocaleString()}`:"Not connected yet."}</small>
      <div className="credential-actions">
        <a className="button" aria-disabled={!status?.appConfigured||busy} href={status?.appConfigured&&!busy?"/api/admin/meta/threads/connect":undefined}>{status?.accountAuthorized?"Reconnect Threads":"Connect Threads"}</a>
        <button type="button" className="button primary" disabled={busy} onClick={()=>void save()}>{busy?<Loader2 className="spin" size={15}/>:<Save size={15}/>} Save Threads</button>
      </div>
    </div>
  </section>;
}
