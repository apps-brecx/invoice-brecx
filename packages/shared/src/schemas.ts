import { z } from "zod";
import { USER_ROLES, INVOICE_STATUSES, INVOICE_FILTERS, CURRENCIES } from "./constants.js";

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

export const clientInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(60).optional().nullable(),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(30).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  taxId: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type ClientInput = z.infer<typeof clientInputSchema>;

/* ----------------------------- Invoices ----------------------------- */

export const invoiceItemInputSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitPrice: z.coerce.number().min(0).max(100_000_000),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const invoiceInputSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  currency: z.enum(CURRENCIES).default("EUR"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
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
