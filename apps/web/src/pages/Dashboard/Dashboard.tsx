import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { INVOICE_STATUS_LABELS } from "@inv/shared";
import { api } from "../../lib/api";
import { formatMoney, formatDate } from "../../lib/format";
import { statusBadgeClass, type InvoiceRow, type InvoiceStatRow } from "../../lib/invoices";

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "dashboard"],
    queryFn: () =>
      api.get<{ invoices: InvoiceRow[]; stats: InvoiceStatRow[] }>("/invoices?limit=8"),
  });

  const stats = data?.stats ?? [];
  const sum = (statuses: string[]) =>
    stats
      .filter((s) => statuses.includes(s.status))
      .reduce((acc, s) => acc + Number(s.sum), 0);
  const count = (statuses: string[]) =>
    stats.filter((s) => statuses.includes(s.status)).reduce((acc, s) => acc + s.n, 0);

  return (
    <>
      <div className="stats">
        <div className="card">
          <div className="label">Outstanding</div>
          <div className="value">{formatMoney(sum(["sent", "overdue"]))}</div>
        </div>
        <div className="card">
          <div className="label">Overdue</div>
          <div className="value">{count(["overdue"])}</div>
        </div>
        <div className="card">
          <div className="label">Paid</div>
          <div className="value">{formatMoney(sum(["paid"]))}</div>
        </div>
        <div className="card">
          <div className="label">Drafts</div>
          <div className="value">{count(["draft"])}</div>
        </div>
      </div>

      <div className="panel">
        <div className="head">
          <div>
            <h2>Recent invoices</h2>
            <div className="desc">The latest invoices across all clients.</div>
          </div>
          <Link className="btn primary" to="/invoices">
            All invoices
          </Link>
        </div>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : (data?.invoices.length ?? 0) === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div className="empty-state-title">No invoices yet</div>
            <div className="empty-state-desc">
              Add a client, then create your first invoice from the Invoices page.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data!.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="order-id">
                      <Link to={`/invoices/${inv.id}`}>{inv.number ?? `#${inv.id}`}</Link>
                    </td>
                    <td>
                      <span className="name">{inv.client_name}</span>
                      {inv.client_company && <div className="muted">{inv.client_company}</div>}
                    </td>
                    <td>
                      <span className={statusBadgeClass(inv.status)}>
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    <td>{formatDate(inv.issue_date)}</td>
                    <td>{formatDate(inv.due_date)}</td>
                    <td>{formatMoney(inv.total, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
