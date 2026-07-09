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
