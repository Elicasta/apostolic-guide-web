"use client";

import { ArrowRight, Check, Mail, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const DISMISS_KEY = "apostolic-guide:email-capture-dismissed";
const SIGNED_UP_KEY = "apostolic-guide:email-capture-signed-up";
const DISMISS_FOR = 1000 * 60 * 60 * 24 * 21;

export function EmailCapture() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [liveTeachings, setLiveTeachings] = useState(true);
  const [newArticles, setNewArticles] = useState(true);
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname.startsWith("/api")) return;

    try {
      if (window.localStorage.getItem(SIGNED_UP_KEY)) return;
      const dismissed = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
      if (dismissed && Date.now() - dismissed < DISMISS_FOR) return;
    } catch {}

    let opened = false;
    const reveal = () => {
      if (opened) return;
      opened = true;
      setOpen(true);
    };

    const timer = window.setTimeout(reveal, 26000);
    const onScroll = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (window.scrollY / maxScroll >= 0.34) reveal();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  const dismiss = () => {
    setOpen(false);
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          liveTeachings,
          newArticles,
          source: "email-capture-popup",
          path: pathname,
          website: ""
        })
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
    <div className="email-capture-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) dismiss();
    }}>
      <section className="email-capture" role="dialog" aria-modal="true" aria-labelledby="email-capture-title">
        <button className="email-capture-close" type="button" onClick={dismiss} aria-label="Close signup"><X size={18} /></button>
        <span className="email-capture-icon"><Mail size={21} /></span>
        <span className="eyebrow eyebrow-light">Stay connected</span>
        <h2 id="email-capture-title">Study with us beyond this page.</h2>
        <p>Receive new Scripture studies and invitations to live Apostolic teachings. No noise. Only material worth opening.</p>

        {state === "success" ? (
          <div className="email-capture-success">
            <Check size={24} />
            <strong>You are on the list.</strong>
            <span>{message}</span>
            <button type="button" onClick={dismiss}>Continue studying <ArrowRight size={16} /></button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="sr-only" htmlFor="subscriber-email">Email address</label>
            <div className="email-capture-field">
              <input
                id="subscriber-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="submit" disabled={state === "submitting"}>{state === "submitting" ? "Joining…" : "Join the list"}<ArrowRight size={16} /></button>
            </div>
            <input className="email-capture-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <div className="email-capture-options">
              <label><input type="checkbox" checked={liveTeachings} onChange={(event) => setLiveTeachings(event.target.checked)} /> Live teaching invitations</label>
              <label><input type="checkbox" checked={newArticles} onChange={(event) => setNewArticles(event.target.checked)} /> New article notifications</label>
            </div>
            {state === "error" && <p className="email-capture-error" role="alert">{message}</p>}
            <small>By joining, you agree to receive Apostolic Guide email updates. You may unsubscribe at any time.</small>
          </form>
        )}
      </section>
    </div>
  );
}
