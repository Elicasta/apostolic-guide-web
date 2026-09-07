"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Download,
  Film,
  LockKeyhole,
  Maximize2,
  Music2,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Sparkles,
  Type,
  Undo2,
  UnlockKeyhole,
  Volume2,
} from "lucide-react";
import {
  buildKeepSegments,
  compileVideoProducerRenderPlan,
  formatProducerTime,
  sourceTimeToOutputTime,
  type VideoProducerEditPlan,
} from "@/video-producer";
import {
  buildProducerScenes,
  editHistory,
  replaceSceneCuts,
  sceneKeepRanges,
  trimProducerScene,
  type EditorDocument,
  type EditorHistory,
} from "@/video-producer-editor";
import styles from "./video-producer-scene-editor.module.css";

type Transcript = {
  text: string;
  segments: { text: string; start: number; end: number }[];
  words: { word: string; start: number; end: number }[];
};
export type SceneEditorDetail = {
  project: {
    id: string;
    title: string;
    mode: "podcast" | "reels";
    status: string;
    updated_at: string;
    source_filename?: string;
    source_duration?: number;
    source_range_start?: number;
    edit_plan: VideoProducerEditPlan | null;
    transcript_local?: Transcript;
    director_metadata?: {
      sceneEditor?: { lockedScenes?: string[] };
      draftJob?: { status: string; message: string; error?: string };
      director?: { summary?: string };
    };
  };
  sourcePreviewUrl: string | null;
  renderPreviewUrl: string | null;
  renderIsCurrent?: boolean;
  renders: {
    id: string;
    status: string;
    error?: string;
    progress?: { percent?: number; stage?: string };
  }[];
};
type Beat = {
  id: string;
  source_start: number;
  duration: number;
  dialogue: string;
  intent: string;
  recommendation: string;
  status: string;
};
type Candidate = {
  id: string;
  title: string;
  preview_url?: string;
  provider: string;
  creator?: string;
  license_name?: string;
  score?: number;
};
type Visuals = {
  beats: Beat[];
  placements: { beat_id: string; asset?: { filename: string } }[];
  importJobs: { beat_id: string; status: string; error?: string }[];
};
type Tab = "cut" | "visuals" | "text" | "sound";
const EMPTY_VISUALS: Visuals = { beats: [], placements: [], importJobs: [] };
async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(`/api/admin/video-producer/${path}`, {
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.error || `Could not complete this action (${response.status}).`,
    );
  return data as T;
}
const label = (value: number) => formatProducerTime(value);

