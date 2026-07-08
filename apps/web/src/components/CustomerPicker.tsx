import { useEffect, useMemo, useRef, useState } from "react";
import { initialsOf, type Customer } from "../lib/store";

/* Zoho-style customer combobox: click to open, type to filter, rows show
 * avatar + name + company/email, "+ New Customer" pinned at the bottom. */
export function CustomerPicker({
  customers,
  value,
  onPick,
  onNew,
}: {
  customers: Customer[];
  value: number | 0;
  onPick: (id: number) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = customers.find((c) => c.id === value) ?? null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.company ?? "").toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle),
    );
  }, [customers, q]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
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

  function pick(id: number) {
    onPick(id);
    setOpen(false);
    setQ("");
  }

  return (
    <div className="picker" ref={rootRef}>
      <button
        type="button"
        className={"picker-btn" + (selected ? "" : " placeholder")}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="picker-sel">
            <span className="cust-dot" style={{ background: selected.dotBg, color: selected.dotFg }}>
              {initialsOf(selected.name)}
            </span>
            {selected.name}
          </span>
        ) : (
          "Select or add a customer"
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="picker-pop" role="listbox">
          <div className="picker-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              placeholder="Search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered[0]) pick(filtered[0].id);
                }
              }}
            />
          </div>
          <div className="picker-list">
            {filtered.length === 0 ? (
              <div className="picker-empty">
                {customers.length === 0 ? "No customers yet." : "No match."}
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={"picker-row" + (c.id === value ? " on" : "")}
                  onClick={() => pick(c.id)}
                  role="option"
                  aria-selected={c.id === value}
                >
                  <span className="cust-dot" style={{ background: c.dotBg, color: c.dotFg }}>
                    {initialsOf(c.name)}
                  </span>
                  <span className="picker-row-txt">
                    <b>{c.name}</b>
                    <span>
                      {[c.email, c.company ?? c.city].filter(Boolean).join(" · ") || c.terms}
                    </span>
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
            ⊕ New Customer
          </button>
        </div>
      )}
    </div>
  );
}
