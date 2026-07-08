import { useEffect, useMemo, useRef, useState } from "react";

/* Ant-design-style date picker: input shows "08 Jul 2026", popup is a
 * month calendar with «‹ month year ›» navigation, today outlined,
 * selected day filled. Value is always an ISO YYYY-MM-DD string. */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmt(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function DatePicker({
  value,
  onChange,
  required,
}: {
  value: string; // ISO or ""
  onChange: (iso: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T00:00:00") : null;
  const [viewYear, setViewYear] = useState((selected ?? new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState((selected ?? new Date()).getMonth());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && selected) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const todayIso = toIso(new Date());

  const grid = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay()); // back to Sunday
    const days: Array<{ iso: string; day: number; inMonth: boolean }> = [];
    const cursor = new Date(start);
    for (let i = 0; i < 42; i++) {
      days.push({
        iso: toIso(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === viewMonth,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [viewYear, viewMonth]);

  function nav(deltaMonth: number, deltaYear = 0) {
    const d = new Date(viewYear + deltaYear, viewMonth + deltaMonth, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  return (
    <div className="dp" ref={rootRef}>
      <button
        type="button"
        className={"dp-btn" + (value ? "" : " placeholder")}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span>{value ? fmt(value) : "dd MMM yyyy"}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
        {required && <input tabIndex={-1} className="dp-req" required value={value} onChange={() => {}} />}
      </button>

      {open && (
        <div className="dp-pop" role="dialog">
          <div className="dp-head">
            <button type="button" className="dp-nav" title="Previous year" onClick={() => nav(0, -1)}>
              «
            </button>
            <button type="button" className="dp-nav" title="Previous month" onClick={() => nav(-1)}>
              ‹
            </button>
            <b>
              {MONTHS[viewMonth]} {viewYear}
            </b>
            <button type="button" className="dp-nav" title="Next month" onClick={() => nav(1)}>
              ›
            </button>
            <button type="button" className="dp-nav" title="Next year" onClick={() => nav(0, 1)}>
              »
            </button>
          </div>
          <div className="dp-grid dp-dow">
            {DOW.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="dp-grid">
            {grid.map((c) => (
              <button
                type="button"
                key={c.iso}
                className={
                  "dp-day" +
                  (c.inMonth ? "" : " out") +
                  (c.iso === value ? " sel" : "") +
                  (c.iso === todayIso ? " today" : "")
                }
                onClick={() => {
                  onChange(c.iso);
                  setOpen(false);
                }}
              >
                {c.day}
              </button>
            ))}
          </div>
          <div className="dp-foot">
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
