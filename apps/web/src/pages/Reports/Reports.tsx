import { MONTHLY, useBilling, customerOf, invoiceTotals, moneyK } from "../../lib/store";
import { useToast } from "../../components/Toast";

export function Reports() {
  const { customers, invoices } = useBilling();
  const { toast } = useToast();

  const max = Math.max(...MONTHLY.map((m) => m.invoiced));

  // Quarter summary (last 3 months of the series + live invoice data).
  const quarter = MONTHLY.slice(-3);
  const invoiced = quarter.reduce((s, m) => s + m.invoiced, 0) * 1000;
  const collected = quarter.reduce((s, m) => s + m.invoiced * m.collectedShare, 0) * 1000;

  const byCustomer = new Map<string, number>();
  for (const inv of invoices) {
    byCustomer.set(
      inv.customerId,
      (byCustomer.get(inv.customerId) ?? 0) + invoiceTotals(inv).grand,
    );
  }
  const top = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0];
  const topName = top ? customerOf(customers, top[0]).name : "—";
  const avgSize =
    invoices.length > 0
      ? invoices.reduce((s, i) => s + invoiceTotals(i).grand, 0) / invoices.length
      : 0;

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Invoiced vs collected, last six months.</p>
        </div>
        <div className="right">
          <button className="btn btn-ghost" onClick={() => toast("Report PDF is being prepared")}>
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
          <div className="bars">
            {MONTHLY.map((m) => (
              <div className="bar-col" key={m.label}>
                <div className="bar" style={{ height: `${(m.invoiced / max) * 78}%` }}>
                  <span className="tip">${m.invoiced.toFixed(1)}k</span>
                  <div className="paid-part" style={{ height: `${m.collectedShare * 100}%` }} />
                </div>
                <span className="bar-lab">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="panel-head">
            <h2>This quarter</h2>
          </div>
          <div className="mini-rows">
            <div>
              <span>Total invoiced</span>
              <b>${Math.round(invoiced).toLocaleString("en-US")}</b>
            </div>
            <div>
              <span>Total collected</span>
              <b>${Math.round(collected).toLocaleString("en-US")}</b>
            </div>
            <div>
              <span>Collection rate</span>
              <b style={{ color: "var(--green)" }}>{((collected / invoiced) * 100).toFixed(1)}%</b>
            </div>
            <div>
              <span>Write-offs</span>
              <b>$640</b>
            </div>
            <div>
              <span>Top customer</span>
              <b>{topName}</b>
            </div>
            <div>
              <span>Avg invoice size</span>
              <b>{moneyK(avgSize)}</b>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
