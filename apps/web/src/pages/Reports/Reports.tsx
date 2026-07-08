import { useBilling, moneyK, money } from "../../lib/store";
import { useToast } from "../../components/Toast";

interface MonthAgg {
  key: string; // YYYY-MM
  label: string;
  invoiced: number;
  collected: number;
}

/** Last six calendar months, aggregated from the real ledger. */
function lastSixMonths(): MonthAgg[] {
  const months: MonthAgg[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push({
      key: m.toISOString().slice(0, 7),
      label: m.toLocaleDateString("en-US", { month: "short" }),
      invoiced: 0,
      collected: 0,
    });
  }
  return months;
}

export function Reports() {
  const { invoices, payments, loading } = useBilling();
  const { toast } = useToast();

  const months = lastSixMonths();
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const inv of invoices) {
    if (inv.status === "draft" || inv.status === "void") continue;
    const m = byKey.get(inv.issued.slice(0, 7));
    if (m) m.invoiced += inv.total;
  }
  for (const p of payments) {
    const m = byKey.get(p.paidOn.slice(0, 7));
    if (m) m.collected += p.amount;
  }
  const max = Math.max(...months.map((m) => m.invoiced), 1);

  // Quarter summary — last 3 calendar months of real data.
  const quarter = months.slice(-3);
  const invoiced = quarter.reduce((s, m) => s + m.invoiced, 0);
  const collected = quarter.reduce((s, m) => s + m.collected, 0);

  const sent = invoices.filter((i) => i.status !== "draft" && i.status !== "void");
  const byCustomer = new Map<string, number>();
  for (const inv of sent) {
    byCustomer.set(inv.customerName, (byCustomer.get(inv.customerName) ?? 0) + inv.total);
  }
  const top = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0];
  const avgSize = sent.length > 0 ? sent.reduce((s, i) => s + i.total, 0) / sent.length : 0;
  const openBalance = sent.reduce((s, i) => s + i.balance, 0);

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
          <h1>Reports</h1>
          <p>Invoiced vs collected, last six months.</p>
        </div>
        <div className="right">
          <button className="btn btn-ghost" onClick={() => toast("Report PDF is coming with the Reports module")}>
            Download PDF
          </button>
        </div>
      </div>

      <div className="report-grid">
        <div className="card chart-card">
          <div className="chart-legend">
            <span>
              <i style={{ background: "var(--bar-g1)" }} />
              Invoiced
            </span>
            <span>
              <i style={{ background: "var(--brass)" }} />
              Collected
            </span>
          </div>
          {sent.length === 0 ? (
            <div className="empty-note">
              <b>No data yet</b>
              Send invoices and the chart draws itself.
            </div>
          ) : (
            <div className="bars">
              {months.map((m) => (
                <div className="bar-col" key={m.key}>
                  <div
                    className="bar"
                    style={{ height: `${(m.invoiced / max) * 78}%`, minHeight: m.invoiced > 0 ? 4 : 0 }}
                  >
                    <span className="tip">{moneyK(m.invoiced)}</span>
                    <div
                      className="paid-part"
                      style={{
                        height: `${m.invoiced > 0 ? Math.min(100, (m.collected / m.invoiced) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="bar-lab">{m.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="panel-head">
            <h2>Last 3 months</h2>
          </div>
          <div className="mini-rows">
            <div>
              <span>Total invoiced</span>
              <b>{money(invoiced)}</b>
            </div>
            <div>
              <span>Total collected</span>
              <b>{money(collected)}</b>
            </div>
            <div>
              <span>Collection rate</span>
              <b style={{ color: "var(--green)" }}>
                {invoiced > 0 ? ((collected / invoiced) * 100).toFixed(1) + "%" : "—"}
              </b>
            </div>
            <div>
              <span>Open balance</span>
              <b>{money(openBalance)}</b>
            </div>
            <div>
              <span>Top customer</span>
              <b>{top ? top[0] : "—"}</b>
            </div>
            <div>
              <span>Avg invoice size</span>
              <b>{sent.length > 0 ? moneyK(avgSize) : "—"}</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
