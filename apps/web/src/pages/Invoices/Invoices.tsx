import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useBilling,
  customerOf,
  invoiceTotals,
  invoiceBalance,
  daysSince,
  money,
  fmtShort,
  type InvoiceStatus,
} from "../../lib/store";
import { Stamp, Cust, STATUS_LABEL } from "../../components/bits";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../Dashboard/Dashboard";

type Filter = "all" | InvoiceStatus;
const FILTERS: Filter[] = ["all", "due", "overdue", "partial", "paid", "draft"];

export function Invoices() {
  const { customers, invoices, logActivity } = useBilling();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").toLowerCase();
  const [filter, setFilter] = useState<Filter>("all");

  const matchesQ = (invId: string, custName: string) =>
    !q || invId.toLowerCase().includes(q) || custName.toLowerCase().includes(q);

  const searched = invoices.filter((i) =>
    matchesQ(i.id, customerOf(customers, i.customerId).name),
  );
  const rows = searched.filter((i) => filter === "all" || i.status === filter);

  const counts: Record<Filter, number> = {
    all: searched.length,
    due: 0,
    overdue: 0,
    partial: 0,
    paid: 0,
    draft: 0,
  };
  for (const i of searched) counts[i.status]++;

  function exportCsv() {
    downloadCsv("brecx-invoices.csv", [
      ["No.", "Customer", "Status", "Issued", "Due", "Amount", "Balance"],
      ...rows.map((i) => [
        i.id,
        customerOf(customers, i.customerId).name,
        i.status,
        i.issued ?? "",
        i.due ?? "",
        invoiceTotals(i).grand.toFixed(2),
        i.status === "draft" ? "" : invoiceBalance(i).toFixed(2),
      ]),
    ]);
    toast(`Exported ${rows.length} invoices as CSV`);
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
          <h1>Invoices</h1>
          <p>The full ledger — every invoice, filterable by state.</p>
        </div>
        <div className="right">
          <button className="btn btn-ghost" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => navigate("/invoices/new")}>
            + New invoice
          </button>
        </div>
      </div>

      <div className="filter-row">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={"chip" + (filter === f ? " on" : "")}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : STATUS_LABEL[f]} <span className="n">{counts[f]}</span>
          </button>
        ))}
        {q && (
          <button className="chip" onClick={() => navigate("/invoices")}>
            Search: “{q}” ✕
          </button>
        )}
      </div>

      <div className="card">
        <div className="panel-body">
          {rows.length === 0 ? (
            <div className="empty-note">
              <b>Nothing here</b>
              No invoices match this filter{q ? " and search" : ""}.
            </div>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Customer</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th className="right">Amount</th>
                  <th className="right">Balance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const c = customerOf(customers, inv.customerId);
                  const isDraft = inv.status === "draft";
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
                      <td className="num">{fmtShort(inv.due)}</td>
                      <td className="num right">{money(invoiceTotals(inv).grand)}</td>
                      <td className="num right">{isDraft ? "—" : money(invoiceBalance(inv))}</td>
                      <td>
                        <Stamp status={inv.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {isDraft ? (
                            <button
                              className="icon-btn"
                              title="Edit draft"
                              onClick={() => navigate(`/invoices/new?inv=${inv.id}`)}
                            >
                              ✎
                            </button>
                          ) : inv.status === "paid" ? (
                            <button className="icon-btn" title="Receipt" onClick={() => toast(`Receipt for ${inv.id} downloaded`)}>
                              ⎙
                            </button>
                          ) : (
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
          )}
        </div>
      </div>
    </section>
  );
}
