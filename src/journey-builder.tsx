"use client";

import { useMemo, useState } from "react";
import { ArrowDown, Clock3, Flag, PauseCircle, Plus, Route, Tag, UserRoundCheck, X } from "lucide-react";
import type { GrowthJourney, GrowthJourneyStep, JourneyStepType, JourneyTriggerType } from "@/growth-journeys";

const STEP_OPTIONS: Array<{ type: JourneyStepType; label: string }> = [
  { type: "add_tag", label: "Add tag" },
  { type: "remove_tag", label: "Remove tag" },
  { type: "set_status", label: "Set person status" },
  { type: "wait", label: "Wait" },
  { type: "manual_task", label: "Manual follow-up" },
  { type: "mark_complete", label: "Complete journey" }
];

type EditableStep = { name: string; stepType: JourneyStepType; config: Record<string, unknown> };

function fromStep(step: GrowthJourneyStep): EditableStep { return { name: step.name, stepType: step.step_type, config: step.config ?? {} }; }

function StepIcon({ type }: { type: JourneyStepType }) {
  if (type === "wait") return <Clock3 size={17}/>;
  if (type === "add_tag" || type === "remove_tag") return <Tag size={17}/>;
  if (type === "set_status") return <UserRoundCheck size={17}/>;
  if (type === "manual_task") return <PauseCircle size={17}/>;
  return <Flag size={17}/>;
}

export function NewJourneyForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(form: FormData) {
    setBusy(true); setError("");
    const triggerType = String(form.get("triggerType")) as JourneyTriggerType;
    const keyword = String(form.get("keyword") ?? "").trim();
    const response = await fetch("/api/admin/journeys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), triggerType, triggerConfig: keyword ? { keywords: [keyword], match_type: "contains" } : {} }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "Could not create journey."); setBusy(false); return; }
    window.location.assign(`/admin/journeys/${result.id}`);
  }
  return <form className="journey-new-form" action={submit}>
    <div><label>Journey name<input name="name" placeholder="Jesus Is God follow-up" required /></label><label>Entry trigger<select name="triggerType" defaultValue="manual"><option value="manual">Manual enrollment</option><option value="instagram_comment_keyword">Instagram comment keyword</option><option value="instagram_dm_keyword">Instagram DM keyword</option><option value="person_tag">Person tag</option></select></label></div>
    <label>Description<textarea name="description" placeholder="What should this journey accomplish?" /></label>
    <label>Trigger keyword or tag<input name="keyword" placeholder="JESUS" /></label>
    <button className="button button-crimson" disabled={busy}>{busy ? "Creating…" : "Create journey"}</button>
    {error ? <p className="form-error">{error}</p> : null}
  </form>;
}

