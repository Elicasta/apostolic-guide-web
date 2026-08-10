"use client";

import { Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CustomSegmentRecord, SegmentDefinition } from "@/segments";
import type { CustomSegmentRule, SegmentMatchMode } from "@/segment-rules";

type Props = {
  options: Array<Pick<SegmentDefinition, "key" | "label" | "category" | "count">>;
  saved: CustomSegmentRecord[];
};

const blankRule = (segmentKey = "all"): CustomSegmentRule => ({ segment_key: segmentKey, negate: false });

export function CustomSegmentBuilder({ options, saved }: Props) {
  const firstKey = options[0]?.key ?? "all";
  const [id, setId] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [matchMode, setMatchMode] = useState<SegmentMatchMode>("all");
  const [rules, setRules] = useState<CustomSegmentRule[]>([blankRule(firstKey)]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const grouped = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const option of options) {
      const rows = map.get(option.category) ?? [];
      rows.push(option);
      map.set(option.category, rows);
    }
    return [...map.entries()];
  }, [options]);

  function reset() {
    setId(undefined);
    setName("");
    setDescription("");
    setMatchMode("all");
    setRules([blankRule(firstKey)]);
    setMessage("");
  }

  function edit(segment: CustomSegmentRecord) {
    setId(segment.id);
    setName(segment.name);
    setDescription(segment.description ?? "");
    setMatchMode(segment.match_mode);
    setRules(segment.rules.length ? segment.rules : [blankRule(firstKey)]);
    setMessage("");
    document.getElementById("custom-segment-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateRule(index: number, patch: Partial<CustomSegmentRule>) {
    setRules((current) => current.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  }

  async function save() {
    if (!name.trim() || !rules.length) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/segments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", id, name: name.trim(), description: description.trim(), match_mode: matchMode, rules })
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error ?? "Could not save segment.");
      return;
    }
    setMessage(id ? "Segment updated." : "Segment created.");
    window.setTimeout(() => window.location.reload(), 350);
  }

  async function remove(segmentId: string) {
    if (!window.confirm("Delete this custom segment? People records will not be deleted.")) return;
    setBusy(true);
    const response = await fetch("/api/admin/segments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", id: segmentId })
    });
    setBusy(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setMessage(result.error ?? "Could not delete segment.");
      return;
    }
    window.location.reload();
  }

  return <section className="admin-card custom-segment-builder" id="custom-segment-builder">
    <div className="card-heading custom-segment-heading">
      <div><span className="section-kicker">Custom audiences</span><h2>{id ? "Edit custom segment" : "Build custom segment"}</h2><p>Combine any live segment with AND/OR logic. Exclude conditions to create rules such as Instagram + Studying now + NOT Subscriber.</p></div>
      {id ? <button className="button button-outline" type="button" onClick={reset}><X size={15}/> Cancel edit</button> : null}
    </div>

    <div className="custom-segment-form">
      <div className="custom-segment-meta">
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Engaged Instagram non-subscribers" maxLength={120}/></label>
        <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="People worth inviting into the next study" maxLength={500}/></label>
        <label>Match<select value={matchMode} onChange={(event) => setMatchMode(event.target.value as SegmentMatchMode)}><option value="all">ALL conditions</option><option value="any">ANY condition</option></select></label>
      </div>

      <div className="custom-segment-rules">
        {rules.map((rule, index) => <div className="custom-segment-rule" key={`${index}:${rule.segment_key}`}>
          <span className="custom-rule-join">{index === 0 ? "Where" : matchMode === "all" ? "AND" : "OR"}</span>
          <select value={rule.negate ? "exclude" : "include"} onChange={(event) => updateRule(index, { negate: event.target.value === "exclude" })} aria-label="Include or exclude"><option value="include">is in</option><option value="exclude">is not in</option></select>
          <select value={rule.segment_key} onChange={(event) => updateRule(index, { segment_key: event.target.value })} aria-label="Segment condition">
            {grouped.map(([category, rows]) => <optgroup label={category} key={category}>{rows.map((option) => <option value={option.key} key={option.key}>{option.label} ({option.count})</option>)}</optgroup>)}
          </select>
          <button className="custom-rule-remove" type="button" title="Remove condition" aria-label="Remove condition" onClick={() => setRules((current) => current.length === 1 ? current : current.filter((_, i) => i !== index))} disabled={rules.length === 1}><X size={15}/></button>
        </div>)}
      </div>

      <div className="custom-segment-actions">
        <button className="button button-outline" type="button" onClick={() => rules.length < 20 && setRules((current) => [...current, blankRule(firstKey)])} disabled={rules.length >= 20}><Plus size={15}/> Add condition</button>
        <div><span>{message}</span><button className="button button-crimson" type="button" onClick={save} disabled={busy || !name.trim() || !rules.length}><Save size={15}/>{busy ? "Saving…" : id ? "Update segment" : "Save segment"}</button></div>
      </div>
    </div>

    {saved.length ? <div className="custom-segment-saved"><div className="custom-segment-saved-head"><strong>Saved custom segments</strong><span>{saved.length}</span></div>{saved.map((segment) => <div className="custom-segment-saved-row" key={segment.id}><div><strong>{segment.name}</strong><span>{segment.match_mode === "all" ? "ALL" : "ANY"} · {segment.rules.length} {segment.rules.length === 1 ? "condition" : "conditions"}</span></div><div><button type="button" onClick={() => edit(segment)}>Edit</button><button className="danger" type="button" onClick={() => remove(segment.id)} disabled={busy}><Trash2 size={14}/> Delete</button></div></div>)}</div> : null}
  </section>;
}
