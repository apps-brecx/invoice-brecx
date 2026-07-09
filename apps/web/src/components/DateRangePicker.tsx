import { useEffect, useRef, useState } from "react";

/**
 * Date-range picker (Priceobo-style): quick ranges down the left, two-month
 * calendar on the right, range highlight while picking. Values are
 * "YYYY-MM-DD" local dates. Popup is viewport-fixed like Select/DateTimePicker.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => new Date(`${k}T00:00:00`);
const sameDay = (a: Date, b: Date) => toKey(a) === toKey(b);

function fmtDisplay(k: string | null): string {
  if (!k) return "";
  const d = fromKey(k);
  return `${pad(d.getDate())}-${MONTHS_SHORT[d.getMonth()]}-${d.getFullYear()}`;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

interface QuickRange {
  label: string;
  range: () => [Date, Date];
}

function quickRanges(): QuickRange[] {
  const today = new Date();
  const day = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d;
  };
  return [
    { label: "Today", range: () => [today, today] },
    { label: "Last 7 Days", range: () => [day(-6), today] },
    { label: "This Week", range: () => [startOfWeek(today), today] },
    { label: "Last Week", range: () => {
      const end = startOfWeek(today);
      end.setDate(end.getDate() - 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return [start, end];
    } },
    { label: "Last 30 Days", range: () => [day(-29), today] },
    { label: "Last 90 Days", range: () => [day(-89), today] },
    { label: "This Month", range: () => [new Date(today.getFullYear(), today.getMonth(), 1), today] },
    { label: "Last Month", range: () => [
      new Date(today.getFullYear(), today.getMonth() - 1, 1),
      new Date(today.getFullYear(), today.getMonth(), 0),
    ] },
    { label: "Last 6 Months", range: () => [new Date(today.getFullYear(), today.getMonth() - 6, today.getDate()), today] },
    { label: "Year to Date", range: () => [new Date(today.getFullYear(), 0, 1), today] },
  ];
}

export function DateRangePicker({
  start,
  end,
  onChange,
  onClear,
  className,
}: {
  start: string | null;
  end: string | null;
  onChange: (start: string, end: string) => void;
  /** Renders a "Clear" action that resets the range (caller decides to what). */
  onClear?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // In-progress selection (start picked, waiting for end).
  const [picking, setPicking] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const [viewMonth, setViewMonth] = useState(() => {
    const base = start ? fromKey(start) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const POP_W = 596;
  const POP_H = 360;

  function computePos(): { top: number; left: number } | null {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const below = window.innerHeight - rect.bottom;
    const top = below < POP_H + 12 && rect.top > POP_H + 12 ? rect.top - POP_H - 6 : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.right - POP_W, window.innerWidth - POP_W - 8));
    return { top, left: Math.max(8, left) };
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const p = computePos();
    if (!p) return;
    const base = start ? fromKey(start) : new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setPicking(null);
    setPos(p);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const reposition = (e?: Event) => {
      if (e && popRef.current?.contains(e.target as Node)) return;
      const p = computePos();
      if (p) setPos(p);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  function applyRange(a: Date, b: Date) {
    onChange(toKey(a), toKey(b));
    setPicking(null);
    setOpen(false);
  }

  function pickDay(d: Date) {
    const key = toKey(d);
    if (!picking) {
      setPicking(key);
      return;
    }
    const a = fromKey(picking);
    if (d < a) applyRange(d, a);
    else applyRange(a, d);
  }

  /* Effective highlight range: committed values, or in-progress pick+hover. */
  const hiStart = picking ?? start;
  const hiEnd = picking ? hoverKey : end;
  const lo = hiStart && hiEnd ? (hiStart < hiEnd ? hiStart : hiEnd) : hiStart;
  const hi = hiStart && hiEnd ? (hiStart < hiEnd ? hiEnd : hiStart) : hiStart;

  function renderMonth(monthStart: Date) {
    const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
    const gridStart = new Date(firstDay);
    gridStart.setDate(1 - firstDay.getDay());
    const cells = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
    const today = new Date();
    return (
      <div className="drp-month">
        <div className="drp-month-title">
          {MONTHS[monthStart.getMonth()]} {monthStart.getFullYear()}
        </div>
        <div className="drp-grid drp-weekdays">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="drp-grid">
          {cells.map((d, i) => {
            const key = toKey(d);
            const out = d.getMonth() !== monthStart.getMonth();
            const inRange = !out && lo && hi && key >= lo && key <= hi;
            const isEdge = !out && (key === lo || key === hi);
            return (
              <button
                key={i}
                type="button"
                className={
                  "drp-day" +
                  (out ? " out" : "") +
                  (sameDay(d, today) ? " today" : "") +
                  (inRange ? " in-range" : "") +
                  (isEdge ? " edge" : "")
                }
                onClick={() => !out && pickDay(d)}
                onMouseEnter={() => !out && setHoverKey(key)}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const nextMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);

  const clearable = !!onClear && !!(start || end);

  return (
    <div ref={wrapRef} className={"drp" + (className ? ` ${className}` : "")}>
      <button
        type="button"
        className={"drp-btn" + (open ? " open" : "") + (clearable ? " clearable" : "")}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarIcon />
        <span className={"drp-value" + (start ? "" : " placeholder")}>
          {start ? fmtDisplay(start) : "Start date"}
        </span>
        <span className="drp-arrow">→</span>
        <span className={"drp-value" + (end ? "" : " placeholder")}>
          {end ? fmtDisplay(end) : "End date"}
        </span>
      </button>
      {clearable && (
        <button
          type="button"
          className="drp-x"
          aria-label="Clear date range"
          onClick={() => {
            onClear!();
            setPicking(null);
            setOpen(false);
          }}
        >
          <XIcon />
        </button>
      )}

      {open && pos && (
        <div ref={popRef} className="drp-pop" style={{ top: pos.top, left: pos.left, width: POP_W }}>
          <div className="drp-quick">
            {quickRanges().map((qr) => (
              <button
                key={qr.label}
                type="button"
                className="drp-quick-btn"
                onClick={() => {
                  const [a, b] = qr.range();
                  applyRange(a, b);
                }}
              >
                {qr.label}
              </button>
            ))}
            {onClear && (
              <button
                type="button"
                className="drp-quick-btn drp-clear"
                onClick={() => {
                  onClear();
                  setPicking(null);
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="drp-cals">
            <div className="drp-cal-nav">
              <button type="button" className="drp-nav" onClick={() => setViewMonth(new Date(viewMonth.getFullYear() - 1, viewMonth.getMonth(), 1))} aria-label="Previous year">«</button>
              <button type="button" className="drp-nav" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
              <span className="drp-nav-spacer" />
              <button type="button" className="drp-nav" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} aria-label="Next month">›</button>
              <button type="button" className="drp-nav" onClick={() => setViewMonth(new Date(viewMonth.getFullYear() + 1, viewMonth.getMonth(), 1))} aria-label="Next year">»</button>
            </div>
            <div className="drp-months">
              {renderMonth(viewMonth)}
              {renderMonth(nextMonth)}
            </div>
            {picking && <div className="drp-hint">Now pick the end date</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
