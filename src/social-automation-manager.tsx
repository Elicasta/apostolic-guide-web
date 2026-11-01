"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Copy, Instagram, MessageCircle, MessageSquareReply, Pencil, Plus, Power, Send, Trash2 } from "lucide-react";
import type { InstagramConnection, SocialAutomation, SocialMatchType, SocialTriggerType } from "@/social-messaging";
import { buildStudyHandshake, studyTitleFromDestination } from "@/social-signature-flow";
import { buildPublicGuideAcknowledgement } from "@/comment-guide";

export type SocialLinkSource = { label: string; url: string; kind: string };

type Draft = {
  id?: string;
  name: string;
  triggerType: SocialTriggerType;
  keywords: string;
  matchType: SocialMatchType;
  replyText: string;
  destinationUrl: string;
  enabled: boolean;
};

const emptyDraft: Draft = {
  name: "",
  triggerType: "comment_keyword",
  keywords: "",
  matchType: "exact",
  replyText: "Thanks for reaching out. Here’s the study:",
  destinationUrl: "",
  enabled: false
};

function finalReply(draft: Draft) {
  const text = draft.replyText.trim();
  const url = draft.destinationUrl.trim();
  return url && !text.includes(url) ? `${text}\n\n${url}` : text;
}

function usesSignatureFlow(draft: Draft) {
  return draft.triggerType === "comment_keyword" && Boolean(draft.destinationUrl.trim());
}

