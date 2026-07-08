import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useBilling,
  customerOf,
  money,
  fmtShort,
  type DisplayStatus,
} from "../../lib/store";
import { Stamp, DueText, STATUS_LABEL } from "../../components/bits";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../Dashboard/Dashboard";

type Filter = "all" | DisplayStatus;
const FILTERS: Filter[] = ["all", "due", "overdue", "partial", "paid", "draft", "void"];

export function Invoices() {
  const { customers, invoices, summary, loading } = useBilling();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").toLowerCase();
  const [filter, setFilter] = useState<Filter>("all");

  const searched = invoices.filter(
    (i) =>
      !q ||
      i.number.toLowerCase().includes(q) ||
      i.customerName.toLowerCase().includes(q) ||
      (i.orderNumber ?? "").toLowerCase().includes(q),
  );
  const rows = searched.filter((i) => filter === "all" || i.status === filter);

  const counts: Record<Filter, number> = {
    all: searched.length,
    due: 0,
    overdue: 0,
    partial: 0,
    paid: 0,
    draft: 0,
    void: 0,
  };
  for (const i of searched) counts[i.status]++;

  function exportCsv() {
    downloadCsv("brecx-invoices.csv", [
      ["No.", "Order number", "Customer", "Status", "Issued", "Due", "Amount", "Balance"],
      ...rows.map((i) => [
        i.number,
        i.orderNumber ?? "",
        i.customerName,
        i.status,
        i.issued,
        i.due,
        i.total.toFixed(2),
        i.status === "draft" ? "" : i.balance.toFixed(2),
      ]),
    ]);
    toast(`Exported ${rows.length} invoices as CSV`);
  }

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>All Invoices</h1>
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

      {/* Zoho-style payment summary */}
      <div className="cash-strip five">
        <div className="cash-cell hero">
          <div className="lab">Total Outstanding Receivables</div>
          <div className="val">{money(summary.outstanding)}</div>
          <div className="sub">
            across <b>{summary.openCount} open invoices</b>
          </div>
        </div>
        <div className="cash-cell">
          <div className="lab">Due Today</div>
          <div className="val">{money(summary.dueToday)}</div>
        </div>
        <div className="cash-cell">
          <div className="lab">Due Within 30 Days</div>
          <div className="val" style={{ color: "var(--brass)" }}>
            {money(summary.due30)}
          </div>
        </div>
        <div className="cash-cell">
          <div className="lab">Overdue Invoices</div>
          <div className="val" style={{ color: "var(--red)" }}>
            {money(summary.overdue)}
          </div>
          <div className="sub">
            <b>{summary.overdueCount}</b> past due date
          </div>
        </div>
        <div className="cash-cell">
          <div className="lab">Avg. Days to Get Paid</div>
          <div className="val">
            {summary.avgDaysToPay === null ? "—" : summary.avgDaysToPay.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="filter-row">
        {FILTERS.filter((f) => f !== "void" || counts.void > 0).map((f) => (
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
          {loading ? (
            <div className="center-fill" style={{ minHeight: "30vh" }}>
              <div className="spinner" />
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-note">
              <b>{invoices.length === 0 ? "No invoices yet" : "Nothing here"}</b>
              {invoices.length === 0
                ? "Create your first invoice to start the ledger."
                : `No invoices match this filter${q ? " and search" : ""}.`}
            </div>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice#</th>
                  <th>Order Number</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th className="right">Amount</th>
                  <th className="right">Balance Due</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const c = customerOf(customers, inv.customerId);
                  const isDraft = inv.status === "draft";
                  return (
                    <tr
                      key={inv.dbId}
                      className="row-link"
                      onClick={() => navigate(`/invoices/${inv.dbId}`)}
                    >
                      <td className="num">{fmtShort(inv.issued)}</td>
                      <td>
                        <span className="inv-id">{inv.number}</span>
                      </td>
                      <td className="num">{inv.orderNumber ?? "—"}</td>
                      <td>
                        <div className="cust">
                          <div
                            className="cust-dot"
                            style={{ background: c.dotBg, color: c.dotFg }}
                          >
                            {c.name === "Unknown" ? "?" : c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <b>{inv.customerName}</b>
                            <span>{inv.terms}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Stamp status={inv.status} />
                        <DueText status={inv.status} dueInDays={inv.dueInDays} />
                      </td>
                      <td className="num">{fmtShort(inv.due)}</td>
                      <td className="num right">{money(inv.total)}</td>
                      <td className="num right">{isDraft ? "—" : money(inv.balance)}</td>
                      <td>
                        <div className="row-actions">
                          {isDraft && (
                            <button
                              className="icon-btn"
                              title="Edit draft"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/invoices/${inv.dbId}/edit`);
                              }}
                            >
                              ✎
                            </button>
                          )}
                          <button
                            className="icon-btn"
                            title="View"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/invoices/${inv.dbId}`);
                            }}
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
