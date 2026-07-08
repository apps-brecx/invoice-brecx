import { useEffect, useMemo, useRef, useState } from "react";
import { money, type Item } from "../lib/store";

/* Zoho-style item cell: free-text input that doubles as an item combobox.
 * Focus/type → dropdown of matching catalog items (name + rate), pick one
 * to prefill description + rate, or keep typing a custom description.
 * "⊕ Add New Item" pinned at the bottom. */
export function ItemSelect({
  items,
  value,
  onText,
  onPick,
  onNew,
}: {
  items: Item[];
  value: string;
  onText: (text: string) => void;
  onPick: (item: Item) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(needle) ||
        (i.description ?? "").toLowerCase().includes(needle),
    );
  }, [items, value]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="item-sel" ref={rootRef}>
      <input
        placeholder="Type or click to select an item"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onText(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="item-pop">
          <div className="item-pop-list">
            {filtered.length === 0 ? (
              <div className="picker-empty">
                {items.length === 0 ? "No items in the catalog yet." : "No matching item — free text is fine."}
              </div>
            ) : (
              filtered.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className="item-row"
                  onClick={() => {
                    onPick(it);
                    setOpen(false);
                  }}
                >
                  <b>{it.name}</b>
                  <span>
                    Rate: {money(it.sellingPrice)}
                    {it.unit ? ` · ${it.unit}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            className="picker-new"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
          >
            ⊕ Add New Item
          </button>
        </div>
      )}
    </div>
  );
}
