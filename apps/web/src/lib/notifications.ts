import { useEffect, useState } from "react";
import { money, type Invoice } from "./store";

/* Notifications are derived live from real invoice data — anything still
 * owed becomes an entry, most-overdue first. No fake data. Shared by the
 * topbar bell dropdown and Settings → Notifications. */

export interface Notif {
  id: string;
  tone: "crit" | "warn" | "info";
  title: string;
  /** Compact "amount · due" line for the dropdown. */
  time: string;
  /** Split fields for the Settings table. */
  amount: number;
  due: string;
  invoiceNumber: string;
  customerName: string;
  dbId: number;
}

export function buildNotifs(invoices: Invoice[]): Notif[] {
  return invoices
    .filter((i) => i.balance > 0 && i.status !== "paid" && i.status !== "draft" && i.status !== "void")
    .sort((a, b) => a.dueInDays - b.dueInDays)
    .map((i) => {
      const overdue = i.status === "overdue" || i.dueInDays < 0;
      const soon = !overdue && i.dueInDays <= 7;
      const d = Math.abs(i.dueInDays);
      const amt = money(i.balance);
      const due = overdue
        ? `overdue by ${d} day${d === 1 ? "" : "s"}`
        : i.dueInDays === 0
          ? "due today"
          : `due in ${i.dueInDays} day${i.dueInDays === 1 ? "" : "s"}`;
      return {
        id: `inv-${i.dbId}`,
        tone: overdue ? ("crit" as const) : soon ? ("warn" as const) : ("info" as const),
        title: overdue
          ? `Invoice ${i.number} to ${i.customerName} is overdue`
          : i.dueInDays === 0
            ? `Invoice ${i.number} is due today`
            : `Invoice ${i.number} awaiting payment`,
        time: `${amt} · ${due}`,
        amount: i.balance,
        due,
        invoiceNumber: i.number,
        customerName: i.customerName,
        dbId: i.dbId,
      };
    });
}

export const TONE_LABEL: Record<Notif["tone"], string> = {
  crit: "Overdue",
  warn: "Due soon",
  info: "Awaiting",
};

/* ---- read state, persisted + synced between bell and Settings ---- */

const READ_KEY = "brecx.notifRead";
const READ_EVENT = "brecx:notif-read";

function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function useNotifRead(): [Set<string>, (next: Set<string>) => void] {
  const [read, setRead] = useState<Set<string>>(loadRead);

  useEffect(() => {
    const sync = () => setRead(loadRead());
    window.addEventListener(READ_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(READ_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = (next: Set<string>) => {
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...next]));
    } catch {
      /* storage full/blocked — state still updates below */
    }
    setRead(new Set(next));
    window.dispatchEvent(new Event(READ_EVENT));
  };
  return [read, update];
}
