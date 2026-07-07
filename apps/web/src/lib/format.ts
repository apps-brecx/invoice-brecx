export function formatMoney(value: number | string | null | undefined, currency = "EUR"): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n || 0);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Today as YYYY-MM-DD (for date inputs). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today + n days as YYYY-MM-DD. */
export function daysFromNowISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
