import { useEffect, useRef, useState } from "react";

export interface SelectOption<T> {
  value: T;
  label: string;
}

/** Custom dropdown select — replaces the browser-default <select> UI with the
 *  app's own menu styling. Closes on outside click / Escape; opens upward
 *  automatically when there's no room below (e.g. table footers). */
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
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && ref.current) {
      // Not enough room below → drop up instead (footers sit near the fold).
      const r = ref.current.getBoundingClientRect();
      setUp(window.innerHeight - r.bottom < 40 * opts.length + 60);
    }
    setOpen((o) => !o);
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
      {open && (
        <div className={"menu-pop ui-select-pop" + (up ? " up" : "")} role="listbox">
          {opts.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={"menu-item" + (o.value === value ? " active" : "")}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="menu-lab">{o.label}</span>
              {o.value === value && <span className="menu-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
