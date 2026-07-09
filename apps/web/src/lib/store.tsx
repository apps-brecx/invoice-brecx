import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

/* ------------------------------------------------------------------
 * API-backed billing store. Everything comes from Postgres via the
 * API — there is NO seed or demo data. Pages read through
 * useBilling() and call refresh() after mutations.
 * ------------------------------------------------------------------ */

export type DisplayStatus = "draft" | "due" | "partial" | "paid" | "overdue" | "void";

export interface Customer {
  id: number;
  name: string;
  type: string; // Wholesale | Retail
  terms: string; // payment terms label
  company: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string;
  postalCode: string | null;
  country: string | null;
  lifetime: number; // total actually paid, all time
  avgPayDays: number | null;
  dotBg: string;
  dotFg: string;
}

export interface Invoice {
  dbId: number;
  number: string; // "INV-00042"
  customerId: number;
  customerName: string;
  status: DisplayStatus;
  issued: string; // YYYY-MM-DD
  due: string;
  dueInDays: number;
  orderNumber: string | null;
  terms: string;
  subject: string | null;
  currency: string;
  discountPct: number;
  taxPct: number;
  shipping: number;
  adjustment: number;
  subtotal: number;
  taxTotal: number;
  total: number;
  paid: number;
  balance: number;
  sentAt: string | null;
  createdAt: string;
}

export interface Payment {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  invoiceTotal: number;
  customerId: number;
  customerName: string;
  amount: number;
  paidOn: string;
  mode: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export interface Item {
  id: number;
  name: string;
  type: string; // Goods | Service
  unit: string | null;
  sellingPrice: number;
  description: string | null;
  active: boolean;
  /** Storage key of the uploaded image (null = none). Bytes served at
   *  /items/:id/image — append ?k=imageKey to bust caches on re-upload. */
  imageKey: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface Summary {
  outstanding: number;
  dueToday: number;
  due30: number;
  overdue: number;
  overdueCount: number;
  openCount: number;
  avgDaysToPay: number | null;
}

/* --------------------------- formatting --------------------------- */

export const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const moneyK = (n: number) =>
  n >= 1000 ? "$" + (n / 1000).toFixed(1) + "k" : money(n);

export const fmtShort = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};
export const fmtLong = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
/** Full timestamp — "09 Jul 2026 04:12 PM" (Zoho-style history rows). */
export const fmtDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} ${time}`;
};

/** Days between an ISO date and today (positive = past). */
export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor(
    (Date.now() - new Date(iso.slice(0, 10) + "T00:00:00").getTime()) / 86_400_000,
  );
}

export const DOT_PALETTE: Array<[string, string]> = [
  ["var(--green-soft)", "var(--green)"],
  ["var(--brass-soft)", "var(--brass)"],
  ["#E5E9F5", "#5B6FA8"],
  ["var(--red-soft)", "var(--red)"],
];

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* --------------------------- row mapping --------------------------- */

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapClient(row: any, index: number): Customer {
  const [dotBg, dotFg] = DOT_PALETTE[index % DOT_PALETTE.length];
  return {
    id: row.id,
    name: row.name,
    type: row.type ?? "Wholesale",
    terms: row.payment_terms ?? "Net 30",
    company: row.company ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    addressLine1: row.address_line1 ?? null,
    addressLine2: row.address_line2 ?? null,
    city: row.city ?? "",
    postalCode: row.postal_code ?? null,
    country: row.country ?? null,
    lifetime: num(row.lifetime_paid),
    avgPayDays: numOrNull(row.avg_pay_days),
    dotBg,
    dotFg,
  };
}

export function mapInvoice(row: any): Invoice {
  return {
    dbId: row.id,
    number: row.number ?? `INV-${row.id}`,
    customerId: row.client_id,
    customerName: row.client_name ?? "",
    status: (row.display_status ?? "draft") as DisplayStatus,
    issued: String(row.issue_date).slice(0, 10),
    due: String(row.due_date).slice(0, 10),
    dueInDays: num(row.due_in_days),
    orderNumber: row.order_number ?? null,
    terms: row.terms ?? "Due on Receipt",
    subject: row.subject ?? null,
    currency: row.currency ?? "USD",
    discountPct: num(row.discount_pct),
    taxPct: num(row.tax_rate),
    shipping: num(row.shipping),
    adjustment: num(row.adjustment),
    subtotal: num(row.subtotal),
    taxTotal: num(row.tax_total),
    total: num(row.total),
    paid: num(row.paid_total),
    balance: num(row.balance),
    sentAt: row.sent_at ?? null,
    createdAt: row.created_at ?? "",
  };
}

function mapPayment(row: any): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    invoiceTotal: num(row.invoice_total),
    customerId: row.client_id,
    customerName: row.client_name,
    amount: num(row.amount),
    paidOn: String(row.paid_on).slice(0, 10),
    mode: row.mode ?? null,
    reference: row.reference ?? null,
    note: row.note ?? null,
    createdAt: row.created_at ?? "",
  };
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapItem(row: any): Item {
  return {
    id: row.id,
    name: row.name,
    type: row.type ?? "Goods",
    unit: row.unit ?? null,
    sellingPrice: num(row.selling_price),
    description: row.description ?? null,
    active: row.active ?? true,
    imageKey: row.image_key ?? null,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ----------------------------- Store ----------------------------- */

interface BillingState {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  items: Item[];
  summary: Summary;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EMPTY_SUMMARY: Summary = {
  outstanding: 0,
  dueToday: 0,
  due30: 0,
  overdue: 0,
  overdueCount: 0,
  openCount: 0,
  avgDaysToPay: null,
};

const Ctx = createContext<BillingState | undefined>(undefined);

export function BillingProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const [cl, inv, pay, it] = await Promise.all([
        api.get<{ clients: any[] }>("/clients"),
        api.get<{ invoices: any[]; summary: any }>("/invoices?limit=200"),
        api.get<{ payments: any[] }>("/payments"),
        api.get<{ items: any[] }>("/items"),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */
      setCustomers(cl.clients.map(mapClient));
      setInvoices(inv.invoices.map(mapInvoice));
      setPayments(pay.payments.map(mapPayment));
      setItems(it.items.map(mapItem));
      const s = inv.summary ?? {};
      setSummary({
        outstanding: num(s.outstanding),
        dueToday: num(s.due_today),
        due30: num(s.due_30),
        overdue: num(s.overdue),
        overdueCount: num(s.overdue_count),
        openCount: num(s.open_count),
        avgDaysToPay: numOrNull(s.avg_days_to_pay),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<BillingState>(
    () => ({ customers, invoices, payments, items, summary, loading, error, refresh }),
    [customers, invoices, payments, items, summary, loading, error, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBilling(): BillingState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBilling must be used within BillingProvider");
  return ctx;
}

export function customerOf(customers: Customer[], id: number): Customer {
  return (
    customers.find((c) => c.id === id) ?? {
      id,
      name: "Unknown",
      type: "Wholesale",
      terms: "Net 30",
      company: null,
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: "",
      postalCode: null,
      country: null,
      lifetime: 0,
      avgPayDays: null,
      dotBg: "var(--line-soft)",
      dotFg: "var(--mut)",
    }
  );
}
