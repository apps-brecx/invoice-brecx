import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SSOption {
  value: string;
  label: string;
  /** Shown left of the label in mono (e.g. the dial code). */
  tag?: string;
}

/* Zoho-style searchable dropdown — used for phone country codes and the
 * Country/Region fields. Button shows the current value; popup has a search
 * box and the filtered list. */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Select",
  display,
  compact = false,
  footer,
  onFooter,
}: {
  options: SSOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Override what the closed button shows (defaults to the value). */
  display?: string;
  /** Narrow trigger for dial codes. */
  compact?: boolean;
  /** Pinned action at the bottom of the popup (e.g. "⊕ New Payment Term"). */
  footer?: string;
  onFooter?: () => void;
}) {
  // The pop renders into <body> via a portal (fixed position) so it can never
  // be clipped or overpainted inside modals/scroll containers.
  const [box, setBox] = useState<DOMRect | null>(null);
  const [up, setUp] = useState(false);
  const open = box !== null;
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    if (open) {
      setBox(null);
      return;
    }
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    setUp(window.innerHeight - r.bottom < 330);
    setBox(r);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) ||
        (o.tag ?? "").toLowerCase().includes(needle),
    );
  }, [options, q]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !popRef.current?.contains(t)) setBox(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setBox(null);
    }
    // Fixed-positioned pop would drift when the container scrolls — close it.
    function onScroll(e: Event) {
      if (popRef.current?.contains(e.target as Node)) return; // the list itself scrolls
      setBox(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setBox(null);
    setQ("");
  }

  const shown = display ?? (value || "");

  return (
    <div className={"ss" + (compact ? " compact" : "")} ref={rootRef}>
      <button
        type="button"
        className={"ss-btn" + (shown ? "" : " placeholder")}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{shown || placeholder}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open &&
        box &&
        createPortal(
        <div
          ref={popRef}
          className="ss-pop"
          role="listbox"
          style={{
            position: "fixed",
            left: Math.max(8, Math.min(box.left, window.innerWidth - 300)),
            minWidth: Math.max(230, box.width),
            ...(up
              ? { bottom: window.innerHeight - box.top + 6, top: "auto" }
              : { top: box.bottom + 6 }),
          }}
        >
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
                  if (filtered[0]) pick(filtered[0].value);
                }
              }}
            />
          </div>
          <div className="ss-list">
            {filtered.length === 0 ? (
              <div className="picker-empty">No match.</div>
            ) : (
              filtered.map((o, i) => (
                <button
                  type="button"
                  key={`${o.value}-${i}`}
                  className={"ss-row" + (o.value === value ? " on" : "")}
                  onClick={() => pick(o.value)}
                  role="option"
                  aria-selected={o.value === value}
                >
                  {o.tag && <span className="ss-tag">{o.tag}</span>}
                  <span>{o.label}</span>
                </button>
              ))
            )}
          </div>
          {footer && onFooter && (
            <button
              type="button"
              className="picker-new"
              onClick={() => {
                setBox(null);
                onFooter();
              }}
            >
              {footer}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
