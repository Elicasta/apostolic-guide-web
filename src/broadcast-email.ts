import { buildApostolicEmail, escapeEmailHtml } from "./email-design";

export type BroadcastCampaign = {
  type: "article" | "topic" | "answer" | "pathway" | "youtube" | "podcast" | "announcement";
  subject: string;
  previewText: string;
  eyebrow: string;
  title: string;
  summary: string;
  ctaLabel: string;
  url: string;
};

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "https://apostolicguide.com";
  } catch {
    return "https://apostolicguide.com";
  }
}

function typeLabel(type: BroadcastCampaign["type"]) {
  return ({ article: "New article", topic: "Study topic", answer: "Direct answer", pathway: "Scripture pathway", youtube: "New video", podcast: "New episode", announcement: "Apostolic Guide update" } as const)[type];
}

export function buildBroadcastEmail(campaign: BroadcastCampaign) {
  const url = safeUrl(campaign.url);
  const summary = escapeEmailHtml(campaign.summary);
  const type = escapeEmailHtml(typeLabel(campaign.type));
  const bodyHtml = `
    <div style="display:inline-block;margin-bottom:18px;padding:6px 9px;border:1px solid #dfe5e3;border-radius:999px;font-size:10px;line-height:14px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#68777d;">${type}</div>
    <p style="margin:0;font-size:18px;line-height:30px;color:#536269;">${summary}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:28px;border-top:1px solid #e5e9e7;"><tr><td style="padding-top:22px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:25px;color:#536269;">Open the study, follow the passages in context, and keep the conversation anchored in Scripture.</td></tr></table>`;

  const designed = buildApostolicEmail({
    subject: campaign.subject,
    previewText: campaign.previewText,
    eyebrow: campaign.eyebrow,
    title: campaign.title,
    intro: "A new resource from Apostolic Guide.",
    bodyHtml,
    cta: { label: campaign.ctaLabel, url },
    footerNote: "Truth deserves to be understood, not merely repeated.",
    unsubscribeUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}"
  });

  const text = `${campaign.eyebrow}\n\n${campaign.title}\n\n${campaign.summary}\n\n${campaign.ctaLabel}: ${url}\n\nApostolic Guide\nScripture first. Study carefully. Follow the text.\n\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`;
  return { html: designed.html, text };
}
