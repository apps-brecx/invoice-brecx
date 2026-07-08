import { useNavigate } from "react-router-dom";
import { useBilling, customerOf, money, fmtShort } from "../../lib/store";
import { Cust } from "../../components/bits";

/** Money that actually arrived — every payment row on record. */
export function Payments() {
  const { customers, payments, loading } = useBilling();
  const navigate = useNavigate();

  const received = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p>
            {money(received)} received across {payments.length} payments.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="panel-body">
          {loading ? (
            <div className="center-fill" style={{ minHeight: "30vh" }}>
              <div className="spinner" />
            </div>
          ) : payments.length === 0 ? (
            <div className="empty-note">
              <b>No payments yet</b>
              Payments appear here once you record them on invoices.
            </div>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Mode</th>
                  <th>Reference</th>
                  <th className="right">Invoice total</th>
                  <th className="right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const c = customerOf(customers, p.customerId);
                  return (
                    <tr key={p.id}>
                      <td className="num">{fmtShort(p.paidOn)}</td>
                      <td>
                        <button
                          className="inv-id"
                          onClick={() => navigate(`/invoices/${p.invoiceId}`)}
                        >
                          {p.invoiceNumber}
                        </button>
                      </td>
                      <td>
                        <Cust customer={c} />
                      </td>
                      <td>{p.mode ?? "—"}</td>
                      <td className="num">{p.reference ?? "—"}</td>
                      <td className="num right">{money(p.invoiceTotal)}</td>
                      <td className="num right" style={{ color: "var(--green)", fontWeight: 600 }}>
                        {money(p.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
