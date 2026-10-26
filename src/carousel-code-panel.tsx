"use client";
import { useEffect, useRef, useState } from "react";
import type { CreativeEditorState, CreativeFrame } from "./creative-project";
import {
  BUILTIN_CODE_ASSETS,
  codeTheme,
  initialCodeTheme,
  parseCodeJson,
  toCodeJson,
  type CarouselCodeJson,
  type CodeTheme,
} from "./carousel-code";
import { CodeFramePreview } from "./carousel-code-preview";
import { CAROUSEL_THEMES } from "./carousel-theme";
import styles from "./carousel-code-panel.module.css";
type Project = {
  id: string;
  title: string;
  status: string;
  stateVersion: number;
  pathwaySlug: string;
  editorState: CreativeEditorState;
};
type Preset = { id: string; name: string; theme: CodeTheme };
export function CarouselCodePanel({
  project,
  selectedId,
  onApply,
  onRestore,
  onFrame,
  onCodeFields,
  onSelectFrame,
  open,
  onOpenChange,
  busy = false,
}: {
  project: Project;
  selectedId: string;
  onApply: (json: CarouselCodeJson) => Promise<void>;
  onRestore: (revisionId: string) => Promise<void>;
  onFrame: (id: string, patch: Partial<CreativeFrame>) => void;
  onCodeFields: (id: string, patch: Partial<CodeTheme["overrides"][string]>) => void;
  busy?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFrame: (id: string) => void;
}) {
  const [theme, setTheme] = useState<CodeTheme>(
    () =>
      codeTheme(project.editorState) ||
      initialCodeTheme(
        String(project.editorState.visualSettings.style || "editorial-white"),
      ),
  );
  const [json, setJson] = useState(() => JSON.stringify(toCodeJson(project.title, project.editorState), null, 2));
  const [jsonDirty, setJsonDirty] = useState(false);
  const [showJson, setShowJson] = useState(true);
  const [message, setMessage] = useState("");
  const hasOpened = useRef(false);
  const [failed, setFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const [full, setFull] = useState(false);
  const [largeId, setLargeId] = useState<string | null>(null);
  const [tab, setTab] = useState("fields");
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [revisions, setRevisions] = useState<
    Array<{ id: string; version: number; change_summary: string }>
  >([]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasOpened.current) return;
      const saved =
        codeTheme(project.editorState) ||
        initialCodeTheme(
          String(project.editorState.visualSettings.style || "editorial-white"),
        );
      if (JSON.stringify(theme) !== JSON.stringify(saved) || jsonDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [theme, project.editorState, jsonDirty]);
  const selected =
    project.editorState.frames.find((f) => f.id === selectedId) ||
    project.editorState.frames[0];
  const override = theme.overrides[selected.id] || { html: "", css: "" };
  const readonly = project.status !== "draft";
  async function refresh() {
    const [p, r] = await Promise.all([
      fetch("/api/admin/carousel-code-presets").then((r) => r.json()),
      fetch(`/api/admin/creative-projects/${project.id}`).then((r) => r.json()),
    ]);
    if (p.presets) setPresets(p.presets);
    if (r.revisions) setRevisions(r.revisions);
    return r.project as Project | undefined;
  }
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (!hasOpened.current) {
        setTheme(
          codeTheme(project.editorState) ||
            initialCodeTheme(
              String(
                project.editorState.visualSettings.style || "editorial-white",
              ),
            ),
        );
        hasOpened.current = true;
      }
      void refresh().catch(() =>
        setMessage(
          "Could not load presets or revisions. Retry by reopening Code Mode.",
        ),
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [open, project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  function patchOverride(patch: Partial<typeof override>) {
    setTheme((t) => ({
      ...t,
      overrides: { ...t.overrides, [selected.id]: { ...override, ...patch } },
    }));
  }
  function currentJson() {
    return {
      ...toCodeJson(project.title, project.editorState),
      theme: { ...theme, enabled: true },
      frames: project.editorState.frames.map((f) => ({
        ...f,
        ...(theme.overrides[f.id] || { html: "", css: "" }),
      })),
    };
  }
  async function paste(setValue: (text: string) => void) {
    await run(async () => {
      if (!navigator.clipboard?.readText) throw new Error("Clipboard unavailable. Paste directly into the textarea.");
      setValue(await navigator.clipboard.readText());
      setMessage("Clipboard pasted. Review before Apply.");
    });
  }
  async function run(action: () => Promise<void>) {
    setWorking(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }
  async function apply(value: CarouselCodeJson = currentJson()) {
    await onApply(value);
    setTheme(value.theme);
    setJson(JSON.stringify(value, null, 2));
    setJsonDirty(false);
    setMessage("Applied and saved. Previous version is in revision history.");
    await refresh();
  }
  async function download(index?: number) {
    const r = await fetch(
      `/api/admin/creative-projects/${project.id}/code-render`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedStateVersion: project.stateVersion,
          frameIndex: index,
        }),
      },
    );
    if (!r.ok) {
      const v = await r.json();
      throw new Error(v.error || "Export failed");
    }
    let cleanupPath: string | undefined;
    let filename =
      index === undefined
        ? `${project.title.replace(/[^a-z0-9_-]+/gi, "-")}.zip`
        : `slide-${String(index + 1).padStart(2, "0")}.png`;
    let blob: Blob;
    if (r.headers.get("content-type")?.includes("application/json")) {
      const delivery = await r.json();
      cleanupPath = delivery.cleanupPath;
      filename = delivery.filename;
      const file = await fetch(delivery.downloadUrl);
      if (!file.ok)
        throw new Error("Export download failed. Retry the export.");
      blob = await file.blob();
    } else blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    if (cleanupPath)
      void fetch(`/api/admin/creative-projects/${project.id}/code-render`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: cleanupPath }),
      }).catch(() => undefined);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function upload(file: File) {
    if (file.size > 8 * 1024 * 1024)
      throw new Error("Upload an image of 8 MB or less.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const r = await fetch("/api/admin/pathway-assets/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pathwaySlug: project.pathwaySlug,
        studio: "carousel",
        assetType: "uploaded-image",
        title: file.name,
        sourceType: "uploaded",
        dataUrl,
      }),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error || "Upload failed");
    const url = v.asset?.public_url || v.asset?.preview_url;
    if (!url) throw new Error("Upload saved but has no public URL.");
    setTheme((t) => ({
      ...t,
      assets: [
        ...t.assets,
        {
          name: file.name,
          url: `/api/admin/carousel-code-assets/${v.asset.id}`,
          assetId: v.asset.id,
          resolvedUrl: url,
        },
      ],
    }));
    setMessage("Image uploaded. Apply to save its URL with this carousel.");
  }
  return (
    <section className={styles.panel} aria-label="Carousel Code Mode">
      <div className={styles.bar}>
        <strong>Code Mode</strong>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          {open ? "Close Code Mode" : "Open Code Mode"}
        </button>
      </div>
      {open && (
        <>
          <p className={styles.hint}>
            Text fields and buttons only. Apply saves this draft and preserves
            the previous version. Export uses the last saved version.
          </p>
          <fieldset disabled={working || busy || readonly}>
            <label>
              Preset
              <select
                aria-label="Code Mode preset"
                value="custom"
                onChange={(e) => {
                  const p = presets.find((p) => p.id === e.target.value);
                  setTheme(
                    p
                      ? {
                          ...p.theme,
                          overrides: theme.overrides,
                          assets: [
                            ...p.theme.assets,
                            ...theme.assets.filter(
                              (a) =>
                                !p.theme.assets.some((b) => a.url === b.url),
                            ),
                          ],
                        }
                      : {
                          ...initialCodeTheme(e.target.value),
                          overrides: theme.overrides,
                          assets: theme.assets,
                        },
                  );
                }}
              >
                <option value="custom">Custom Theme</option>
                {CAROUSEL_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Carousel template HTML
              <textarea aria-label="Carousel template HTML" rows={12} spellCheck={false} value={theme.template} onChange={e => setTheme({...theme, template: e.target.value})} />
            </label>
            <button type="button" onClick={() => void paste(text => setTheme({...theme, template: text}))}>Paste from clipboard · Carousel template HTML</button>
            <button type="button" onClick={() => setTheme({...theme, overrides: Object.fromEntries(Object.entries(theme.overrides).map(([id, value]) => [id, {...value, html: ""}]))})}>Clear all Frame HTML overrides</button>
            <p className={styles.hint}>Apply saves the shared template and cleared overrides. Frame CSS remains in effect.</p>
            <label>
              Carousel CSS
              <textarea
                aria-label="Carousel CSS"
                rows={18}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                value={theme.css}
                onChange={(e) => setTheme({ ...theme, css: e.target.value })}
              />
            </label>
            <button type="button" onClick={() => void paste(text => setTheme({...theme, css: text}))}>Paste from clipboard · Carousel CSS</button>
            <div className={styles.bar}>
              <button type="button" onClick={() => void run(() => apply())}>
                Apply
              </button>
              <button
                type="button"
                onClick={() =>
                  setTheme({
                    ...initialCodeTheme(theme.preset),
                    overrides: theme.overrides,
                    assets: theme.assets,
                  })
                }
              >
                Reset to preset
              </button>
              <button
                type="button"
                onClick={() => {
                  setJson(JSON.stringify(currentJson(), null, 2));
                  setShowJson(true);
                  setJsonDirty(false);
                }}
              >
                Refresh JSON from fields
              </button>
              <button
                type="button"
                onClick={() => setTheme({ ...theme, fitText: !theme.fitText })}
                aria-pressed={theme.fitText}
              >
                Auto-shrink headlines: {theme.fitText ? "On" : "Off"}
              </button>
            </div>
            <label>
              New preset name
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="My editorial theme"
              />
            </label>
            <button
              type="button"
              disabled={!presetName.trim()}
              onClick={() =>
                void run(async () => {
                  const r = await fetch("/api/admin/carousel-code-presets", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ name: presetName, theme }),
                  });
                  const v = await r.json();
                  if (!r.ok) throw new Error(v.error || "Preset save failed");
                  setPresets([v.preset, ...presets]);
                  setPresetName("");
                  setMessage("Preset saved for future carousels.");
                })
              }
            >
              Save as new preset
            </button>
            <label>
              Selected frame
              <select
                aria-label="Code Mode frame"
                value={selected.id}
                onChange={(e) => onSelectFrame(e.target.value)}
              >
                {project.editorState.frames.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.order} · {f.headline || f.role}
                  </option>
                ))}
              </select>
            </label>
            <h3>Frame {selected.order}</h3>
            <div className={styles.tabs}>
              <button
                type="button"
                aria-pressed={tab === "fields"}
                onClick={() => setTab("fields")}
              >
                Normal fields
              </button>
              <button
                type="button"
                aria-pressed={tab === "code"}
                onClick={() => setTab("code")}
              >
                Code
              </button>
            </div>
            {tab === "fields" ? (
              <>
                {(["kicker", "quote", "label", "eyebrow"] as const).map(key => (
                  <div key={key}>
                    <label>{key[0].toUpperCase() + key.slice(1)}
                      <textarea aria-label={`Code Mode ${key}`} maxLength={key === "quote" ? 10000 : 2000} value={override[key] ?? ""} onChange={e => { const patch = {[key]: e.target.value}; patchOverride(patch); onCodeFields(selected.id, patch); }} />
                    </label>
                    <label className={styles.checkbox}><input type="checkbox" checked={override[key] === undefined} onChange={e => { const patch = {[key]: e.target.checked ? undefined : ""}; patchOverride(patch); onCodeFields(selected.id, patch); }} />Use fallback for {key}</label>
                  </div>
                ))}
                {(
                  [
                    "headline",
                    "body",
                    "scripture",
                    "overlayText",
                    "supportingNotes",
                    "cta",
                    "caption",
                    "altText",
                    "pathwayLink",
                  ] as const
                ).map((key) => (
                  <label key={key}>
                    {key}
                    <textarea
                      aria-label={`Code Mode ${key}`}
                      maxLength={
                        {
                          headline: 240,
                          body: 1400,
                          scripture: 180,
                          overlayText: 500,
                          supportingNotes: 1600,
                          cta: 500,
                          caption: 2200,
                          altText: 1000,
                          pathwayLink: 500,
                        }[key]
                      }
                      value={selected[key]}
                      onChange={(e) =>
                        onFrame(selected.id, { [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => patchOverride({ html: theme.template })}
                >
                  Load template HTML
                </button>
                <label>
                  Frame HTML
                  <textarea
                    aria-label="Frame HTML"
                    rows={10}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={override.html}
                    onChange={(e) => patchOverride({ html: e.target.value })}
                    placeholder="Empty uses the carousel template"
                  />
                </label>
                <label>
                  Frame CSS
                  <textarea
                    aria-label="Frame CSS"
                    rows={8}
                    spellCheck={false}
                    autoComplete="off"
                    value={override.css}
                    onChange={(e) => patchOverride({ css: e.target.value })}
                  />
                </label>
                <button type="button" onClick={() => void paste(text => patchOverride({html: text}))}>Paste from clipboard · Frame HTML</button>
                <button type="button" onClick={() => void paste(text => patchOverride({css: text}))}>Paste from clipboard · Frame CSS</button>
                <button type="button" onClick={() => setTheme({...theme, overrides: Object.fromEntries(project.editorState.frames.map(frame => [frame.id, {...(theme.overrides[frame.id] || {html: "", css: ""}), css: override.css}]))})}>Copy Frame CSS to all</button>
                <p className={styles.hint}>
                  {
                    "Placeholders: {{kicker}} {{headline}} {{quote}} {{body}} {{label}} {{page}} {{total}} {{logo}} {{eyebrow}}. Use <br> in Headline for manual breaks. Inline SVG is supported; scripts are removed."
                  }
                </p>
              </>
            )}
            {showJson && (
              <>
                <label>
                  Whole-carousel JSON
                  <textarea
                    aria-label="Whole-carousel JSON"
                    rows={24}
                    spellCheck={false}
                    autoComplete="off"
                    value={json}
                    onChange={(e) => { setJson(e.target.value); setJsonDirty(true); }}
                  />
                </label>
                <button type="button" onClick={() => void paste(text => {setJson(text); setJsonDirty(true);})}>Paste from clipboard · Whole-carousel JSON</button>
                <div className={styles.bar}>
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        const parsed = parseCodeJson(json);
                        await apply({
                          ...currentJson(),
                          title: parsed.title,
                          settings: parsed.visualSettings,
                          theme: parsed.visualSettings.codeMode,
                          frames: parsed.frames.map((f) => ({
                            ...f,
                            ...(parsed.visualSettings.codeMode.overrides[
                              f.id
                            ] || { html: "", css: "" }),
                          })),
                        });
                      })
                    }
                  >
                    Apply JSON
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await navigator.clipboard.writeText(json);
                        setMessage("JSON copied.");
                      })
                    }
                  >
                    Copy JSON
                  </button>
                </div>
              </>
            )}
            <details>
              <summary>Assets</summary>
              {[...BUILTIN_CODE_ASSETS, ...theme.assets].map((asset, i) => (
                <div key={`${asset.url}-${i}`} className={styles.asset}>
                  <label>
                    {asset.name}
                    <input readOnly value={asset.url} />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await navigator.clipboard.writeText(asset.url);
                        setMessage("Asset URL copied.");
                      })
                    }
                  >
                    Copy URL
                  </button>
                </div>
              ))}
              <label>
                Upload image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void run(() => upload(file));
                    e.target.value = "";
                  }}
                />
              </label>
            </details>
            <details>
              <summary>Revisions · Undo / Restore</summary>
              <p className={styles.hint}>
                Every Apply preserves a revision. Restore also preserves the
                current version.
              </p>
              {revisions[0] && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await onRestore(revisions[0].id);
                      const restored = await refresh();
                      if (restored)
                        setTheme(
                          codeTheme(restored.editorState) ||
                            initialCodeTheme(
                              String(
                                restored.editorState.visualSettings.style ||
                                  "editorial-white",
                              ),
                            ),
                        );
                      setMessage("Last Apply undone.");
                    })
                  }
                >
                  Undo last Apply
                </button>
              )}
              {revisions.map((r) => (
                <div className={styles.bar} key={r.id}>
                  <span>
                    Version {r.version} · {r.change_summary}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await onRestore(r.id);
                        const restored = await refresh();
                        if (restored)
                          setTheme(
                            codeTheme(restored.editorState) ||
                              initialCodeTheme(
                                String(
                                  restored.editorState.visualSettings.style ||
                                    "editorial-white",
                                ),
                              ),
                          );
                        setMessage("Revision restored.");
                      })
                    }
                  >
                    Restore version {r.version}
                  </button>
                </div>
              ))}
            </details>
            <div className={styles.bar}>
              <button type="button" onClick={() => void run(() => download())}>
                Export PNGs
              </button>
              <button
                type="button"
                onClick={() =>
                  void run(() =>
                    download(
                      project.editorState.frames.findIndex(
                        (f) => f.id === selected.id,
                      ),
                    ),
                  )
                }
              >
                Export frame PNG
              </button>
            </div>
          </fieldset>
          {readonly && <p>Return this project to Draft to edit Code Mode.</p>}
          {working && <p role="status">Working…</p>}
          {message && (
            <p role="status" className={failed ? styles.error : styles.hint}>
              {message}
            </p>
          )}
          <div className={styles.bar}>
            <strong>Saved preview · 1080 × 1350</strong>
            <button
              type="button"
              aria-pressed={full}
              onClick={() => setFull((v) => !v)}
            >
              View 100%: {full ? "On" : "Off"}
            </button>
          </div>
          {largeId && <div className={styles.large} role="region" aria-label="Large frame preview">
            <button type="button" onClick={() => setLargeId(null)}>Close large preview</button>
            {project.editorState.frames.filter(f => f.id === largeId).map(frame => <CodeFramePreview key={frame.id} frame={frame} index={project.editorState.frames.findIndex(f => f.id === frame.id)} total={project.editorState.frames.length} theme={codeTheme(project.editorState) || initialCodeTheme(theme.preset)} />)}
          </div>}
          <div className={`${styles.gallery} ${full ? styles.gallery100 : ""}`}>
            {project.editorState.frames.map((frame, index) => (
              <div
                key={frame.id}
                className={full ? styles.tileFull : styles.tile}
              >
                <button type="button" onClick={() => setLargeId(frame.id)}>Open frame {index + 1} large</button>
                <CodeFramePreview
                  frame={frame}
                  index={index}
                  total={project.editorState.frames.length}
                  theme={
                    codeTheme(project.editorState) ||
                    initialCodeTheme(theme.preset)
                  }
                  full={full}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
