import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { fmtDateTime, useBilling } from "../../lib/store";
import { DateRangePicker } from "../../components/DateRangePicker";
import { Pagination } from "../../components/Pagination";
import { Select } from "../../components/Select";
import { AiBadge } from "../../components/bits";
import { EmptyState, SearchOffIcon } from "../../components/EmptyState";
import { TableSkeleton } from "../../components/TableSkeleton";
import { useToast } from "../../components/Toast";

const PAGE_SIZES = [15, 25, 50, 100];

type Entity = "all" | "invoice" | "customer" | "item" | "payment";

const ENTITY_TABS: Array<{ key: Entity; label: string }> = [
  { key: "all", label: "All" },
  { key: "invoice", label: "Invoices" },
  { key: "customer", label: "Customers" },
  { key: "item", label: "Items" },
  { key: "payment", label: "Payments" },
];

/** action key → chip label + tone class */
const ACTIONS: Record<string, { label: string; tone: string }> = {
  created: { label: "Created", tone: "ok" },
  updated: { label: "Updated", tone: "info" },
  deleted: { label: "Deleted", tone: "bad" },
  marked_sent: { label: "Marked as Sent", tone: "brass" },
  voided: { label: "Voided", tone: "mut" },
  status_changed: { label: "Status Changed", tone: "info" },
  payment_recorded: { label: "Payment Recorded", tone: "ok" },
  payment_removed: { label: "Payment Removed", tone: "bad" },
  marked_active: { label: "Marked Active", tone: "ok" },
  marked_inactive: { label: "Marked Inactive", tone: "mut" },
  emailed: { label: "Emailed", tone: "brass" },
  link_shared: { label: "Link Shared", tone: "info" },
  links_disabled: { label: "Links Disabled", tone: "mut" },
};

const ENTITY_LABEL: Record<string, string> = {
  invoice: "Invoice",
  customer: "Customer",
  item: "Item",
  payment: "Payment",
};

interface Entry {
  id: number;
  actor: string | null;
  action: string;
  entity: string;
  entity_id: number | null;
  entity_label: string | null;
  details: string | null;
  via_ai: boolean;
  created_at: string;
}

