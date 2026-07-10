/** Renders the "Send Invoice" email body (Zoho-style): the user's message on
 *  top, then a branded summary card — amount, invoice no/dates and a VIEW
 *  INVOICE button that opens the public share link. Inline-styled so it
 *  survives email clients. */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export function renderInvoiceEmail(opts: {
  invoiceNumber: string;
  customerName: string;
  amount: number;
  invoiceDate: string;
  dueDate: string;
  /** Public share URL for the VIEW INVOICE button (null → button omitted). */
  viewUrl: string | null;
  message: string;
  /** Rich-text body from the compose editor; falls back to escaped plain text. */
  messageHtml?: string;
  orgName: string;
}): string {
  const messageHtml = opts.messageHtml?.trim()
    ? `<div style="line-height:1.6">${opts.messageHtml}</div>`
    : esc(opts.message)
        .split(/\n{2,}/)
        .map((p) => `<p style="margin:0 0 12px;line-height:1.6">${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");

  const meta = (label: string, value: string) => `
    <tr>
      <td style="padding:4px 12px;font-size:13px;color:#697077">${label}</td>
      <td style="padding:4px 12px;font-size:13px;color:#1E2227;font-weight:700">${value}</td>
    </tr>`;

  const viewButton = opts.viewUrl
    ? `<div style="text-align:center;margin:18px 0 4px">
         <a href="${esc(opts.viewUrl)}"
            style="display:inline-block;background:#1E6B4E;color:#ffffff;text-decoration:none;
                   font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
                   padding:11px 26px;border-radius:8px">View Invoice</a>
       </div>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
      <div style="background:#1E6B4E;color:#fff;text-align:center;padding:16px 20px;
                  font-size:17px;font-weight:700">Invoice #${esc(opts.invoiceNumber)}</div>
      <div style="padding:26px 30px">
        ${messageHtml}
        <div style="background:#FDFAF1;border:1px solid #EFE6CC;border-radius:10px;
                    padding:22px 24px;margin:20px 0;text-align:center">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#697077">
            Invoice Amount</div>
          <div style="font-size:26px;font-weight:800;color:#BE4B32;margin:6px 0 14px">
            ${fmtMoney(opts.amount)}</div>
          <table style="border-collapse:collapse;margin:0 auto">
            ${meta("Invoice No", esc(opts.invoiceNumber))}
            ${meta("Invoice Date", fmtDate(opts.invoiceDate))}
            ${meta("Due Date", fmtDate(opts.dueDate))}
          </table>
          ${viewButton}
        </div>
        <p style="margin:0;line-height:1.7;font-size:13.5px;color:#1E2227">
          Regards,<br/>${esc(opts.orgName)}
        </p>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#959CA3;margin:14px 0 0">
      Sent by ${esc(opts.orgName)} · Brecx Billing
    </p>
  </div>
</body></html>`;
}
