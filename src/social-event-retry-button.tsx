"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";

export function SocialEventRetryButton({ eventId }: { eventId: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "retrying" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function retry() {
    if (state === "retrying") return;
    setState("retrying");
    setMessage("");
    try {
      const response = await fetch("/api/admin/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry_event", id: eventId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Retry failed.");
      const alreadySent = result.retry?.status === "already_sent";
      setState("success");
      setMessage(alreadySent ? "Already recovered" : "Sent");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Retry failed.");
    }
  }

  return (
    <div className="social-event-retry">
      <button
        type="button"
        className={state === "success" ? "social-retry-button success" : "social-retry-button"}
        onClick={retry}
        disabled={state === "retrying" || state === "success"}
        title="Retry this failed automation"
      >
        {state === "success" ? <Check size={14} /> : <RotateCcw size={14} />}
        {state === "retrying" ? "Checking…" : state === "success" ? message : "Retry"}
      </button>
      {state === "error" ? <span className="social-retry-error" role="alert">{message}</span> : null}
    </div>
  );
}
