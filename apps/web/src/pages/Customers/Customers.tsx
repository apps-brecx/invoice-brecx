import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBilling, money, type Customer } from "../../lib/store";
import { api } from "../../lib/api";
import { Menu } from "../../components/Menu";
import { ConfirmModal } from "../../components/ConfirmModal";
import { AddCustomerModal } from "../../components/CustomerModal";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../Dashboard/Dashboard";

type View = "all" | "business" | "individual" | "open" | "overdue";

export function Customers() {
  const { customers, invoices, loading, refresh } = useBilling();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const [view, setView] = useState<View>("all");
  const [viewsOpen, setViewsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "receivables">("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [editing, setEditing] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const openOf = (c: Customer) =>
    invoices
      .filter((i) => i.customerId === c.id && i.status !== "draft" && i.status !== "void")
      .reduce((s, i) => s + i.balance, 0);
  const hasOverdue = (c: Customer) =>
    invoices.some((i) => i.customerId === c.id && i.status === "overdue");

  const VIEWS: Array<{ key: View; label: string; test: (c: Customer) => boolean }> = [
    { key: "all", label: "All", test: () => true },
    { key: "business", label: "Business", test: (c) => c.type === "Business" },
    { key: "individual", label: "Individual", test: (c) => c.type === "Individual" },
    { key: "open", label: "With Open Balance", test: (c) => openOf(c) > 0 },
    { key: "overdue", label: "Overdue Customers", test: hasOverdue },
  ];
  const activeView = VIEWS.find((v) => v.key === view)!;

  const searched = customers.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q),
  );
  const rows = [...searched.filter(activeView.test)].sort((a, b) => {
    const c = sortKey === "name" ? a.name.localeCompare(b.name) : openOf(a) - openOf(b);
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
        <div className="views-wrap">
          <button
            type="button"
            className={"views-title" + (viewsOpen ? " open" : "")}
            onClick={() => setViewsOpen((o) => !o)}
          >
            <h1>{view === "all" ? "All Customers" : activeView.label}</h1>
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
                  {view === v.key && <span className="menu-check">✓</span>}
                  <span className="menu-count">{searched.filter(v.test).length}</span>
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
              { icon: "⤒", label: "Import Customers", disabled: true, title: "Coming later" },
              { icon: "⚙", label: "Preferences", disabled: true, title: "Settings module pending" },
            ]}
          />
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
            placeholder="Search customers by name, company or email…"
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
            <div className="center-fill" style={{ minHeight: "30vh" }}>
              <div className="spinner" />
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-note">
              <b>{customers.length === 0 ? "No customers yet" : "Nothing here"}</b>
              {customers.length === 0
                ? "Add your first customer to start invoicing."
                : "No customers match this view."}
            </div>
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
                {rows.map((c) => {
                  const open = openOf(c);
                  return (
                    <tr
                      key={c.id}
                      className="row-link"
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
                            <b>{c.name}</b>
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
                            ✎
                          </button>
                          <button
                            className="icon-btn"
                            title="View"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/customers/${c.id}`);
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
