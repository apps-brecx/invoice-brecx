import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useBilling, money, type Item } from "../../lib/store";
import { api } from "../../lib/api";
import { Menu } from "../../components/Menu";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../Dashboard/Dashboard";

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
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").toLowerCase();
  const [view, setView] = useState<View>("all");
  const [viewsOpen, setViewsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const searched = items.filter(
    (i) =>
      !q ||
      i.name.toLowerCase().includes(q) ||
      (i.description ?? "").toLowerCase().includes(q),
  );
  const activeView = VIEWS.find((v) => v.key === view)!;
  const rows = [...searched.filter(activeView.test)].sort((a, b) => {
    const c = sortKey === "name" ? a.name.localeCompare(b.name) : a.sellingPrice - b.sellingPrice;
    return sortDesc ? -c : c;
  });

  const allChecked = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
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
      <div className="page-head">
        <div className="views-wrap">
          <button
            type="button"
            className={"views-title" + (viewsOpen ? " open" : "")}
            onClick={() => setViewsOpen((o) => !o)}
          >
            <h1>{view === "all" ? "All Items" : `${activeView.label} Items`}</h1>
            <i>▾</i>
          </button>
          {viewsOpen && (
            <div className="menu-pop views-pop">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={"menu-item" + (view === v.key ? " active" : "")}
                  onClick={() => {
                    setView(v.key);
                    setViewsOpen(false);
                    setSel(new Set());
                  }}
                >
                  <span className="menu-lab">{v.label}</span>
                  <span className="menu-count">{searched.filter(v.test).length}</span>
                </button>
              ))}
            </div>
          )}
          {viewsOpen && <div className="views-backdrop" onClick={() => setViewsOpen(false)} />}
        </div>
        <div className="right">
          <button className="btn btn-primary" onClick={() => navigate("/items/new")}>
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
              { icon: "⤒", label: "Import Items", disabled: true, title: "Coming later" },
              { icon: "⚙", label: "Preferences", disabled: true, title: "Settings module pending" },
            ]}
          />
        </div>
      </div>

      {q && (
        <div className="filter-row">
          <button className="chip on" onClick={() => navigate("/items")}>
            Search: “{q}” ✕
          </button>
        </div>
      )}

      <div className="card">
        {sel.size > 0 && (
          <div className="bulk-bar">
            <button className="btn btn-ghost" disabled={busy} onClick={() => void markActive(true)}>
              Mark as Active
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void markActive(false)}>
              Mark as Inactive
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
            <b style={{ marginLeft: "auto" }}>{sel.size} Selected</b>
            <button className="btn btn-ghost" onClick={() => setSel(new Set())}>
              Esc ✕
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
              <b>{items.length === 0 ? "No items yet" : "Nothing here"}</b>
              {items.length === 0
                ? "Add products or services you sell — picking one prefills invoice lines."
                : "No items match this view."}
            </div>
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
                {rows.map((it) => (
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
                            navigate(`/items/${it.id}/edit`);
                          }}
                        >
                          ✎
                        </button>
                        <button
                          className="icon-btn"
                          title="View"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/items/${it.id}`);
                          }}
                        >
                          →
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
