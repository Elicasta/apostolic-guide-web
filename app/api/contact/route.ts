import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const categories = [
  "Biblical / theological question",
  "Scripture passage question",
  "Apostolic doctrine / objection",
  "Content or source correction",
  "Media / project inquiry",
  "Technical issue",
  "Other"
] as const;

const optionalText = (max: number, fallback = "") =>
  z.preprocess((value) => value == null ? fallback : value, z.string().trim().max(max));

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  location: z.string().trim().min(2).max(160),
  category: z.enum(categories),
  otherCategory: optionalText(160),
  context: optionalText(240),
  question: z.string().trim().min(12).max(6000),
  website: optionalText(0),
  path: optionalText(500, "/contact")
}).superRefine((value, ctx) => {
  if (value.category === "Other" && value.otherCategory.length < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["otherCategory"], message: "Tell us what the inquiry is about." });
  }
});

type ContactInput = z.infer<typeof contactSchema>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function subjectSafe(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function shortReference() {
  return `AG-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
}

async function sendContactEmail(input: ContactInput, referenceId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.CONTACT_RECEIVER_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "info@apostolicguide.com";

  if (!apiKey || !from || !to) {
    return { sent: false, error: "Contact email is not configured." };
  }

  const category = input.category === "Other" ? `Other — ${input.otherCategory}` : input.category;
  const subject = `[${referenceId}] ${subjectSafe(category)} — ${subjectSafe(input.name)}`.slice(0, 190);
  const context = input.context || "Not provided";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: input.email,
      subject,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f6f6f4;font-family:Arial,Helvetica,sans-serif;color:#0f1e2d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f6f6f4;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #d7d9dc;border-radius:18px;">
        <tr><td style="padding:28px 30px 18px;border-bottom:1px solid #e5e6e7;">
          <p style="margin:0 0 8px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#b3212d;">Apostolic Guide · Contact Intake</p>
          <h1 style="margin:0;font-size:28px;line-height:34px;color:#0f1e2d;">${escapeHtml(category)}</h1>
          <p style="margin:8px 0 0;font-size:13px;line-height:20px;color:#66727a;">Reference ${escapeHtml(referenceId)}</p>
        </td></tr>
        <tr><td style="padding:24px 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr><td style="padding:0 0 12px;font-size:13px;line-height:20px;color:#66727a;width:120px;">From</td><td style="padding:0 0 12px;font-size:15px;line-height:22px;font-weight:700;color:#0f1e2d;">${escapeHtml(input.name)}</td></tr>
            <tr><td style="padding:0 0 12px;font-size:13px;line-height:20px;color:#66727a;">Email</td><td style="padding:0 0 12px;font-size:15px;line-height:22px;color:#0f1e2d;">${escapeHtml(input.email)}</td></tr>
            <tr><td style="padding:0 0 12px;font-size:13px;line-height:20px;color:#66727a;">Location</td><td style="padding:0 0 12px;font-size:15px;line-height:22px;color:#0f1e2d;">${escapeHtml(input.location)}</td></tr>
            <tr><td style="padding:0 0 12px;font-size:13px;line-height:20px;color:#66727a;">Context</td><td style="padding:0 0 12px;font-size:15px;line-height:22px;color:#0f1e2d;">${escapeHtml(context)}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 30px 30px;">
          <p style="margin:0 0 10px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#b3212d;">Question / Message</p>
          <div style="padding:20px;background-color:#f1f3f3;border-left:4px solid #b3212d;border-radius:10px;white-space:pre-wrap;font-size:16px;line-height:26px;color:#0f1e2d;">${escapeHtml(input.question)}</div>
          <p style="margin:20px 0 0;font-size:12px;line-height:19px;color:#7a848a;">Submitted from ${escapeHtml(input.path)}. Reply to this email to respond directly to ${escapeHtml(input.name)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      text: [
        "APOSTOLIC GUIDE — CONTACT INTAKE",
        `Reference: ${referenceId}`,
        `Category: ${category}`,
        `Name: ${input.name}`,
        `Email: ${input.email}`,
        `Location: ${input.location}`,
        `Context: ${context}`,
        "",
        "QUESTION / MESSAGE",
        input.question,
        "",
        `Submitted from ${input.path}`
      ].join("\n")
    })
  });

  if (!response.ok) return { sent: false, error: await response.text() };
  return { sent: true, error: null };
}

export async function POST(request: NextRequest) {
  let input: ContactInput;

  try {
    input = contactSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, message: "Check the form and make sure every required field is complete." }, { status: 400 });
  }

  const referenceId = shortReference();
  const result = await sendContactEmail(input, referenceId);

  if (!result.sent) {
    console.error("Contact email error", result.error);
    return NextResponse.json({ ok: false, message: "We could not send your message right now. Please try again in a moment." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    referenceId,
    message: "Your question has been sent to the Apostolic Guide team."
  });
}
