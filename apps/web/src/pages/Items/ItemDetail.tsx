import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBilling, money, fmtShort, fmtDateTime } from "../../lib/store";
import { api, apiUrl } from "../../lib/api";
import { Menu } from "../../components/Menu";
import { NewItemModal } from "../../components/ItemModal";
import { Pagination } from "../../components/Pagination";
import { DetailSkeleton } from "../../components/TableSkeleton";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Stamp } from "../../components/bits";
import { useToast } from "../../components/Toast";
import type { DisplayStatus } from "../../lib/store";

const MINI_PAGE = 15;

interface Txn {
  id: number;
  number: string;
  status: string;
  issue_date: string;
  due_date: string;
  total: string;
  customer_name: string;
  quantity: string;
  unit_price: string;
  amount: string;
}

type Tab = "overview" | "transactions" | "history";

export function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, refresh, loading } = useBilling();
  const [tab, setTab] = useState<Tab>("overview");
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Shared DB but per-environment files — the image may live on the other
  // environment's disk (same tradeoff as Wholesale's attachments).
  const [imgBroken, setImgBroken] = useState(false);

  const item = items.find((i) => String(i.id) === id);

  // Mini-list: search + paging + bulk selection (mirrors the full list view).
  const [miniQ, setMiniQ] = useState("");
  const [miniPage, setMiniPage] = useState(1);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const q = miniQ.trim().toLowerCase();
  const miniRows = items.filter((i) => !q || i.name.toLowerCase().includes(q));
  const miniPages = Math.max(1, Math.ceil(miniRows.length / MINI_PAGE));
  const safeMiniPage = Math.min(miniPage, miniPages);
  const pageItems = miniRows.slice((safeMiniPage - 1) * MINI_PAGE, safeMiniPage * MINI_PAGE);
  const allChecked = pageItems.length > 0 && pageItems.every((r) => sel.has(r.id));
  const toggleAll = () =>
    setSel(allChecked ? new Set() : new Set(pageItems.map((r) => r.id)));
  const toggleOne = (rowId: number) =>
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });

  useEffect(() => {
    setMiniPage(1);
  }, [q]);

  useEffect(() => {
    setTab("overview");
    setTxns(null);
    setImgBroken(false);
  }, [id]);

  useEffect(() => {
    if (tab !== "transactions" || txns !== null || !id) return;
    api
      .get<{ transactions: Txn[] }>(`/items/${id}/transactions`)
      .then((res) => setTxns(res.transactions))
      .catch((err) =>
        toast(err instanceof Error ? err.message : "Failed to load transactions", "error"),
      );
  }, [tab, txns, id, toast]);

  async function act(fn: () => Promise<unknown>, doneMsg: string) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast(doneMsg);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  }

  const setActive = (active: boolean) =>
    act(
      () => api.patch(`/items/${id}/active`, { active }),
      `"${item?.name}" marked as ${active ? "active" : "inactive"}`,
    );
  const deleteItem = () =>
    act(async () => {
      await api.del(`/items/${id}`);
      navigate("/items");
    }, "Item deleted");

  // Bulk actions over the mini-list selection (same behavior as the list view).
  const plural = (n: number) => `${n} item${n === 1 ? "" : "s"}`;
  const bulkActive = (active: boolean) =>
    act(async () => {
      for (const s of sel) await api.patch(`/items/${s}/active`, { active });
      setSel(new Set());
    }, `${plural(sel.size)} marked as ${active ? "active" : "inactive"}`);
  const bulkDelete = () =>
    act(async () => {
      const goHome = id ? sel.has(Number(id)) : false;
      for (const s of sel) await api.del(`/items/${s}`);
      setSel(new Set());
      if (goHome) navigate("/items");
    }, `${plural(sel.size)} deleted`);

  // On a hard refresh the store is still loading — skeleton, not "not found".
  if (!item && loading) return <DetailSkeleton />;

  return (
    <section className="view detail-grid">
      {/* left: compact items list, Zoho-style */}
      <aside className="card inv-mini-list print-hide">
        <div className="panel-head">
          <button className="back-nav" title="Back to all items" onClick={() => navigate("/items")}>
            <span className="bn-ic">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </span>
            All Items
          </button>
        </div>
        <div className="mini-tools">
          <input
            type="checkbox"
            className="mini-check"
            title="Select all on this page"
            checked={allChecked}
            onChange={toggleAll}
          />
          <label className="list-search mini-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={miniQ}
              onChange={(e) => setMiniQ(e.target.value)}
              placeholder="Search items…"
            />
            {miniQ && (
              <button type="button" className="ls-clear" aria-label="Clear search" onClick={() => setMiniQ("")}>
                ✕
              </button>
            )}
          </label>
        </div>
        <div className="mini-list-body">
          {pageItems.map((row) => (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              className={"mini-inv" + (String(row.id) === id ? " on" : "")}
              onClick={() => navigate(`/items/${row.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/items/${row.id}`);
              }}
            >
              <input
                type="checkbox"
                className="mini-check"
                checked={sel.has(row.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleOne(row.id)}
              />
              <div className="mini-inv-main">
                <div className="mini-inv-top">
                  <b>{row.name}</b>
                  <span className="num">{money(row.sellingPrice)}</span>
                </div>
                {!row.active && (
                  <div className="mini-inv-status">
                    <span className="stamp void">Inactive</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {miniRows.length === 0 && (
            <div className="empty-note">
              <b>{items.length === 0 ? "No items yet" : "No matches"}</b>
            </div>
          )}
        </div>
        {miniPages > 1 && (
          <div className="mini-foot">
            <Pagination page={safeMiniPage} pages={miniPages} onPage={setMiniPage} />
          </div>
        )}
      </aside>

      {sel.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">
            <strong>{sel.size}</strong> selected
          </span>
          <div className="bulk-actions">
            <button className="bb-btn" disabled={busy} onClick={() => void bulkActive(true)}>
              Mark as Active
            </button>
            <button className="bb-btn" disabled={busy} onClick={() => void bulkActive(false)}>
              Mark as Inactive
            </button>
            <button
              className="bb-btn danger bb-icon"
              disabled={busy}
              title="Delete selected"
              aria-label="Delete selected"
              onClick={() => setConfirmBulk(true)}
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

      {/* right: the item */}
      <div className="inv-detail">
        {!item ? (
          <div className="empty-note card" style={{ padding: 40 }}>
            <b>Item not found</b>
            It may have been deleted.
          </div>
        ) : (
          <>
            <div className="detail-head print-hide">
              <div>
                <h1>{item.name}</h1>
                <p>
                  {item.type === "Service" ? "Service" : "Goods"} · {money(item.sellingPrice)}
                  {item.unit ? ` per ${item.unit}` : ""}
                  {!item.active && <span className="stamp void">Inactive</span>}
                </p>
              </div>
              <div className="detail-actions">
                <button
                  className="btn btn-ghost da-btn"
                  disabled={busy}
                  onClick={() => setEditOpen(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  Edit
                </button>
                <Menu
                  align="right"
                  trigger={
                    <button className="btn btn-ghost da-btn" disabled={busy}>
                      More
                      <svg className="da-caret" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  }
                  items={[
                    item.active
                      ? {
                          icon: (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M5.6 5.6l12.8 12.8" />
                            </svg>
                          ),
                          label: "Mark as Inactive",
                          onClick: () => void setActive(false),
                        }
                      : {
                          icon: (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          ),
                          label: "Mark as Active",
                          onClick: () => void setActive(true),
                        },
                    {
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                          <path d="M19 6l-.8 13.2A2 2 0 0 1 16.2 21H7.8a2 2 0 0 1-2-1.8L5 6" />
                          <path d="M10 11v5M14 11v5" />
                        </svg>
                      ),
                      label: "Delete",
                      danger: true,
                      onClick: () => setConfirmDelete(true),
                    },
                  ]}
                />
              </div>
            </div>

            <div className="tabs">
              {(["overview", "transactions", "history"] as Tab[]).map((t) => (
                <button
                  key={t}
                  className={"tab" + (tab === t ? " on" : "")}
                  onClick={() => setTab(t)}
                >
                  {t === "overview" ? "Overview" : t === "transactions" ? "Transactions" : "History"}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="card" style={{ padding: "22px 26px" }}>
                {item.imageKey &&
                  (imgBroken ? (
                    <div className="detail-img img-unavailable">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2.5" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.8-3.8a2 2 0 0 0-2.8 0L6 19.5" />
                        <path d="M3 3l18 18" />
                      </svg>
                      <b>No image available here</b>
                      <small>
                        This item's image was uploaded from{" "}
                        {location.hostname === "localhost" ? "the live site" : "local dev"} — image
                        files don't sync between environments. Re-upload it here if you need it in
                        both.
                      </small>
                    </div>
                  ) : (
                    <img
                      className="detail-img"
                      src={apiUrl(`/items/${item.id}/image?k=${item.imageKey}`)}
                      alt={item.name}
                      onError={() => setImgBroken(true)}
                    />
                  ))}
                <div className="ov-grid">
                  <div className="ov-row">
                    <span>Item Type</span>
                    <b>Sales Items</b>
                  </div>
                  <div className="ov-row">
                    <span>Type</span>
                    <b>{item.type}</b>
                  </div>
                  <div className="ov-row">
                    <span>Unit</span>
                    <b>{item.unit ?? "—"}</b>
                  </div>
                  <div className="ov-row">
                    <span>Created Source</span>
                    <b>User</b>
                  </div>
                </div>
                <h3 className="ov-h">Sales Information</h3>
                <div className="ov-grid">
                  <div className="ov-row">
                    <span>Selling Price</span>
                    <b>{money(item.sellingPrice)}</b>
                  </div>
                  <div className="ov-row">
                    <span>Description</span>
                    <b style={{ whiteSpace: "pre-line" }}>{item.description ?? "—"}</b>
                  </div>
                </div>
              </div>
            )}

            {tab === "transactions" && (
              <div className="card">
                <div className="panel-head">
                  <h2>Invoices with this item</h2>
                </div>
                <div className="panel-body">
                  {txns === null ? (
                    <div className="center-fill" style={{ minHeight: 120 }}>
                      <div className="spinner" />
                    </div>
                  ) : txns.length === 0 ? (
                    <div className="empty-note">
                      <b>There are no invoices</b>
                      This item hasn't been billed yet.
                    </div>
                  ) : (
                    <table className="ledger">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Invoice#</th>
                          <th>Customer</th>
                          <th>Status</th>
                          <th className="right">Qty</th>
                          <th className="right">Rate</th>
                          <th className="right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txns.map((t, i) => (
                          <tr
                            key={`${t.id}-${i}`}
                            className="row-link"
                            onClick={() => navigate(`/invoices/${t.id}`)}
                          >
                            <td className="num">{fmtShort(String(t.issue_date).slice(0, 10))}</td>
                            <td>
                              <span className="inv-id">{t.number}</span>
                            </td>
                            <td>{t.customer_name}</td>
                            <td>
                              <Stamp status={(t.status === "sent" ? "due" : t.status) as DisplayStatus} />
                            </td>
                            <td className="num right">{Number(t.quantity)}</td>
                            <td className="num right">{money(Number(t.unit_price))}</td>
                            <td className="num right">{money(Number(t.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {tab === "history" && (
              <div className="card">
                <div className="panel-body">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.updatedAt && item.updatedAt !== item.createdAt && (
                        <tr>
                          <td className="num">{fmtDateTime(item.updatedAt)}</td>
                          <td>
                            updated by <b className="hist-by">— {item.updatedBy ?? "Admin"}</b>
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="num">{fmtDateTime(item.createdAt)}</td>
                        <td>
                          created by <b className="hist-by">— {item.createdBy ?? "Admin"}</b>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {editOpen && item && (
        <NewItemModal
          initial={item}
          onClose={() => setEditOpen(false)}
          onCreated={async () => {
            setEditOpen(false);
            await refresh();
          }}
        />
      )}

      {confirmBulk && (
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
            setConfirmBulk(false);
            void bulkDelete();
          }}
          onClose={() => setConfirmBulk(false)}
        />
      )}

      {confirmDelete && item && (
        <ConfirmModal
          title="Delete this item?"
          message={
            <>
              <b>“{item.name}”</b> will be permanently deleted. Invoices already created are
              not affected — their lines keep the text.
            </>
          }
          confirmLabel="Yes, delete it"
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteItem();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
