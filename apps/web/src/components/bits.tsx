import type { Customer, InvoiceStatus } from "../lib/store";
import { initialsOf } from "../lib/store";

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  due: "Due",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
};

export function Stamp({ status }: { status: InvoiceStatus }) {
  return <span className={`stamp ${status}`}>{STATUS_LABEL[status]}</span>;
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
