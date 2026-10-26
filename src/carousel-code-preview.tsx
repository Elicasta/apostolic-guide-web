"use client";
import { useEffect, useId, useRef, useState } from "react";
import { codeDocument, type CodeTheme } from "./carousel-code";
import type { CreativeFrame } from "./creative-project";
export function CodeFramePreview({
  frame,
  index,
  total,
  theme,
  full = false,
  onIssues,
}: {
  frame: CreativeFrame;
  index: number;
  total: number;
  theme: CodeTheme;
  full?: boolean;
  onIssues?: (issues: string[]) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const baseChannel = useId();
  const [width, setWidth] = useState(300);
  const [overflow, setOverflow] = useState(false);
  const [elements, setElements] = useState<Array<{selector: string; width: number; scrollWidth: number; height: number; scrollHeight: number}>>([]);
  const [resourceError, setResourceError] = useState(false);
  const [ready, setReady] = useState(false);
  const [origin, setOrigin] = useState("https://www.apostolicguide.com");
  useEffect(() => {
    const timer = setTimeout(() => setOrigin(window.location.origin), 0);
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(node);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
  let fingerprint = 2166136261;
  for (const char of JSON.stringify([frame, index, total, theme, origin]))
    fingerprint = Math.imul(fingerprint ^ char.charCodeAt(0), 16777619);
  const channel = baseChannel + "-" + (fingerprint >>> 0);
  const doc = codeDocument(frame, index, total, theme, origin, channel);
  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(false);
      setOverflow(false);
      setResourceError(false);
      setElements([]);
    }, 0);
    return () => clearTimeout(timer);
  }, [doc]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.source !== iframe.current?.contentWindow ||
        event.data?.channel !== channel ||
        event.data?.type !== "ag-code-check"
      )
        return;
      setOverflow(Boolean(event.data.overflow));
      setElements(event.data.elements || []);
      setResourceError(Boolean(event.data.resourceErrors?.length));
      setReady(true);
      onIssues?.(
        event.data.resourceErrors?.length ? ["Image or font unavailable"] : [],
      );
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [channel, onIssues]);
  const scale = full ? 1 : Math.min(1, width / 1080);
  return (
    <div>
      <div
        role="status"
        style={{
          fontSize: 12,
          color: overflow ? "#a12d3d" : "inherit",
          marginBottom: 5,
        }}
      >
        Slide {index + 1} ·{" "}
        {ready
          ? resourceError
            ? "Image or font unavailable"
            : overflow
              ? "Overflow"
              : "Fits"
          : "Checking fonts and layout…"}
      </div>
      {ready && elements.length > 0 && <details><summary>Overflow details · {elements.length} elements</summary><ul>{elements.map((e, i) => <li key={i}>{e.selector}: box {e.width} × {e.height}, content {e.scrollWidth} × {e.scrollHeight}. Check clipping and artboard edges.</li>)}</ul></details>}
      <div
        ref={host}
        data-code-preview
        style={{
          width: full ? 1080 : "100%",
          minWidth: 0,
          height: 1350 * scale,
          position: "relative",
          outline: overflow ? "3px solid #c32032" : "1px solid #d8d8d0",
          overflow: "hidden",
          background: "#f2f3f0",
        }}
        aria-busy={!ready}
      >
        {!ready && <div style={{position: "absolute", inset: 0, zIndex: 1, display: "grid", placeItems: "center", background: "#f2f3f0", color: "#20313a", fontSize: 13}}>Loading fonts and artwork…</div>}
        <iframe
          ref={iframe}
          title={`Code preview slide ${index + 1}`}
          sandbox="allow-scripts"
          key={channel}
          loading="eager"
          srcDoc={doc}
          width={1080}
          height={1350}
          style={{
            display: "block",
            border: 0,
            width: 1080,
            height: 1350,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            maxWidth: "none",
          }}
        />
      </div>
    </div>
  );
}
