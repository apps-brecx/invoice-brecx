import { useCallback, useEffect, useState } from "react";
import { PAYMENT_TERMS } from "@inv/shared";
import { api } from "./api";

export interface PaymentTerm {
  name: string;
  /** Custom terms: due N days after invoice date. Built-ins: null. */
  days: number | null;
  builtin: boolean;
}

const FALLBACK: PaymentTerm[] = PAYMENT_TERMS.map((name) => ({
  name,
  days: null,
  builtin: true,
}));

/** Built-in + user-defined payment terms, refreshable after adding one. */
export function usePaymentTerms(): { terms: PaymentTerm[]; refresh: () => Promise<void> } {
  const [terms, setTerms] = useState<PaymentTerm[]>(FALLBACK);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ terms: PaymentTerm[] }>("/settings/payment-terms");
      setTerms(res.terms);
    } catch {
      /* fallback stays */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { terms, refresh };
}

export async function createPaymentTerm(name: string, days: number): Promise<void> {
  await api.post("/settings/payment-terms", { name, days });
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Due date implied by a payment term, Zoho semantics. */
export function dueDateFor(issueIso: string, termName: string, terms: PaymentTerm[]): string {
  const d = new Date(issueIso + "T00:00:00");
  if (termName === "Due end of the month") {
    return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  if (termName === "Due end of next month") {
    return toIso(new Date(d.getFullYear(), d.getMonth() + 2, 0));
  }
  const custom = terms.find((t) => t.name === termName && t.days !== null);
  const m = termName.match(/\d+/);
  const days = custom?.days ?? (m ? Number(m[0]) : 0);
  d.setDate(d.getDate() + days);
  return toIso(d);
}
