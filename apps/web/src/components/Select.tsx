import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SelectOption<T> {
  value: T;
  label: string;
}

/** Custom dropdown select — replaces the browser-default <select> UI with the
 *  app's own menu styling. The option list renders into <body> via a portal,
 *  so it never gets clipped by cards/scroll containers (their overflow:clip
 *  would swallow it otherwise). Opens upward when there's no room below. */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: {
  value: T;
  options: Array<SelectOption<T>> | T[];
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const opts: Array<SelectOption<T>> = options.map((o) =>
    typeof o === "object" ? o : { value: o, label: String(o) },
  );
  const [box, setBox] = useState<DOMRect | null>(null);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const open = box !== null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setBox(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBox(null);
    };
    // The pop is fixed-positioned — close instead of drifting when scrolling.
    const onScroll = () => setBox(null);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setBox(null);
      return;
    }
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setUp(window.innerHeight - r.bottom < 40 * opts.length + 60);
    setBox(r);
  };

  const current = opts.find((o) => o.value === value);

  return (
    <div className={"ui-select" + (className ? ` ${className}` : "")} ref={ref}>
      <button
        type="button"
        className={"ui-select-btn" + (open ? " open" : "")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
      >
        <span>{current?.label ?? String(value)}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open &&
        box &&
        createPortal(
          <div
            ref={popRef}
            className={"menu-pop ui-select-pop" + (up ? " up" : "")}
            role="listbox"
            style={{
              position: "fixed",
              left: box.left,
              minWidth: box.width,
              ...(up
                ? { bottom: window.innerHeight - box.top + 6, top: "auto" }
                : { top: box.bottom + 6 }),
            }}
          >
            {opts.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={"menu-item" + (o.value === value ? " active" : "")}
                onClick={() => {
                  onChange(o.value);
                  setBox(null);
                }}
              >
                <span className="menu-lab">{o.label}</span>
                {o.value === value && <span className="menu-check">✓</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
