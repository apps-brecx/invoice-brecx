export const SESSION_COOKIE = "inv_session";

export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Invoice lifecycle. draft → sent → paid; overdue is derived from due_date
 *  but can also be set explicitly; void = cancelled, kept for the records. */
export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export const CURRENCIES = ["EUR", "USD", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Filter keys for the Invoices list page. */
export const INVOICE_FILTERS = ["all", ...INVOICE_STATUSES] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];
