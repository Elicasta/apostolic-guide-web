"use client";

import { ArrowRight, Check, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import styles from "./subscribe.module.css";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [liveTeachings, setLiveTeachings] = useState(true);
  const [newArticles, setNewArticles] = useState(true);
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
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
          source: "subscribe-page",
          path: "/subscribe",
          website
        })
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message || "Unable to subscribe right now.");
      setState("success");
      setMessage(result.message || "You are on the list.");
      try { window.localStorage.setItem("apostolic-guide:email-capture-signed-up", String(Date.now())); } catch {}
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to subscribe right now.");
    }
  }

  if (state === "success") {
    return (
      <div className={styles.success} role="status">
        <span><Check size={24} /></span>
        <div>
          <strong>You are on the list.</strong>
          <p>{message}</p>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.heading}>
        <span><Mail size={22} /></span>
        <div>
          <h2>Choose what you want to receive.</h2>
          <p>New studies and live teaching invitations. No noise and no filler.</p>
        </div>
      </div>

      <label className={styles.emailLabel} htmlFor="subscribe-email">Email address</label>
      <div className={styles.emailRow}>
        <input
          id="subscribe-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" disabled={state === "submitting"}>
          {state === "submitting" ? "Joining…" : "Join the list"}
          <ArrowRight size={18} />
        </button>
      </div>

      <input
        className={styles.honeypot}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
      />

      <div className={styles.options}>
        <label>
          <input type="checkbox" checked={liveTeachings} onChange={(event) => setLiveTeachings(event.target.checked)} />
          <span><strong>Live teaching invitations</strong><small>Join future live Bible teachings and project sessions.</small></span>
        </label>
        <label>
          <input type="checkbox" checked={newArticles} onChange={(event) => setNewArticles(event.target.checked)} />
          <span><strong>New article notifications</strong><small>Know when a new Scripture study is published.</small></span>
        </label>
      </div>

      {state === "error" && <p className={styles.error} role="alert">{message}</p>}
      <small className={styles.legal}>You may unsubscribe at any time. Your email is never sold or shared.</small>
    </form>
  );
}
