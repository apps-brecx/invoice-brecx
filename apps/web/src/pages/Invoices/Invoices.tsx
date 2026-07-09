import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useBilling,
  customerOf,
  money,
  fmtShort,
  type DisplayStatus,
  type Invoice,
} from "../../lib/store";
import { Stamp, DueText, KpiIcon } from "../../components/bits";
import { Menu } from "../../components/Menu";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../Dashboard/Dashboard";

/* Zoho-style saved views — each is a status filter with a friendly name. */
type Filter = "all" | DisplayStatus;
const VIEWS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "due", label: "Unpaid" },
  { key: "partial", label: "Partially Paid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
];

type SortKey = "date" | "number" | "customer" | "amount" | "balance";
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "date", label: "Created / invoice date" },
  { key: "number", label: "Invoice#" },
  { key: "customer", label: "Customer name" },
  { key: "amount", label: "Amount" },
  { key: "balance", label: "Balance due" },
];

function cmp(a: Invoice, b: Invoice, key: SortKey): number {
  switch (key) {
    case "date":
      return a.issued < b.issued ? -1 : a.issued > b.issued ? 1 : 0;
    case "number":
      return a.number.localeCompare(b.number);
    case "customer":
      return a.customerName.localeCompare(b.customerName);
    case "amount":
      return a.total - b.total;
    case "balance":
      return a.balance - b.balance;
  }
}

