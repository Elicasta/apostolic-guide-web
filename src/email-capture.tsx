"use client";

import { ArrowRight, Check, Mail, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

const DISMISS_KEY = "apostolic-guide:email-capture-dismissed";
const SIGNED_UP_KEY = "apostolic-guide:email-capture-signed-up";
const DISMISS_FOR = 1000 * 60 * 60 * 24 * 21;

function browserIdentity() {
  try {
    return {
      anonymousId: window.localStorage.getItem("ag_anonymous_id") || undefined,
      sessionId: window.sessionStorage.getItem("ag_session_id") || undefined
    };
  } catch { return {}; }
}

export function EmailCapture() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [liveTeachings, setLiveTeachings] = useState(true);
  const [newArticles, setNewArticles] = useState(true);
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const dismiss = useCallback(() => {
    setOpen(false);
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname.startsWith("/api")) return;
    try {
      if (window.localStorage.getItem(SIGNED_UP_KEY)) return;
      const dismissed = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
      if (dismissed && Date.now() - dismissed < DISMISS_FOR) return;
    } catch {}

    let cancelled = false;
    let timer = 0;
    let listening = false;
    let opened = false;
    const reveal = () => { if (!opened && !cancelled) { opened = true; setOpen(true); } };
    const onScroll = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (window.scrollY / maxScroll >= 0.34) reveal();
    };
    const prepare = async () => {
      try {
        const response = await fetch("/api/subscribe", { cache: "no-store" });
        const result = await response.json() as { enabled?: boolean };
        if (cancelled || !result.enabled) return;
        timer = window.setTimeout(reveal, 26000);
        window.addEventListener("scroll", onScroll, { passive: true });
        listening = true;
      } catch {}
    };
    void prepare();
    return () => { cancelled = true; window.clearTimeout(timer); if (listening) window.removeEventListener("scroll", onScroll); };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [dismiss, open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, liveTeachings, newArticles, source: "email-capture-popup", path: pathname, website, ...browserIdentity() })
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message || "Unable to subscribe right now.");
      setState("success");
      setMessage(result.message || "You are on the list.");
      try { window.localStorage.setItem(SIGNED_UP_KEY, String(Date.now())); } catch {}
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to subscribe right now.");
    }
  };

  if (!open) return null;
  return (
    <div className="email-capture-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section className="email-capture" role="dialog" aria-modal="true" aria-labelledby="email-capture-title" onPointerDown={(event) => event.stopPropagation()}>
        <button className="email-capture-close" type="button" onClick={dismiss} aria-label="Close signup"><X size={18} /></button>
        <span className="email-capture-icon"><Mail size={21} /></span>
        <span className="eyebrow eyebrow-light">Stay connected</span>
        <h2 id="email-capture-title">Study with us beyond this page.</h2>
        <p>Receive new Scripture studies and invitations to live Apostolic teachings. No noise. Only material worth opening.</p>
        {state === "success" ? (
          <div className="email-capture-success"><Check size={24} /><strong>You are on the list.</strong><span>{message}</span><button type="button" onClick={dismiss}>Continue studying <ArrowRight size={16} /></button></div>
        ) : (
          <form onSubmit={submit}>
            <label className="sr-only" htmlFor="subscriber-email">Email address</label>
            <div className="email-capture-field"><input id="subscriber-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} /><button type="submit" disabled={state === "submitting"}>{state === "submitting" ? "Joining…" : "Join the list"}<ArrowRight size={16} /></button></div>
            <input className="email-capture-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(event) => setWebsite(event.target.value)} />
            <div className="email-capture-options"><label><input type="checkbox" checked={liveTeachings} onChange={(event) => setLiveTeachings(event.target.checked)} /> Live teaching invitations</label><label><input type="checkbox" checked={newArticles} onChange={(event) => setNewArticles(event.target.checked)} /> New article notifications</label></div>
            {state === "error" && <p className="email-capture-error" role="alert">{message}</p>}
            <small>By joining, you agree to receive Apostolic Guide email updates. You may unsubscribe at any time.</small>
          </form>
        )}
      </section>
    </div>
  );
}
