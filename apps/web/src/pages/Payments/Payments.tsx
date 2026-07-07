import { useNavigate } from "react-router-dom";
import {
  useBilling,
  customerOf,
  invoiceTotals,
  money,
  fmtShort,
} from "../../lib/store";
import { Stamp, Cust } from "../../components/bits";

/** Money that actually arrived — every full or partial payment on record. */
export function Payments() {
  const { customers, invoices } = useBilling();
  const navigate = useNavigate();

  const paymentRows = invoices
    .filter((i) => i.paidAmount > 0)
    .sort((a, b) => (b.issued ?? "").localeCompare(a.issued ?? ""));
  const received = paymentRows.reduce((s, i) => s + i.paidAmount, 0);

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p>
            {money(received)} received across {paymentRows.length} payments.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="panel-body">
          {paymentRows.length === 0 ? (
            <div className="empty-note">
              <b>No payments yet</b>
              Payments appear here once invoices get paid.
            </div>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Issued</th>
                  <th className="right">Invoice total</th>
                  <th className="right">Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((inv) => {
                  const c = customerOf(customers, inv.customerId);
                  return (
                    <tr key={inv.id}>
                      <td>
                        <button className="inv-id" onClick={() => navigate(`/invoices/new?inv=${inv.id}`)}>
                          {inv.id}
                        </button>
                      </td>
                      <td>
                        <Cust customer={c} />
                      </td>
                      <td className="num">{fmtShort(inv.issued)}</td>
                      <td className="num right">{money(invoiceTotals(inv).grand)}</td>
                      <td className="num right" style={{ color: "var(--green)", fontWeight: 600 }}>
                        {money(inv.paidAmount)}
                      </td>
                      <td>
                        <Stamp status={inv.status} />
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
