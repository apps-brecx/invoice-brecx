import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useBilling, money, type Customer } from "../../lib/store";
import { api } from "../../lib/api";
import { Menu } from "../../components/Menu";
import { Pagination } from "../../components/Pagination";
import { Select } from "../../components/Select";
import { EmptyState, SearchOffIcon } from "../../components/EmptyState";
import { TableSkeleton } from "../../components/TableSkeleton";
import { ConfirmModal } from "../../components/ConfirmModal";
import { AddCustomerModal } from "../../components/CustomerModal";
import { ImportCustomersModal } from "../../components/ImportCustomersModal";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../Dashboard/Dashboard";

type View = "all" | "business" | "individual" | "open" | "overdue";

const PAGE_SIZES = [15, 25, 50, 100];

export function Customers() {
  const { customers, invoices, loading, refresh } = useBilling();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const [view, setView] = useState<View>("all");
  const [sortKey, setSortKey] = useState<"name" | "receivables">("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [editing, setEditing] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Sidebar quick-add lands on /customers?new=1 — open the modal, then
  // drop the param so refresh/back doesn't reopen it.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("new") === "1") {
      setAdding(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const openOf = (c: Customer) =>
    invoices
      .filter((i) => i.customerId === c.id && i.status !== "draft" && i.status !== "void")
      .reduce((s, i) => s + i.balance, 0);
  const hasOverdue = (c: Customer) =>
    invoices.some((i) => i.customerId === c.id && i.status === "overdue");

  const VIEWS: Array<{ key: View; label: string; title: string; test: (c: Customer) => boolean }> = [
    { key: "all", label: "All", title: "All Customers", test: () => true },
    { key: "business", label: "Business", title: "Business Customers", test: (c) => c.type === "Business" },
    { key: "individual", label: "Individual", title: "Individual Customers", test: (c) => c.type === "Individual" },
    { key: "open", label: "Open Balance", title: "Open Balance", test: (c) => openOf(c) > 0 },
    { key: "overdue", label: "Overdue", title: "Overdue Customers", test: hasOverdue },
  ];
  const activeView = VIEWS.find((v) => v.key === view)!;

  // Priceobo-style filters (orthogonal to the saved-view tabs).
  const [filterOpen, setFilterOpen] = useState(false);
  const [fTerms, setFTerms] = useState<Set<string>>(new Set());
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");
  const allTerms = [...new Set(customers.map((c) => c.terms).filter(Boolean))].sort();
  const filterCount = fTerms.size + (fMin ? 1 : 0) + (fMax ? 1 : 0);
  const toggleTerm = (t: string) =>
    setFTerms((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  const resetFilters = () => {
    setFTerms(new Set());
    setFMin("");
    setFMax("");
  };

  const searched = customers.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q),
  );
  const min = parseFloat(fMin);
  const max = parseFloat(fMax);
  const rows = [...searched.filter(activeView.test).filter((c) => {
    if (fTerms.size && !fTerms.has(c.terms)) return false;
    const open = openOf(c);
    if (fMin && !Number.isNaN(min) && open < min) return false;
    if (fMax && !Number.isNaN(max) && open > max) return false;
    return true;
  })].sort((a, b) => {
    const c = sortKey === "name" ? a.name.localeCompare(b.name) : openOf(a) - openOf(b);
    return sortDesc ? -c : c;
  });

  // Paged slice; the chosen page size sticks across visits.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = Number(localStorage.getItem("customers-page-size"));
    return PAGE_SIZES.includes(saved) ? saved : 25;
  });
  const changePageSize = (n: number) => {
    setPageSize(n);
    localStorage.setItem("customers-page-size", String(n));
  };
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => {
    setPage(1);
  }, [q, view, fTerms, fMin, fMax, pageSize]);

  const allChecked = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(pageRows.map((r) => r.id)));
  const toggleOne = (id: number) =>
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function markActive(active: boolean) {
    setBusy(true);
    try {
      for (const id of sel) await api.patch(`/clients/${id}/active`, { active });
      await refresh();
      toast(
        `${sel.size} customer${sel.size === 1 ? "" : "s"} marked as ${active ? "active" : "inactive"}`,
      );
      setSel(new Set());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const id of sel) {
      try {
        await api.del(`/clients/${id}`);
        ok++;
      } catch {
        failed++;
      }
    }
    await refresh();
    setSel(new Set());
    setBusy(false);
    if (failed > 0) {
      toast(
        `${ok} deleted — ${failed} skipped (customers with invoices can't be deleted)`,
        "error",
      );
    } else {
      toast(`${ok} customer${ok === 1 ? "" : "s"} deleted`);
    }
  }

  async function openEdit(id: number) {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = await api.get<{ client: any }>(`/clients/${id}`);
      setEditing(res.client);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load customer", "error");
    }
  }

  function exportCsv() {
    downloadCsv("brecx-customers.csv", [
      ["Name", "Type", "Company", "Email", "Work phone", "Payment terms", "Receivables"],
      ...rows.map((c) => [
        c.name,
        c.type,
        c.company ?? "",
        c.email ?? "",
        c.phone ?? "",
        c.terms,
        openOf(c).toFixed(2),
      ]),
    ]);
    toast(`Exported ${rows.length} customers as CSV`);
  }

  return (
    <section className="view">
      <div className="page-head">
        <h1>{activeView.title}</h1>
      </div>

      <div className="list-toolbar with-actions">
        <label className="list-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, company or email…"
          />
          {search && (
            <button type="button" className="ls-clear" aria-label="Clear search" onClick={() => setSearch("")}>
              ✕
            </button>
          )}
        </label>
        <div className="tb-right">
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + New
          </button>
          <Menu
            align="right"
            trigger={<button className="btn btn-ghost icon-only">⋯</button>}
            items={[
              { heading: "Sort by" },
              {
                label: sortKey === "name" ? `Name ${sortDesc ? "↓" : "↑"}` : "Name",
                checked: sortKey === "name",
                onClick: () =>
                  sortKey === "name" ? setSortDesc((d) => !d) : (setSortKey("name"), setSortDesc(false)),
              },
              {
                label: sortKey === "receivables" ? `Receivables ${sortDesc ? "↓" : "↑"}` : "Receivables",
                checked: sortKey === "receivables",
                onClick: () =>
                  sortKey === "receivables"
                    ? setSortDesc((d) => !d)
                    : (setSortKey("receivables"), setSortDesc(true)),
              },
              { sep: true },
              { icon: "⤓", label: "Export (CSV)", onClick: exportCsv },
              { icon: "⟳", label: "Refresh List", onClick: () => void refresh() },
              { sep: true },
              { icon: "⤒", label: "Import Customers", onClick: () => setImporting(true) },
              { icon: "⚙", label: "Preferences", disabled: true, title: "Settings module pending" },
            ]}
          />
        </div>
      </div>

      <div className="tab-row">
        <div className="tabs">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={"tab" + (view === v.key ? " on" : "")}
              onClick={() => {
                setView(v.key);
                setSel(new Set());
              }}
            >
              {v.label}
              <span className="tab-n">{searched.filter(v.test).length}</span>
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
                  <h5>Payment Terms</h5>
                  {allTerms.length === 0 ? (
                    <span style={{ fontSize: 12.5, color: "var(--mut-2)" }}>No terms on any customer yet</span>
                  ) : (
                    <div className="filter-checks">
                      {allTerms.map((t) => (
                        <label className="filter-check" key={t}>
                          <input type="checkbox" checked={fTerms.has(t)} onChange={() => toggleTerm(t)} />
                          {t}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="filter-sec">
                  <h5>Receivables Range</h5>
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

      {!loading && rows.length === 0 ? (
        customers.length === 0 ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3.5" />
                <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
                <circle cx="17.5" cy="9" r="2.5" />
                <path d="M16 14.7c2.6.3 4.7 2 5.5 4.8" />
              </svg>
            }
            title="No customers yet"
            note="Add your first customer to start invoicing — their details prefill every invoice you create for them."
            action={
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                + New Customer
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={<SearchOffIcon />}
            title="Nothing here"
            note="No customers match this view — try a different tab, or adjust your search and filters."
          />
        )
      ) : (
      <div className="card">
        {sel.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">
              <strong>{sel.size}</strong> selected
            </span>
            <div className="bulk-actions">
              <button className="bb-btn" disabled={busy} onClick={() => void markActive(true)}>
                Mark as Active
              </button>
              <button className="bb-btn" disabled={busy} onClick={() => void markActive(false)}>
                Mark as Inactive
              </button>
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
          ) : (
            <table className="ledger">
              <thead>
                <tr>
                  <th className="sel-col">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  </th>
                  <th>Name</th>
                  <th>Company Name</th>
                  <th>Email</th>
                  <th>Work Phone</th>
                  <th className="right">Receivables</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => {
                  const open = openOf(c);
                  return (
                    <tr
                      key={c.id}
                      className={"row-link" + (c.active ? "" : " row-muted")}
                      onClick={() => navigate(`/customers/${c.id}`)}
                    >
                      <td className="sel-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={sel.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                        />
                      </td>
                      <td>
                        <div className="cust">
                          <div className="cust-dot" style={{ background: c.dotBg, color: c.dotFg }}>
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <b>
                              {c.name}
                              {!c.active && (
                                <span className="stamp void" style={{ marginLeft: 8 }}>
                                  Inactive
                                </span>
                              )}
                            </b>
                            <span>{c.type} · {c.terms}</span>
                          </div>
                        </div>
                      </td>
                      <td className="mut-cell">{c.company ?? "—"}</td>
                      <td className="mut-cell">{c.email ?? "—"}</td>
                      <td className="num">{c.phone ?? "—"}</td>
                      <td
                        className="num right"
                        style={hasOverdue(c) ? { color: "var(--red)", fontWeight: 600 } : undefined}
                      >
                        {money(open)}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            title="Edit customer"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openEdit(c.id);
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                          </button>
                          <button
                            className="icon-btn"
                            title="View customer"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/customers/${c.id}`);
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
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
              {rows.length.toLocaleString("en-US")} customer{rows.length === 1 ? "" : "s"} · page{" "}
              {safePage} of {pageCount}
            </span>
            <span className="lf-size">
              Show
              <Select
                value={pageSize}
                options={PAGE_SIZES}
                onChange={changePageSize}
                ariaLabel="Customers per page"
              />
              per page
            </span>
            <Pagination page={safePage} pages={pageCount} onPage={setPage} />
          </div>
        )}
      </div>
      )}

      {importing && (
        <ImportCustomersModal
          onClose={() => setImporting(false)}
          onImported={async (ok) => {
            await refresh();
            toast(`${ok} customer${ok === 1 ? "" : "s"} imported`);
          }}
        />
      )}

      {adding && (
        <AddCustomerModal
          onClose={() => setAdding(false)}
          onAdded={async (c) => {
            setAdding(false);
            await refresh();
            toast(`${c.name} added to customers`);
          }}
        />
      )}
      {editing && (
        <AddCustomerModal
          initial={editing}
          onClose={() => setEditing(null)}
          onAdded={async (c) => {
            setEditing(null);
            await refresh();
            toast(`${c.name} saved`);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${sel.size} customer${sel.size === 1 ? "" : "s"}?`}
          message={
            <>
              Selected customer{sel.size === 1 ? "" : "s"} will be permanently deleted.
              Customers with invoices are skipped — void or delete their invoices first.
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
