import { Link, useNavigate } from "react-router-dom";
import {
  useBilling,
  customerOf,
  invoiceTotals,
  invoiceBalance,
  daysSince,
  money,
  moneyK,
  fmtShort,
} from "../../lib/store";
import { Stamp, Cust } from "../../components/bits";
import { useToast } from "../../components/Toast";

export function Dashboard() {
  const { customers, invoices, activity, logActivity } = useBilling();
  const navigate = useNavigate();
  const { toast } = useToast();

  const open = invoices.filter((i) => i.status !== "paid" && i.status !== "draft");
  const outstanding = open.reduce((s, i) => s + invoiceBalance(i), 0);
  const overdueInvs = invoices.filter((i) => i.status === "overdue");
  const overdue = overdueInvs.reduce((s, i) => s + invoiceBalance(i), 0);
  const collected = invoices.reduce((s, i) => s + i.paidAmount, 0);

  // Aging buckets by how long past due each open balance is.
  const buckets = [0, 0, 0, 0];
  for (const inv of open) {
    const d = inv.due ? daysSince(inv.due) : 0;
    const bal = invoiceBalance(inv);
    if (d <= 0) buckets[0] += bal;
    else if (d <= 30) buckets[1] += bal;
    else if (d <= 60) buckets[2] += bal;
    else buckets[3] += bal;
  }
  const agingTotal = buckets.reduce((a, b) => a + b, 0) || 1;
  const agingColors = ["var(--bar-g1)", "var(--brass)", "var(--aging3)", "var(--red)"];
  const agingLabels = ["Current", "1–30 days", "31–60 days", "60+ days"];

  const recent = invoices.filter((i) => i.status !== "draft").slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function exportLedger() {
    const rows = [
      ["No.", "Customer", "Status", "Issued", "Due", "Amount", "Balance"],
      ...invoices.map((i) => [
        i.id,
        customerOf(customers, i.customerId).name,
        i.status,
        i.issued ?? "",
        i.due ?? "",
        invoiceTotals(i).grand.toFixed(2),
        i.status === "draft" ? "" : invoiceBalance(i).toFixed(2),
      ]),
    ];
    downloadCsv("brecx-ledger.csv", rows);
    toast("Ledger exported as CSV");
  }

  function remind(invId: string) {
    const inv = invoices.find((i) => i.id === invId)!;
    const c = customerOf(customers, inv.customerId);
    logActivity("var(--brass)", [
      { t: "Reminder sent to " },
      { b: true, t: c.name },
      { t: ` for ${inv.id}${inv.status === "overdue" ? ` (${daysSince(inv.due)} days overdue)` : ""}.` },
    ]);
    toast(`Reminder sent to ${c.name}`);
  }

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>{greeting}, Brecx</h1>
          <p>
            {today} · Here's where the money stands.
          </p>
        </div>
        <div className="right">
          <button className="btn btn-ghost" onClick={exportLedger}>
            Export ledger
          </button>
        </div>
      </div>

      <div className="cash-strip">
        <div className="cash-cell hero">
          <div className="lab">Outstanding</div>
          <div className="val">{money(outstanding)}</div>
          <div className="sub">
            across <b>{open.length} open invoices</b>
          </div>
        </div>
        <div className="cash-cell">
          <div className="lab">Overdue</div>
          <div className="val" style={{ color: "var(--red)" }}>
            {money(overdue)}
          </div>
          <div className="sub">
            <b>{overdueInvs.length} invoices</b> past due date
          </div>
        </div>
        <div className="cash-cell">
          <div className="lab">Collected · July</div>
          <div className="val" style={{ color: "var(--green)" }}>
            {money(collected)}
          </div>
          <div className="sub">
            <span className="tick-up">▲ 12.4%</span> vs June
          </div>
        </div>
        <div className="cash-cell">
          <div className="lab">Avg. days to pay</div>
          <div className="val">18.2</div>
          <div className="sub">
            <span className="tick-up">▼ 2.1 days</span> improving
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <h2>Recent invoices</h2>
              <Link className="link" to="/invoices">
                Open full ledger →
              </Link>
            </div>
            <div className="panel-body">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Customer</th>
                    <th>Issued</th>
                    <th className="right">Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((inv) => {
                    const c = customerOf(customers, inv.customerId);
                    return (
                      <tr key={inv.id}>
                        <td>
                          <button className="inv-id" onClick={() => navigate(`/invoices/new?inv=${inv.id}`)}>
                            {inv.id}
                          </button>
                        </td>
                        <td>
                          <Cust customer={c} sub={`${c.type} · ${c.terms}`} />
                        </td>
                        <td className="num">{fmtShort(inv.issued)}</td>
                        <td className="num right">{money(invoiceTotals(inv).grand)}</td>
                        <td>
                          <Stamp status={inv.status} />
                        </td>
                        <td>
                          <div className="row-actions">
                            {inv.status !== "paid" && (
                              <button className="icon-btn" title="Send reminder" onClick={() => remind(inv.id)}>
                                ✉
                              </button>
                            )}
                            <button
                              className="icon-btn"
                              title="View"
                              onClick={() => navigate(`/invoices/new?inv=${inv.id}`)}
                            >
                              →
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="panel-head">
              <h2>Receivables aging</h2>
            </div>
            <div className="aging">
              <div className="aging-note">
                {money(outstanding)} outstanding, by how long it's been waiting
              </div>
              <div
                className="aging-bar"
                role="img"
                aria-label={agingLabels
                  .map((l, i) => `${Math.round((buckets[i] / agingTotal) * 100)}% ${l}`)
                  .join(", ")}
              >
                {buckets.map((b, i) => (
                  <div
                    key={i}
                    style={{ width: `${(b / agingTotal) * 100}%`, background: agingColors[i] }}
                  />
                ))}
              </div>
              <div className="aging-legend">
                {agingLabels.map((l, i) => (
                  <span key={l}>
                    <i style={{ background: agingColors[i] }} />
                    {l} <b>{moneyK(buckets[i])}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="panel-head">
            <h2>Activity</h2>
          </div>
          <ul className="feed">
            {activity.slice(0, 6).map((a) => (
              <li key={a.id}>
                <span className="dot" style={{ background: a.dot }} />
                <div>
                  {a.parts.map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <span key={i}>{p.t}</span>))}
                  <time>{a.time}</time>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
