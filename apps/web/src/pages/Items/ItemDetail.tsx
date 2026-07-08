import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBilling, money, fmtShort, fmtLong } from "../../lib/store";
import { api } from "../../lib/api";
import { Menu } from "../../components/Menu";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Stamp } from "../../components/bits";
import { useToast } from "../../components/Toast";
import type { DisplayStatus } from "../../lib/store";

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
  const { items, refresh } = useBilling();
  const [tab, setTab] = useState<Tab>("overview");
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const item = items.find((i) => String(i.id) === id);

  useEffect(() => {
    setTab("overview");
    setTxns(null);
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

  return (
    <section className="view detail-grid">
      {/* left: compact items list, Zoho-style */}
      <aside className="card inv-mini-list print-hide">
        <div className="panel-head">
          <h2>All Items</h2>
          <button className="link" onClick={() => navigate("/items")}>
            Full list →
          </button>
        </div>
        <div className="mini-list-body">
          {items.map((row) => (
            <button
              key={row.id}
              className={"mini-inv" + (String(row.id) === id ? " on" : "")}
              onClick={() => navigate(`/items/${row.id}`)}
            >
              <div className="mini-inv-top">
                <b>{row.name}</b>
                <span className="num">{money(row.sellingPrice)}</span>
              </div>
              {!row.active && (
                <div className="mini-inv-status">
                  <span className="stamp void">Inactive</span>
                </div>
              )}
            </button>
          ))}
          {items.length === 0 && (
            <div className="empty-note">
              <b>No items yet</b>
            </div>
          )}
        </div>
      </aside>

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
              <div className="right" style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button
                  className="icon-btn"
                  title="Edit item"
                  disabled={busy}
                  onClick={() => navigate(`/items/${item.id}/edit`)}
                >
                  ✎
                </button>
                <Menu
                  align="right"
                  trigger={
                    <button className="btn btn-ghost" disabled={busy}>
                      More <i className="caret">▾</i>
                    </button>
                  }
                  items={[
                    item.active
                      ? { icon: "⊘", label: "Mark as Inactive", onClick: () => void setActive(false) }
                      : { icon: "✓", label: "Mark as Active", onClick: () => void setActive(true) },
                    {
                      icon: "🗑",
                      label: "Delete",
                      danger: true,
                      onClick: () => setConfirmDelete(true),
                    },
                  ]}
                />
                <button className="icon-btn" title="Back to items" onClick={() => navigate("/items")}>
                  ✕
                </button>
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
                          <td className="num">{fmtLong(String(item.updatedAt).slice(0, 10))}</td>
                          <td>last updated</td>
                        </tr>
                      )}
                      <tr>
                        <td className="num">
                          {item.createdAt ? fmtLong(String(item.createdAt).slice(0, 10)) : "—"}
                        </td>
                        <td>created</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