export function Invoices() {
  const { customers, invoices, summary, loading, refresh } = useBilling();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const [filter, setFilter] = useState<Filter>("all");
  const [viewsOpen, setViewsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDesc, setSortDesc] = useState(true);
  const [sel, setSel] = useState<Set<number>>(new Set());

  const searched = invoices.filter(
    (i) =>
      !q ||
      i.number.toLowerCase().includes(q) ||
      i.customerName.toLowerCase().includes(q) ||
      (i.orderNumber ?? "").toLowerCase().includes(q),
  );
  const counts = new Map<Filter, number>([["all", searched.length]]);
  for (const v of VIEWS) {
    if (v.key !== "all") counts.set(v.key, searched.filter((i) => i.status === v.key).length);
  }
  const rows = [...searched.filter((i) => filter === "all" || i.status === filter)].sort(
    (a, b) => (sortDesc ? -1 : 1) * cmp(a, b, sortKey),
  );

  const activeView = VIEWS.find((v) => v.key === filter)!;
  const allChecked = rows.length > 0 && rows.every((r) => sel.has(r.dbId));

  const toggleAll = () =>
    setSel(allChecked ? new Set() : new Set(rows.map((r) => r.dbId)));
  const toggleOne = (id: number) =>
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function exportCsv(only?: Set<number>) {
    const list = only ? rows.filter((r) => only.has(r.dbId)) : rows;
    downloadCsv("brecx-invoices.csv", [
      ["No.", "Order number", "Customer", "Status", "Issued", "Due", "Amount", "Balance"],
      ...list.map((i) => [
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
    toast(`Exported ${list.length} invoice${list.length === 1 ? "" : "s"} as CSV`);
  }

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key === "date" || key === "amount" || key === "balance");
    }
  }

  return (
    <section className="view">
      <div className="page-head">
        <div className="views-wrap">
          <button
            type="button"
            className={"views-title" + (viewsOpen ? " open" : "")}
            onClick={() => setViewsOpen((o) => !o)}
          >
            <h1>{activeView.key === "all" ? "All Invoices" : `${activeView.label} Invoices`}</h1>
            <i>▾</i>
          </button>
          {viewsOpen && (
            <div className="menu-pop views-pop">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={"menu-item" + (filter === v.key ? " active" : "")}
                  onClick={() => {
                    setFilter(v.key);
                    setViewsOpen(false);
                    setSel(new Set());
                  }}
                >
                  <span className="menu-lab">{v.label}</span>
                  {filter === v.key && <span className="menu-check">✓</span>}
                  <span className="menu-count">{counts.get(v.key) ?? 0}</span>
                </button>
              ))}
              <div className="menu-sep" />
              <button type="button" className="menu-item" disabled title="Custom views come with the Settings module">
                <span className="menu-ic">＋</span>
                <span className="menu-lab">New View</span>
              </button>
            </div>
          )}
          {viewsOpen && <div className="views-backdrop" onClick={() => setViewsOpen(false)} />}
        </div>
        <div className="right">
          <button className="btn btn-primary" onClick={() => navigate("/invoices/new")}>
            + New
          </button>
          <Menu
            align="right"
            trigger={<button className="btn btn-ghost icon-only">⋯</button>}
            items={[
              { heading: "Sort by" },
              ...SORTS.map((s) => ({
                label: s.key === sortKey ? `${s.label} ${sortDesc ? "↓" : "↑"}` : s.label,
                checked: s.key === sortKey,
                onClick: () => sortBy(s.key),
              })),
              { sep: true },
              { icon: "⤓", label: "Export (CSV)", onClick: () => exportCsv() },
              { icon: "⟳", label: "Refresh List", onClick: () => void refresh() },
              { sep: true },
              { icon: "⤒", label: "Import Invoices", disabled: true, title: "Coming later" },
              { icon: "⚙", label: "Preferences", disabled: true, title: "Settings module pending" },
              { icon: "▦", label: "Manage Custom Fields", disabled: true, title: "Settings module pending" },
            ]}
          />
        </div>
      </div>

      {/* Zoho-style payment summary */}
      <div className="cash-strip five">
        <div className="cash-cell hero">
          <span className="kpi-ic">
            <KpiIcon name="banknote" />
          </span>
          <div className="lab">Total Outstanding Receivables</div>
          <div className="val">{money(summary.outstanding)}</div>
          <div className="sub">
            across <b>{summary.openCount} open invoices</b>
          </div>
        </div>
        <div className="cash-cell">
          <span className="kpi-ic n">
            <KpiIcon name="calendar" />
          </span>
          <div className="lab">Due Today</div>
          <div className="val">{money(summary.dueToday)}</div>
        </div>
        <div className="cash-cell">
          <span className="kpi-ic b">
            <KpiIcon name="hourglass" />
          </span>
          <div className="lab">Due Within 30 Days</div>
          <div className="val" style={{ color: "var(--brass)" }}>
            {money(summary.due30)}
          </div>
        </div>
        <div className="cash-cell">
          <span className="kpi-ic r">
            <KpiIcon name="alert" />
          </span>
          <div className="lab">Overdue Invoices</div>
          <div className="val" style={{ color: "var(--red)" }}>
            {money(summary.overdue)}
          </div>
          <div className="sub">
            <b>{summary.overdueCount}</b> past due date
          </div>
        </div>
        <div className="cash-cell">
          <span className="kpi-ic n">
            <KpiIcon name="clock" />
          </span>
          <div className="lab">Avg. Days to Get Paid</div>
          <div className="val">
            {summary.avgDaysToPay === null ? "—" : summary.avgDaysToPay.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="list-toolbar">
        <label className="list-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoices by number, customer or order #…"
          />
          {search && (
            <button type="button" className="ls-clear" aria-label="Clear search" onClick={() => setSearch("")}>
              ✕
            </button>
          )}
        </label>
      </div>

      <div className="card">
        {sel.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">
              <strong>{sel.size}</strong> selected
            </span>
            <div className="bulk-actions">
              <button className="bb-btn" onClick={() => exportCsv(sel)}>
                Export CSV
              </button>
            </div>
            <button className="bb-close" aria-label="Clear selection" onClick={() => setSel(new Set())}>
              ✕
            </button>
          </div>
        )}
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
                : `No invoices match this view${q ? " and search" : ""}.`}
            </div>
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th className="sel-col">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  </th>
                  <th>Date</th>
                  <th>Invoice#</th>
                  <th>Order Number</th>
                  <th>Customer Name</th>
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
                      <td className="sel-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={sel.has(inv.dbId)}
                          onChange={() => toggleOne(inv.dbId)}
                        />
                      </td>
                      <td className="num">{fmtShort(inv.issued)}</td>
                      <td>
                        <span className="inv-id">
                          {inv.number}
                          {inv.orderNumber ? ` (${inv.orderNumber})` : ""}
                        </span>
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
                        {/* Zoho-style: open invoices show the countdown, others the stamp */}
                        {inv.status === "due" || inv.status === "overdue" ? (
                          <DueText status={inv.status} dueInDays={inv.dueInDays} />
                        ) : inv.status === "partial" ? (
                          <>
                            <Stamp status={inv.status} />
                            <DueText status={inv.status} dueInDays={inv.dueInDays} />
                          </>
                        ) : (
                          <Stamp status={inv.status} />
                        )}
                      </td>
                      <td className="num">{fmtShort(inv.due)}</td>
                      <td className="num right">{money(inv.total)}</td>
                      <td className="num right">{isDraft ? money(inv.total) : money(inv.balance)}</td>
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
