import { Link, useNavigate } from "react-router-dom";
import {
  useBilling,
  customerOf,
  daysSince,
  money,
  moneyK,
  fmtShort,
  fmtLong,
  type Invoice,
  type Payment,
} from "../../lib/store";
import { Stamp, Cust, KpiIcon } from "../../components/bits";
import { useToast } from "../../components/Toast";

interface FeedItem {
  key: string;
  dot: string;
  parts: Array<{ b?: boolean; t: string }>;
  when: string; // sortable ISO
  time: string; // display
}

/** Real activity, derived from the ledger itself: payments received,
 *  invoices sent, drafts created. No stored feed, no fake entries. */
function buildFeed(invoices: Invoice[], payments: Payment[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const p of payments) {
    items.push({
      key: `pay-${p.id}`,
      dot: "var(--green)",
      parts: [
        { b: true, t: p.customerName },
        { t: ` paid ${money(p.amount)} on ${p.invoiceNumber}${p.mode ? ` via ${p.mode.toLowerCase()}` : ""}.` },
      ],
      when: `${p.paidOn}T12:00:00`,
      time: fmtLong(p.paidOn),
    });
  }
  for (const i of invoices) {
    if (i.sentAt) {
      items.push({
        key: `sent-${i.dbId}`,
        dot: "var(--brass)",
        parts: [
          { t: "Invoice " },
          { b: true, t: i.number },
          { t: ` sent to ${i.customerName} — ${money(i.total)}, ${i.terms}.` },
        ],
        when: i.sentAt,
        time: fmtLong(i.sentAt.slice(0, 10)),
      });
    } else if (i.status === "draft") {
      items.push({
        key: `draft-${i.dbId}`,
        dot: "var(--mut-2)",
        parts: [
          { t: "Draft " },
          { b: true, t: i.number },
          { t: ` created for ${i.customerName} — awaiting review.` },
        ],
        when: i.createdAt,
        time: fmtLong(i.createdAt.slice(0, 10)),
      });
    }
  }
  return items.sort((a, b) => b.when.localeCompare(a.when));
}

export function Dashboard() {
  const { customers, invoices, payments, summary, loading } = useBilling();
  const navigate = useNavigate();
  const { toast } = useToast();

  const open = invoices.filter(
    (i) => i.status !== "paid" && i.status !== "draft" && i.status !== "void",
  );
  const overdueInvs = invoices.filter((i) => i.status === "overdue");

  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const monthName = now.toLocaleDateString("en-US", { month: "long" });
  const collectedThisMonth = payments
    .filter((p) => p.paidOn.startsWith(monthKey))
    .reduce((s, p) => s + p.amount, 0);

  // Aging buckets by how long past due each open balance is.
  const buckets = [0, 0, 0, 0];
  for (const inv of open) {
    const d = daysSince(inv.due);
    if (d <= 0) buckets[0] += inv.balance;
    else if (d <= 30) buckets[1] += inv.balance;
    else if (d <= 60) buckets[2] += inv.balance;
    else buckets[3] += inv.balance;
  }
  const agingTotal = buckets.reduce((a, b) => a + b, 0) || 1;
  const agingColors = ["var(--bar-g1)", "var(--brass)", "var(--aging3)", "var(--red)"];
  const agingLabels = ["Current", "1–30 days", "31–60 days", "60+ days"];

  const recent = invoices.filter((i) => i.status !== "draft").slice(0, 5);
  const feed = buildFeed(invoices, payments).slice(0, 6);

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
        i.number,
        i.customerName,
        i.status,
        i.issued,
        i.due,
        i.total.toFixed(2),
        i.status === "draft" ? "" : i.balance.toFixed(2),
      ]),
    ];
    downloadCsv("brecx-ledger.csv", rows);
    toast("Ledger exported as CSV");
  }

  if (loading) {
    return (
      <div className="center-fill">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>{greeting}, Brecx</h1>
          <p>{today} · Here's where the money stands.</p>
        </div>
        <div className="right">
          <button className="btn btn-ghost" onClick={exportLedger}>
            Export ledger
          </button>
        </div>
      </div>

      <div className="cash-strip">
        <div className="cash-cell hero">
          <span className="kpi-ic">
            <KpiIcon name="banknote" />
          </span>
          <div className="lab">Outstanding</div>
          <div className="val">{money(summary.outstanding)}</div>
          <div className="sub">
            across <b>{summary.openCount} open invoices</b>
          </div>
        </div>
        <div className="cash-cell">
          <span className="kpi-ic r">
            <KpiIcon name="alert" />
          </span>
          <div className="lab">Overdue</div>
          <div className="val" style={{ color: "var(--red)" }}>
            {money(summary.overdue)}
          </div>
          <div className="sub">
            <b>{overdueInvs.length} invoices</b> past due date
          </div>
        </div>
        <div className="cash-cell">
          <span className="kpi-ic">
            <KpiIcon name="check" />
          </span>
          <div className="lab">Collected · {monthName}</div>
          <div className="val" style={{ color: "var(--green)" }}>
            {money(collectedThisMonth)}
          </div>
          <div className="sub">
            across <b>{payments.filter((p) => p.paidOn.startsWith(monthKey)).length} payments</b>
          </div>
        </div>
        <div className="cash-cell">
          <span className="kpi-ic b">
            <KpiIcon name="clock" />
          </span>
          <div className="lab">Avg. days to pay</div>
          <div className="val">
            {summary.avgDaysToPay === null ? "—" : summary.avgDaysToPay.toFixed(1)}
          </div>
          <div className="sub">across all paid invoices</div>
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
              {recent.length === 0 ? (
                <div className="empty-note">
                  <b>No invoices sent yet</b>
                  Send your first invoice and it lands here.
                </div>
              ) : (
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
                        <tr key={inv.dbId}>
                          <td>
                            <button
                              className="inv-id"
                              onClick={() => navigate(`/invoices/${inv.dbId}`)}
                            >
                              {inv.number}
                            </button>
                          </td>
                          <td>
                            <Cust customer={c} sub={`${c.type} · ${inv.terms}`} />
                          </td>
                          <td className="num">{fmtShort(inv.issued)}</td>
                          <td className="num right">{money(inv.total)}</td>
                          <td>
                            <Stamp status={inv.status} />
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="icon-btn"
                                title="View"
                                onClick={() => navigate(`/invoices/${inv.dbId}`)}
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
              )}
            </div>
          </div>

          <div className="card">
            <div className="panel-head">
              <h2>Receivables aging</h2>
            </div>
            <div className="aging">
              <div className="aging-note">
                {money(summary.outstanding)} outstanding, by how long it's been waiting
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
          {feed.length === 0 ? (
            <div className="empty-note">
              <b>Quiet so far</b>
              Invoice activity shows up here.
            </div>
          ) : (
            <ul className="feed">
              {feed.map((a) => (
                <li key={a.key}>
                  <span className="dot" style={{ background: a.dot }} />
                  <div>
                    {a.parts.map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <span key={i}>{p.t}</span>))}
                    <time>{a.time}</time>
                  </div>
                </li>
              ))}
            </ul>
          )}
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
