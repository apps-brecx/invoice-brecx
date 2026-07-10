import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useBilling, money, type Customer, type Item } from "../../lib/store";
import { useTemplate } from "../../lib/template";
import { usePaymentTerms, dueDateFor } from "../../lib/terms";
import { ActionIcon } from "../../components/bits";
import { useToast } from "../../components/Toast";
import { AddCustomerModal } from "../../components/CustomerModal";
import { CustomerPicker } from "../../components/CustomerPicker";
import { SearchSelect } from "../../components/SearchSelect";
import { DatePicker } from "../../components/DatePicker";
import { ItemSelect } from "../../components/ItemSelect";
import { NewItemModal } from "../../components/ItemModal";
import { BulkItemsModal } from "../../components/BulkItemsModal";
import { ImportInvoicesModal } from "../../components/ImportInvoicesModal";
import { NewTermModal } from "../../components/TermModal";
import { CustomizeDrawer } from "../../components/CustomizeDrawer";

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Line {
  description: string;
  qty: number;
  price: number;
  unit?: string | null;
  extra?: Record<string, string>;
}

/** Label ABOVE the input, Zoho-style. */
function Field({ label, children, grow }: { label: string; children: ReactNode; grow?: boolean }) {
  return (
    <div className={"field lab-top" + (grow ? " grow" : "")}>
      <span className="f-cap">{label}</span>
      {children}
    </div>
  );
}

