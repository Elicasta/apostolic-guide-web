"use client";

import { ArrowRight, CheckCircle2, Send } from "lucide-react";
import { FormEvent, useState } from "react";

const categories = [
  "Biblical / theological question",
  "Scripture passage question",
  "Apostolic doctrine / objection",
  "Content or source correction",
  "Media / project inquiry",
  "Technical issue",
  "Other"
] as const;

type FormState = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [category, setCategory] = useState<(typeof categories)[number]>(categories[0]);
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const [referenceId, setReferenceId] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          location: data.get("location"),
          category: data.get("category"),
          otherCategory: data.get("otherCategory"),
          context: data.get("context"),
          question: data.get("question"),
          website: data.get("website"),
          path: window.location.pathname
        })
      });

      const result = await response.json() as { ok?: boolean; message?: string; referenceId?: string };
      if (!response.ok || !result.ok) throw new Error(result.message || "We could not send your message.");

      setState("success");
      setMessage(result.message || "Your message has been sent.");
      setReferenceId(result.referenceId || "");
      form.reset();
      setCategory(categories[0]);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "We could not send your message. Please try again.");
    }
  }

  if (state === "success") {
    return (
      <div className="contact-form-success" role="status">
        <span className="contact-success-icon"><CheckCircle2 size={24} /></span>
        <span className="eyebrow">Message received</span>
        <h2>Thank you for contacting the project.</h2>
        <p>{message}</p>
        {referenceId && <small>Reference: {referenceId}</small>}
        <button type="button" className="button button-dark" onClick={() => { setState("idle"); setMessage(""); setReferenceId(""); }}>
          Send another question <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <form className="contact-intake-form" onSubmit={submit}>
      <div className="contact-form-grid">
        <label>
          <span>Your name</span>
          <input name="name" type="text" autoComplete="name" maxLength={120} required placeholder="First and last name" />
        </label>

        <label>
          <span>Email address</span>
          <input name="email" type="email" inputMode="email" autoComplete="email" maxLength={320} required placeholder="you@example.com" />
        </label>

        <label className="contact-field-wide">
          <span>Where are you writing from?</span>
          <input name="location" type="text" autoComplete="address-level2" maxLength={160} required placeholder="City, state / country" />
        </label>

        <label className="contact-field-wide">
          <span>What kind of message is this?</span>
          <select name="category" value={category} onChange={(event) => setCategory(event.target.value as (typeof categories)[number])} required>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        {category === "Other" && (
          <label className="contact-field-wide contact-other-field">
            <span>Tell us what this is about</span>
            <input name="otherCategory" type="text" maxLength={160} required placeholder="Briefly describe the type of inquiry" />
          </label>
        )}

        <label className="contact-field-wide">
          <span>Page or Scripture reference <em>optional</em></span>
          <input name="context" type="text" maxLength={240} placeholder="Example: John 14:9–11 or /articles/why-jesus-prayed" />
        </label>

        <label className="contact-field-wide">
          <span>Your question or message</span>
          <textarea name="question" rows={8} minLength={12} maxLength={6000} required placeholder="Write the question clearly. Include the passage, claim, or context that will help us understand what you are asking." />
        </label>
      </div>

      <label className="contact-honeypot" aria-hidden="true">
        Website
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>

      {state === "error" && <p className="contact-form-error" role="alert">{message}</p>}

      <div className="contact-form-footer">
        <p>Questions may help shape future Apostolic Guide studies and answers. Private pastoral matters should be directed to your local pastor or church leadership.</p>
        <button className="button button-crimson" type="submit" disabled={state === "submitting"}>
          {state === "submitting" ? "Sending…" : "Submit to Apostolic Guide"} <Send size={16} />
        </button>
      </div>
    </form>
  );
}
