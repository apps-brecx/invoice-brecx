import { useRef, useState, type DragEvent } from "react";
import { api } from "../lib/api";
import { parseCsv, normHeader, headerIndex } from "../lib/csv";
import { money, type Customer } from "../lib/store";
import { downloadCsv } from "../pages/Dashboard/Dashboard";

/** One invoice built from one or more CSV line rows (grouped by the file's
 *  invoice number — Zoho's import format works the same way). */
interface ParsedInvoice {
  key: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  orderNumber: string;
  subject: string;
  notes: string;
  terms: string;
  discountPct: number;
  taxPct: number;
  shipping: number;
  adjustment: number;
  markSent: boolean;
  lines: Array<{ description: string; qty: number; price: number; unit: string }>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** YYYY-MM-DD as-is; anything else through Date parsing; junk → fallback. */
function isoDate(v: string, fallback: string): string {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (!s) return fallback;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const num = (v: string, fallback = 0) => {
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  return Number.isNaN(n) ? fallback : n;
};

function mapRows(rows: string[][]): { invoices: ParsedInvoice[]; skipped: number } {
  if (rows.length < 2) return { invoices: [], skipped: 0 };
  const headers = rows[0].map(normHeader);
  const col = (...names: string[]) => headerIndex(headers, ...names);
  const iNumber = col("invoicenumber", "invoiceno", "number", "no", "invoice");
  const iCustomer = col("customername", "customer", "client", "clientname");
  const iIssued = col("invoicedate", "issued", "issuedate", "date");
  const iDue = col("duedate", "due");
  const iOrder = col("ordernumber", "order", "po", "ponumber");
  const iSubject = col("subject");
  const iNotes = col("notes", "customernotes");
  const iTerms = col("terms", "paymentterms");
  const iDesc = col("itemdescription", "itemdetails", "description", "item", "itemname");
  const iQty = col("quantity", "qty");
  const iRate = col("rate", "unitprice", "price");
  const iUnit = col("unit", "usageunit");
  const iDiscount = col("discount", "discountpct");
  const iTax = col("tax", "taxrate", "taxpct");
  const iShipping = col("shippingcharges", "shipping");
  const iAdjustment = col("adjustment");
  const iStatus = col("status", "invoicestatus");

  const groups = new Map<string, ParsedInvoice>();
  let skipped = 0;
  rows.slice(1).forEach((r, rowIdx) => {
    const at = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const customer = at(iCustomer);
    const desc = at(iDesc);
    const rate = num(at(iRate), NaN);
    if (!customer || !desc || Number.isNaN(rate) || rate < 0) {
      skipped++;
      return;
    }
    // Rows sharing an invoice number merge into one invoice; rows without a
    // number each become their own.
    const key = at(iNumber) || `__row${rowIdx}`;
    let inv = groups.get(key);
    if (!inv) {
      const issue = isoDate(at(iIssued), todayISO());
      inv = {
        key: at(iNumber) || `Row ${rowIdx + 2}`,
        customerName: customer.slice(0, 200),
        issueDate: issue,
        dueDate: isoDate(at(iDue), issue),
        orderNumber: at(iOrder).slice(0, 100),
        subject: at(iSubject).slice(0, 300),
        notes: at(iNotes).slice(0, 2000),
        terms: at(iTerms).slice(0, 60),
        discountPct: Math.min(Math.max(num(at(iDiscount)), 0), 100),
        taxPct: Math.min(Math.max(num(at(iTax)), 0), 100),
        shipping: Math.max(num(at(iShipping)), 0),
        adjustment: num(at(iAdjustment)),
        markSent: /sent|due|unpaid/i.test(at(iStatus)),
        lines: [],
      };
      groups.set(key, inv);
    }
    inv.lines.push({
      description: desc.slice(0, 1000),
      qty: Math.max(num(at(iQty), 1), 0) || 1,
      price: Math.min(rate, 100_000_000),
      unit: at(iUnit).slice(0, 40),
    });
  });
  return { invoices: [...groups.values()], skipped };
}

const invTotal = (inv: ParsedInvoice) => {
  const sub = inv.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const disc = (sub * inv.discountPct) / 100;
  return sub - disc + ((sub - disc) * inv.taxPct) / 100 + inv.shipping + inv.adjustment;
};

function sampleCsv() {
  downloadCsv("brecx-invoices-import-sample.csv", [
    ["Invoice Number", "Customer Name", "Invoice Date", "Due Date", "Order Number", "Item Description", "Quantity", "Rate", "Unit", "Status"],
    ["INV-A1", "Acme Traders", "2026-07-01", "2026-07-31", "PO-1001", "Blue Raspberry Syrup 750 ml", "12", "18.30", "box", "Draft"],
    ["INV-A1", "Acme Traders", "2026-07-01", "2026-07-31", "PO-1001", "Popping Boba 7 LB Tub", "4", "15.99", "pcs", "Draft"],
    ["INV-A2", "Nimbus Cafe", "2026-07-03", "2026-08-02", "", "Lavender Syrup 750 ml", "6", "3.75", "pcs", "Sent"],
  ]);
}

type Phase = "pick" | "preview" | "importing" | "done";

export function ImportInvoicesModal({
  customers,
  onClose,
  onImported,
}: {
  customers: Customer[];
  onClose: () => void;
  /** Called after a successful run so the caller can refresh + toast. */
  onImported: (ok: number) => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedInvoice[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [createCustomers, setCreateCustomers] = useState(true);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [okCount, setOkCount] = useState(0);
  const [failures, setFailures] = useState<Array<{ name: string; reason: string }>>([]);

  function pickFile(file: File | undefined | null) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setError("Use a .csv file — you can export one from Excel or Google Sheets.");
      return;
    }
    setError("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const { invoices, skipped: sk } = mapRows(parseCsv(String(reader.result ?? "")));
      if (invoices.length === 0) {
        setError(
          sk > 0
            ? "No usable rows — every row is missing a Customer Name, Item Description or a valid Rate."
            : 'No rows found. The first line must be headers including "Customer Name", "Item Description" and "Rate".',
        );
        return;
      }
      setParsed(invoices);
      setSkipped(sk);
      setPhase("preview");
    };
    reader.onerror = () => setError("Could not read the file.");
    reader.readAsText(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  async function runImport() {
    setPhase("importing");
    let ok = 0;
    const fails: Array<{ name: string; reason: string }> = [];
    // Customer lookup by name (case-insensitive); newly created ones join it.
    const byName = new Map<string, number>(
      customers.map((c) => [c.name.trim().toLowerCase(), c.id]),
    );

    for (let i = 0; i < parsed.length; i++) {
      const inv = parsed[i];
      setProgress(i + 1);
      try {
        let clientId = byName.get(inv.customerName.toLowerCase());
        if (!clientId) {
          if (!createCustomers) {
            throw new Error(`customer "${inv.customerName}" not found`);
          }
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          const res = await api.post<{ client: any }>("/clients", {
            name: inv.customerName,
            type: "Business",
            currency: "USD",
            language: "English",
            paymentTerms: inv.terms || "Due on Receipt",
            portalEnabled: false,
            contactPersons: [],
          });
          clientId = res.client.id as number;
          byName.set(inv.customerName.toLowerCase(), clientId);
        }

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const created = await api.post<{ invoice: any }>("/invoices", {
          clientId,
          orderNumber: inv.orderNumber || null,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          terms: inv.terms || "Due on Receipt",
          subject: inv.subject || null,
          currency: "USD",
          taxRate: inv.taxPct,
          discountPct: inv.discountPct,
          shipping: inv.shipping,
          adjustment: inv.adjustment,
          notes: inv.notes || null,
          items: inv.lines.map((l) => ({
            description: l.description,
            quantity: l.qty,
            unitPrice: l.price,
            unit: l.unit || null,
          })),
        });
        // A "Sent"-ish status column flips the fresh draft, Zoho-style.
        if (inv.markSent) {
          await api.patch(`/invoices/${created.invoice.id}/status`, { status: "sent" });
        }
        ok++;
      } catch (err) {
        fails.push({
          name: `${inv.key} (${inv.customerName})`,
          reason: err instanceof Error ? err.message : "failed",
        });
      }
    }
    setOkCount(ok);
    setFailures(fails);
    setPhase("done");
    if (ok > 0) await onImported(ok);
  }

  return (
    <div className="modal-overlay" onClick={phase === "importing" ? undefined : onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>Import Invoices</h3>

        {phase === "pick" && (
          <>
            <p className="imp-help">
              Upload a CSV with a header row — one line item per row; rows sharing an{" "}
              <b>Invoice Number</b> merge into one invoice. Required columns:{" "}
              <b>Customer Name</b>, <b>Item Description</b>, <b>Rate</b>. Also recognized:
              Invoice Date, Due Date, Quantity, Unit, Order Number, Terms, Notes, Discount, Tax,
              Shipping, Status.{" "}
              <button type="button" className="ov-link" onClick={sampleCsv}>
                Download a sample CSV
              </button>
            </p>
            <div
              className={"imp-drop" + (dragOver ? " drag" : "")}
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 8l5-5 5 5M12 3v12" />
              </svg>
              <span>
                Drag a CSV here or <b>Browse</b>
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
            <label className="imp-opt">
              <input
                type="checkbox"
                checked={createCustomers}
                onChange={(e) => setCreateCustomers(e.target.checked)}
              />
              <span>
                <b>Create missing customers automatically</b> — names that don't match an
                existing customer get a new record (Zoho-style address mapping).
              </span>
            </label>
            <p className="imp-help" style={{ marginTop: 10 }}>
              Invoice numbers are auto-assigned (INV-…) — the file's numbers only group line
              rows, same as Zoho's "Auto-Generate Invoice Numbers".
            </p>
            {error && <p className="imp-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {phase === "preview" && (
          <>
            <p className="imp-help">
              <b>{fileName}</b> — {parsed.length} invoice{parsed.length === 1 ? "" : "s"} (
              {parsed.reduce((s, p) => s + p.lines.length, 0)} line rows) ready
              {skipped > 0 && (
                <> · {skipped} row{skipped === 1 ? "" : "s"} skipped (missing customer/item/rate)</>
              )}
            </p>
            <div className="imp-preview">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>File #</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th className="right">Lines</th>
                    <th className="right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 5).map((inv, i) => (
                    <tr key={i}>
                      <td className="num">{inv.key}</td>
                      <td>
                        {inv.customerName}
                        {!customers.some(
                          (c) => c.name.trim().toLowerCase() === inv.customerName.toLowerCase(),
                        ) && (
                          <span className="stamp draft" style={{ marginLeft: 8 }}>
                            New
                          </span>
                        )}
                      </td>
                      <td className="num">{inv.issueDate}</td>
                      <td className="num right">{inv.lines.length}</td>
                      <td className="num right">{money(invTotal(inv))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 5 && <p className="imp-more">…and {parsed.length - 5} more</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPhase("pick")}>
                Back
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void runImport()}>
                Import {parsed.length} invoice{parsed.length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}

        {phase === "importing" && (
          <div className="imp-progress">
            <div className="spinner" />
            <p>
              Importing {progress} / {parsed.length}…
            </p>
          </div>
        )}

        {phase === "done" && (
          <>
            <p className="imp-help">
              <b>{okCount}</b> invoice{okCount === 1 ? "" : "s"} imported
              {failures.length > 0 && (
                <> · <b style={{ color: "var(--red)" }}>{failures.length}</b> failed</>
              )}
            </p>
            {failures.length > 0 && (
              <ul className="imp-fails">
                {failures.slice(0, 6).map((f, i) => (
                  <li key={i}>
                    <b>{f.name}</b> — {f.reason}
                  </li>
                ))}
                {failures.length > 6 && <li>…and {failures.length - 6} more</li>}
              </ul>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
