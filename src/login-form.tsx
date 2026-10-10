"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}

export function LoginForm() {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [previewSignup, setPreviewSignup] = useState(false);
  const [previewEligible, setPreviewEligible] = useState(false);
  useEffect(() => {
    // Only the isolated Supabase staging preview can create separate test accounts.
    const { url } = getSupabaseConfig();
    setPreviewEligible(window.location.hostname.endsWith(".vercel.app") &&
      Boolean(url?.includes("vikmaynudolxiaszxpwg")));
  }, []);

  async function submit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const { url, key } = getSupabaseConfig();

    if (!url || !key) {
      setState("error");
      setMessage("Authentication is not configured.");
      return;
    }

    setState("loading");
    setMessage("");

    const supabase = createBrowserClient(url, key);
    if (previewEligible && previewSignup) {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + "/auth/callback?next=%2Fteleprompter" }
      });
      if (error) {
        setState("error");
        setMessage(error.message.includes("already") || error.message.includes("registered")
          ? "This preview email may already be registered. Switch to Sign in, or use Forgot password."
          : "Preview account setup failed: " + error.message);
        return;
      }
      if (!data.session) {
        setState("idle");
        setMessage("Check your email for the confirmation link. After confirming, return here and sign in with the preview password you chose.");
        return;
      }
      window.location.assign("/teleprompter");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setState("error");
      setMessage(previewEligible
        ? "This preview uses a separate test account. If you haven't created one, choose Create preview account below."
        : "The email or password is incorrect.");
      return;
    }

    const next = new URLSearchParams(window.location.search).get("next");
    const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : null;
    window.location.assign(safeNext || (previewEligible ? "/teleprompter" : "/admin"));
  }

  return (
    <form className="login-form" action={submit}>
      {previewEligible && (
        <div role="group" aria-label="Preview authentication mode" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button type="button" aria-pressed={!previewSignup} className={previewSignup ? "button" : "button button-crimson"}
            onClick={() => { setPreviewSignup(false); setMessage(""); setState("idle"); }} style={{ flex: 1, padding: "12px 8px" }}>
            Sign in
          </button>
          <button type="button" aria-pressed={previewSignup} className={previewSignup ? "button button-crimson" : "button"}
            onClick={() => { setPreviewSignup(true); setMessage(""); setState("idle"); }} style={{ flex: 1, padding: "12px 8px" }}>
            Create preview account
          </button>
        </div>
      )}
      {previewEligible && <p style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 14px" }}>
        This isolated preview has its own Supabase sign-in. Use the same admin email as your live Studio, but choose a <strong>different, preview-only password</strong> when creating the account.
      </p>}
      <label>
        Email
        <input type="email" name="email" required autoComplete="email" />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="current-password"
        />
      </label>
      <button className="button button-crimson" type="submit" disabled={state === "loading"}>
        {state === "loading" ? (previewSignup ? "Creating preview account…" : "Signing in…") : (previewSignup ? "Create preview account" : "Sign in")}
      </button>
      {message && <p className="form-error" role="alert">{message}</p>}
      {!previewSignup && <Link className="login-help-link" href="/forgot-password">Forgot password?</Link>}
    </form>
  );
}
