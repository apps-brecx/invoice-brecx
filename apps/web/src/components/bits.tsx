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
