import type { ReactNode } from "react";
import type { Customer, DisplayStatus } from "../lib/store";
import { initialsOf } from "../lib/store";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  due: "Due",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export function Stamp({ status }: { status: DisplayStatus }) {
  return <span className={`stamp ${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Zoho-style status line for the invoices table: "Due in 25 days",
 *  "Overdue by 8 days" — colored, scannable. */
export function DueText({ status, dueInDays }: { status: DisplayStatus; dueInDays: number }) {
  if (status === "due" || status === "partial") {
    if (dueInDays === 0) return <span className="due-text due">Due today</span>;
    if (dueInDays > 0)
      return <span className="due-text due">Due in {dueInDays} day{dueInDays === 1 ? "" : "s"}</span>;
  }
  if (status === "overdue") {
    const d = Math.abs(dueInDays);
    return <span className="due-text overdue">Overdue by {d} day{d === 1 ? "" : "s"}</span>;
  }
  return null;
}

/** Line icons for the KPI strip chips (dashboard / invoices summaries). */
const KPI_PATHS: Record<string, ReactNode> = {
  banknote: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  alert: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m8.6 12.2 2.3 2.3 4.5-4.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6.5V12l3.5 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M16 2v4M8 2v4M3 9.5h18" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6 2h12M6 22h12" />
      <path d="M7 2v4.5c0 2 5 4 5 5.5s-5 3.5-5 5.5V22M17 2v4.5c0 2-5 4-5 5.5s5 3.5 5 5.5V22" />
    </>
  ),
};

export function KpiIcon({ name }: { name: keyof typeof KPI_PATHS }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {KPI_PATHS[name]}
    </svg>
  );
}

/** Line icons for action bars and dropdown menus (lucide-style strokes —
 *  replaces the old unicode glyphs, which rendered inconsistently). */
const ACTION_PATHS: Record<string, ReactNode> = {
  pencil: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 8.9 5.6a2 2 0 0 0 2.2 0L22 7" />
    </>
  ),
  share: (
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="m16 6-4-4-4 4M12 2v13" />
    </>
  ),
  printer: (
    <>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </>
  ),
  payment: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M15 8.8a3 3 0 0 0-2.2-1H11a2.4 2.4 0 0 0 0 4.8h2a2.4 2.4 0 0 1 0 4.8h-1.8A3 3 0 0 1 9 16.4" />
      <path d="M12 5.8v2m0 8.4v2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.9" fill="currentColor" stroke="none" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  chat: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7v5l3.2 1.9" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5M12 15V3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 8 5-5 5 5M12 3v12" />
    </>
  ),
  chevronUp: <path d="m6 15 6-6 6 6" />,
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m5.5 5.5 13 13" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-.8 13.2A2 2 0 0 1 16.2 21H7.8a2 2 0 0 1-2-1.8L5 6" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M2 14h4M10 8h4M18 16h4" />
    </>
  ),
  mailCheck: (
    <>
      <path d="M22 12.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8.5" />
      <path d="m2 7 8.9 5.6a2 2 0 0 0 2.2 0L22 7" />
      <path d="m15.5 18.5 2.3 2.3 4.2-4.5" />
    </>
  ),
};

export function ActionIcon({ name, size = 15 }: { name: keyof typeof ACTION_PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ACTION_PATHS[name]}
    </svg>
  );
}

export function Cust({ customer, sub }: { customer: Customer; sub?: string }) {
  return (
    <div className="cust">
      <div className="cust-dot" style={{ background: customer.dotBg, color: customer.dotFg }}>
        {initialsOf(customer.name)}
      </div>
      <div>
        <b>{customer.name}</b>
        <span>{sub ?? customer.terms}</span>
      </div>
    </div>
  );
}
