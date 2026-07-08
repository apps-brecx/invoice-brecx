export const SESSION_COOKIE = "inv_session";

export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Stored invoice lifecycle. draft → sent → paid; void = cancelled, kept for
 *  the records. partial/overdue are DERIVED from payments + due_date at read
 *  time and never stored. */
export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** What the UI shows: stored status refined by payments + due date. */
export const DISPLAY_STATUSES = ["draft", "due", "partial", "paid", "overdue", "void"] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export const DISPLAY_STATUS_LABELS: Record<DisplayStatus, string> = {
  draft: "Draft",
  due: "Due",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export const CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PAYMENT_TERMS = [
  "Due end of next month",
  "Due end of the month",
  "Due on Receipt",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const PAYMENT_MODES = ["Bank Transfer", "Card", "Cash", "Check", "Other"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const ITEM_TYPES = ["Goods", "Service"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_UNITS = ["pcs", "box", "kg", "g", "lb", "dozen", "hour", "case", "pack"] as const;

export const CUSTOMER_TYPES = ["Business", "Individual"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Miss", "Dr."] as const;

export const CUSTOMER_LANGUAGES = [
  "English",
  "Bengali",
  "Hindi",
  "Spanish",
  "French",
  "German",
  "Chinese",
  "Arabic",
] as const;

/** Filter keys for the Invoices list page (display statuses). */
export const INVOICE_FILTERS = ["all", ...DISPLAY_STATUSES] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];
