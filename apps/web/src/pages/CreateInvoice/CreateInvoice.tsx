import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useBilling,
  customerOf,
  money,
  fmtLong,
  type Line,
  type InvoiceStatus,
} from "../../lib/store";
import { STATUS_LABEL } from "../../components/bits";
import { useToast } from "../../components/Toast";

const TERMS = ["Net 15", "Net 30", "Net 45", "Due on receipt"];

function termDays(terms: string): number {
  const m = terms.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export function CreateInvoice() {
  const { customers, invoices, nextInvoiceId, saveInvoice, logActivity } = useBilling();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();

  // ?inv=INV-2608 loads an existing invoice into the editor (edit a draft,
  // or inspect a sent one). Otherwise it's a brand-new draft.
  const existing = useMemo(
    () => invoices.find((i) => i.id === params.get("inv")),
    // Load once per navigation — edits shouldn't reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.get("inv")],
  );

  const [newSerial] = useState(nextInvoiceId); // lazy init — allocated once
  const serial = existing?.id ?? newSerial;
  const [status, setStatus] = useState<InvoiceStatus>(existing?.status ?? "draft");
  const [custId, setCustId] = useState(existing?.customerId ?? customers[0]?.id ?? "");
  const [terms, setTerms] = useState(existing?.terms ?? "Net 45");
  const [issue, setIssue] = useState(existing?.issued ?? todayISO());
  const [due, setDue] = useState(existing?.due ?? addDays(todayISO(), 45));
  const [discountPct, setDiscountPct] = useState(existing?.discountPct ?? 5);
  const [taxPct, setTaxPct] = useState(existing?.taxPct ?? 9);
  const [note, setNote] = useState(
    existing?.note ??
      "Thank you for stocking Syruvia. Pallet ships from SG warehouse within 3 working days.",
  );
  const [lines, setLines] = useState<Line[]>(
    existing?.lines.map((l) => ({ ...l })) ?? [
      { item: "Syruvia Vanilla Syrup 750ml — case of 12", qty: 8, price: 118.8 },
      { item: "Syruvia Hazelnut Syrup 750ml — case of 12", qty: 6, price: 118.8 },
      { item: "Syruvia Caramel Stick Pouch 15ml — box of 100", qty: 12, price: 64.0 },
    ],
  );

  const customer = customerOf(customers, custId);
  const sub = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const disc = (sub * discountPct) / 100;
  const tax = ((sub - disc) * taxPct) / 100;
  const grand = sub - disc + tax;

  function setLine(i: number, patch: Partial<Line>) {
    setLines((cur) => cur.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function onTermsChange(t: string) {
    setTerms(t);
    setDue(addDays(issue, termDays(t)));
  }

  function build(newStatus: InvoiceStatus) {
    return {
      id: serial,
      customerId: custId,
      status: newStatus,
      issued: newStatus === "draft" ? (existing?.issued ?? null) : issue,
      due: newStatus === "draft" ? (existing?.due ?? null) : due,
      terms,
      lines: lines.filter((l) => l.item.trim() || l.qty * l.price > 0),
      discountPct,
      taxPct,
      note,
      paidAmount: existing?.paidAmount ?? 0,
    };
  }

  function saveDraft() {
    saveInvoice(build("draft"));
    setStatus("draft");
    if (!existing) {
      logActivity("var(--mut-2)", [
        { t: "Draft " },
        { b: true, t: serial },
        { t: ` created for ${customer.name} — awaiting review.` },
      ]);
    }
    toast(`Draft ${serial} saved`);
  }

  function sendInvoice() {
    saveInvoice(build("due"));
    setStatus("due");
    logActivity("var(--green)", [
      { t: "Invoice " },
      { b: true, t: serial },
      { t: ` sent to ${customer.name} — ${money(grand)}, ${terms}.` },
    ]);
    toast(`Invoice ${serial} sent to ${customer.name}`);
    setTimeout(() => navigate("/invoices"), 900);
  }

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>{existing ? serial : "New invoice"}</h1>
          <p>Everything you type appears on the paper, live.</p>
        </div>
      </div>

      <div className="create-grid">
        {/* form */}
        <div className="card form-card">
          <div className="f-sec">
            <span className="f-lab">Bill to</span>
            <div className="f-row">
              <div className="field">
                <select value={custId} onChange={(e) => setCustId(e.target.value)}>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <small>Customer</small>
              </div>
              <div className="field">
                <select value={terms} onChange={(e) => onTermsChange(e.target.value)}>
                  {TERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <small>Payment terms</small>
              </div>
            </div>
            <div className="f-row">
              <div className="field">
                <input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
                <small>Issue date</small>
              </div>
              <div className="field">
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                <small>Due date</small>
              </div>
            </div>
          </div>

          <div className="f-sec">
            <span className="f-lab">Line items</span>
            <table className="lines">
              <thead>
                <tr>
                  <th style={{ width: "44%" }}>Item</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <input value={l.item} onChange={(e) => setLine(i, { item: e.target.value })} />
                    </td>
                    <td className="mono-in" style={{ width: 64 }}>
                      <input
                        type="number"
                        min={0}
                        value={l.qty}
                        onChange={(e) => setLine(i, { qty: +e.target.value || 0 })}
                      />
                    </td>
                    <td className="mono-in" style={{ width: 100 }}>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.price}
                        onChange={(e) => setLine(i, { price: +e.target.value || 0 })}
                      />
                    </td>
                    <td className="line-total" style={{ width: 92 }}>
                      {money(l.qty * l.price)}
                    </td>
                    <td style={{ width: 30 }}>
                      <button
                        className="rm-line"
                        title="Remove line"
                        onClick={() => setLines((cur) => cur.filter((_, idx) => idx !== i))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="add-line"
              onClick={() => setLines((cur) => [...cur, { item: "", qty: 1, price: 0 }])}
            >
              + Add line item
            </button>
          </div>

          <div className="f-sec">
            <div className="f-row">
              <div className="field">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(+e.target.value || 0)}
                />
                <small>Discount %</small>
              </div>
              <div className="field">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={taxPct}
                  onChange={(e) => setTaxPct(+e.target.value || 0)}
                />
                <small>Tax / GST %</small>
              </div>
            </div>
            <div className="field">
              <textarea
                rows={2}
                placeholder="Note shown on the invoice…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <small>Customer note</small>
            </div>
          </div>
        </div>

        {/* live paper preview */}
        <div className="paper-wrap">
          <div className="paper">
            <span className={`stamp ${status} paper-stamp`}>{STATUS_LABEL[status]}</span>
            <div className="paper-top">
              <div className="paper-brand">
                Fresh Finest LLC
                <span>Syruvia wholesale · label.brecx.com</span>
              </div>
              <div className="serial">Nº {serial}</div>
            </div>
            <div className="paper-meta">
              <div>
                <div className="lab">Billed to</div>
                <div className="v">
                  {customer.name}
                  <small>Accounts payable</small>
                </div>
              </div>
              <div>
                <div className="lab">Terms</div>
                <div className="v">{terms}</div>
              </div>
              <div>
                <div className="lab">Issued</div>
                <div className="v">{fmtLong(issue)}</div>
              </div>
              <div>
                <div className="lab">Due</div>
                <div className="v">{fmtLong(due)}</div>
              </div>
            </div>
            <table className="paper-lines">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Qty</th>
                  <th className="r">Price</th>
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.item || <span className="untitled">Untitled item</span>}</td>
                    <td className="r">{l.qty}</td>
                    <td className="r">{money(l.price)}</td>
                    <td className="r">{money(l.qty * l.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="paper-sums">
              <div>
                <span>Subtotal</span>
                <span>{money(sub)}</span>
              </div>
              <div>
                <span>Discount</span>
                <span>
                  −{money(disc)} ({discountPct}%)
                </span>
              </div>
              <div>
                <span>Tax</span>
                <span>
                  {money(tax)} ({taxPct}%)
                </span>
              </div>
              <div className="grand">
                <span>Amount due</span>
                <span>{money(grand)}</span>
              </div>
            </div>
            <div className="paper-foot">{note || " "}</div>
          </div>
          <div className="preview-actions">
            <button className="btn btn-ghost" onClick={saveDraft}>
              Save draft
            </button>
            <button className="btn btn-ink" onClick={sendInvoice}>
              Send invoice
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
