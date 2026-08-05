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

export function PasswordRecoveryForm() {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const { url, key } = getSupabaseConfig();

    if (!url || !key) {
      setState("error");
      setMessage("Authentication is not configured.");
      return;
    }

    setState("loading");
    setMessage("");

    const supabase = createBrowserClient(url, key);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`
    });

    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }

    setState("sent");
    setMessage("Check your inbox for the password reset link.");
  }

  return (
    <form className="login-form" action={submit}>
      <label>
        Admin email
        <input type="email" name="email" required autoComplete="email" />
      </label>
      <button className="button button-crimson" type="submit" disabled={state === "loading"}>
        {state === "loading" ? "Sending…" : "Send reset link"}
      </button>
      {message && (
        <p className={state === "error" ? "form-error" : "form-success"} role="status">
          {message}
        </p>
      )}
      <Link className="login-help-link" href="/login">Return to sign in</Link>
    </form>
  );
}