export function JourneyEditor({ journey, initialSteps }: { journey: GrowthJourney; initialSteps: GrowthJourneyStep[] }) {
  const [name, setName] = useState(journey.name);
  const [description, setDescription] = useState(journey.description ?? "");
  const [status, setStatus] = useState(journey.status);
  const [triggerType, setTriggerType] = useState<JourneyTriggerType>(journey.trigger_type);
  const initialKeywords = Array.isArray(journey.trigger_config?.keywords) ? journey.trigger_config.keywords.map(String).join(", ") : "";
  const [keywords, setKeywords] = useState(initialKeywords);
  const [matchType, setMatchType] = useState(String(journey.trigger_config?.match_type ?? "contains"));
  const [steps, setSteps] = useState<EditableStep[]>(initialSteps.map(fromStep));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const activeTriggerNeedsKeyword = triggerType !== "manual";
  const canActivate = useMemo(() => !activeTriggerNeedsKeyword || keywords.split(",").some((v) => v.trim()), [activeTriggerNeedsKeyword, keywords]);

  function addStep(type: JourneyStepType) {
    const defaults: Record<JourneyStepType, EditableStep> = {
      add_tag: { name: "Add interest tag", stepType: "add_tag", config: { tag: "" } },
      remove_tag: { name: "Remove tag", stepType: "remove_tag", config: { tag: "" } },
      set_status: { name: "Update lifecycle", stepType: "set_status", config: { status: "lead" } },
      wait: { name: "Wait", stepType: "wait", config: { minutes: 1440 } },
      manual_task: { name: "Manual follow-up", stepType: "manual_task", config: { instruction: "Review this person and follow up." } },
      mark_complete: { name: "Complete journey", stepType: "mark_complete", config: {} }
    };
    setSteps((current) => [...current, defaults[type]]);
  }

  function patchStep(index: number, patch: Partial<EditableStep>) { setSteps((current) => current.map((step, i) => i === index ? { ...step, ...patch } : step)); }
  function patchConfig(index: number, key: string, value: unknown) { setSteps((current) => current.map((step, i) => i === index ? { ...step, config: { ...step.config, [key]: value } } : step)); }

  async function save() {
    setBusy(true); setMessage("");
    const triggerConfig = triggerType === "manual" ? {} : { keywords: keywords.split(",").map((v) => v.trim()).filter(Boolean), match_type: matchType };
    const response = await fetch("/api/admin/journeys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", id: journey.id, name, description, status, triggerType, triggerConfig, steps }) });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage(result.error ?? "Could not save journey."); return; }
    setMessage("Saved."); window.setTimeout(() => window.location.reload(), 300);
  }

  return <div className="journey-editor">
    <section className="admin-card publishing-card journey-settings-card">
      <div className="card-heading"><div><span className="section-kicker">Journey settings</span><h2>Entry & status</h2></div><p>Journeys track relationship progression. Automated outbound messaging stays in Social Automations until channel policy windows are modeled safely.</p></div>
      <div className="journey-settings-grid">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Status<select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="draft">Draft</option><option value="active" disabled={!canActivate}>Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
        <label>Trigger<select value={triggerType} onChange={(e) => setTriggerType(e.target.value as JourneyTriggerType)}><option value="manual">Manual enrollment</option><option value="instagram_comment_keyword">Instagram comment keyword</option><option value="instagram_dm_keyword">Instagram DM keyword</option><option value="person_tag">Person tag</option></select></label>
        {activeTriggerNeedsKeyword ? <label>Keywords / tags<input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="JESUS, GOD" /></label> : <div/>}
        {triggerType.startsWith("instagram_") ? <label>Match<select value={matchType} onChange={(e) => setMatchType(e.target.value)}><option value="contains">Contains</option><option value="exact">Exact</option><option value="starts_with">Starts with</option></select></label> : null}
        <label className="journey-description-field">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      </div>
    </section>

    <section className="admin-card publishing-card">
      <div className="card-heading"><div><span className="section-kicker">Flow</span><h2>Journey steps</h2></div><p>Steps execute in order. Waits resume automatically. Manual tasks pause until you mark them complete.</p></div>
      <div className="journey-canvas">
        <div className="journey-trigger-node"><Route size={18}/><div><strong>{triggerType.replaceAll("_", " ")}</strong><span>{keywords || "Manual enrollment"}</span></div></div>
        {steps.map((step, index) => <div key={`${index}-${step.stepType}`} className="journey-step-wrap">
          <ArrowDown size={17} className="journey-arrow"/>
          <div className="journey-step-node">
            <div className="journey-step-icon"><StepIcon type={step.stepType}/></div>
            <div className="journey-step-fields">
              <input className="journey-step-name" value={step.name} onChange={(e) => patchStep(index, { name: e.target.value })} />
              {step.stepType === "wait" ? <label>Minutes<input type="number" min="1" value={Number(step.config.minutes ?? 60)} onChange={(e) => patchConfig(index, "minutes", Number(e.target.value))} /></label> : null}
              {(step.stepType === "add_tag" || step.stepType === "remove_tag") ? <label>Tag<input value={String(step.config.tag ?? "")} onChange={(e) => patchConfig(index, "tag", e.target.value)} placeholder="Jesus Is God" /></label> : null}
              {step.stepType === "set_status" ? <label>Status<select value={String(step.config.status ?? "lead")} onChange={(e) => patchConfig(index, "status", e.target.value)}><option value="lead">Lead</option><option value="subscriber">Subscriber</option><option value="app_user">App user</option><option value="inactive">Inactive</option></select></label> : null}
              {step.stepType === "manual_task" ? <label>Instruction<textarea value={String(step.config.instruction ?? "")} onChange={(e) => patchConfig(index, "instruction", e.target.value)} /></label> : null}
            </div>
            <button type="button" className="journey-remove-step" onClick={() => setSteps((current) => current.filter((_, i) => i !== index))} aria-label="Remove step"><X size={16}/></button>
          </div>
        </div>)}
        <ArrowDown size={17} className="journey-arrow"/>
        <div className="journey-add-row">{STEP_OPTIONS.map((option) => <button type="button" key={option.type} onClick={() => addStep(option.type)}><Plus size={14}/>{option.label}</button>)}</div>
      </div>
      <div className="journey-save-bar"><span>{message}</span><button className="button button-crimson" onClick={save} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save journey"}</button></div>
    </section>
  </div>;
}
