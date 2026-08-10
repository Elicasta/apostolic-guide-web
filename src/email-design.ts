export function escapeEmailHtml(value: string) {
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

export type ApostolicEmailInput = {
  subject: string;
  previewText: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  bodyHtml: string;
  cta?: { label: string; url: string } | null;
  footerNote?: string;
  unsubscribeUrl?: string | null;
};

export function buildApostolicEmail(input: ApostolicEmailInput) {
  const subject = escapeEmailHtml(input.subject);
  const previewText = escapeEmailHtml(input.previewText);
  const eyebrow = escapeEmailHtml(input.eyebrow ?? "Apostolic Guide");
  const title = escapeEmailHtml(input.title);
  const intro = input.intro ? escapeEmailHtml(input.intro) : "";
  const footerNote = escapeEmailHtml(input.footerNote ?? "Scripture first. Study carefully. Follow the text.");
  const cta = input.cta ? { label: escapeEmailHtml(input.cta.label), url: safeUrl(input.cta.url) } : null;
  const unsubscribe = input.unsubscribeUrl ? input.unsubscribeUrl : null;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#edf0ef;font-family:Arial,Helvetica,sans-serif;color:#10202a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${previewText}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#edf0ef;">
    <tr><td align="center" style="padding:34px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;">
        <tr><td style="padding:0 4px 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" style="width:38px;height:38px;background:#10202a;border-radius:10px;text-align:center;color:#fff;font-size:12px;font-weight:900;letter-spacing:-.4px;">AG</td>
            <td valign="middle" style="padding-left:11px;"><div style="font-size:14px;line-height:17px;font-weight:800;color:#10202a;">Apostolic Guide</div><div style="font-size:10px;line-height:15px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#7a878b;">Scripture Study</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="overflow:hidden;border-radius:22px;background:#fff;border:1px solid #dfe5e3;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
            <tr><td style="background:#10202a;padding:34px 38px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:42px;height:3px;background:#a12d3d;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
              <div style="padding-top:17px;font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#e6a3ab;">${eyebrow}</div>
              <h1 style="margin:10px 0 0;font-size:34px;line-height:40px;letter-spacing:-1px;color:#fff;font-weight:800;">${title}</h1>
              ${intro ? `<p style="margin:15px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:28px;color:#ced6da;">${intro}</p>` : ""}
            </td></tr>
            <tr><td style="padding:34px 38px 36px;font-size:16px;line-height:27px;color:#536269;">
              ${input.bodyHtml}
              ${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:27px;"><tr><td style="background:#a12d3d;border-radius:10px;"><a href="${cta.url}" style="display:inline-block;padding:14px 22px;color:#fff;text-decoration:none;font-size:15px;line-height:20px;font-weight:800;">${cta.label} →</a></td></tr></table>` : ""}
            </td></tr>
            <tr><td style="padding:22px 38px 25px;background:#f7f8f7;border-top:1px solid #e5e9e7;">
              <p style="margin:0 0 7px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:23px;color:#44535a;">${footerNote}</p>
              <p style="margin:0;font-size:11px;line-height:18px;color:#879397;">Apostolic Guide · <a href="https://apostolicguide.com" style="color:#68777d;text-decoration:none;">apostolicguide.com</a>${unsubscribe ? ` · <a href="${unsubscribe}" style="color:#68777d;text-decoration:underline;">Unsubscribe</a>` : ""}</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, subject: input.subject, previewText: input.previewText };
}