/** Zoho-style New Invoice form. Also the draft editor via /invoices/:id/edit. */
export function CreateInvoice() {
  const { id } = useParams(); // present in edit mode
  const { customers, items, refresh } = useBilling();
  const { template, loaded: tplLoaded } = useTemplate();
  const { terms: termOptions, refresh: refreshTerms } = usePaymentTerms();
  const navigate = useNavigate();
  const { toast } = useToast();

  const editing = Boolean(id);

  const [loadedExisting, setLoadedExisting] = useState(!editing);
  const [number, setNumber] = useState<string | null>(null);
  const [custId, setCustId] = useState<number | 0>(0);
  const [orderNumber, setOrderNumber] = useState("");
  const [issue, setIssue] = useState(todayISO());
  const [terms, setTerms] = useState("Due on Receipt");
  const [due, setDue] = useState(todayISO());
  const [subject, setSubject] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", qty: 1, price: 0 }]);
  const [discountPct, setDiscountPct] = useState(0);
  const [taxPct, setTaxPct] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [adjustment, setAdjustment] = useState(0);
  const [notes, setNotes] = useState("");
  const [tnc, setTnc] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [addingTerm, setAddingTerm] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newItemFor, setNewItemFor] = useState<number | null>(null); // line index
  const [saving, setSaving] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [importing, setImporting] = useState(false);
  const importedRef = useRef(0);
  const sendMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sendMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) {
        setSendMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [sendMenuOpen]);

  // Template defaults prefill notes/terms on a fresh invoice.
  useEffect(() => {
    if (!editing && tplLoaded) {
      setNotes((cur) => cur || template.defaultNotes);
      setTnc((cur) => cur || template.defaultTerms);
    }
  }, [editing, tplLoaded, template.defaultNotes, template.defaultTerms]);

  // Edit mode: load the draft.
  useEffect(() => {
    if (!editing) return;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    api
      .get<{ invoice: any; items: any[] }>(`/invoices/${id}`)
      .then(({ invoice, items: rows }) => {
        if (invoice.status !== "draft") {
          toast("Only draft invoices can be edited.", "error");
          navigate(`/invoices/${id}`, { replace: true });
          return;
        }
        setNumber(invoice.number);
        setCustId(invoice.client_id);
        setOrderNumber(invoice.order_number ?? "");
        setIssue(String(invoice.issue_date).slice(0, 10));
        setTerms(invoice.terms ?? "Due on Receipt");
        setDue(String(invoice.due_date).slice(0, 10));
        setSubject(invoice.subject ?? "");
        setDiscountPct(Number(invoice.discount_pct));
        setTaxPct(Number(invoice.tax_rate));
        setShipping(Number(invoice.shipping));
        setAdjustment(Number(invoice.adjustment));
        setNotes(invoice.notes ?? "");
        setTnc(invoice.terms_conditions ?? "");
        setLines(
          rows.map((it: any) => ({
            description: it.description,
            qty: Number(it.quantity),
            price: Number(it.unit_price),
            unit: it.unit ?? null,
            extra: it.extra ?? {},
          })),
        );
        setLoadedExisting(true);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : "Failed to load invoice", "error");
        navigate("/invoices", { replace: true });
      });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, [editing, id, navigate, toast]);

  const customer = useMemo(
    () => customers.find((c) => c.id === custId) ?? null,
    [customers, custId],
  );

  function pickCustomer(cid: number) {
    setCustId(cid);
    const c = customers.find((x) => x.id === cid);
    if (c && !editing) {
      setTerms(c.terms);
      setDue(dueDateFor(issue, c.terms, termOptions));
    }
  }

  function onTermsChange(t: string) {
    setTerms(t);
    setDue(dueDateFor(issue, t, termOptions));
  }

  function onIssueChange(v: string) {
    setIssue(v);
    setDue(dueDateFor(v, terms, termOptions));
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((cur) => cur.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // Drag-to-reorder: the grip arms the row, then the list live-reorders as
  // the drag passes over other rows (Zoho-style).
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragArmed, setDragArmed] = useState<number | null>(null);
  function moveLine(from: number, to: number) {
    setLines((cur) => {
      const next = [...cur];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  }

  function applyItem(i: number, item: Item) {
    setLine(i, { description: item.name, price: item.sellingPrice, unit: item.unit });
  }

  function addBulk(picked: Array<{ item: Item; qty: number }>) {
    setLines((cur) => {
      // Drop the single untouched empty row before appending.
      const base =
        cur.length === 1 && !cur[0].description.trim() && cur[0].price === 0 ? [] : cur;
      return [
        ...base,
        ...picked.map((p) => ({
          description: p.item.name,
          qty: p.qty,
          price: p.item.sellingPrice,
          unit: p.item.unit,
        })),
      ];
    });
    setBulkOpen(false);
  }

  // The item table adapts to the ACTIVE template: its column labels apply,
  // and visible unit/custom columns get inputs here so their values print.
  const colLabel = (key: string, fallback: string) =>
    template.columns.find((c) => c.key === key)?.label || fallback;
  const extraCols = template.columns.filter(
    (c) => c.show && (c.key === "unit" || c.key.startsWith("custom:")),
  );

  const sub = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const disc = (sub * discountPct) / 100;
  const tax = ((sub - disc) * taxPct) / 100;
  const grand = sub - disc + tax + shipping + adjustment;
  const totalQty = lines.reduce((s, l) => s + (l.qty || 0), 0);

  function buildBody(sendLaterAt: string | null = null) {
    return {
      sendLaterAt,
      clientId: custId,
      orderNumber: orderNumber.trim() || null,
      issueDate: issue,
      dueDate: due,
      terms,
      subject: subject.trim() || null,
      currency: "USD",
      taxRate: taxPct,
      discountPct,
      shipping,
      adjustment,
      notes: notes.trim() || null,
      termsConditions: tnc.trim() || null,
      items: lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          description: l.description.trim(),
          quantity: l.qty,
          unitPrice: l.price,
          unit: l.unit || null,
          extra: l.extra ?? {},
        })),
    };
  }

  type SaveMode = "draft" | "send" | "print" | "share" | "later";

  async function save(mode: SaveMode, sendLaterAt: string | null = null) {
    if (!custId) {
      toast("Select a customer first.", "error");
      return;
    }
    const body = buildBody(sendLaterAt);
    if (body.items.length === 0) {
      toast("Add at least one line item.", "error");
      return;
    }
    setSaving(true);
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      let invId: number;
      let invNumber: string;
      if (editing) {
        const res = await api.put<{ invoice: any }>(`/invoices/${id}`, body);
        invId = res.invoice.id;
        invNumber = res.invoice.number;
      } else {
        const res = await api.post<{ invoice: any }>("/invoices", body);
        invId = res.invoice.id;
        invNumber = res.invoice.number;
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const marksSent = mode === "send" || mode === "print" || mode === "share";
      if (marksSent) {
        await api.patch(`/invoices/${invId}/status`, { status: "sent" });
      }

      switch (mode) {
        case "send":
          toast(`Invoice ${invNumber} sent to ${customer?.name ?? "customer"}`);
          break;
        case "print":
          toast(`Invoice ${invNumber} saved — opening print`);
          break;
        case "share": {
          const link = `${window.location.origin}/invoices/${invId}`;
          try {
            await navigator.clipboard.writeText(link);
            toast(`Invoice link copied to clipboard`);
          } catch {
            toast(`Share link: ${link}`, "info");
          }
          break;
        }
        case "later":
          toast(`Draft ${invNumber} scheduled to send later`);
          break;
        default:
          toast(`Draft ${invNumber} saved`);
      }

      await refresh();
      navigate(`/invoices/${invId}${mode === "print" ? "?print=1" : ""}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save invoice", "error");
      setSaving(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void save("draft");
  }

  if (!loadedExisting) {
    return (
      <div className="center-fill">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>{editing ? `Edit ${number}` : "New Invoice"}</h1>
          <p>{editing ? "Editing a draft — nothing is sent until you say so." : "Fill it in — the number is assigned on save."}</p>
        </div>
        <div className="right">
          {!editing && (
            <button type="button" className="btn btn-ghost" onClick={() => setImporting(true)}>
              <ActionIcon name="upload" /> Import Invoices
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setCustomizing(true)}>
            ⚙ Customize invoice
          </button>
        </div>
      </div>

      <form className="card form-card inv-form" onSubmit={onSubmit}>
        {/* top meta — Zoho order, labels above */}
        <div className="f-sec">
          <div className="f-row three">
            <Field label="Customer name *">
              <CustomerPicker
                customers={customers}
                value={custId}
                onPick={pickCustomer}
                onNew={() => setAddingCustomer(true)}
              />
            </Field>
            <Field label="Invoice#">
              <input value={editing ? (number ?? "") : "Auto (INV-…)"} disabled aria-label="Invoice number" />
            </Field>
            <Field label="Order number">
              <input
                placeholder="e.g. PO-89009023"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
              />
            </Field>
          </div>
          <div className="f-row three">
            <Field label="Invoice date *">
              <DatePicker value={issue} onChange={onIssueChange} required />
            </Field>
            <Field label="Terms">
              <SearchSelect
                options={termOptions.map((t) => ({
                  value: t.name,
                  label: t.name,
                  tag: t.days !== null ? `${t.days}d` : undefined,
                }))}
                value={terms}
                onChange={onTermsChange}
                footer="⊕ New Payment Term"
                onFooter={() => setAddingTerm(true)}
              />
            </Field>
            <Field label="Due date">
              <DatePicker value={due} onChange={setDue} required />
            </Field>
          </div>
          <Field label="Subject">
            <input
              placeholder="Let your customer know what this invoice is for"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
        </div>

        {/* item table */}
        <div className="f-sec">
          <span className="f-lab">Item table</span>
          <table className="lines">
            <thead>
              <tr>
                <th className="drag-cell" aria-label="Reorder" />
                <th style={{ width: extraCols.length > 0 ? "36%" : "48%" }}>
                  {colLabel("description", "Item details")}
                </th>
                {extraCols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th style={{ textAlign: "right" }}>{colLabel("qty", "Quantity")}</th>
                <th style={{ textAlign: "right" }}>{colLabel("rate", "Rate")}</th>
                <th style={{ textAlign: "right" }}>{colLabel("amount", "Amount")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr
                  key={i}
                  className={dragIdx === i ? "dragging" : undefined}
                  draggable={dragArmed === i}
                  onDragStart={(e) => {
                    setDragIdx(i);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (dragIdx === null) return;
                    e.preventDefault();
                    if (dragIdx !== i) {
                      moveLine(dragIdx, i);
                      setDragIdx(i);
                    }
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDragArmed(null);
                  }}
                >
                  <td className="drag-cell">
                    <span
                      className="line-grip"
                      title="Drag to reorder"
                      onMouseDown={() => setDragArmed(i)}
                      onMouseUp={() => setDragArmed(null)}
                    >
                      <svg width="9" height="15" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
                        <circle cx="2.5" cy="2.5" r="1.4" />
                        <circle cx="7.5" cy="2.5" r="1.4" />
                        <circle cx="2.5" cy="8" r="1.4" />
                        <circle cx="7.5" cy="8" r="1.4" />
                        <circle cx="2.5" cy="13.5" r="1.4" />
                        <circle cx="7.5" cy="13.5" r="1.4" />
                      </svg>
                    </span>
                  </td>
                  <td>
                    <ItemSelect
                      items={items.filter((it) => it.active)}
                      value={l.description}
                      onText={(text) => setLine(i, { description: text })}
                      onPick={(item) => applyItem(i, item)}
                      onNew={() => setNewItemFor(i)}
                    />
                  </td>
                  {extraCols.map((c) => (
                    <td key={c.key} style={{ width: 90 }}>
                      {c.key === "unit" ? (
                        <input
                          placeholder="pcs"
                          value={l.unit ?? ""}
                          onChange={(e) => setLine(i, { unit: e.target.value || null })}
                        />
                      ) : (
                        <input
                          value={l.extra?.[c.key] ?? ""}
                          onChange={(e) =>
                            setLine(i, { extra: { ...(l.extra ?? {}), [c.key]: e.target.value } })
                          }
                        />
                      )}
                    </td>
                  ))}
                  <td className="mono-in" style={{ width: 90 }}>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={l.qty}
                      onChange={(e) => setLine(i, { qty: +e.target.value || 0 })}
                    />
                  </td>
                  <td className="mono-in" style={{ width: 110 }}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.price}
                      onChange={(e) => setLine(i, { price: +e.target.value || 0 })}
                    />
                  </td>
                  <td className="line-total" style={{ width: 100 }}>
                    {money(l.qty * l.price)}
                  </td>
                  <td style={{ width: 30 }}>
                    <button
                      type="button"
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
          <div className="line-actions">
            <button
              type="button"
              className="add-line"
              onClick={() => setLines((cur) => [...cur, { description: "", qty: 1, price: 0 }])}
            >
              + Add new row
            </button>
            <button type="button" className="add-line" onClick={() => setBulkOpen(true)}>
              ⊕ Add items in bulk
            </button>
          </div>
        </div>

        {/* notes + totals, Zoho arrangement */}
        <div className="f-sec totals-sec">
          <div>
            <Field label="Customer notes">
              <textarea
                rows={3}
                placeholder="Will be displayed on the invoice"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <Field label="Terms & conditions">
              <textarea
                rows={4}
                placeholder="Enter the terms and conditions of your business"
                value={tnc}
                onChange={(e) => setTnc(e.target.value)}
              />
            </Field>
          </div>

          <div className="totals-box">
            <div className="t-row">
              <span>Sub Total</span>
              <b className="num">{money(sub)}</b>
            </div>
            <div className="t-row">
              <span>Discount</span>
              <span className="t-in">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(+e.target.value || 0)}
                />
                <i>%</i>
              </span>
              <b className="num">−{money(disc)}</b>
            </div>
            <div className="t-row">
              <span>Tax</span>
              <span className="t-in">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={taxPct}
                  onChange={(e) => setTaxPct(+e.target.value || 0)}
                />
                <i>%</i>
              </span>
              <b className="num">{money(tax)}</b>
            </div>
            <div className="t-row">
              <span>Shipping charges</span>
              <span className="t-in wide">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={shipping}
                  onChange={(e) => setShipping(+e.target.value || 0)}
                />
              </span>
              <b className="num">{money(shipping)}</b>
            </div>
            <div className="t-row">
              <span>Adjustment</span>
              <span className="t-in wide">
                <input
                  type="number"
                  step="0.01"
                  value={adjustment}
                  onChange={(e) => setAdjustment(+e.target.value || 0)}
                />
              </span>
              <b className="num">{money(adjustment)}</b>
            </div>
            <div className="t-row grand">
              <span>Total ( $ )</span>
              <b className="num">{money(grand)}</b>
            </div>
          </div>
        </div>

        <div className="form-foot">
          <div className="foot-info">
            Total amount: <b className="num">{money(grand)}</b> · quantity:{" "}
            <b className="num">{totalQty}</b>
          </div>
          <div className="foot-actions">
            <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-ghost" disabled={saving}>
              Save as draft
            </button>
            <div className="split-btn" ref={sendMenuRef}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => void save("send")}
              >
                {saving ? "Saving…" : "Save and send"}
              </button>
              <button
                type="button"
                className="btn btn-primary caret"
                disabled={saving}
                aria-haspopup="menu"
                aria-expanded={sendMenuOpen}
                onClick={() => setSendMenuOpen((o) => !o)}
              >
                <ActionIcon name="chevronUp" size={13} />
              </button>
              {sendMenuOpen && (
                <div className="menu-pop up" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSendMenuOpen(false);
                      void save("print");
                    }}
                  >
                    ⎙ Save and Print
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSendMenuOpen(false);
                      void save("share");
                    }}
                  >
                    ↗ Save and Share
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSendMenuOpen(false);
                      setScheduling(true);
                    }}
                  >
                    ◷ Save and Send Later
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>

      {addingCustomer && (
        <AddCustomerModal
          onClose={() => setAddingCustomer(false)}
          onAdded={async (c: Customer) => {
            setAddingCustomer(false);
            await refresh();
            pickCustomer(c.id);
            toast(`${c.name} added to customers`);
          }}
        />
      )}

      {addingTerm && (
        <NewTermModal
          onClose={() => setAddingTerm(false)}
          onCreated={async (name, days) => {
            setAddingTerm(false);
            setTerms(name);
            // Compute due directly from the fresh term — the terms list
            // refresh below lands after this state update.
            const d = new Date(issue + "T00:00:00");
            d.setDate(d.getDate() + days);
            setDue(
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
            );
            await refreshTerms();
          }}
        />
      )}

      {newItemFor !== null && (
        <NewItemModal
          initialName={lines[newItemFor]?.description ?? ""}
          onClose={() => setNewItemFor(null)}
          onCreated={async (item) => {
            const idx = newItemFor;
            setNewItemFor(null);
            if (idx !== null) applyItem(idx, item);
            await refresh();
          }}
        />
      )}

      {bulkOpen && (
        <BulkItemsModal items={items} onClose={() => setBulkOpen(false)} onAdd={addBulk} />
      )}

      {customizing && <CustomizeDrawer onClose={() => setCustomizing(false)} />}

      {importing && (
        <ImportInvoicesModal
          customers={customers}
          onClose={() => {
            setImporting(false);
            // Anything imported → land on the list where the new rows are.
            if (importedRef.current > 0) navigate("/invoices");
          }}
          onImported={async (ok) => {
            importedRef.current = ok;
            await refresh();
            toast(`${ok} invoice${ok === 1 ? "" : "s"} imported`);
          }}
        />
      )}

      {scheduling && (
        <SendLaterModal
          onClose={() => setScheduling(false)}
          onPick={(iso) => {
            setScheduling(false);
            void save("later", iso);
          }}
        />
      )}
    </section>
  );
}

function SendLaterModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (iso: string) => void;
}) {
  const [date, setDate] = useState(todayISO());
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>Save and Send Later</h3>
        <div className="field lab-top">
          <span className="f-cap">Send on</span>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <p className="tab-note" style={{ padding: "4px 0 0" }}>
          The invoice is saved as a draft and marked with the send date — it shows on the
          invoice until you send it.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onPick(date)}>
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
