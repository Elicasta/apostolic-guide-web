"use client";

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

export function UpdatePasswordForm() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 12) {
      setState("error");
      setMessage("Use at least 12 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setState("error");
      setMessage("The passwords do not match.");
      return;
    }

    const { url, key } = getSupabaseConfig();
    if (!url || !key) {
      setState("error");
      setMessage("Authentication is not configured.");
      return;
    }

    setState("loading");
    setMessage("");

    const supabase = createBrowserClient(url, key);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }

    setState("success");
    setMessage("Password saved. Redirecting to the admin…");
    window.setTimeout(() => window.location.assign("/admin"), 800);
  }

  return (
    <form className="login-form" action={submit}>
      <label>
        New password
        <input
          type="password"
          name="password"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirm password
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={12}
          autoComplete="new-password"
        />
      </label>
      <button className="button button-crimson" type="submit" disabled={state === "loading"}>
        {state === "loading" ? "Saving…" : "Set password"}
      </button>
      {message && (
        <p className={state === "error" ? "form-error" : "form-success"} role="status">
          {message}
        </p>
      )}
    </form>
  );
}
