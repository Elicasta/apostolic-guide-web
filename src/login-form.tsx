"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function LoginForm() {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setState("error");
      setMessage("Supabase is not configured.");
      return;
    }

    setState("loading");
    const supabase = createBrowserClient(url, key);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin` }
    });
    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }
    setState("sent");
    setMessage("Check your email for the secure sign-in link.");
  }

  return (
    <form className="login-form" action={submit}>
      <label>Email<input type="email" name="email" required autoComplete="email" /></label>
      <button className="button button-crimson" type="submit" disabled={state === "loading"}>
        {state === "loading" ? "Sending…" : "Send sign-in link"}
      </button>
      {message && <p className={state === "error" ? "form-error" : "form-success"}>{message}</p>}
    </form>
  );
}
