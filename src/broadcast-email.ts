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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character] ?? character));
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "https://apostolicguide.com";
  } catch {
    return "https://apostolicguide.com";
  }
}

export function buildBroadcastEmail(campaign: BroadcastCampaign) {
  const title = escapeHtml(campaign.title);
  const summary = escapeHtml(campaign.summary);
  const eyebrow = escapeHtml(campaign.eyebrow);
  const cta = escapeHtml(campaign.ctaLabel);
  const url = safeUrl(campaign.url);
  const preview = escapeHtml(campaign.previewText);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f7f4;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f7f4" style="width:100%;background-color:#f5f7f4;">
    <tr>
      <td align="center" style="padding-top:36px;padding-right:18px;padding-bottom:36px;padding-left:18px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
          <tr>
            <td style="padding-top:0;padding-right:4px;padding-bottom:18px;padding-left:4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#10202a;font-weight:700;letter-spacing:0.04em;">APOSTOLIC GUIDE</td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:24px;padding-top:42px;padding-right:38px;padding-bottom:42px;padding-left:38px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#a12d3d;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding-bottom:16px;">${eyebrow}</td></tr>
                <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:38px;line-height:42px;color:#10202a;font-weight:800;letter-spacing:-0.03em;padding-bottom:18px;">${title}</td></tr>
                <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:29px;color:#66777d;padding-bottom:30px;">${summary}</td></tr>
                <tr>
                  <td style="padding-bottom:8px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#a12d3d" style="background-color:#a12d3d;border-radius:999px;">
                          <a href="${url}" style="display:inline-block;padding-top:14px;padding-right:24px;padding-bottom:14px;padding-left:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;color:#ffffff;text-decoration:none;font-weight:700;">${cta}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:22px;padding-right:8px;padding-bottom:0;padding-left:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#78888e;">
              You are receiving this because you subscribed to Apostolic Guide. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#66777d;text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${campaign.eyebrow}\n\n${campaign.title}\n\n${campaign.summary}\n\n${campaign.ctaLabel}: ${url}\n\nUnsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}`;
  return { html, text };
}
