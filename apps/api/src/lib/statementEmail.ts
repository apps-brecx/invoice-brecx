/** Renders the "Customer Statement" email body — the user's message on top,
 *  then the statement summary + transaction table, all inline-styled so it
 *  survives email clients. */

export interface StatementRow {
  date: string; // YYYY-MM-DD
  label: string;
  details?: string;
  amount?: number | null;
  payment?: number | null;
}

export interface StatementPayload {
  opening: number;
  invoiced: number;
  received: number;
  balance: number;
  rows: StatementRow[];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const cell = "padding:8px 10px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#1E2227;";
const cellR = cell + "text-align:right;font-variant-numeric:tabular-nums;";

export function renderStatementEmail(opts: {
  customerName: string;
  message: string;
  /** Rich-text body from the compose editor; falls back to escaped plain text. */
  messageHtml?: string;
  periodFrom: string;
  periodTo: string;
  statement: StatementPayload;
  orgName: string;
}): string {
  const { statement: s } = opts;

  const messageHtml = opts.messageHtml?.trim()
    ? `<div style="line-height:1.6">${opts.messageHtml}</div>`
    : esc(opts.message)
        .split(/\n{2,}/)
        .map((p) => `<p style="margin:0 0 12px;line-height:1.6">${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");

  const rowsHtml = s.rows
    .map(
      (r) => `
      <tr>
        <td style="${cell}white-space:nowrap">${fmtDate(r.date)}</td>
        <td style="${cell}">${esc(r.label)}${r.details ? `<br/><span style="color:#697077;font-size:11.5px">${esc(r.details)}</span>` : ""}</td>
        <td style="${cellR}">${r.amount != null ? fmtMoney(r.amount) : ""}</td>
        <td style="${cellR}">${r.payment != null ? fmtMoney(r.payment) : ""}</td>
      </tr>`,
    )
    .join("");

  const sumRow = (label: string, value: number, strong = false) => `
    <tr>
      <td style="padding:5px 10px;font-size:13px;color:${strong ? "#1E2227" : "#697077"};${strong ? "font-weight:700;border-top:2px solid #1E2227;" : ""}">${label}</td>
      <td style="padding:5px 10px;font-size:13px;text-align:right;font-variant-numeric:tabular-nums;${strong ? "font-weight:700;border-top:2px solid #1E2227;" : ""}">${fmtMoney(value)}</td>
    </tr>`;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:26px 30px">
      ${messageHtml}
      <hr style="border:none;border-top:1px dashed #E5E7EB;margin:18px 0"/>
      <h2 style="font-size:17px;margin:0 0 2px;color:#1E2227">Statement of Accounts</h2>
      <p style="margin:0 0 14px;font-size:12.5px;color:#697077">
        ${esc(opts.customerName)} · ${fmtDate(opts.periodFrom)} — ${fmtDate(opts.periodTo)}
      </p>
      <table style="border-collapse:collapse;margin:0 0 18px;min-width:280px">
        ${sumRow("Opening Balance", s.opening)}
        ${sumRow("Invoiced Amount", s.invoiced)}
        ${sumRow("Amount Received", s.received)}
        ${sumRow("Balance Due", s.balance, true)}
      </table>
      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr>
            <th style="${cell}text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#697077;border-bottom:2px solid #1E2227">Date</th>
            <th style="${cell}text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#697077;border-bottom:2px solid #1E2227">Transactions</th>
            <th style="${cellR}font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#697077;border-bottom:2px solid #1E2227">Amount</th>
            <th style="${cellR}font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#697077;border-bottom:2px solid #1E2227">Payments</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="4" style="${cell}color:#697077">No transactions in this period.</td></tr>`}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:10px;font-weight:700;font-size:13px;text-align:right;border-top:2px solid #1E2227">Balance Due</td>
            <td style="padding:10px;font-weight:700;font-size:13px;text-align:right;border-top:2px solid #1E2227;font-variant-numeric:tabular-nums">${fmtMoney(s.balance)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p style="text-align:center;font-size:11px;color:#959CA3;margin:14px 0 0">
      Sent by ${esc(opts.orgName)} · Brecx Billing
    </p>
  </div>
</body></html>`;
}
