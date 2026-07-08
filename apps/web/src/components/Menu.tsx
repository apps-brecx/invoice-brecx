import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  /** Rendered as a divider when true (other fields ignored). */
  sep?: boolean;
  /** Small non-clickable section heading. */
  heading?: string;
  label?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
  /** Right-aligned check/affordance (e.g. active sort). */
  checked?: boolean;
}

/** Zoho-style dropdown menu: trigger + floating item list. Closes on
 *  outside click, Escape, or after an item runs. */
export function Menu({
  trigger,
  items,
  align = "left",
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="menu-wrap" ref={ref}>
      <span className="menu-trigger" onClick={() => setOpen((o) => !o)}>
        {trigger}
      </span>
      {open && (
        <div className={"menu-pop" + (align === "right" ? " right" : "")}>
          {items.map((it, i) =>
            it.sep ? (
              <div className="menu-sep" key={i} />
            ) : it.heading ? (
              <div className="menu-heading" key={i}>
                {it.heading}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                className={"menu-item" + (it.danger ? " danger" : "")}
                disabled={it.disabled}
                title={it.title}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
              >
                {it.icon && <span className="menu-ic">{it.icon}</span>}
                <span className="menu-lab">{it.label}</span>
                {it.checked && <span className="menu-check">✓</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
