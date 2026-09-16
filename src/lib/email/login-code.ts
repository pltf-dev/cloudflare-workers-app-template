import { env } from "cloudflare:workers";

const RESEND_API = "https://api.resend.com";
const FROM = "CF App <no-reply@cf-app.example.com>";

/** Send the login code and magic link through Resend. Throws on transport errors. */
export async function sendLoginCode(email: string, code: string, loginUrl: string): Promise<void> {
  const res = await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: "Your CF App sign-in code",
      html: loginCodeHtml(code, loginUrl),
      text: `Your sign-in code is ${code}. Or open ${loginUrl}\n\nThe code and link expire in 10 minutes.`,
    }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

// Table layout with inline styles: Gmail strips <style> blocks and web fonts.
export function loginCodeHtml(code: string, loginUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Your sign-in code</title></head>
<body style="margin:0;padding:0;background:#F6F5F1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F1;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#ffffff;border:1px solid #ECEAE3;border-radius:16px;overflow:hidden;">
        <tr><td align="center" style="background:#14171C;padding:24px 32px;font-family:Georgia,serif;font-size:22px;font-weight:600;color:#ECEFF4;">CF App</td></tr>
        <tr><td style="padding:32px 32px 8px;font-family:system-ui,Arial,sans-serif;color:#23282F;font-size:16px;line-height:1.5;">Use this code to sign in:</td></tr>
        <tr><td align="center" style="padding:8px 32px 24px;">
          <span style="display:inline-block;background:#F6F5F1;border:1px solid #2F6BFF;border-radius:12px;padding:16px 28px;font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#14171C;">${code}</span>
        </td></tr>
        <tr><td align="center" style="padding:0 32px 6px;font-family:system-ui,Arial,sans-serif;color:#5E6672;font-size:13px;">or</td></tr>
        <tr><td align="center" style="padding:6px 32px 28px;">
          <a href="${loginUrl}" style="display:inline-block;background:#2F6BFF;border-radius:10px;padding:14px 34px;font-family:system-ui,Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Sign in now</a>
        </td></tr>
        <tr><td style="padding:0 32px 32px;font-family:system-ui,Arial,sans-serif;color:#5E6672;font-size:13px;line-height:1.6;">The code and the link expire in 10 minutes. If you did not request this, you can ignore this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
