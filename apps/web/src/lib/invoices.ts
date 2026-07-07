import type { InvoiceStatus } from "@inv/shared";

export interface InvoiceRow {
  id: number;
  number: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: string;
  tax_total: string;
  total: string;
  created_at: string;
  client_id: number;
  client_name: string;
  client_company: string | null;
}

export interface InvoiceStatRow {
  status: InvoiceStatus;
  n: number;
  sum: string;
}

/** Design-system badge tone for each invoice status. */
export function statusBadgeClass(status: InvoiceStatus): string {
  switch (status) {
    case "draft":
      return "badge consumer";
    case "sent":
      return "badge biz";
    case "paid":
      return "badge contacted";
    case "overdue":
      return "badge skip";
    case "void":
      return "badge consumer";
  }
}
