"use client";

import { useEffect, useRef } from "react";
import { BookOpen, ExternalLink } from "lucide-react";

type BibleReferenceChooserProps = {
  reference: string;
  label: string;
  className: string;
  youVersion: string | null;
  gateway: string;
};

export function BibleReferenceChooser({
  reference,
  label,
  className,
  youVersion,
  gateway
}: BibleReferenceChooserProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (!details?.open) return;
      if (event.target instanceof Node && details.contains(event.target)) return;
      details.open = false;
    };

    document.addEventListener("pointerdown", closeWhenOutside, true);
    return () => document.removeEventListener("pointerdown", closeWhenOutside, true);
  }, []);

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <details ref={detailsRef} className="bible-open-wrap">
      <summary className={`bible-reference-link ${className}`.trim()}>
        {label} <ExternalLink size={14} />
      </summary>
      <div className="bible-open-menu">
        <strong className="bible-open-menu-reference">{reference}</strong>
        {youVersion && (
          <a href={youVersion} onClick={close}>
            <BookOpen size={16} />
            <span><b>Open in Bible app</b><small>YouVersion / Bible.com</small></span>
          </a>
        )}
        <a href={gateway} target="_blank" rel="noopener noreferrer" onClick={close}>
          <ExternalLink size={16} />
          <span><b>Open in Bible Gateway</b><small>Browser fallback · KJV</small></span>
        </a>
      </div>
    </details>
  );
}
