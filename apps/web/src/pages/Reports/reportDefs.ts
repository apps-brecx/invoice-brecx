/** Reports Center registry — one entry per working report. The API
 *  serves rows from /reports/:key; columns here drive the table. */

export interface ReportCol {
  key: string;
  label: string;
  align?: "right";
  fmt?: "money" | "date" | "int" | "status";
  /** Include this column in the Total row (numeric sum). */
  sum?: boolean;
}

export interface ReportDef {
  key: string;
  name: string;
  group: string;
  desc: string;
  columns: ReportCol[];
}

export const REPORTS: ReportDef[] = [
  {
    key: "sales-by-customer",
    name: "Sales by Customer",
    group: "Sales",
    desc: "Invoiced sales grouped by customer (drafts and void excluded).",
    columns: [
      { key: "name", label: "Name" },
      { key: "invoice_count", label: "Invoice Count", align: "right", fmt: "int", sum: true },
      { key: "sales", label: "Sales", align: "right", fmt: "money", sum: true },
    ],
  },
  {
    key: "sales-by-item",
    name: "Sales by Item",
    group: "Sales",
    desc: "Quantity and revenue per item across invoices.",
    columns: [
      { key: "item", label: "Item" },
      { key: "quantity", label: "Quantity Sold", align: "right", fmt: "int", sum: true },
      { key: "avg_rate", label: "Avg. Rate", align: "right", fmt: "money" },
      { key: "amount", label: "Amount", align: "right", fmt: "money", sum: true },
    ],
  },
  {
    key: "ar-aging-summary",
    name: "AR Aging Summary",
    group: "Receivables",
    desc: "Open balances grouped by how long past due they are.",
    columns: [
      { key: "bucket", label: "Age" },
      { key: "invoice_count", label: "Invoices", align: "right", fmt: "int", sum: true },
      { key: "balance", label: "Balance Due", align: "right", fmt: "money", sum: true },
    ],
  },
  {
    key: "ar-aging-details",
    name: "AR Aging Details",
    group: "Receivables",
    desc: "Every open invoice with its days-overdue count.",
    columns: [
      { key: "number", label: "Invoice#" },
      { key: "customer", label: "Customer" },
      { key: "issue_date", label: "Date", fmt: "date" },
      { key: "due_date", label: "Due Date", fmt: "date" },
      { key: "days_overdue", label: "Days Overdue", align: "right", fmt: "int" },
      { key: "total", label: "Amount", align: "right", fmt: "money", sum: true },
      { key: "balance", label: "Balance Due", align: "right", fmt: "money", sum: true },
    ],
  },
  {
    key: "invoice-details",
    name: "Invoice Details",
    group: "Receivables",
    desc: "The full invoice ledger for the period.",
    columns: [
      { key: "number", label: "Invoice#" },
      { key: "customer", label: "Customer" },
      { key: "issue_date", label: "Date", fmt: "date" },
      { key: "due_date", label: "Due Date", fmt: "date" },
      { key: "status", label: "Status", fmt: "status" },
      { key: "total", label: "Amount", align: "right", fmt: "money", sum: true },
      { key: "paid", label: "Received", align: "right", fmt: "money", sum: true },
      { key: "balance", label: "Balance", align: "right", fmt: "money", sum: true },
    ],
  },
  {
    key: "customer-balance-summary",
    name: "Customer Balance Summary",
    group: "Receivables",
    desc: "What each customer still owes.",
    columns: [
      { key: "name", label: "Customer" },
      { key: "open_invoices", label: "Open Invoices", align: "right", fmt: "int", sum: true },
      { key: "invoiced", label: "Invoiced", align: "right", fmt: "money", sum: true },
      { key: "received", label: "Received", align: "right", fmt: "money", sum: true },
      { key: "balance", label: "Balance Due", align: "right", fmt: "money", sum: true },
    ],
  },
  {
    key: "bad-debts",
    name: "Bad Debts",
    group: "Receivables",
    desc: "Voided invoices — revenue written off.",
    columns: [
      { key: "number", label: "Invoice#" },
      { key: "customer", label: "Customer" },
      { key: "issue_date", label: "Date", fmt: "date" },
      { key: "total", label: "Amount", align: "right", fmt: "money", sum: true },
    ],
  },
  {
    key: "payments-received",
    name: "Payments Received",
    group: "Payments Received",
    desc: "Every payment recorded in the period.",
    columns: [
      { key: "paid_on", label: "Date", fmt: "date" },
      { key: "number", label: "Invoice#" },
      { key: "customer", label: "Customer" },
      { key: "mode", label: "Mode" },
      { key: "reference", label: "Reference" },
      { key: "amount", label: "Amount", align: "right", fmt: "money", sum: true },
    ],
  },
  {
    key: "time-to-get-paid",
    name: "Time to Get Paid",
    group: "Payments Received",
    desc: "Average days from invoice date to payment, per customer.",
    columns: [
      { key: "name", label: "Customer" },
      { key: "payments", label: "Payments", align: "right", fmt: "int", sum: true },
      { key: "avg_days", label: "Avg. Days to Pay", align: "right", fmt: "int" },
      { key: "received", label: "Received", align: "right", fmt: "money", sum: true },
    ],
  },
];

export const REPORT_GROUPS = ["Sales", "Receivables", "Payments Received"];
