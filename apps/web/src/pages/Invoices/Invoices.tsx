import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useBilling,
  customerOf,
  money,
  fmtShort,
  type DisplayStatus,
  type Invoice,
} from "../../lib/store";
import { api } from "../../lib/api";
import { exportInvoicesPdf, exportInvoicesZip } from "../../lib/invoicePdf";
import { useTemplate } from "../../lib/template";
import { Stamp, DueText, KpiIcon, ActionIcon } from "../../components/bits";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ImportInvoicesModal } from "../../components/ImportInvoicesModal";
import { Menu } from "../../components/Menu";
import { Pagination } from "../../components/Pagination";
import { Select } from "../../components/Select";
import { TableSkeleton } from "../../components/TableSkeleton";
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

const PAGE_SIZES = [15, 25, 50, 100];

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
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDesc, setSortDesc] = useState(true);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Priceobo-style filters (orthogonal to the saved-view tabs) — also hosts
  // the Sort By options, customers-page style.
  const [filterOpen, setFilterOpen] = useState(false);
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");
  const filterCount = (fMin ? 1 : 0) + (fMax ? 1 : 0);
  const resetFilters = () => {
    setFMin("");
    setFMax("");
    setSortKey("date");
    setSortDesc(true);
  };
  const { template } = useTemplate();
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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
  const min = parseFloat(fMin);
  const max = parseFloat(fMax);
  const rows = [...searched
    .filter((i) => filter === "all" || i.status === filter)
    .filter((i) => {
      if (fMin && !Number.isNaN(min) && i.total < min) return false;
      if (fMax && !Number.isNaN(max) && i.total > max) return false;
      return true;
    })].sort((a, b) => (sortDesc ? -1 : 1) * cmp(a, b, sortKey));

  const activeView = VIEWS.find((v) => v.key === filter)!;

  // Paged slice; the chosen page size sticks across visits.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = Number(localStorage.getItem("invoices-page-size"));
    return PAGE_SIZES.includes(saved) ? saved : 25;
  });
  const changePageSize = (n: number) => {
    setPageSize(n);
    localStorage.setItem("invoices-page-size", String(n));
  };
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => {
    setPage(1);
  }, [q, filter, fMin, fMax, pageSize]);

  const allChecked = pageRows.length > 0 && pageRows.every((r) => sel.has(r.dbId));

  const toggleAll = () =>
    setSel(allChecked ? new Set() : new Set(pageRows.map((r) => r.dbId)));
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

  // Zoho-style bulk operations over the selection. Sent/void/paid invoices
  // can't be marked sent again or deleted — those are skipped with a note.
  const selDrafts = invoices.filter((i) => sel.has(i.dbId) && i.status === "draft");

  async function markSelectedSent() {
    setBusy(true);
    try {
      for (const inv of selDrafts) {
        await api.patch(`/invoices/${inv.dbId}/status`, { status: "sent" });
      }
      await refresh();
      toast(`${selDrafts.length} invoice${selDrafts.length === 1 ? "" : "s"} marked as sent`);
      setSel(new Set());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  }

  // Zoho-style bulk export: combined PDF, or a ZIP of one PDF per invoice.
  async function exportSelected(kind: "pdf" | "zip") {
    if (exporting) return;
    const ids = [...sel];
    try {
      setExporting("0/" + ids.length);
      const onProgress = (done: number, total: number) => setExporting(`${done}/${total}`);
      if (kind === "pdf") await exportInvoicesPdf(ids, template, onProgress);
      else await exportInvoicesZip(ids, template, onProgress);
      toast(
        `Exported ${ids.length} invoice${ids.length === 1 ? "" : "s"} as ${kind === "pdf" ? "PDF" : "ZIP"}`,
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(null);
    }
  }

  async function deleteSelected() {
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const id of sel) {
      try {
        await api.del(`/invoices/${id}`);
        ok++;
      } catch {
        failed++;
      }
    }
    await refresh();
    setSel(new Set());
    setBusy(false);
    if (failed > 0) {
      toast(`${ok} deleted — ${failed} skipped (only drafts can be deleted)`, "error");
    } else {
      toast(`${ok} draft${ok === 1 ? "" : "s"} deleted`);
    }
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
        <h1>{activeView.key === "all" ? "All Invoices" : `${activeView.label} Invoices`}</h1>
        <div className="right">
          <button className="btn btn-primary" onClick={() => navigate("/invoices/new")}>
            + New
          </button>
          <Menu
            align="right"
            trigger={<button className="btn btn-ghost icon-only">⋯</button>}
            items={[
              { icon: "⤓", label: "Export (CSV)", onClick: () => exportCsv() },
              { icon: "⟳", label: "Refresh List", onClick: () => void refresh() },
              { sep: true },
              { icon: <ActionIcon name="upload" />, label: "Import Invoices", onClick: () => setImporting(true) },
              { icon: "⚙", label: "Preferences", disabled: true, title: "Settings module pending" },
              { icon: "▦", label: "Manage Custom Fields", disabled: true, title: "Settings module pending" },
            ]}
          />
        </div>
      </div>

      {/* Zoho-style payment summary — shimmer bars (same as the table
          skeleton) while the store loads. */}
      {loading ? (
        <div className="cash-strip five" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div className={"cash-cell skel-cell" + (i === 0 ? " hero" : "")} key={i}>
              <span className="skel-bar" style={{ width: i === 0 ? "58%" : "64%", height: 10 }} />
              <span className="skel-bar" style={{ width: i === 0 ? "44%" : "38%", height: 22 }} />
              {i === 0 && <span className="skel-bar" style={{ width: "50%", height: 9 }} />}
            </div>
          ))}
        </div>
      ) : (
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
      )}

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

      <div className="tab-row">
        <div className="tabs">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={"tab" + (filter === v.key ? " on" : "")}
              onClick={() => {
                setFilter(v.key);
                setSel(new Set());
              }}
            >
              {v.label}
              <span className="tab-n">{counts.get(v.key) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="filter-wrap">
          <button
            type="button"
            className={"btn btn-ghost filter-btn" + (filterCount > 0 ? " on" : "")}
            onClick={() => setFilterOpen((o) => !o)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            Filters
            {filterCount > 0 && <span className="filter-badge">{filterCount}</span>}
          </button>
          {filterOpen && (
            <>
              <div className="filter-pop">
                <div className="filter-sec">
                  <h5>Sort By</h5>
                  <div className="filter-sorts">
                    {SORTS.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        className={"sort-opt" + (sortKey === s.key ? " on" : "")}
                        title={sortKey === s.key ? "Click again to flip the direction" : undefined}
                        onClick={() => sortBy(s.key)}
                      >
                        {s.label}
                        {sortKey === s.key && <i>{sortDesc ? "↓" : "↑"}</i>}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="filter-sec">
                  <h5>Amount Range</h5>
                  <div className="filter-range">
                    <input
                      type="number"
                      min="0"
                      placeholder="Min"
                      value={fMin}
                      onChange={(e) => setFMin(e.target.value)}
                    />
                    <span>–</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Max"
                      value={fMax}
                      onChange={(e) => setFMax(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-foot">
                  <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                    Reset
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setFilterOpen(false)}>
                    Apply
                  </button>
                </div>
              </div>
              <div className="filter-backdrop" onClick={() => setFilterOpen(false)} />
            </>
          )}
        </div>
      </div>

      <div className="card">
        {sel.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">
              <strong>{sel.size}</strong> selected
            </span>
            <div className="bulk-actions">
              <button
                className="bb-btn"
                disabled={busy || selDrafts.length === 0}
                title={selDrafts.length === 0 ? "Only drafts can be marked as sent" : undefined}
                onClick={() => void markSelectedSent()}
              >
                Mark as Sent
              </button>
              <Menu
                up
                trigger={
                  <button className="bb-btn" disabled={busy || exporting !== null}>
                    {exporting ? `Exporting ${exporting}…` : "Export ▾"}
                  </button>
                }
                items={[
                  { icon: "⤓", label: "Export as PDF", onClick: () => void exportSelected("pdf") },
                  { icon: "⧉", label: "Export as ZIP (Files)", onClick: () => void exportSelected("zip") },
                  { sep: true },
                  { icon: "▤", label: "Export as CSV", onClick: () => exportCsv(sel) },
                ]}
              />
              <button
                className="bb-btn danger bb-icon"
                disabled={busy}
                title="Delete selected"
                aria-label="Delete selected"
                onClick={() => setConfirmDelete(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M19 6l-.8 13.2A2 2 0 0 1 16.2 21H7.8a2 2 0 0 1-2-1.8L5 6" />
                  <path d="M10 11v5M14 11v5" />
                </svg>
              </button>
            </div>
            <button className="bb-close" aria-label="Clear selection" onClick={() => setSel(new Set())}>
              ✕
            </button>
          </div>
        )}
        <div className="panel-body">
          {loading ? (
            <TableSkeleton rows={8} />
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
                {pageRows.map((inv) => {
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
        {!loading && rows.length > 0 && (
          <div className="list-foot">
            <span className="lf-info">
              {rows.length.toLocaleString("en-US")} invoice{rows.length === 1 ? "" : "s"} · page{" "}
              {safePage} of {pageCount}
            </span>
            <span className="lf-size">
              Show
              <Select
                value={pageSize}
                options={PAGE_SIZES}
                onChange={changePageSize}
                ariaLabel="Invoices per page"
              />
              per page
            </span>
            <Pagination page={safePage} pages={pageCount} onPage={setPage} />
          </div>
        )}
      </div>

      {importing && (
        <ImportInvoicesModal
          customers={customers}
          onClose={() => setImporting(false)}
          onImported={async (ok) => {
            await refresh();
            toast(`${ok} invoice${ok === 1 ? "" : "s"} imported`);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${sel.size} invoice${sel.size === 1 ? "" : "s"}?`}
          message={
            <>
              Selected draft{sel.size === 1 ? "" : "s"} will be permanently deleted. Sent or
              paid invoices are skipped — void those instead.
            </>
          }
          confirmLabel="Yes, delete"
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteSelected();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
