import { z } from "zod";
import {
  USER_ROLES,
  INVOICE_STATUSES,
  INVOICE_FILTERS,
  CURRENCIES,
  PAYMENT_MODES,
  CUSTOMER_TYPES,
  ITEM_TYPES,
} from "./constants.js";

/* ----------------------------- Auth ----------------------------- */

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const userSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(USER_ROLES),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type User = z.infer<typeof userSchema>;

export const sessionUserSchema = z.object({
  userId: z.number().int(),
  email: z.string().email(),
  role: z.enum(USER_ROLES),
  name: z.string().nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

/* ----------------------------- Users mgmt ----------------------------- */

export const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().trim().optional(),
  role: z.enum(USER_ROLES).default("user"),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

/* ----------------------------- Clients ----------------------------- */

const optStr = (max: number) => z.string().trim().max(max).optional().nullable();

/** Zoho-parity customer form: primary contact, display name, phones,
 *  language, payment terms, portal flag, billing + shipping addresses,
 *  internal remarks (notes). `name` IS the display name. */
export const clientInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(CUSTOMER_TYPES).default("Business"),
  salutation: optStr(20),
  firstName: optStr(100),
  lastName: optStr(100),
  company: optStr(200),
  currency: z.enum(CURRENCIES).default("USD"),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: optStr(60),
  mobile: optStr(60),
  language: z.string().trim().max(40).default("English"),
  paymentTerms: z.string().trim().max(40).default("Due on Receipt"),
  portalEnabled: z.boolean().default(false),
  // "Add more details" block
  website: optStr(300),
  department: optStr(120),
  designation: optStr(120),
  twitter: optStr(300),
  skype: optStr(120),
  facebook: optStr(300),
  // billing address
  billingAttention: optStr(200),
  addressLine1: optStr(200),
  addressLine2: optStr(200),
  city: optStr(120),
  state: optStr(120),
  postalCode: optStr(30),
  country: optStr(120),
  billingPhone: optStr(60),
  billingFax: optStr(60),
  // shipping address
  shippingAttention: optStr(200),
  shippingStreet1: optStr(200),
  shippingStreet2: optStr(200),
  shippingCity: optStr(120),
  shippingState: optStr(120),
  shippingZip: optStr(30),
  shippingCountry: optStr(120),
  shippingPhone: optStr(60),
  shippingFax: optStr(60),
  taxId: optStr(60),
  notes: z.string().trim().max(2000).optional().nullable(),
  /** Zoho-style contact persons (stored as JSONB on the client row). */
  contactPersons: z
    .array(
      z.object({
        salutation: z.string().trim().max(20).default(""),
        firstName: z.string().trim().max(100).default(""),
        lastName: z.string().trim().max(100).default(""),
        email: z.string().trim().max(200).default(""),
        workPhone: z.string().trim().max(60).default(""),
        mobile: z.string().trim().max(60).default(""),
      }),
    )
    .max(10)
    .default([]),
});
export type ClientInput = z.infer<typeof clientInputSchema>;
export type ContactPerson = ClientInput["contactPersons"][number];

/** A comment on a customer (internal, Zoho "Comments" tab). */
export const clientCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

/* ----------------------------- Invoices ----------------------------- */

export const invoiceItemInputSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitPrice: z.coerce.number().min(0).max(100_000_000),
  unit: z.string().trim().max(40).optional().nullable(),
  /** Values for template-defined custom columns, keyed by "custom:<id>". */
  extra: z.record(z.string().max(60), z.string().max(300)).default({}),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const invoiceInputSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  orderNumber: z.string().trim().max(100).optional().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  terms: z.string().trim().max(40).default("Due on Receipt"),
  subject: z.string().trim().max(300).optional().nullable(),
  currency: z.enum(CURRENCIES).default("USD"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  discountPct: z.coerce.number().min(0).max(100).default(0),
  shipping: z.coerce.number().min(0).max(100_000_000).default(0),
  adjustment: z.coerce.number().min(-100_000_000).max(100_000_000).default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
  termsConditions: z.string().trim().max(5000).optional().nullable(),
  /** "Save and Send Later" — the draft is scheduled to go out on this date. */
  sendLaterAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .nullable(),
  items: z.array(invoiceItemInputSchema).min(1),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const invoiceStatusSchema = z.object({
  status: z.enum(INVOICE_STATUSES),
});
export type InvoiceStatusInput = z.infer<typeof invoiceStatusSchema>;

export const invoiceListQuerySchema = z.object({
  filter: z.enum(INVOICE_FILTERS).default("all"),
  q: z.string().trim().default(""),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

/* ----------------------------- Items ----------------------------- */

export const itemInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  type: z.enum(ITEM_TYPES).default("Goods"),
  unit: z.string().trim().max(40).optional().nullable(),
  sellingPrice: z.coerce.number().min(0).max(100_000_000),
  description: z.string().trim().max(2000).optional().nullable(),
});
export type ItemInput = z.infer<typeof itemInputSchema>;

/* ----------------------------- Payment terms ----------------------------- */

/** Custom term: due N days after the invoice date. */
export const paymentTermInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  days: z.coerce.number().int().min(0).max(1000),
});
export type PaymentTermInput = z.infer<typeof paymentTermInputSchema>;

