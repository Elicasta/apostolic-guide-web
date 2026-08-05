"use client";

import Link from "next/link";
import { useState } from "react";
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setState("error");
      setMessage("The email or password is incorrect.");
      return;
    }

    window.location.assign("/admin");
  }

  return (
    <form className="login-form" action={submit}>
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
        {state === "loading" ? "Signing in…" : "Sign in"}
      </button>
      {message && <p className="form-error" role="alert">{message}</p>}
      <Link className="login-help-link" href="/forgot-password">Forgot password?</Link>
    </form>
  );
}
