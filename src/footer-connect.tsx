"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Check, Facebook, Instagram, Youtube } from "lucide-react";

export function FooterConnect() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
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
          liveTeachings: true,
          newArticles: true,
          source: "footer",
          path: window.location.pathname,
          website
        })
      });

      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message || "Unable to subscribe right now.");

      setState("success");
      setMessage(result.message || "You are on the list.");
      setEmail("");
      try {
        window.localStorage.setItem("apostolic-guide:email-capture-signed-up", String(Date.now()));
      } catch {}
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to subscribe right now.");
    }
  }

  return (
    <section className="footer-connect" aria-labelledby="footer-connect-heading">
      <div className="shell footer-connect-inner">
        <div className="footer-connect-copy">
          <span className="footer-connect-label">Stay connected</span>
          <h2 id="footer-connect-heading">Keep following the biblical case.</h2>
          <p>Receive new Scripture studies, articles, and invitations to live teachings.</p>
        </div>

        <div className="footer-connect-actions">
          {state === "success" ? (
            <div className="footer-connect-success" role="status">
              <Check size={20} aria-hidden="true" />
              <span>{message}</span>
            </div>
          ) : (
            <form className="footer-connect-form" onSubmit={submit}>
              <label className="sr-only" htmlFor="footer-connect-email">Email address</label>
              <input
                id="footer-connect-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Your email address"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <input
                className="footer-connect-honeypot"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
              <button type="submit" disabled={state === "submitting"} aria-label="Subscribe to Apostolic Guide updates">
                <span>{state === "submitting" ? "Joining" : "Subscribe"}</span>
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            </form>
          )}
          {state === "error" && <p className="footer-connect-error" role="alert">{message}</p>}
          <small>New studies and live teaching updates. Unsubscribe at any time.</small>
        </div>

        <nav className="footer-socials" aria-label="Apostolic Guide social media">
          <a href="https://www.youtube.com/@apostolicguide" target="_blank" rel="noreferrer" aria-label="Apostolic Guide on YouTube">
            <Youtube size={22} aria-hidden="true" />
            <span>YouTube</span>
          </a>
          <a href="https://www.instagram.com/apostolicguide" target="_blank" rel="noreferrer" aria-label="Apostolic Guide on Instagram">
            <Instagram size={22} aria-hidden="true" />
            <span>Instagram</span>
          </a>
          <a href="https://www.facebook.com/apostolicguide" target="_blank" rel="noreferrer" aria-label="Apostolic Guide on Facebook">
            <Facebook size={22} aria-hidden="true" />
            <span>Facebook</span>
          </a>
        </nav>
      </div>
    </section>
  );
}