/* ----------------------------- Payments ----------------------------- */

export const paymentInputSchema = z.object({
  amount: z.coerce.number().positive().max(100_000_000),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  mode: z.enum(PAYMENT_MODES).default("Bank Transfer"),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

/* ----------------------------- Invoice template ----------------------------- */

const label = (d: string) => z.string().trim().max(60).default(d);

/** Every text label on the paper is renameable — "Rate" can become
 *  "Unit Price", "Bill To" can become "Sold To". The DATA behind each
 *  label always comes from the invoice; templates never break binding. */
export const templateLabelsSchema = z.object({
  billTo: label("Bill To"),
  shipTo: label("Ship To"),
  invoiceNo: label("Invoice#"),
  orderNumber: label("Order Number"),
  invoiceDate: label("Invoice Date"),
  terms: label("Terms"),
  dueDate: label("Due Date"),
  balanceDue: label("Balance Due"),
  subTotal: label("Sub Total"),
  discount: label("Discount"),
  tax: label("Tax"),
  shipping: label("Shipping charge"),
  adjustment: label("Adjustment"),
  total: label("Total"),
  paid: label("Payments received"),
  notes: label("Notes"),
  termsConditions: label("Terms & Conditions"),
  signature: label("Authorized Signature"),
  paymentInstructions: label("Payment Instructions"),
});
export type TemplateLabels = z.infer<typeof templateLabelsSchema>;

export const TABLE_COLUMN_KEYS = ["index", "description", "qty", "unit", "rate", "amount"] as const;
export type TableColumnKey = (typeof TABLE_COLUMN_KEYS)[number];

/** These columns carry the data the invoice math depends on — they can be
 *  renamed and reordered but never removed from a template. */
export const REQUIRED_COLUMN_KEYS = ["description", "qty", "rate", "amount"] as const;

/** Column keys: a built-in key, or "custom:<id>" for user-defined columns
 *  whose per-line values are typed on the invoice form. */
const columnKeySchema = z.union([
  z.enum(TABLE_COLUMN_KEYS),
  z.string().regex(/^custom:[A-Za-z0-9_-]{1,40}$/),
]);

const columnSchema = z.object({
  key: columnKeySchema,
  label: z.string().trim().max(40),
  show: z.boolean(),
  /** Columns sharing a group name get a spanning header above them —
   *  e.g. "Special Pricing" over Unit Price + Total. Text after an
   *  em-dash ("Special Pricing — within 60 days") prints as a smaller
   *  subtitle line inside the header band. */
  group: z.string().trim().max(80).optional().nullable(),
  /** Column width in % of the table; null/absent = automatic. */
  width: z.coerce.number().min(4).max(80).optional().nullable(),
  /** Body-cell fill color — tint a whole column (pricing-tier style). */
  tint: z.string().trim().max(30).optional().nullable(),
  /** Print a TOTAL row at the foot of the table summing this column,
   *  as a plain count ("3,720") or as money ("$10,338.00"). */
  total: z.enum(["count", "money"]).optional().nullable(),
  /** Also print this column's sum as a row in the totals block. */
  sumLabel: z.string().trim().max(80).optional().nullable(),
});
export type TemplateColumn = z.infer<typeof columnSchema>;

export const DEFAULT_COLUMNS: TemplateColumn[] = [
  { key: "index", label: "#", show: true },
  { key: "description", label: "Item & Description", show: true },
  { key: "qty", label: "Qty", show: true },
  { key: "unit", label: "Unit", show: false },
  { key: "rate", label: "Rate", show: true },
  { key: "amount", label: "Amount", show: true },
];

/* ------------------------- layout blocks ------------------------- */

/** The paper is a stack of blocks, Shopify-theme-editor style: each can be
 *  shown/hidden, reordered, and styled (padding, font scale, colors,
 *  alignment). Required blocks can be styled/moved but never hidden. */
export const BLOCK_KEYS = [
  "header",
  "titleMeta",
  "subject",
  "itemTable",
  "totals",
  "custom",
  "paymentInstructions",
  "terms",
  "signature",
] as const;
export type BlockKey = (typeof BLOCK_KEYS)[number];

/** Full freedom: every block may be removed from a template. (The invoice
 *  DATA always survives in the database regardless of what prints.) */
export const REQUIRED_BLOCK_KEYS: BlockKey[] = [];

const blockSchema = z.object({
  key: z.enum(BLOCK_KEYS),
  show: z.boolean().default(true),
  /** Extra vertical padding in px (0–60). */
  pad: z.coerce.number().min(0).max(60).default(0),
  /** Font scale in % (70–140). */
  size: z.coerce.number().min(70).max(140).default(100),
  /** Text color override; empty = template default. */
  color: z.string().trim().max(30).default(""),
  /** Background fill; empty = none. */
  bg: z.string().trim().max(30).default(""),
  align: z.enum(["auto", "left", "center", "right"]).default("auto"),
  /** Block box width in % of the paper (30–100). */
  w: z.coerce.number().min(30).max(100).default(100),
  /** Where a narrower block sits on the paper. */
  pos: z.enum(["left", "center", "right"]).default("left"),
});
export type TemplateBlock = z.infer<typeof blockSchema>;

export const DEFAULT_BLOCKS: TemplateBlock[] = BLOCK_KEYS.map((key) => ({
  key,
  show: key !== "signature",
  pad: 0,
  size: 100,
  color: "",
  bg: "",
  align: "auto",
  w: 100,
  pos: "left",
}));

/* ------------------------- free content rows ------------------------- */

/** Notion-style custom content: rows of cells, each cell with its own
 *  text, color, weight, size and width. Lives in the "custom" block. */
const freeCellSchema = z.object({
  t: z.string().max(500).default(""),
  color: z.string().trim().max(30).default(""),
  b: z.boolean().default(false),
  /** Font size % (60–200). */
  size: z.coerce.number().min(60).max(200).default(100),
  /** Cell width % of the row; null = share evenly. */
  w: z.coerce.number().min(5).max(100).optional().nullable(),
  align: z.enum(["left", "center", "right"]).default("left"),
});
export type FreeCell = z.infer<typeof freeCellSchema>;

const freeRowSchema = z.object({
  id: z.string().max(20),
  cells: z.array(freeCellSchema).min(1).max(6),
});
export type FreeRow = z.infer<typeof freeRowSchema>;

/** Everything on the invoice paper the user can customize — the Brecx
 *  differentiator over Zoho's fixed templates. Templates control the
 *  PRESENTATION (layout, labels, visibility, order); the data is always
 *  bound to the invoice fields, so a template can never "lose" a field's
 *  value — only choose how and whether to show it. */
export const templateSettingsSchema = z.object({
  orgName: z.string().trim().max(200).default("Fresh Finest"),
  orgTagline: z.string().trim().max(200).default(""),
  orgAddress: z.string().trim().max(500).default(""),
  orgPhone: z.string().trim().max(60).default(""),
  orgEmail: z.string().trim().max(200).default(""),
  /** Data-URL of the uploaded logo (kept small client-side). */
  logoDataUrl: z.string().max(400_000).default(""),
  showLogo: z.boolean().default(true),
  /** Accent color for rules/serial/title on the paper. */
  accent: z.string().trim().max(30).default("#14231B"),
  /** Heading text color. */
  labelColor: z.string().trim().max(30).default("#8B988E"),
  font: z.enum(["sans", "serif", "mono"]).default("sans"),
  layout: z.enum(["standard", "continental", "compact"]).default("standard"),
  /** Header arrangement: logo/org left (classic), right, centered, or
   *  brand-left (logo with the org details stacked underneath it). */
  headerStyle: z.enum(["logo-left", "logo-right", "centered", "brand-left"]).default("logo-left"),
  /** Item table look: accent band header, zebra rows, full grid, or minimal. */
  tableStyle: z.enum(["band", "zebra", "boxed", "minimal"]).default("band"),
  documentTitle: z.string().trim().max(60).default("INVOICE"),
  /** "Balance Due $X" highlight under the title, like Zoho's PDFs. */
  showBalanceBox: z.boolean().default(true),
  /** Second address block from the customer's shipping address. */
  showShipTo: z.boolean().default(false),
  showSignature: z.boolean().default(false),
  showOrderNumber: z.boolean().default(true),
  showDiscountRow: z.boolean().default(true),
  showShippingRow: z.boolean().default(true),
  /** Bank / wire details block printed above the footer. */
  paymentInstructions: z.string().trim().max(2000).default(""),
  labels: templateLabelsSchema.default({}),
  columns: z.array(columnSchema).max(14).default(DEFAULT_COLUMNS),
  blocks: z.array(blockSchema).max(12).default(DEFAULT_BLOCKS),
  /** Individually removed elements (meta rows, totals rows, notes, title…). */
  hidden: z.array(z.string().max(40)).max(40).default([]),
  /** Rows of the "custom" content block. */
  freeRows: z.array(freeRowSchema).max(30).default([]),
  footerNote: z.string().trim().max(500).default("Thanks for your business."),
  defaultNotes: z.string().trim().max(2000).default(""),
  defaultTerms: z.string().trim().max(5000).default(""),
});
export type TemplateSettings = z.infer<typeof templateSettingsSchema>;
