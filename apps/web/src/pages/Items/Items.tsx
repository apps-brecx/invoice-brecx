import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useBilling, money, type Item } from "../../lib/store";
import { api } from "../../lib/api";
import { Menu } from "../../components/Menu";
import { Pagination } from "../../components/Pagination";
import { Select } from "../../components/Select";
import { EmptyState, BoxIcon, SearchOffIcon } from "../../components/EmptyState";
import { TableSkeleton } from "../../components/TableSkeleton";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ImportItemsModal } from "../../components/ImportItemsModal";
import { NewItemModal } from "../../components/ItemModal";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../Dashboard/Dashboard";

const PAGE_SIZES = [15, 25, 50, 100];

/* Zoho-style saved views for items. */
type View = "all" | "active" | "inactive" | "goods" | "services";
const VIEWS: Array<{ key: View; label: string; test: (i: Item) => boolean }> = [
  { key: "all", label: "All", test: () => true },
  { key: "active", label: "Active", test: (i) => i.active },
  { key: "inactive", label: "Inactive", test: (i) => !i.active },
  { key: "goods", label: "Goods", test: (i) => i.type === "Goods" },
  { key: "services", label: "Services", test: (i) => i.type === "Service" },
];

type SortKey = "name" | "rate";

export function Items() {
  const { items, loading, refresh } = useBilling();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const [view, setView] = useState<View>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  // Sidebar quick-add lands on /items?new=1 — open the modal, then drop the
  // param so refresh/back doesn't reopen it.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("new") === "1") {
      setAdding(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  // Priceobo-style filters (orthogonal to the saved view).
  const [filterOpen, setFilterOpen] = useState(false);
  const [fUnits, setFUnits] = useState<Set<string>>(new Set());
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");
  const allUnits = [...new Set(items.map((i) => i.unit).filter((u): u is string => !!u))].sort();
  const filterCount = fUnits.size + (fMin ? 1 : 0) + (fMax ? 1 : 0);
  const toggleUnit = (u: string) =>
    setFUnits((cur) => {
      const next = new Set(cur);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  const resetFilters = () => {
    setFUnits(new Set());
    setFMin("");
    setFMax("");
  };

  const searched = items.filter(
    (i) =>
      !q ||
      i.name.toLowerCase().includes(q) ||
      (i.description ?? "").toLowerCase().includes(q),
  );
  const activeView = VIEWS.find((v) => v.key === view)!;
  const min = parseFloat(fMin);
  const max = parseFloat(fMax);
  const rows = [...searched.filter(activeView.test).filter((i) => {
    if (fUnits.size && !(i.unit && fUnits.has(i.unit))) return false;
    if (fMin && !Number.isNaN(min) && i.sellingPrice < min) return false;
    if (fMax && !Number.isNaN(max) && i.sellingPrice > max) return false;
    return true;
  })].sort((a, b) => {
    const c = sortKey === "name" ? a.name.localeCompare(b.name) : a.sellingPrice - b.sellingPrice;
    return sortDesc ? -c : c;
  });

  // Paged slice of the filtered rows; jump back to page 1 whenever the
  // visible set changes shape (search, view, filters, page size). The chosen
  // page size sticks across visits via localStorage.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = Number(localStorage.getItem("items-page-size"));
    return PAGE_SIZES.includes(saved) ? saved : 25;
  });
  const changePageSize = (n: number) => {
    setPageSize(n);
    localStorage.setItem("items-page-size", String(n));
  };
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => {
    setPage(1);
  }, [q, view, fUnits, fMin, fMax, pageSize]);

  const allChecked = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(pageRows.map((r) => r.id)));
  const toggleOne = (id: number) =>
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function bulk(fn: (id: number) => Promise<unknown>, doneMsg: string) {
    setBusy(true);
    try {
      for (const id of sel) await fn(id);
      await refresh();
      toast(doneMsg);
      setSel(new Set());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  }

  const markActive = (active: boolean) =>
    bulk(
      (id) => api.patch(`/items/${id}/active`, { active }),
      `${sel.size} item${sel.size === 1 ? "" : "s"} marked as ${active ? "active" : "inactive"}`,
    );
  const deleteSelected = () =>
    bulk((id) => api.del(`/items/${id}`), `${sel.size} item${sel.size === 1 ? "" : "s"} deleted`);

  function exportCsv() {
    downloadCsv("brecx-items.csv", [
      ["Name", "Type", "Description", "Rate", "Usage unit", "Status"],
      ...rows.map((i) => [
        i.name,
        i.type,
        i.description ?? "",
        i.sellingPrice.toFixed(2),
        i.unit ?? "",
        i.active ? "Active" : "Inactive",
      ]),
    ]);
    toast(`Exported ${rows.length} items as CSV`);
  }

  return (
    <section className="view">
      <div className="list-toolbar with-actions">
        <label className="list-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items by name or description…"
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
                onClick: () => (sortKey === "name" ? setSortDesc((d) => !d) : (setSortKey("name"), setSortDesc(false))),
              },
              {
                label: sortKey === "rate" ? `Rate ${sortDesc ? "↓" : "↑"}` : "Rate",
                checked: sortKey === "rate",
                onClick: () => (sortKey === "rate" ? setSortDesc((d) => !d) : (setSortKey("rate"), setSortDesc(true))),
              },
              { sep: true },
              { icon: "⤓", label: "Export (CSV)", onClick: exportCsv },
              { icon: "⟳", label: "Refresh List", onClick: () => void refresh() },
              { sep: true },
              { icon: "⤒", label: "Import Items", onClick: () => setImporting(true) },
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
                  <h5>Usage Unit</h5>
                  {allUnits.length === 0 ? (
                    <span style={{ fontSize: 12.5, color: "var(--mut-2)" }}>No units on any item yet</span>
                  ) : (
                    <div className="filter-checks">
                      {allUnits.map((u) => (
                        <label className="filter-check" key={u}>
                          <input type="checkbox" checked={fUnits.has(u)} onChange={() => toggleUnit(u)} />
                          {u}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="filter-sec">
                  <h5>Price Range</h5>
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
        items.length === 0 ? (
          <EmptyState
            icon={<BoxIcon />}
            title="No items yet"
            note="Add the products or services you sell — picking one prefills invoice lines with its description and rate."
            action={
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                + New Item
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={<SearchOffIcon />}
            title="Nothing here"
            note="No items match this view — try a different tab, or adjust your search and filters."
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
                  <th>Description</th>
                  <th className="right">Rate</th>
                  <th>Usage Unit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((it) => (
                  <tr
                    key={it.id}
                    className={"row-link" + (it.active ? "" : " row-muted")}
                    onClick={() => navigate(`/items/${it.id}`)}
                  >
                    <td className="sel-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={sel.has(it.id)}
                        onChange={() => toggleOne(it.id)}
                      />
                    </td>
                    <td>
                      <span className="item-name">{it.name}</span>
                      {!it.active && <span className="stamp void" style={{ marginLeft: 8 }}>Inactive</span>}
                    </td>
                    <td className="mut-cell">{(it.description ?? "—").split("\n")[0]}</td>
                    <td className="num right">{money(it.sellingPrice)}</td>
                    <td className="num">{it.unit ?? "—"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="Edit item"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(it);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                        <button
                          className="icon-btn"
                          title="View item"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/items/${it.id}`);
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
                ))}
              </tbody>
            </table>
          )}
        </div>
        {!loading && rows.length > 0 && (
          <div className="list-foot">
            <span className="lf-info">
              {rows.length.toLocaleString("en-US")} item{rows.length === 1 ? "" : "s"} · page{" "}
              {safePage} of {pageCount}
            </span>
            <span className="lf-size">
              Show
              <Select
                value={pageSize}
                options={PAGE_SIZES}
                onChange={changePageSize}
                ariaLabel="Items per page"
              />
              per page
            </span>
            <Pagination page={safePage} pages={pageCount} onPage={setPage} />
          </div>
        )}
      </div>
      )}

      {adding && (
        <NewItemModal
          onClose={() => setAdding(false)}
          onCreated={async () => {
            setAdding(false);
            await refresh();
          }}
        />
      )}

      {editingItem && (
        <NewItemModal
          initial={editingItem}
          onClose={() => setEditingItem(null)}
          onCreated={async () => {
            setEditingItem(null);
            await refresh();
          }}
        />
      )}

      {importing && (
        <ImportItemsModal
          onClose={() => setImporting(false)}
          onImported={async (ok) => {
            await refresh();
            toast(`${ok} item${ok === 1 ? "" : "s"} imported`);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${sel.size} item${sel.size === 1 ? "" : "s"}?`}
          message={
            <>
              The selected item{sel.size === 1 ? "" : "s"} will be permanently deleted. Invoices
              already created are not affected — lines keep their text.
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