export function SocialAutomationManager({
  automations,
  connection,
  sources,
  canManageAutomations = true,
  canManageConnection = true
}: {
  automations: SocialAutomation[];
  connection: InstagramConnection;
  sources: SocialLinkSource[];
  canManageAutomations?: boolean;
  canManageConnection?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [connectionForm, setConnectionForm] = useState({
    appSecret: "",
    accessToken: "",
    instagramUserId: connection.instagramUserId ?? "",
    verifyToken: connection.verifyToken,
    graphVersion: connection.graphVersion
  });
  const [state, setState] = useState<"idle" | "working" | "error" | "success">("idle");
  const [message, setMessage] = useState("");
  const callbackUrl = "https://www.apostolicguide.com/api/webhooks/meta/instagram";
  const keywords = useMemo(() => draft.keywords.split(",").map((value) => value.trim()).filter(Boolean), [draft.keywords]);
  const signatureFlow = usesSignatureFlow(draft);
  const studyTitle = studyTitleFromDestination(draft.destinationUrl, draft.name.replace(/[!]+$/g, "") || "Apostolic Guide Study");

  async function api(payload: unknown) {
    const response = await fetch("/api/admin/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Operation failed.");
    return result;
  }

  async function saveConnection() {
    if (!canManageConnection) return;
    setState("working"); setMessage("");
    try {
      await api({ action: "save_connection", ...connectionForm });
      setState("success"); setMessage("Instagram credentials saved. Now verify the account and webhook subscription.");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Connection save failed."); }
  }

  async function verifyConnection() {
    if (!canManageConnection) return;
    setState("working"); setMessage("");
    try {
      const result = await api({ action: "verify_connection" });
      setState("success"); setMessage(`Connected${result.connection?.username ? ` to @${result.connection.username}` : ""} and subscribed to Instagram message/comment webhooks.`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Instagram verification failed."); }
  }

  async function saveAutomation() {
    if (!canManageAutomations || !draft.name.trim() || !keywords.length || !draft.replyText.trim()) return;
    setState("working"); setMessage("");
    try {
      await api({
        action: draft.id ? "update_automation" : "create_automation",
        ...(draft.id ? { id: draft.id } : {}),
        automation: {
          name: draft.name,
          triggerType: draft.triggerType,
          keywords,
          matchType: draft.matchType,
          replyText: draft.replyText,
          destinationUrl: draft.destinationUrl,
          enabled: draft.enabled
        }
      });
      setState("success"); setMessage(draft.id ? "Automation updated." : "Automation created.");
      setDraft(emptyDraft);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Automation save failed."); }
  }

  async function toggle(id: string, enabled: boolean) {
    if (!canManageAutomations) return;
    try { await api({ action: "toggle_automation", id, enabled }); window.location.reload(); }
    catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Could not update automation."); }
  }

  async function remove(id: string, name: string) {
    if (!canManageAutomations) return;
    if (!window.confirm(`Delete “${name}”? This stops the automation permanently.`)) return;
    try { await api({ action: "delete_automation", id }); window.location.reload(); }
    catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Could not delete automation."); }
  }

  function edit(item: SocialAutomation) {
    if (!canManageAutomations) return;
    setDraft({
      id: item.id,
      name: item.name,
      triggerType: item.trigger_type,
      keywords: item.keywords.join(", "),
      matchType: item.trigger_type === "comment_keyword" ? "exact" : item.match_type,
      replyText: item.reply_text,
      destinationUrl: item.destination_url ?? "",
      enabled: item.enabled
    });
    document.getElementById("social-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="social-admin-stack">
      <section className="admin-card social-connection-card">
        <div className="social-connection-head">
          <div><span className="section-kicker">Instagram connection</span><h2>{connection.configured ? (connection.username ? `@${connection.username}` : "Instagram configured") : "Connect Instagram"}</h2><p>{canManageConnection ? "Use a professional Instagram account and a Meta Business app. Secrets stay server-side and are never returned to the browser after saving." : "Connection credentials are restricted to Studio owners and admins."}</p></div>
          <span className={connection.webhookSubscribed ? "social-connection-badge ready" : "social-connection-badge"}>{connection.webhookSubscribed ? <CheckCircle2 size={16} /> : <Instagram size={16} />}{connection.webhookSubscribed ? "Connected" : "Setup required"}</span>
        </div>

        <div className="social-webhook-box"><div><strong>Meta webhook callback</strong><code>{callbackUrl}</code></div><button type="button" onClick={() => navigator.clipboard.writeText(callbackUrl)} title="Copy callback URL"><Copy size={16} /></button></div>
        {canManageConnection ? <div className="social-webhook-box"><div><strong>Verify token</strong><code>{connection.verifyToken}</code></div><button type="button" onClick={() => navigator.clipboard.writeText(connection.verifyToken)} title="Copy verify token"><Copy size={16} /></button></div> : null}

        {canManageConnection ? <details className="social-connection-details" open={!connection.configured}>
          <summary>{connection.configured ? "Update connection credentials" : "Enter Meta credentials"}</summary>
          <div className="social-connection-form">
            <label>Instagram professional account ID<input value={connectionForm.instagramUserId} onChange={(e) => setConnectionForm({ ...connectionForm, instagramUserId: e.target.value })} placeholder="1784…" /></label>
            <label>Graph API version<input value={connectionForm.graphVersion} onChange={(e) => setConnectionForm({ ...connectionForm, graphVersion: e.target.value })} placeholder="v24.0" /></label>
            <label>Instagram access token<input type="password" value={connectionForm.accessToken} onChange={(e) => setConnectionForm({ ...connectionForm, accessToken: e.target.value })} placeholder={connection.hasAccessToken ? "Saved. Leave blank to keep current token." : "Paste access token"} /></label>
            <label>Meta app secret<input type="password" value={connectionForm.appSecret} onChange={(e) => setConnectionForm({ ...connectionForm, appSecret: e.target.value })} placeholder={connection.hasAppSecret ? "Saved. Leave blank to keep current secret." : "Paste app secret"} /></label>
            <label>Webhook verify token<input value={connectionForm.verifyToken} onChange={(e) => setConnectionForm({ ...connectionForm, verifyToken: e.target.value })} /></label>
            <div className="social-connection-actions"><button className="button button-outline" type="button" onClick={saveConnection} disabled={state === "working"}>Save credentials</button><button className="button button-crimson" type="button" onClick={verifyConnection} disabled={state === "working" || (!connection.configured && (!connectionForm.accessToken || !connectionForm.appSecret || !connectionForm.instagramUserId))}>Verify & subscribe webhooks</button></div>
          </div>
        </details> : null}
        {connection.lastError ? <p className="form-error">{connection.lastError}</p> : null}
      </section>

      {canManageAutomations ? <section className="admin-card publishing-card" id="social-composer">
        <div className="card-heading"><div><span className="section-kicker">Keyword automation</span><h2>{draft.id ? "Edit automation" : "Create automation"}</h2></div><p>Comment keywords are passed to Sol and must look like an explicit guide request. Direct-message rules keep the matching behavior and reply text you define.</p></div>
        <div className="social-composer-grid">
          <div className="social-fields">
            <label>Automation name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Send Jesus Is God study" /></label>
            <div className="form-row">
              <label>Trigger<select value={draft.triggerType} onChange={(e) => { const triggerType = e.target.value as SocialTriggerType; setDraft({ ...draft, triggerType, matchType: triggerType === "comment_keyword" ? "exact" : draft.matchType }); }}><option value="comment_keyword">Instagram comment keyword</option><option value="dm_keyword">Instagram DM keyword</option></select></label>
              <label>Match<select value={draft.matchType} onChange={(e) => setDraft({ ...draft, matchType: e.target.value as SocialMatchType })} disabled={draft.triggerType === "comment_keyword"}>{draft.triggerType === "comment_keyword" ? <option value="exact">Sol safe request gate</option> : <><option value="contains">Contains keyword</option><option value="exact">Exact message</option><option value="starts_with">Starts with keyword</option></>}</select></label>
            </div>
            <label>Keywords<input value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} placeholder="JESUS, GOD, STUDY" /><small>{draft.triggerType === "comment_keyword" ? "Separate with commas. Sol sees every comment, but delivery fires only for a short explicit request such as JESUS or “send me the Jesus guide.”" : "Separate multiple keywords with commas. Matching is case-insensitive."}</small></label>
            <label>{signatureFlow ? "Fallback reply message" : "Reply message"}<textarea value={draft.replyText} onChange={(e) => setDraft({ ...draft, replyText: e.target.value })} placeholder="Thanks for commenting. Here’s the study:" /><small>{signatureFlow ? "This study-link comment rule uses the AG signature handshake first. This text remains available as the rule’s fallback copy." : "This text is sent directly when the rule matches."}</small></label>
            <label>Link target<select value={sources.some((source) => source.url === draft.destinationUrl) ? draft.destinationUrl : "custom"} onChange={(e) => e.target.value !== "custom" && setDraft({ ...draft, destinationUrl: e.target.value })}><option value="custom">Custom / no link</option>{sources.map((source) => <option key={source.url} value={source.url}>{source.kind} · {source.label}</option>)}</select></label>
            <label>Destination URL<input type="url" value={draft.destinationUrl} onChange={(e) => setDraft({ ...draft, destinationUrl: e.target.value })} placeholder="https://apostolicguide.com/pathways/..." /><small>{signatureFlow ? "The URL stays hidden until the branded card, where it becomes the Open the Study button." : "A direct reply may include this URL."}</small></label>
            <label className="publish-toggle"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /><span><strong>Enable immediately</strong><small>Leave off while testing copy and Meta setup.</small></span></label>
          </div>
          <aside className="social-preview">
            <span className="section-kicker">Instagram preview</span>
            <div className="ig-preview-phone">
              <div className="ig-preview-account"><Instagram size={18} /><strong>Apostolic Guide</strong></div>
              <div className="ig-preview-trigger"><small>{draft.triggerType === "comment_keyword" ? "COMMENT" : "DM"}</small><p>{keywords[0] || "JESUS"}</p></div>
              {signatureFlow ? <>
                <div className="ig-preview-reply"><p>{buildPublicGuideAcknowledgement(studyTitle)}</p></div>
                <div className="ig-preview-reply"><p>{buildStudyHandshake(studyTitle)}</p></div>
                <div className="ig-preview-trigger ig-preview-open"><small>REPLY</small><p>OPEN</p></div>
                <div className="ig-study-card-preview"><span>APOSTOLIC GUIDE</span><strong>{studyTitle}</strong><p>Scripture first. Questions welcome.</p><button type="button">Open the Study</button></div>
                <div className="ig-preview-reply"><p>If a verse raises a question, send it here. I’ll point you back to Scripture.</p></div>
              </> : <div className="ig-preview-reply"><p>{finalReply(draft) || "Your automated reply will appear here."}</p></div>}
            </div>
            <div className="social-rule-summary"><MessageSquareReply size={17} /><div><strong>{signatureFlow ? "Sol + AG signature study flow" : draft.triggerType === "comment_keyword" ? "Sol safe request gate" : "Direct message reply"}</strong><span>{signatureFlow ? "Public acknowledgement → private handshake → OPEN → branded card" : keywords.length ? `${keywords.length} keyword${keywords.length === 1 ? "" : "s"}` : "Add at least one keyword"}</span></div></div>
          </aside>
        </div>
        <div className="broadcast-actions"><button className="button button-outline" type="button" onClick={() => setDraft(emptyDraft)}>{draft.id ? "Cancel edit" : "Clear"}</button><button className="button button-crimson" type="button" onClick={saveAutomation} disabled={state === "working" || !draft.name.trim() || !keywords.length || !draft.replyText.trim()}><Plus size={16} /> {draft.id ? "Save automation" : "Create automation"}</button></div>
      </section> : <section className="admin-card role-readonly-note"><strong>Read-only access</strong><p>Your Studio role can review automation status and activity but cannot create or change Instagram automations.</p></section>}

      <section className="admin-card publishing-card">
        <div className="card-heading"><div><span className="section-kicker">Automation library</span><h2>Instagram automations</h2></div><p>{canManageAutomations ? "Turn rules on or off without deleting them. Only one best matching rule runs for each incoming event." : "Review the rules currently configured for Instagram."}</p></div>
        {automations.length ? <div className="social-automation-list">{automations.map((item) => { const signature = item.trigger_type === "comment_keyword" && Boolean(item.destination_url); return <div className="social-automation-row" key={item.id}><div className="social-automation-icon">{item.trigger_type === "comment_keyword" ? <MessageCircle size={19} /> : <Send size={19} />}</div><div className="social-automation-copy"><span className="content-kind">{signature ? "AG signature flow" : item.trigger_type === "comment_keyword" ? "Comment keyword" : "DM keyword"}</span><strong>{item.name}</strong><p><b>{item.keywords.join(", ")}</b> → {signature ? "handshake → OPEN → branded study card" : `${item.reply_text}${item.destination_url ? " + link" : ""}`}</p></div>{canManageAutomations ? <div className="social-automation-actions"><button className={item.enabled ? "mini-toggle on" : "mini-toggle"} type="button" onClick={() => toggle(item.id, !item.enabled)} title={item.enabled ? "Disable" : "Enable"}><Power size={15} />{item.enabled ? "On" : "Off"}</button><button type="button" onClick={() => edit(item)} title="Edit"><Pencil size={16} /></button><button type="button" onClick={() => remove(item.id, item.name)} title="Delete"><Trash2 size={16} /></button></div> : <span className={item.enabled ? "status-pill" : "status-pill status-pending"}>{item.enabled ? "On" : "Off"}</span>}</div>;})}</div> : <div className="empty-state"><MessageSquareReply size={24} /><strong>No social automations yet.</strong><p>{canManageAutomations ? "Create a keyword rule above. Keep it disabled until the Instagram connection verifies successfully." : "No Instagram rules have been created yet."}</p></div>}
      </section>

      {message ? <p className={state === "error" ? "form-error social-floating-message" : "form-success social-floating-message"}>{message}</p> : null}
    </div>
  );
}
