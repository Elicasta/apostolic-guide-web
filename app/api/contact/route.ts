import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildApostolicEmail, escapeEmailHtml } from "@/email-design";
import { recordWebsiteContactSubmission } from "@/inbox";

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

function subjectSafe(value: string) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function shortReference() {
  return `AG-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
}

async function sendContactNotification(input: ContactInput, referenceId: string, conversationId?: string | null) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.CONTACT_RECEIVER_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "info@apostolicguide.com";
  if (!apiKey || !from || !to) return { sent: false, error: "Contact email is not configured." };

  const category = input.category === "Other" ? `Other — ${input.otherCategory}` : input.category;
  const context = input.context || "Not provided";
  const question = escapeEmailHtml(input.question).replace(/\n/g, "<br>");
  const adminUrl = conversationId ? `https://apostolicguide.com/admin/inbox/${conversationId}` : "https://apostolicguide.com/admin/inbox";
  const designed = buildApostolicEmail({
    subject: `[${referenceId}] ${subjectSafe(category)} — ${subjectSafe(input.name)}`.slice(0, 190),
    previewText: `${input.name}: ${input.question}`.slice(0, 150),
    eyebrow: "Studio · Website form",
    title: category,
    intro: `New message from ${input.name}`,
    bodyHtml: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:25px;">
        <tr><td style="padding:0 0 8px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#879397;">From</td><td style="padding:0 0 8px;text-align:right;font-size:14px;font-weight:700;color:#10202a;">${escapeEmailHtml(input.name)}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #e5e9e7;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#879397;">Email</td><td style="padding:8px 0;border-top:1px solid #e5e9e7;text-align:right;font-size:14px;color:#10202a;">${escapeEmailHtml(input.email)}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #e5e9e7;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#879397;">Location</td><td style="padding:8px 0;border-top:1px solid #e5e9e7;text-align:right;font-size:14px;color:#10202a;">${escapeEmailHtml(input.location)}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #e5e9e7;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#879397;">Context</td><td style="padding:8px 0;border-top:1px solid #e5e9e7;text-align:right;font-size:14px;color:#10202a;">${escapeEmailHtml(context)}</td></tr>
        <tr><td style="padding:8px 0;border-top:1px solid #e5e9e7;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#879397;">Reference</td><td style="padding:8px 0;border-top:1px solid #e5e9e7;text-align:right;font-size:14px;font-weight:700;color:#a12d3d;">${escapeEmailHtml(referenceId)}</td></tr>
      </table>
      <div style="padding:20px 22px;background:#f5f7f6;border:1px solid #e4e9e6;border-radius:14px;font-size:16px;line-height:27px;color:#31444d;">${question}</div>`,
    cta: { label: "Open in Studio Inbox", url: adminUrl },
    footerNote: "Reply from Studio to keep the response attached to this relationship."
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: input.email,
      subject: designed.subject,
      html: designed.html,
      text: [
        "APOSTOLIC GUIDE — WEBSITE FORM",
        `Reference: ${referenceId}`,
        `Category: ${category}`,
        `Name: ${input.name}`,
        `Email: ${input.email}`,
        `Location: ${input.location}`,
        `Context: ${context}`,
        "",
        input.question,
        "",
        `Studio Inbox: ${adminUrl}`
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
  const category = input.category === "Other" ? `Other — ${input.otherCategory}` : input.category;
  let stored: Awaited<ReturnType<typeof recordWebsiteContactSubmission>> = null;
  let storageError: unknown = null;
  try {
    stored = await recordWebsiteContactSubmission({
      referenceId,
      name: input.name,
      email: input.email,
      location: input.location,
      category,
      context: input.context,
      question: input.question,
      path: input.path
    });
  } catch (error) {
    storageError = error;
    console.error("Contact Inbox storage error", error);
  }

  const notification = await sendContactNotification(input, referenceId, stored?.conversationId ?? null);
  if (!notification.sent) console.error("Contact notification email error", notification.error);

  if (!stored && !notification.sent) {
    console.error("Contact submission unavailable", storageError);
    return NextResponse.json({ ok: false, message: "We could not send your message right now. Please try again in a moment." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    referenceId,
    message: "Your question has been sent to the Apostolic Guide team."
  });
}