export function VideoProducerSceneEditor({ projectId }: { projectId: string }) {
  const [detail, setDetail] = useState<SceneEditorDetail | null>(null);
  const [history, setHistory] = useState<EditorHistory | null>(null);
  const [saved, setSaved] = useState("");
  const [revision, setRevision] = useState("");
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<Tab>("cut");
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [preview, setPreview] = useState<"cut" | "original" | "render">("cut");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visuals, setVisuals] = useState<Visuals>(EMPTY_VISUALS);
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [music, setMusic] = useState<{ id: string; title: string }[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const loadSequence = useRef(0);
  const actionLock = useRef(false);
  const previewSignedAt = useRef(0);
  const plan = history?.present.plan ?? null;
  const dirty = Boolean(history && JSON.stringify(history.present) !== saved);
  dirtyRef.current = dirty;
  const project = detail?.project;
  const job = project?.director_metadata?.draftJob;
  const working =
    job?.status === "running" ||
    ["transcribing", "directing", "rendering"].includes(project?.status ?? "");
  const readOnly = Boolean(busy || working);
  const scenes = useMemo(
    () =>
      buildProducerScenes(
        project?.transcript_local?.segments ?? [],
        plan?.sourceDuration ?? project?.source_duration ?? 0,
      ),
    [
      project?.transcript_local?.segments,
      project?.source_duration,
      plan?.sourceDuration,
    ],
  );
  const scene = scenes[Math.min(selected, Math.max(0, scenes.length - 1))];
  const compiled = useMemo(
    () => (plan ? compileVideoProducerRenderPlan(plan) : null),
    [plan],
  );
  const kept = plan && scene ? sceneKeepRanges(plan, scene) : [];
  const locked = Boolean(
    scene && history?.present.lockedScenes.includes(scene.id),
  );
  const densities = useMemo(
    () =>
      scenes.map((s) => {
        const bins = Array<number>(28).fill(12);
        for (const word of project?.transcript_local?.words ?? []) {
          if (word.start >= s.start && word.start < s.end) {
            const index = Math.min(
              27,
              Math.floor(((word.start - s.start) / (s.end - s.start)) * 28),
            );
            bins[index] = Math.min(100, bins[index] + 23);
          }
        }
        return bins;
      }),
    [scenes, project?.transcript_local?.words],
  );
  const sourceOffset = project?.source_range_start ?? 0;
  const currentRender = !dirty && detail?.renderIsCurrent === true;
  const sceneBeats = scene
    ? visuals.beats.filter(
        (b) =>
          b.source_start < scene.end &&
          b.source_start + b.duration > scene.start,
      )
    : [];
  const overlays =
    plan && scene
      ? plan.overlays.filter(
          (o) => o.start < scene.end && o.start + o.duration > scene.start,
        )
      : [];
  const sourceClock =
    preview === "render" ? 0 : Math.max(0, clock - sourceOffset);
  const outputClock = plan
    ? sourceTimeToOutputTime(sourceClock, plan.cuts, plan.sourceDuration)
    : null;

  const load = useCallback(
    async (reset = false) => {
      const sequence = ++loadSequence.current;
      const next = await api<SceneEditorDetail>(`projects/${projectId}`);
      if (sequence !== loadSequence.current) return;
      const refreshPreview =
        reset || Date.now() - previewSignedAt.current > 25 * 60 * 1000;
      if (refreshPreview) previewSignedAt.current = Date.now();
      setDetail((old) =>
        refreshPreview || !old
          ? next
          : {
              ...next,
              sourcePreviewUrl: old.sourcePreviewUrl || next.sourcePreviewUrl,
              renderPreviewUrl:
                old.renders[0]?.id === next.renders[0]?.id &&
                old.renders[0]?.status === next.renders[0]?.status
                  ? old.renderPreviewUrl || next.renderPreviewUrl
                  : next.renderPreviewUrl,
            },
      );
      if (reset || !dirtyRef.current) {
        if (next.project.edit_plan) {
          const doc: EditorDocument = {
            plan: next.project.edit_plan,
            lockedScenes:
              next.project.director_metadata?.sceneEditor?.lockedScenes ?? [],
          };
          setHistory((current) =>
            !reset &&
            current &&
            JSON.stringify(current.present) === JSON.stringify(doc)
              ? current
              : { past: [], present: doc, future: [] },
          );
          setSaved(JSON.stringify(doc));
          setRevision(next.project.updated_at);
        }
      }
    },
    [projectId],
  );
  const loadVisuals = useCallback(async () => {
    setVisuals(await api<Visuals>(`visual-pass?projectId=${projectId}`));
  }, [projectId]);
  useEffect(() => {
    let active = true;
    void load().catch((e) => {
      if (active) setError(e.message);
    });
    void loadVisuals().catch(() => {
      /* The editor remains available if Visual Pass has not been configured. */
    });
    void api<{ musicTracks: { id: string; title: string }[] }>(
      `finishing?projectId=${projectId}`,
    )
      .then((data) => {
        if (active) setMusic(data.musicTracks ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
      loadSequence.current++;
    };
  }, [load, loadVisuals, projectId]);
  useEffect(() => {
    const interval = window.setInterval(
      () => {
        void load().catch((e) => setError(e.message));
        if (working || tab === "visuals") void loadVisuals().catch(() => {});
      },
      working || tab === "visuals" ? 5000 : 60000,
    );
    return () => clearInterval(interval);
  }, [load, loadVisuals, working, tab]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const togglePlay = useCallback(() => {
    const player = video.current;
    if (!player) return;
    if (
      player.paused &&
      plan &&
      preview !== "render" &&
      player.currentTime >= sourceOffset + plan.sourceDuration - 0.05
    )
      player.currentTime =
        sourceOffset +
        (preview === "cut"
          ? (buildKeepSegments(plan.cuts, plan.sourceDuration)[0]?.start ?? 0)
          : 0);
    if (player.paused)
      void player
        .play()
        .catch(() => setError("Tap the player to start playback."));
    else player.pause();
  }, [plan, preview, sourceOffset]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,button,a,[contenteditable=true]",
        )
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (
        !readOnly &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        setHistory((h) =>
          h ? editHistory(h, event.shiftKey ? "redo" : "undo") : h,
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [readOnly, togglePlay]);

  function change(nextPlan: VideoProducerEditPlan) {
    if (readOnly || locked) return;
    setPreview("cut");
    setHistory((h) =>
      h ? editHistory(h, { ...h.present, plan: nextPlan }) : h,
    );
    setNotice("");
  }
  function seek(time: number) {
    if (video.current) video.current.currentTime = time + sourceOffset;
    setClock(time + sourceOffset);
  }
  function selectScene(index: number) {
    const next = scenes[index];
    if (!next) return;
    setSelected(index);
    setPreview("cut");
    // Switching from the rendered master remounts the video. Its loadedmetadata handler seeks to the selected scene.
    if (preview !== "render")
      seek(
        plan
          ? (sceneKeepRanges(plan, next)[0]?.start ?? next.start)
          : next.start,
      );
  }
  function onTime() {
    const player = video.current;
    if (!player) return;
    const local = player.currentTime - sourceOffset;
    if (preview !== "render" && plan) {
      if (local >= plan.sourceDuration - 0.025) {
        player.pause();
        setClock(sourceOffset + plan.sourceDuration);
        return;
      }
      if (preview === "cut") {
        const keep = buildKeepSegments(plan.cuts, plan.sourceDuration).find(
          (r) => r.end > local + 0.025,
        );
        if (!keep) {
          player.pause();
          setClock(sourceOffset + plan.sourceDuration);
          return;
        }
        if (local < keep.start) {
          player.currentTime = sourceOffset + keep.start;
          return;
        }
      }
    }
    setClock(player.currentTime);
  }
  async function action(name: string, work: () => Promise<unknown>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "That action did not finish. Try again.",
      );
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  }
  async function save() {
    if (!history || !dirty) return revision;
    const document = history.present;
    const result = await api<{ updatedAt: string }>(
      "editor",
      { projectId, expectedUpdatedAt: revision, ...document },
      "PATCH",
    );
    setSaved(JSON.stringify(document));
    setRevision(result.updatedAt);
    dirtyRef.current = false;
    setDetail((d) =>
      d
        ? {
            ...d,
            project: {
              ...d.project,
              status: "planned",
              updated_at: result.updatedAt,
              edit_plan: document.plan,
            },
          }
        : d,
    );
    setNotice("Edits saved. Ready for a fresh render.");
    return result.updatedAt;
  }
  async function render() {
    const expectedUpdatedAt = await save();
    await api("approve", { projectId, expectedUpdatedAt });
    await api("render", { projectId });
    await load();
    setNotice(
      "Your video is rendering. You can leave this page and return later.",
    );
  }
  function navigate(event: React.MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm("Leave without saving these edits?"))
      event.preventDefault();
  }
  const primaryDisabled = Boolean(!plan || readOnly);

  return (
    <main className={styles.desk}>
      <header className={styles.topbar}>
        <Link
          className={styles.brand}
          href="/admin/video-producer"
          onClick={navigate}
        >
          <span className={styles.mark}>
            AG<span>·</span>
          </span>
          <span>
            VIDEO
            <br />
            <b>PRODUCER</b>
          </span>
        </Link>
        <nav className={styles.steps} aria-label="Production steps">
          <Link
            href={`/admin/video-producer/${projectId}/source`}
            onClick={navigate}
          >
            <span>01</span> Upload
          </Link>
          <span aria-current="step">
            <i>02</i> Edit
          </span>
          <Link
            href={`/admin/video-producer/${projectId}/deliver`}
            onClick={navigate}
          >
            <span>03</span> Deliver
          </Link>
        </nav>
        <Link
          className={styles.projects}
          href="/admin/video-producer"
          onClick={navigate}
        >
          <ArrowLeft size={15} /> Projects
        </Link>
      </header>
      <section className={styles.titlebar}>
        <div>
          <p className={styles.eyebrow}>
            THE EDITING ROOM <span>/</span>{" "}
            {project?.mode === "reels" ? "VERTICAL FILM" : "LONG FORM"}
          </p>
          <h1>{project?.title ?? "Opening your project…"}</h1>
        </div>
        <div className={styles.titleActions}>
          <span className={styles.saveState}>
            {working ? (
              <>
                <span className={styles.pulse} /> In production
              </>
            ) : dirty ? (
              "Unsaved changes"
            ) : (
              <>
                <Check size={13} /> All changes saved
              </>
            )}
          </span>
          <button
            className={styles.secondary}
            disabled={!dirty || readOnly}
            onClick={() => void action("save", save)}
          >
            <Save size={15} /> Save
          </button>
          <button
            className={styles.primary}
            disabled={primaryDisabled}
            onClick={() => void action("render", render)}
          >
            <Clapperboard size={16} />
            {busy === "render" ? "Starting…" : "Render video"}
            <ArrowRight size={15} />
          </button>
        </div>
      </section>
      {error && (
        <div className={styles.alert} role="alert">
          {error}
          <button
            onClick={() =>
              void action("reload", async () => {
                if (
                  !dirty ||
                  window.confirm(
                    "Discard your unsaved edits and load the latest version?",
                  )
                ) {
                  await load(true);
                  setError("");
                }
              })
            }
          >
            Reload latest
          </button>
        </div>
      )}
      {job?.status === "failed" && plan && (
        <div className={styles.alert} role="alert">
          {job.error || job.message}
          <button
            disabled={readOnly || dirty}
            onClick={() =>
              void action("draft", async () => {
                await api("draft", { projectId });
                await load();
              })
            }
          >
            Retry draft
          </button>
        </div>
      )}
      {notice && (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      )}
      {working && (
        <div className={styles.production} role="status">
          <Sparkles size={17} />
          <span>
            {job?.status === "running"
              ? job.message
              : detail?.renders[0]?.progress?.stage ||
                (project?.status === "transcribing"
                  ? "Listening to your recording…"
                  : project?.status === "directing"
                    ? "Finding the strongest cut…"
                    : "Rendering your video…")}
          </span>
          {job?.status === "running" && (
            <button
              className={styles.textButton}
              disabled={Boolean(busy)}
              onClick={() =>
                void action("continue", async () => {
                  await api("draft", { projectId });
                  await load();
                })
              }
            >
              Continue draft
            </button>
          )}
          {project?.status === "rendering" && (
            <b>{Math.round(detail?.renders[0]?.progress?.percent ?? 0)}%</b>
          )}
        </div>
      )}
      <div className={styles.workspace}>
        <section className={styles.viewer} aria-label="Video preview">
          <div className={styles.viewerTop}>
            <span>
              <span className={styles.liveDot} />{" "}
              {preview === "render"
                ? currentRender
                  ? "RENDERED MASTER"
                  : "PREVIOUS RENDER"
                : preview === "original"
                  ? "ORIGINAL RECORDING"
                  : "CUT PREVIEW"}
            </span>
            <div className={styles.previewSwitch}>
              {(["cut", "original", "render"] as const).map((mode) => (
                <button
                  key={mode}
                  disabled={mode === "render" && !detail?.renderPreviewUrl}
                  aria-pressed={preview === mode}
                  onClick={() => {
                    video.current?.pause();
                    setPreview(mode);
                  }}
                >
                  {mode === "render"
                    ? "Render"
                    : mode === "original"
                      ? "Original"
                      : "Cut"}
                </button>
              ))}
            </div>
          </div>
          <div
            className={styles.screen}
            ref={frame}
            data-vertical={project?.mode === "reels"}
          >
            {(
              preview === "render"
                ? detail?.renderPreviewUrl
                : detail?.sourcePreviewUrl
            ) ? (
              <video
                key={preview === "render" ? "render" : "source"}
                ref={video}
                muted={muted}
                src={
                  (preview === "render"
                    ? detail?.renderPreviewUrl
                    : detail?.sourcePreviewUrl) ?? undefined
                }
                playsInline
                preload="metadata"
                onTimeUpdate={onTime}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onClick={togglePlay}
                onLoadedMetadata={() => {
                  if (preview !== "render" && scene)
                    seek(kept[0]?.start ?? scene.start);
                }}
                onError={() =>
                  setError(
                    "Video preview could not load. Reload latest to refresh its private link.",
                  )
                }
              />
            ) : (
              <div className={styles.emptyScreen}>
                <Film size={42} strokeWidth={1} />
                <h2>
                  {detail
                    ? "Your footage starts here."
                    : "Opening the editing room."}
                </h2>
                <p>
                  {detail
                    ? "Upload a recording to begin your edit."
                    : "Loading your source and production decisions…"}
                </p>
                {detail && (
                  <Link href={`/admin/video-producer/${projectId}/source`}>
                    Open upload <ArrowRight size={15} />
                  </Link>
                )}
              </div>
            )}
            {!playing && detail?.sourcePreviewUrl && (
              <button
                className={styles.bigPlay}
                aria-label="Play video"
                onClick={togglePlay}
              >
                <Play size={25} fill="currentColor" />
              </button>
            )}
            <span className={styles.frameLabel}>
              {project?.mode === "reels" ? "9:16" : "16:9"}
              <span> / </span>AG STUDIO
            </span>
          </div>
          <div className={styles.transport}>
            <button
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              disabled={!detail?.sourcePreviewUrl}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <span className={styles.time}>
              {label(preview === "render" ? clock : sourceClock)}
              <small>
                {" "}
                /{" "}
                {label(
                  preview === "render"
                    ? (compiled?.outputDuration ?? 0)
                    : (plan?.sourceDuration ?? project?.source_duration ?? 0),
                )}
              </small>
            </span>
            <input
              aria-label="Seek video"
              type="range"
              min={0}
              max={
                preview === "render"
                  ? (compiled?.outputDuration ?? 1)
                  : (plan?.sourceDuration ?? project?.source_duration ?? 1)
              }
              step={0.05}
              value={preview === "render" ? clock : sourceClock}
              onChange={(e) => {
                if (preview === "render" && video.current)
                  video.current.currentTime = Number(e.target.value);
                else seek(Number(e.target.value));
              }}
            />
            <button
              aria-label="Toggle mute"
              aria-pressed={muted}
              onClick={() => {
                if (video.current) {
                  video.current.muted = !video.current.muted;
                  setMuted(video.current.muted);
                }
              }}
            >
              <Volume2 size={17} />
            </button>
            <button
              aria-label="Full screen"
              onClick={() =>
                void frame.current
                  ?.requestFullscreen()
                  .catch(() =>
                    setError("Full screen is unavailable in this browser."),
                  )
              }
            >
              <Maximize2 size={16} />
            </button>
          </div>
          <p className={styles.previewNote}>
            {preview === "render"
              ? currentRender
                ? "Finished video with B-roll, graphics, color, and mixed audio."
                : "This is an earlier render. Render again to include your latest decisions."
              : "Preview your cuts here. Render to review B-roll, graphics, color, and mixed audio."}
          </p>
          {plan && (
            <div className={styles.editStats}>
              <span>
                <b>{label(compiled?.outputDuration ?? 0)}</b> edited runtime
              </span>
              <span>
                <b>
                  {label(plan.sourceDuration - (compiled?.outputDuration ?? 0))}
                </b>{" "}
                tightened
              </span>
              <span>
                <b>{plan.overlays.length}</b> graphics
              </span>
              <span>
                <b>{visuals.placements.length}</b> B-roll shots
              </span>
            </div>
          )}
        </section>
        <aside className={styles.inspector} aria-label="Scene controls">
          <div className={styles.inspectorHead}>
            <div>
              <p className={styles.eyebrow}>MAKE IT YOURS</p>
              <h2>
                {scene
                  ? `Scene ${String(selected + 1).padStart(2, "0")}`
                  : "Your first cut"}
              </h2>
            </div>
            {scene && history && (
              <button
                className={styles.iconButton}
                aria-label={locked ? "Unlock scene" : "Lock scene"}
                aria-pressed={locked}
                disabled={readOnly}
                onClick={() =>
                  setHistory((h) =>
                    h
                      ? editHistory(h, {
                          ...h.present,
                          lockedScenes: locked
                            ? h.present.lockedScenes.filter(
                                (id) => id !== scene.id,
                              )
                            : [...h.present.lockedScenes, scene.id],
                        })
                      : h,
                  )
                }
              >
                {locked ? (
                  <LockKeyhole size={17} />
                ) : (
                  <UnlockKeyhole size={17} />
                )}
              </button>
            )}
          </div>
          {!plan ? (
            <div className={styles.startDraft}>
              <Sparkles size={30} />
              <h3>
                Good footage.
                <br />A stronger story.
              </h3>
              <p>
                Find the cleanest takes, tighten the pauses, and plan the
                graphics and B-roll around your words.
              </p>
              <button
                className={styles.primary}
                disabled={readOnly || !detail?.sourcePreviewUrl}
                onClick={() =>
                  void action("draft", async () => {
                    await api("draft", { projectId });
                    await load();
                  })
                }
              >
                {working
                  ? "Producing your draft…"
                  : job?.status === "failed"
                    ? "Retry draft"
                    : "Produce my draft"}
                <ArrowRight size={16} />
              </button>
              {job?.error && <p role="alert">{job.error}</p>}
            </div>
          ) : (
            <>
              <div
                className={styles.tabs}
                role="tablist"
                aria-label="Edit tools"
              >
                {(
                  [
                    { id: "cut", icon: Scissors, text: "Cut" },
                    { id: "visuals", icon: Film, text: "B-roll" },
                    { id: "text", icon: Type, text: "Text" },
                    { id: "sound", icon: Music2, text: "Sound" },
                  ] as const
                ).map(({ id, icon: Icon, text }) => (
                  <button
                    key={id}
                    id={`tab-${id}`}
                    role="tab"
                    aria-selected={tab === id}
                    aria-controls={`panel-${id}`}
                    onClick={() => setTab(id)}
                  >
                    <Icon size={17} />
                    {text}
                  </button>
                ))}
              </div>
              <div
                className={styles.controls}
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
              >
                {locked && (
                  <p className={styles.lockNotice}>
                    <LockKeyhole size={13} /> Scene locked. Unlock to edit.
                  </p>
                )}
                {tab === "cut" && scene && (
                  <>
                    <div className={styles.quote}>
                      <span>
                        {label(scene.start)} <span>→</span> {label(scene.end)}
                      </span>
                      <p>“{scene.text}”</p>
                    </div>
                    <div className={styles.controlHeading}>
                      <h3>Keep the good part</h3>
                      <span>
                        {kept
                          .reduce((sum, r) => sum + r.end - r.start, 0)
                          .toFixed(1)}
                        s
                      </span>
                    </div>
                    <label className={styles.field}>
                      Start{" "}
                      <output>
                        {(kept[0]?.start ?? scene.start).toFixed(1)}s
                      </output>
                      <input
                        aria-label="Scene start"
                        type="range"
                        min={scene.start}
                        max={(kept.at(-1)?.end ?? scene.end) - 0.1}
                        step={0.1}
                        value={kept[0]?.start ?? scene.start}
                        disabled={readOnly || locked || !kept.length}
                        onChange={(e) =>
                          change(
                            trimProducerScene(
                              plan,
                              scene,
                              Number(e.target.value),
                              kept.at(-1)?.end ?? scene.end,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      End{" "}
                      <output>
                        {(kept.at(-1)?.end ?? scene.end).toFixed(1)}s
                      </output>
                      <input
                        aria-label="Scene end"
                        type="range"
                        min={(kept[0]?.start ?? scene.start) + 0.1}
                        max={scene.end}
                        step={0.1}
                        value={kept.at(-1)?.end ?? scene.end}
                        disabled={readOnly || locked || !kept.length}
                        onChange={(e) =>
                          change(
                            trimProducerScene(
                              plan,
                              scene,
                              kept[0]?.start ?? scene.start,
                              Number(e.target.value),
                            ),
                          )
                        }
                      />
                    </label>
                    <div className={styles.twoButtons}>
                      <button
                        disabled={readOnly || locked}
                        onClick={() =>
                          change(replaceSceneCuts(plan, scene, []))
                        }
                      >
                        <RotateCcw size={14} /> Restore scene
                      </button>
                      <button
                        disabled={
                          readOnly ||
                          locked ||
                          !kept.length ||
                          (compiled?.outputDuration ?? 0) <=
                            kept.reduce((n, r) => n + r.end - r.start, 0) + 0.1
                        }
                        onClick={() =>
                          change(
                            replaceSceneCuts(plan, scene, [
                              {
                                id: `remove-${scene.id}`,
                                start: scene.start,
                                end: scene.end,
                                reason: "Removed in scene editor",
                              },
                            ]),
                          )
                        }
                      >
                        <Scissors size={14} /> Remove
                      </button>
                    </div>
                    <div className={styles.rule} />
                    <h3>Camera emphasis</h3>
                    <p className={styles.hint}>
                      Give this moment a subtle punch-in.
                    </p>
                    <button
                      className={styles.wideButton}
                      disabled={readOnly || locked}
                      onClick={() => {
                        const id = `editor-punch-${scene.id}`;
                        const exists = plan.motion.some((m) => m.id === id);
                        change({
                          ...plan,
                          motion: exists
                            ? plan.motion.filter((m) => m.id !== id)
                            : [
                                ...plan.motion,
                                {
                                  id,
                                  kind: "punch-in",
                                  start: scene.start,
                                  duration: scene.end - scene.start,
                                  intensity: "subtle",
                                  transform: {
                                    focusX: 0.5,
                                    focusY: 0.5,
                                    scale: 1.1,
                                  },
                                },
                              ],
                        });
                      }}
                    >
                      {plan.motion.some(
                        (m) => m.id === `editor-punch-${scene.id}`,
                      )
                        ? "Remove scene punch-in"
                        : "+ Add subtle punch-in"}
                    </button>
                  </>
                )}
                {tab === "text" && (
                  <>
                    <h3>Words with weight.</h3>
                    <p className={styles.hint}>
                      Edit the graphics in this scene. Keep Scripture and quotes
                      faithful to your recording.
                    </p>
                    {overlays.map((o) => (
                      <div className={styles.graphicCard} key={o.id}>
                        <span className={styles.eyebrow}>
                          {o.kind} · {label(o.start)}
                        </span>
                        <label className={styles.field}>
                          On-screen text
                          <textarea
                            aria-label={`Text for ${o.id}`}
                            value={o.title}
                            disabled={readOnly || locked}
                            maxLength={1000}
                            onChange={(e) =>
                              change({
                                ...plan,
                                overlays: plan.overlays.map((x) =>
                                  x.id === o.id
                                    ? { ...x, title: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        {o.reference !== undefined && (
                          <label className={styles.field}>
                            Reference
                            <input
                              value={o.reference}
                              disabled={readOnly || locked}
                              onChange={(e) =>
                                change({
                                  ...plan,
                                  overlays: plan.overlays.map((x) =>
                                    x.id === o.id
                                      ? { ...x, reference: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </label>
                        )}
                        <button
                          className={styles.textButton}
                          disabled={readOnly || locked}
                          onClick={() =>
                            change({
                              ...plan,
                              overlays: plan.overlays.filter(
                                (x) => x.id !== o.id,
                              ),
                            })
                          }
                        >
                          Remove graphic
                        </button>
                      </div>
                    ))}
                    {scene && (
                      <button
                        className={styles.wideButton}
                        disabled={readOnly || locked}
                        onClick={() =>
                          change({
                            ...plan,
                            overlays: [
                              ...plan.overlays,
                              {
                                id: `editor-text-${crypto.randomUUID()}`,
                                kind: "statement",
                                start: scene.start,
                                duration: Math.min(4, scene.end - scene.start),
                                title: scene.text
                                  .split(/\s+/)
                                  .slice(0, 8)
                                  .join(" "),
                                placement: "lower-third",
                                animation: "rise",
                              },
                            ],
                          })
                        }
                      >
                        + Add a text moment
                      </button>
                    )}
                    <label className={styles.checkField}>
                      <input
                        type="checkbox"
                        checked={plan.captions.enabled}
                        disabled={readOnly || locked}
                        onChange={(e) =>
                          change({
                            ...plan,
                            captions: {
                              ...plan.captions,
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />{" "}
                      Captions throughout the video
                    </label>
                  </>
                )}
                {tab === "sound" && (
                  <>
                    <h3>Let your voice lead.</h3>
                    <p className={styles.hint}>
                      These settings apply to the whole video. Hear the finished
                      mix in your render.
                    </p>
                    <label className={styles.field}>
                      Voice treatment
                      <select
                        value={plan.audioPreset}
                        disabled={readOnly || locked}
                        onChange={(e) =>
                          change({
                            ...plan,
                            audioPreset: e.target
                              .value as VideoProducerEditPlan["audioPreset"],
                          })
                        }
                      >
                        <option value="ag-voice-clean">Clean & natural</option>
                        <option value="ag-voice-punch">Present & punchy</option>
                        <option value="none">Original audio</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      Music bed
                      <select
                        value={plan.music[0]?.trackId ?? ""}
                        disabled={readOnly || locked}
                        onChange={(e) =>
                          change({
                            ...plan,
                            music: e.target.value
                              ? [
                                  {
                                    id: "ag-music-bed",
                                    trackId: e.target.value,
                                    start: 0,
                                    end: plan.sourceDuration,
                                    gainDb: -28,
                                    duckUnderVoice: true,
                                  },
                                ]
                              : [],
                          })
                        }
                      >
                        <option value="">Voice only</option>
                        {music.map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    {plan.music.length > 0 && (
                      <>
                        <label className={styles.field}>
                          Music level <output>{plan.music[0].gainDb} dB</output>
                          <input
                            aria-label="Music level"
                            type="range"
                            min={-48}
                            max={-12}
                            step={1}
                            disabled={readOnly || locked}
                            value={plan.music[0].gainDb}
                            onChange={(e) =>
                              change({
                                ...plan,
                                music: plan.music.map((m, i) =>
                                  i
                                    ? m
                                    : { ...m, gainDb: Number(e.target.value) },
                                ),
                              })
                            }
                          />
                        </label>
                        <label className={styles.checkField}>
                          <input
                            type="checkbox"
                            checked={plan.music[0].duckUnderVoice}
                            disabled={readOnly || locked}
                            onChange={(e) =>
                              change({
                                ...plan,
                                music: plan.music.map((m) => ({
                                  ...m,
                                  duckUnderVoice: e.target.checked,
                                })),
                              })
                            }
                          />{" "}
                          Lower music while speaking
                        </label>
                      </>
                    )}
                    <Link
                      className={styles.wideButton}
                      href={`/admin/video-producer/${projectId}/finish`}
                      onClick={navigate}
                    >
                      Manage music & finishing <ArrowRight size={14} />
                    </Link>
                  </>
                )}
                {tab === "visuals" && (
                  <>
                    <h3>Show what you mean.</h3>
                    <p className={styles.hint}>
                      Real footage, chosen around this moment.
                    </p>
                    {dirty && (
                      <p className={styles.lockNotice}>
                        Save your edits before changing B-roll.
                      </p>
                    )}
                    {!sceneBeats.some((b) => b.recommendation === "b-roll") && (
                      <div className={styles.quietCard}>
                        <Film size={24} />
                        <p>
                          {visuals.beats.length
                            ? "This moment stays with you and your graphics."
                            : "Produce the visual draft to find B-roll opportunities."}
                        </p>
                        {!visuals.beats.length && (
                          <button
                            className={styles.wideButton}
                            disabled={readOnly || dirty}
                            onClick={() =>
                              void action("draft", async () => {
                                await api("draft", { projectId });
                                await load();
                              })
                            }
                          >
                            Find visual moments
                          </button>
                        )}
                      </div>
                    )}
                    {sceneBeats
                      .filter((b) => b.recommendation === "b-roll")
                      .map((beat) => (
                        <div className={styles.shot} key={beat.id}>
                          <span className={styles.eyebrow}>
                            {label(beat.source_start)} ·{" "}
                            {beat.status === "resolved"
                              ? "SHOT SELECTED"
                              : beat.status === "skipped"
                                ? "KEEPING YOU ON SCREEN"
                                : "B-ROLL OPPORTUNITY"}
                          </span>
                          <p>{beat.intent}</p>
                          {visuals.placements.find((p) => p.beat_id === beat.id)
                            ?.asset?.filename && (
                            <small>
                              {
                                visuals.placements.find(
                                  (p) => p.beat_id === beat.id,
                                )?.asset?.filename
                              }
                            </small>
                          )}
                          <div className={styles.twoButtons}>
                            <button
                              disabled={readOnly || dirty || locked}
                              onClick={() =>
                                void action("search", async () => {
                                  const data = await api<{
                                    candidates: Candidate[];
                                  }>("visual-pass/search", { beatId: beat.id });
                                  setCandidates((c) => ({
                                    ...c,
                                    [beat.id]: data.candidates,
                                  }));
                                  if (!data.candidates.length)
                                    setNotice(
                                      "No footage found for this moment. You can keep yourself on screen.",
                                    );
                                })
                              }
                            >
                              Find footage
                            </button>
                            <button
                              disabled={readOnly || dirty || locked}
                              onClick={() =>
                                void action("keep", async () => {
                                  await api(
                                    "visual-pass/beat",
                                    { beatId: beat.id, status: "skipped" },
                                    "PATCH",
                                  );
                                  await loadVisuals();
                                  await load();
                                })
                              }
                            >
                              Keep me on screen
                            </button>
                          </div>
                          {(candidates[beat.id] ?? []).map((c) => (
                            <div className={styles.candidate} key={c.id}>
                              {c.preview_url && (
                                <video
                                  src={c.preview_url}
                                  muted
                                  playsInline
                                  preload="none"
                                  controls
                                />
                              )}
                              <strong>{c.title}</strong>
                              <small>
                                {c.provider} ·{" "}
                                {c.license_name || "Review source rights"}
                                {c.creator ? ` · ${c.creator}` : ""}
                              </small>
                              <button
                                className={styles.wideButton}
                                disabled={readOnly || dirty || locked}
                                onClick={() =>
                                  void action("use", async () => {
                                    await api("visual-pass/use", {
                                      candidateId: c.id,
                                    });
                                    setCandidates((all) => ({
                                      ...all,
                                      [beat.id]: [],
                                    }));
                                    await loadVisuals();
                                    await load();
                                    setNotice(
                                      "Shot selected. Any required import continues in the background.",
                                    );
                                  })
                                }
                              >
                                Use this shot <Check size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      {plan && (
        <section className={styles.timeline} aria-label="Scene timeline">
          <div className={styles.timelineHeader}>
            <div>
              <span className={styles.eyebrow}>THE STORY</span>
              <h2>{scenes.length} scenes. Your call.</h2>
            </div>
            <div className={styles.history}>
              <button
                aria-label="Undo"
                disabled={readOnly || !history?.past.length}
                onClick={() =>
                  setHistory((h) => (h ? editHistory(h, "undo") : h))
                }
              >
                <Undo2 size={17} />
              </button>
              <button
                aria-label="Redo"
                disabled={readOnly || !history?.future.length}
                onClick={() =>
                  setHistory((h) => (h ? editHistory(h, "redo") : h))
                }
              >
                <Redo2 size={17} />
              </button>
              <span />
              <button
                aria-label="Previous scene"
                disabled={selected === 0}
                onClick={() => selectScene(selected - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                aria-label="Next scene"
                disabled={selected >= scenes.length - 1}
                onClick={() => selectScene(selected + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className={styles.sceneStrip}>
            {scenes.map((s, index) => {
              const ranges = sceneKeepRanges(plan, s);
              const duration = ranges.reduce(
                (sum, r) => sum + r.end - r.start,
                0,
              );
              const beat = visuals.beats.find(
                (b) =>
                  b.source_start >= s.start &&
                  b.source_start < s.end &&
                  b.recommendation === "b-roll",
              );
              const graphics = plan.overlays.some(
                (o) => o.start >= s.start && o.start < s.end,
              );
              const density = densities[index];
              return (
                <button
                  className={styles.sceneCard}
                  data-selected={selected === index}
                  data-removed={!duration}
                  key={s.id}
                  aria-pressed={selected === index}
                  aria-label={`Scene ${index + 1}: ${s.text}`}
                  onClick={() => selectScene(index)}
                >
                  <div className={styles.sceneMeta}>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    <span>
                      {history?.present.lockedScenes.includes(s.id) && (
                        <LockKeyhole size={12} />
                      )}{" "}
                      {duration ? `${duration.toFixed(1)}s` : "Removed"}
                    </span>
                  </div>
                  <p>{s.text}</p>
                  <div
                    className={styles.density}
                    aria-label="Transcript word density"
                  >
                    {density.map((height, i) => (
                      <i key={i} style={{ height: `${height}%` }} />
                    ))}
                  </div>
                  <div className={styles.sceneTags}>
                    <span>{label(s.start)}</span>
                    {beat ? (
                      <em>B-roll</em>
                    ) : graphics ? (
                      <em>Graphics</em>
                    ) : (
                      <em>A-roll</em>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <footer className={styles.timelineFooter}>
            <span>
              <i /> Scene order follows your recording. Trim and remove without
              changing the meaning.
            </span>
            <span>
              {preview === "cut" && outputClock !== null
                ? `${label(outputClock)} into your edit`
                : "Click a scene to make it yours"}
            </span>
          </footer>
        </section>
      )}
      <footer className={styles.bottomline}>
        <span>
          APOSTOLIC GUIDE <b>/</b> MADE WITH INTENTION.
        </span>
        {detail?.renderPreviewUrl && (
          <a
            href={`/api/admin/video-producer/projects/${projectId}/download`}
            onClick={navigate}
          >
            <Download size={13} /> Download{" "}
            {currentRender ? "video" : "previous render"}
          </a>
        )}
      </footer>
    </main>
  );
}
