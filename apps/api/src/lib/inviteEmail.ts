const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** Branded "you're invited" email — dark-green ledger header, role chip,
 *  one green CTA. Table-based + inline styles so every mail client keeps
 *  the layout. */
export function renderInviteEmail({
  inviteeName,
  inviterName,
  role,
  orgName,
  acceptUrl,
  expiresAt,
}: {
  inviteeName: string | null;
  inviterName: string;
  role: string;
  orgName: string;
  acceptUrl: string;
  expiresAt: string;
}): { html: string; text: string } {
  const green = "#1E6B4E";
  const ink = "#1E2227";
  const mut = "#697077";
  const line = "#E5E7EB";
  const roleLabel = role === "admin" ? "Admin" : "User";
  const hello = inviteeName ? `Hi ${esc(inviteeName)},` : "Hi,";

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#F3F5F2;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F2;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid ${line};">

        <!-- Brand band -->
        <tr><td style="background:${green};padding:22px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:40px;height:40px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);border-radius:10px;text-align:center;vertical-align:middle;color:#FFFFFF;font-size:19px;font-weight:800;font-family:Georgia,serif;">B</td>
            <td style="padding-left:12px;">
              <div style="color:#FFFFFF;font-size:16px;font-weight:700;letter-spacing:.2px;">Brecx Billing</div>
              <div style="color:rgba(255,255,255,.65);font-size:10px;letter-spacing:.16em;text-transform:uppercase;">${esc(orgName)}</div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:34px 32px 8px;">
          <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#B9892F;font-weight:700;">Workspace invitation</div>
          <h1 style="margin:10px 0 0;font-size:23px;line-height:1.3;color:${ink};font-weight:800;">You&rsquo;re invited to join ${esc(orgName)}&rsquo;s billing workspace</h1>
        </td></tr>

        <tr><td style="padding:18px 32px 0;font-size:14.5px;line-height:1.65;color:${ink};">
          <p style="margin:0 0 14px;">${hello}</p>
          <p style="margin:0 0 14px;"><b>${esc(inviterName)}</b> has invited you to <b>Brecx Billing</b> &mdash; the workspace ${esc(orgName)} uses to manage customers, invoices and payments.</p>
        </td></tr>

        <!-- Invite details card -->
        <tr><td style="padding:6px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAF9;border:1px solid ${line};border-radius:10px;">
            <tr>
              <td style="padding:14px 18px;font-size:13px;color:${mut};">Your role</td>
              <td style="padding:14px 18px;text-align:right;">
                <span style="display:inline-block;background:#E7F1EB;color:${green};border:1px solid #CBE2D6;border-radius:999px;padding:3px 12px;font-size:12px;font-weight:700;">${roleLabel}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:0 18px 14px;font-size:13px;color:${mut};border-top:0;">Invite expires</td>
              <td style="padding:0 18px 14px;text-align:right;font-size:13px;color:${ink};font-weight:600;">${fmtDate(expiresAt)}</td>
            </tr>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:26px 32px 8px;" align="center">
          <a href="${acceptUrl}" style="display:inline-block;background:${green};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:13px 38px;border-radius:9px;">Accept invitation</a>
          <div style="font-size:12px;color:${mut};margin-top:12px;">You&rsquo;ll pick your own password on the next screen.</div>
        </td></tr>

        <!-- Fallback link -->
        <tr><td style="padding:18px 32px 28px;">
          <div style="border-top:1px dashed ${line};padding-top:16px;font-size:12px;line-height:1.6;color:${mut};">
            If the button doesn&rsquo;t work, copy this link into your browser:<br/>
            <a href="${acceptUrl}" style="color:${green};word-break:break-all;">${acceptUrl}</a>
          </div>
        </td></tr>
      </table>

      <div style="font-size:11.5px;color:#959CA3;padding:18px 8px 0;">
        Sent by Brecx Billing on behalf of ${esc(orgName)}.<br/>
        Didn&rsquo;t expect this invite? You can safely ignore this email.
      </div>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    hello,
    "",
    `${inviterName} has invited you to Brecx Billing — the workspace ${orgName} uses to manage customers, invoices and payments.`,
    "",
    `Your role: ${roleLabel}`,
    `Invite expires: ${fmtDate(expiresAt)}`,
    "",
    `Accept the invitation and set your password here:`,
    acceptUrl,
    "",
    "Didn't expect this invite? You can safely ignore this email.",
  ].join("\n");

  return { html, text };
}
