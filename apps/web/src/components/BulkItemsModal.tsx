import { useMemo, useState } from "react";
import { money, type Item } from "../lib/store";

interface Picked {
  item: Item;
  qty: number;
}

/** Zoho's "Add Items in Bulk": search + click items on the left, adjust
 *  quantities on the right, then add them all as invoice lines at once. */
export function BulkItemsModal({
  items,
  onClose,
  onAdd,
}: {
  items: Item[];
  onClose: () => void;
  onAdd: (picked: Picked[]) => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        (i.description ?? "").toLowerCase().includes(needle),
    );
  }, [items, q]);

  const isPicked = (id: number) => picked.some((p) => p.item.id === id);

  function toggle(item: Item) {
    setPicked((cur) =>
      cur.some((p) => p.item.id === item.id)
        ? cur.filter((p) => p.item.id !== item.id)
        : [...cur, { item, qty: 1 }],
    );
  }

  function setQty(id: number, qty: number) {
    setPicked((cur) => cur.map((p) => (p.item.id === id ? { ...p, qty } : p)));
  }

  const totalQty = picked.reduce((s, p) => s + (p.qty || 0), 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bulk-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>Add Items in Bulk</h3>

        <div className="bulk-grid">
          <div className="bulk-left">
            <div className="picker-search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                autoFocus
                placeholder="Type to search items"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="bulk-list">
              {filtered.length === 0 ? (
                <div className="picker-empty">
                  {items.length === 0 ? "No items in the catalog yet." : "No match."}
                </div>
              ) : (
                filtered.map((it) => (
                  <button
                    type="button"
                    key={it.id}
                    className={"item-row" + (isPicked(it.id) ? " picked" : "")}
                    onClick={() => toggle(it)}
                  >
                    <b>{it.name}</b>
                    <span>Rate: {money(it.sellingPrice)}</span>
                    {isPicked(it.id) && <i className="tick">✓</i>}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bulk-right">
            <div className="bulk-right-head">
              <b>Selected Items</b>
              <span className="count-pill">{picked.length}</span>
              <span className="bulk-total">Total quantity: {totalQty}</span>
            </div>
            {picked.length === 0 ? (
              <div className="picker-empty" style={{ marginTop: 60 }}>
                Click the item names from the left pane to select them.
              </div>
            ) : (
              <div className="bulk-sel-list">
                {picked.map((p) => (
                  <div className="bulk-sel-row" key={p.item.id}>
                    <div className="bulk-sel-txt">
                      <b>{p.item.name}</b>
                      <span>{money(p.item.sellingPrice)}</span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={p.qty}
                      onChange={(e) => setQty(p.item.id, Math.max(1, +e.target.value || 1))}
                    />
                    <button type="button" className="rm-line" onClick={() => toggle(p.item)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={picked.length === 0}
            onClick={() => onAdd(picked)}
          >
            Add Items
          </button>
        </div>
      </div>
    </div>
  );
}