export function Activity() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { invoices } = useBilling();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [actors, setActors] = useState<string[]>([]);

  const [entity, setEntity] = useState<Entity>("all");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const q = search.trim();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = Number(localStorage.getItem("activity-page-size"));
    return PAGE_SIZES.includes(saved) ? saved : 25;
  });
  const changePageSize = (n: number) => {
    setPageSize(n);
    localStorage.setItem("activity-page-size", String(n));
  };

  useEffect(() => {
    setPage(1);
  }, [entity, action, actor, from, to, q, pageSize]);

  // Server-side filtering + paging; the search box is debounced so typing
  // doesn't fire a request per keystroke.
  useEffect(() => {
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          entity,
          page: String(page),
          pageSize: String(pageSize),
        });
        if (action) params.set("action", action);
        if (actor) params.set("actor", actor);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (q) params.set("q", q);
        const res = await api.get<{ entries: Entry[]; total: number; actors: string[] }>(
          `/activity?${params.toString()}`,
        );
        if (dead) return;
        setEntries(res.entries);
        setTotal(res.total);
        setActors(res.actors);
      } catch (err) {
        if (!dead) toast(err instanceof Error ? err.message : "Failed to load activity", "error");
      }
    }, q ? 300 : 0);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [entity, action, actor, from, to, q, page, pageSize, toast]);

  /** Where an entry leads: the record it touched. Deleted records (and
   *  payments whose invoice is gone) have nowhere to go → no link. */
  function linkFor(e: Entry): string | null {
    if (e.action === "deleted") return null;
    if (e.entity === "invoice" && e.entity_id) return `/invoices/${e.entity_id}`;
    if (e.entity === "customer" && e.entity_id) return `/customers/${e.entity_id}`;
    if (e.entity === "item" && e.entity_id) return `/items/${e.entity_id}`;
    if (e.entity === "payment" && e.entity_label) {
      const inv = invoices.find((i) => i.number === e.entity_label);
      return inv ? `/invoices/${inv.dbId}` : null;
    }
    return null;
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const loading = entries === null;
  const filtered = Boolean(action || actor || from || q || entity !== "all");

  return (
    <section className="view">
      <div className="page-head">
        <h1>Activity Log</h1>
        <p>Every create, edit, delete and payment across the workspace — who did what, and when.</p>
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
            placeholder="Search by invoice #, customer, item or user…"
          />
          {search && (
            <button type="button" className="ls-clear" aria-label="Clear search" onClick={() => setSearch("")}>
              ✕
            </button>
          )}
        </label>
        <div className="tb-right">
          <DateRangePicker
            start={from}
            end={to}
            onChange={(s, e) => {
              setFrom(s);
              setTo(e);
            }}
            onClear={() => {
              setFrom(null);
              setTo(null);
            }}
          />
        </div>
      </div>

      <div className="tab-row">
        <div className="tabs">
          {ENTITY_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={"tab" + (entity === t.key ? " on" : "")}
              onClick={() => setEntity(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="act-filters">
          <Select
            value={action}
            ariaLabel="Filter by action"
            options={[
              { value: "", label: "All actions" },
              ...Object.entries(ACTIONS).map(([value, a]) => ({ value, label: a.label })),
            ]}
            onChange={setAction}
          />
          <Select
            value={actor}
            ariaLabel="Filter by user"
            options={[{ value: "", label: "All users" }, ...actors.map((a) => ({ value: a, label: a }))]}
            onChange={setActor}
          />
        </div>
      </div>

      {!loading && entries.length === 0 ? (
        <EmptyState
          icon={<SearchOffIcon />}
          title={filtered ? "Nothing here" : "No activity yet"}
          note={
            filtered
              ? "No events match these filters — widen the date range or clear the search."
              : "Actions across invoices, customers, items and payments will show up here as they happen."
          }
        />
      ) : (
        <div className="card">
          <div className="panel-body">
            {loading ? (
              <TableSkeleton rows={8} />
            ) : (
              <table className="ledger activity-ledger">
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const a = ACTIONS[e.action] ?? { label: e.action, tone: "info" };
                    const to = linkFor(e);
                    return (
                      <tr
                        key={e.id}
                        className={to ? "row-link" : undefined}
                        onClick={to ? () => navigate(to) : undefined}
                      >
                        <td className="num">{fmtDateTime(e.created_at)}</td>
                        <td>
                          <span className="act-user">
                            {e.actor ?? "—"}
                            {e.via_ai && <AiBadge by={e.actor} />}
                          </span>
                        </td>
                        <td>
                          <span className={`act-chip ${a.tone}`}>{a.label}</span>
                        </td>
                        <td>
                          <div className="act-details">
                            <span>
                              <span className="act-entity">{ENTITY_LABEL[e.entity] ?? e.entity}</span>
                              {e.entity_label && <b>{e.entity_label}</b>}
                            </span>
                            {e.details && <span className="act-note">{e.details}</span>}
                          </div>
                        </td>
                        <td>
                          {to && (
                            <div className="row-actions">
                              <button
                                className="icon-btn"
                                title={`Open ${e.entity_label ?? ENTITY_LABEL[e.entity] ?? "record"}`}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  navigate(to);
                                }}
                              >
                                →
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {!loading && total > 0 && (
            <div className="list-foot">
              <span className="lf-info">
                {total.toLocaleString("en-US")} event{total === 1 ? "" : "s"} · page {safePage} of{" "}
                {pageCount}
              </span>
              <span className="lf-size">
                Show
                <Select
                  value={pageSize}
                  options={PAGE_SIZES}
                  onChange={changePageSize}
                  ariaLabel="Events per page"
                />
                per page
              </span>
              <Pagination page={safePage} pages={pageCount} onPage={setPage} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
