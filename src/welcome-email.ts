type WelcomeEmailInput = {
  liveTeachings: boolean;
  newArticles: boolean;
};

const siteUrl = "https://apostolicguide.com";
const pathwaysUrl = `${siteUrl}/pathways`;
const appUrl = `${siteUrl}/install-app?destination=${encodeURIComponent("https://app.apostolicguide.com/?source=welcome-email")}`;

function interestsText(input: WelcomeEmailInput) {
  const interests = [
    input.liveTeachings ? "live teaching invitations" : null,
    input.newArticles ? "new Scripture studies and articles" : null
  ].filter(Boolean);

  if (!interests.length) return "Apostolic Guide updates";
  if (interests.length === 1) return interests[0] as string;
  return `${interests[0]} and ${interests[1]}`;
}

export function buildWelcomeEmail(input: WelcomeEmailInput) {
  const interests = interestsText(input);
  const subject = "Welcome to Apostolic Guide — Scripture first.";
  const previewText = "Thank you for subscribing. Start with a Scripture pathway and keep studying in the Apostolic Guide app.";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:#eef0f2; font-family:Arial, Helvetica, sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; font-size:1px; line-height:1px;">${previewText}</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%; background-color:#eef0f2;">
    <tr>
      <td align="center" style="padding-top:24px; padding-right:14px; padding-bottom:24px; padding-left:14px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%; max-width:600px; background-color:#ffffff; border-radius:18px; overflow:hidden;">
          <tr>
            <td bgcolor="#0f1e2d" style="background-color:#0f1e2d; padding-top:32px; padding-right:34px; padding-bottom:34px; padding-left:34px;">
              <p style="margin-top:0; margin-right:0; margin-bottom:28px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; font-weight:700; letter-spacing:2.4px; color:#ffffff; text-transform:uppercase;">APOSTOLIC <span style="font-family:Georgia, 'Times New Roman', serif; font-style:italic; font-weight:400; letter-spacing:0;">GUIDE</span></p>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td bgcolor="#b3212d" style="background-color:#b3212d; width:48px; height:3px; font-size:1px; line-height:1px;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin-top:18px; margin-right:0; margin-bottom:12px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; font-weight:700; letter-spacing:2px; color:#f09aa4; text-transform:uppercase;">WELCOME</p>
              <h1 style="margin-top:0; margin-right:0; margin-bottom:18px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:38px; line-height:42px; font-weight:800; letter-spacing:-1.2px; color:#ffffff;">Thank you for subscribing.</h1>
              <p style="margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; font-family:Georgia, 'Times New Roman', serif; font-size:20px; line-height:30px; color:#d7dde2;">Truth deserves to be understood, not merely repeated.</p>
            </td>
          </tr>

          <tr>
            <td style="padding-top:34px; padding-right:34px; padding-bottom:10px; padding-left:34px;">
              <p style="margin-top:0; margin-right:0; margin-bottom:16px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:28px; color:#253746;">We’re glad you’re here.</p>
              <p style="margin-top:0; margin-right:0; margin-bottom:16px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:28px; color:#4e5c67;">Apostolic Guide exists to help people search the Scriptures, follow connected passages, ask honest questions, and understand not only <strong style="color:#0f1e2d;">what</strong> they believe, but <strong style="color:#0f1e2d;">why</strong> they believe it.</p>
              <p style="margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:28px; color:#4e5c67;">You’re currently signed up for ${interests}. We’ll keep it useful, Scripture-centered, and worth opening.</p>
            </td>
          </tr>

          <tr>
            <td style="padding-top:22px; padding-right:34px; padding-bottom:10px; padding-left:34px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%; border-top-width:1px; border-top-style:solid; border-top-color:#e3e7ea;">
                <tr>
                  <td style="padding-top:28px; padding-right:0; padding-bottom:0; padding-left:0;">
                    <p style="margin-top:0; margin-right:0; margin-bottom:10px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; font-weight:700; letter-spacing:1.8px; color:#b3212d; text-transform:uppercase;">START HERE</p>
                    <h2 style="margin-top:0; margin-right:0; margin-bottom:12px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:27px; line-height:33px; font-weight:800; letter-spacing:-0.7px; color:#0f1e2d;">Follow the biblical case, one passage at a time.</h2>
                    <p style="margin-top:0; margin-right:0; margin-bottom:22px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#5b6872;">Scripture Pathways organize connected passages into a clear sequence so you can study a doctrine without collecting isolated verses.</p>
                    <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                      <tr>
                        <td bgcolor="#b3212d" style="background-color:#b3212d; border-radius:10px;">
                          <a href="${pathwaysUrl}" style="display:inline-block; padding-top:14px; padding-right:22px; padding-bottom:14px; padding-left:22px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:20px; font-weight:700; color:#ffffff; text-decoration:none;">Explore Scripture Pathways →</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-top:26px; padding-right:34px; padding-bottom:34px; padding-left:34px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;">
                <tr>
                  <td bgcolor="#f4f5f6" style="background-color:#f4f5f6; border-radius:14px; padding-top:24px; padding-right:24px; padding-bottom:24px; padding-left:24px;">
                    <p style="margin-top:0; margin-right:0; margin-bottom:8px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; font-weight:700; letter-spacing:1.8px; color:#68747e; text-transform:uppercase;">TAKE THE STUDY WITH YOU</p>
                    <h2 style="margin-top:0; margin-right:0; margin-bottom:10px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:23px; line-height:29px; font-weight:800; color:#0f1e2d;">Apostolic Guide goes deeper in the app.</h2>
                    <p style="margin-top:0; margin-right:0; margin-bottom:18px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:24px; color:#5b6872;">Search Scripture, open complete pathway sequences, follow objections and supporting passages, and keep the study moving wherever the conversation goes.</p>
                    <a href="${appUrl}" style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:22px; font-weight:700; color:#0f1e2d; text-decoration:underline;">Open the Apostolic Guide app →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td bgcolor="#0f1e2d" style="background-color:#0f1e2d; padding-top:26px; padding-right:34px; padding-bottom:28px; padding-left:34px;">
              <p style="margin-top:0; margin-right:0; margin-bottom:8px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; font-weight:700; color:#ffffff;">A word from the Apostolic Guide team</p>
              <p style="margin-top:0; margin-right:0; margin-bottom:18px; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:23px; color:#bdc7cf;">We believe questions should be welcomed and every doctrine should be able to stand on the testimony of Scripture. Thanks for studying with us.</p>
              <p style="margin-top:0; margin-right:0; margin-bottom:0; margin-left:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:20px; color:#8796a2;">Apostolic Guide · <a href="${siteUrl}" style="color:#cbd4da; text-decoration:none;">apostolicguide.com</a><br>You received this email because you subscribed to Apostolic Guide updates. You may unsubscribe from future updates at any time.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Welcome to Apostolic Guide

Thank you for subscribing.

Truth deserves to be understood, not merely repeated.

Apostolic Guide exists to help people search the Scriptures, follow connected passages, ask honest questions, and understand not only what they believe, but why they believe it.

You’re currently signed up for ${interests}.

START HERE
Explore Scripture Pathways: ${pathwaysUrl}

TAKE THE STUDY WITH YOU
The Apostolic Guide app gives you complete pathway sequences, connected passages, objections, and deeper context: ${appUrl}

A word from the Apostolic Guide team:
We believe questions should be welcomed and every doctrine should be able to stand on the testimony of Scripture. Thanks for studying with us.

Apostolic Guide
${siteUrl}

You received this because you subscribed to Apostolic Guide updates. You may unsubscribe from future updates at any time.`;

  return { subject, previewText, html, text };
}
