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

function driveTemplateThroughEditor(template: TemplateId) {
  const select = document.querySelector<HTMLSelectElement>(".carousel-studio-master .creative-visual-controls > label:first-child select");
  if (!select) return false;

  if (![...select.options].some((option) => option.value === template)) {
    const option = document.createElement("option");
    option.value = template;
    option.textContent = template;
    option.dataset.carouselTemplateBridge = "true";
    select.appendChild(option);
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (nativeSetter) nativeSetter.call(select, template);
  else select.value = template;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
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
    {error ? <p className="is-error">{error}</p> : disabled ? <p>Saving art direction…</p> : <p>Pick a direction and the preview updates immediately. Carousel Studio autosaves the choice with the project.</p>}
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
    const timer = window.setInterval(sync, 250);
    return () => window.clearInterval(timer);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void requestProject(projectId).then((project) => {
      if (cancelled) return;
      const template = normalizeTemplate(project.editorState.visualSettings?.style || project.editorState.visualSettings?.template);
      setSelected(template);
      applyTemplateToDom(template);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Template state could not be loaded."); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => { if (projectId) applyTemplateToDom(selected); }, [projectId, selected, target]);

  useEffect(() => {
    if (saving && saveReady) setSaving(null);
  }, [saveReady, saving]);

  const disabled = !saveReady || Boolean(saving);
  const picker = useMemo(() => <TemplatePicker selected={selected} disabled={disabled} saving={saving} error={error} onPick={(template) => {
    if (!projectId || disabled || template === selected) return;
    setSaving(template);
    setSaveReady(false);
    setError("");
    setSelected(template);
    applyTemplateToDom(template);
    if (!driveTemplateThroughEditor(template)) {
      setError("Carousel editor state could not be reached. Refresh once and try again.");
      setSaving(null);
      setSaveReady(true);
    }
  }}/>, [disabled, error, projectId, saving, selected]);

  if (!target || !projectId) return null;
  return createPortal(picker, target);
}
