"use client";

import { Check, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

type CreativeProject = {
  id: string;
  title: string;
  pathwaySlug: string;
  intent: string;
  format: string;
  destination: string;
  editorState: {
    frames: unknown[];
    visualSettings: Record<string, unknown>;
    sourceImages: unknown[];
    generatedText?: Record<string, unknown>;
    destinationSettings?: Record<string, unknown>;
  };
  unifiedCaption: string;
  cta: string;
  tags: string[];
  stateVersion: number;
};

type TemplateId = "street-theology" | "editorial-white" | "cinematic" | "verse-connection" | "manifesto";

type Template = { id: TemplateId; label: string; description: string; surface: "dark" | "light" };

const TEMPLATES: Template[] = [
  { id: "street-theology", label: "Street Theology", description: "Texture + hard type", surface: "dark" },
  { id: "editorial-white", label: "Brand White Editorial", description: "Brand white + editorial", surface: "light" },
  { id: "cinematic", label: "Cinematic", description: "Dark + restrained", surface: "dark" },
  { id: "verse-connection", label: "Verse Connection", description: "Paired verses", surface: "light" },
  { id: "manifesto", label: "Manifesto", description: "Single statement", surface: "dark" }
];

function normalizeTemplate(value: unknown): TemplateId {
  if (value === "street-theology" || value === "editorial-white" || value === "cinematic" || value === "verse-connection" || value === "manifesto") return value;
  if (value === "street") return "street-theology";
  if (value === "editorial") return "editorial-white";
  if (value === "verse") return "verse-connection";
  return "editorial-white";
}

function applyTemplateToDom(template: TemplateId) {
  const shell = document.querySelector<HTMLElement>(".creative-studio-shell");
  if (shell) shell.dataset.creativeTemplate = template;
}

async function requestProject(id: string) {
  const response = await fetch(`/api/admin/creative-projects/${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.project) throw new Error(data.error || "Creative Project could not be loaded.");
  return data.project as CreativeProject;
}

async function persistTemplate(id: string, template: TemplateId) {
  const current = await requestProject(id);
  const response = await fetch(`/api/admin/creative-projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      expectedStateVersion: current.stateVersion,
      title: current.title,
      pathwaySlug: current.pathwaySlug,
      intent: current.intent,
      format: current.format,
      destination: current.destination,
      editorState: {
        ...current.editorState,
        visualSettings: {
          ...(current.editorState.visualSettings || {}),
          style: template,
          template,
          texture: template === "editorial-white" || template === "verse-connection" ? "ag-paper-white" : template === "cinematic" ? "ag-navy-speckle" : "ag-navy-paper"
        }
      },
      unifiedCaption: current.unifiedCaption,
      cta: current.cta,
      tags: current.tags
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.project) throw new Error(data.error || "Template could not be saved.");
  return data.project as CreativeProject;
}

function TemplatePicker({ selected, disabled, saving, error, onPick }: {
  selected: TemplateId;
  disabled: boolean;
  saving: TemplateId | null;
  error: string;
  onPick: (template: TemplateId) => void;
}) {
  return <section className="creative-template-system" aria-label="Creative templates">
    <div className="creative-template-head">
      <div><span>Art direction</span><strong>Carousel Studio templates</strong></div>
      <small>Saved with this project</small>
    </div>
    <div className="creative-template-grid">
      {TEMPLATES.map((template) => <button
        type="button"
        key={template.id}
        className={selected === template.id ? "is-active" : ""}
        data-template-surface={template.surface}
        disabled={disabled}
        onClick={() => onPick(template.id)}
      >
        <i aria-hidden="true"/>
        <span><strong>{template.label}</strong><small>{template.description}</small></span>
        {saving === template.id ? <Loader2 className="spin" size={14}/> : selected === template.id ? <Check size={14}/> : null}
      </button>)}
    </div>
    {error ? <p className="is-error">{error}</p> : disabled ? <p>Finish the current autosave before changing art direction.</p> : <p>These are the original Carousel Studio directions, now attached to the persistent Creative Project and its renders.</p>}
  </section>;
}

export function CreativeTemplateSystem({ projectId }: { projectId?: string | null }) {
  const [target, setTarget] = useState<Element | null>(null);
  const [selected, setSelected] = useState<TemplateId>("editorial-white");
  const [saving, setSaving] = useState<TemplateId | null>(null);
  const [saveReady, setSaveReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) {
      setTarget(null);
      return;
    }
    const sync = () => {
      const next = document.querySelector(".creative-preview-panel");
      setTarget((current) => current === next ? current : next);
      const indicator = document.querySelector(".creative-save-state");
      setSaveReady(Boolean(indicator?.classList.contains("is-saved")));
    };
    sync();
    const timer = window.setInterval(sync, 300);
    return () => window.clearInterval(timer);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void requestProject(projectId).then((project) => {
      if (cancelled) return;
      const template = normalizeTemplate(project.editorState.visualSettings?.template || project.editorState.visualSettings?.style);
      setSelected(template);
      applyTemplateToDom(template);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Template state could not be loaded."); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => { if (projectId) applyTemplateToDom(selected); }, [projectId, selected, target]);

  const disabled = !saveReady || Boolean(saving);
  const picker = useMemo(() => <TemplatePicker selected={selected} disabled={disabled} saving={saving} error={error} onPick={(template) => {
    if (!projectId || disabled || template === selected) return;
    setSaving(template);
    setError("");
    void persistTemplate(projectId, template).then(() => {
      setSelected(template);
      applyTemplateToDom(template);
      window.location.reload();
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Template could not be saved.")).finally(() => setSaving(null));
  }}/>, [disabled, error, projectId, saving, selected]);

  if (!target || !projectId) return null;
  return createPortal(picker, target);
}
