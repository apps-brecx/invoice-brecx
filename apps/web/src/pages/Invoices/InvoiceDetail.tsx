import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import {
  useBilling,
  customerOf,
  mapInvoice,
  money,
  fmtShort,
  fmtLong,
  type Invoice,
} from "../../lib/store";
import { useTemplate } from "../../lib/template";
import { InvoicePaper, type PaperData } from "../../components/InvoicePaper";
import { Stamp, DueText } from "../../components/bits";
import { DatePicker } from "../../components/DatePicker";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Menu } from "../../components/Menu";
import { useToast } from "../../components/Toast";

interface DetailItem {
  id: number;
  description: string;
  quantity: string;
  unit_price: string;
  unit?: string | null;
  extra?: Record<string, string>;
}
interface DetailPayment {
  id: number;
  amount: string;
  paid_on: string;
  mode: string | null;
  reference: string | null;
  note: string | null;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
interface Detail {
  invoice: Invoice;
  raw: any;
  items: DetailItem[];
  payments: DetailPayment[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { customers, invoices, refresh } = useBilling();
  const { template } = useTemplate();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: "delete" }
    | { kind: "void" }
    | { kind: "payment"; pid: number }
    | null
  >(null);
  const [params, setParams] = useSearchParams();

  // "Save and Print" lands here with ?print=1 — print once the paper is up.
  useEffect(() => {
    if (detail && params.get("print") === "1") {
      setParams({}, { replace: true });
      const t = setTimeout(() => window.print(), 450);
      return () => clearTimeout(t);
    }
  }, [detail, params, setParams]);

  const load = useCallback(async () => {
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const res = await api.get<{ invoice: any; items: any[]; payments: any[] }>(
        `/invoices/${id}`,
      );
      /* eslint-enable @typescript-eslint/no-explicit-any */
      setDetail({
        invoice: mapInvoice(res.invoice),
        raw: res.invoice,
        items: res.items,
        payments: res.payments,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else toast(err instanceof Error ? err.message : "Failed to load invoice", "error");
    }
  }, [id, toast]);

  useEffect(() => {
    setDetail(null);
    setNotFound(false);
    void load();
  }, [load]);

  if (notFound) {
    return (
      <section className="view">
        <div className="empty-note card" style={{ padding: 40 }}>
          <b>Invoice not found</b>
          It may have been deleted.
        </div>
      </section>
    );
  }

  const inv = detail?.invoice;

  async function act(fn: () => Promise<void>, doneMsg: string) {
    setBusy(true);
    try {
      await fn();
      await Promise.all([load(), refresh()]);
      toast(doneMsg);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  }

  const markSent = () =>
    act(async () => {
      await api.patch(`/invoices/${id}/status`, { status: "sent" });
    }, `Invoice ${inv?.number} marked as sent`);

  const voidInvoice = () =>
    act(async () => {
      await api.patch(`/invoices/${id}/status`, { status: "void" });
    }, `Invoice ${inv?.number} voided`);

  const deleteDraft = () =>
    act(async () => {
      await api.del(`/invoices/${id}`);
      navigate("/invoices");
    }, "Draft deleted");

  const removePayment = (pid: number) =>
    act(async () => {
      await api.del(`/payments/${pid}`);
    }, "Payment removed");

  /** Zoho-style Clone — a fresh draft with the same customer, lines and
   *  settings, dated today. */
  const cloneInvoice = () =>
    act(async () => {
      if (!detail || !inv) return;
      const today = new Date().toISOString().slice(0, 10);
      const span =
        (new Date(inv.due).getTime() - new Date(inv.issued).getTime()) / 86_400_000;
      const dueDate = new Date(Date.now() + Math.max(0, span) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const res = await api.post<{ invoice: any }>("/invoices", {
        clientId: detail.raw.client_id,
        orderNumber: inv.orderNumber,
        issueDate: today,
        dueDate,
        terms: inv.terms,
        subject: inv.subject,
        taxRate: inv.taxPct,
        discountPct: inv.discountPct,
        shipping: inv.shipping,
        adjustment: inv.adjustment,
        notes: detail.raw.notes,
        termsConditions: detail.raw.terms_conditions,
        items: detail.items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unit_price),
          unit: it.unit ?? null,
          extra: it.extra ?? {},
        })),
      });
      navigate(`/invoices/${res.invoice.id}`);
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }, "Invoice cloned as a new draft");

  const shareLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast("Invoice link copied to clipboard");
  };

  const customer = inv ? customerOf(customers, inv.customerId) : null;

  const paper: PaperData | null =
    inv && detail
      ? {
          number: inv.number,
          status: inv.status,
          issued: inv.issued,
          due: inv.due,
          terms: inv.terms,
          orderNumber: inv.orderNumber,
          subject: inv.subject,
          customerName: inv.customerName,
          customerAddress: [
            detail.raw.address_line1,
            detail.raw.address_line2,
            [detail.raw.city, detail.raw.postal_code].filter(Boolean).join(" "),
            detail.raw.country,
          ].filter(Boolean),
          shipToAddress: [
            detail.raw.shipping_attention,
            detail.raw.shipping_street1,
            detail.raw.shipping_street2,
            [detail.raw.shipping_city, detail.raw.shipping_zip].filter(Boolean).join(" "),
            detail.raw.shipping_country,
          ].filter(Boolean),
          lines: detail.items.map((it) => ({
            description: it.description,
            qty: Number(it.quantity),
            price: Number(it.unit_price),
            unit: it.unit ?? null,
            extra: it.extra ?? {},
          })),
          discountPct: inv.discountPct,
          taxPct: inv.taxPct,
          shipping: inv.shipping,
          adjustment: inv.adjustment,
          paid: inv.paid,
          notes: detail.raw.notes,
          termsConditions: detail.raw.terms_conditions,
        }
      : null;

  return (
    <section className="view detail-grid">
      {/* left: compact invoice list, Zoho-style */}
      <aside className="card inv-mini-list print-hide">
        <div className="panel-head">
          <h2>All Invoices</h2>
          <button className="link" onClick={() => navigate("/invoices")}>
            Full list →
          </button>
        </div>
        <div className="mini-list-body">
          {invoices.map((row) => (
            <button
              key={row.dbId}
              className={"mini-inv" + (String(row.dbId) === id ? " on" : "")}
              onClick={() => navigate(`/invoices/${row.dbId}`)}
            >
              <div className="mini-inv-top">
                <b>{row.customerName}</b>
                <span className="num">{money(row.total)}</span>
              </div>
              <div className="mini-inv-sub">
                <span className="inv-id">{row.number}</span>
                <span>· {fmtShort(row.issued)}</span>
              </div>
              <div className="mini-inv-status">
                <Stamp status={row.status} />
              </div>
            </button>
          ))}
          {invoices.length === 0 && (
            <div className="empty-note">
              <b>No invoices yet</b>
            </div>
          )}
        </div>
      </aside>

      {/* right: the document */}
      <div className="inv-detail">
        {!inv || !paper ? (
          <div className="center-fill">
            <div className="spinner" />
          </div>
        ) : (
          <>
            <div className="detail-head print-hide">
              <div>
                <h1>{inv.number}</h1>
                <p>
                  {inv.customerName} · issued {fmtLong(inv.issued)}
                  <DueText status={inv.status} dueInDays={inv.dueInDays} />
                </p>
              </div>
              <button
                className="icon-btn detail-close"
                title="Back to the invoice list"
                onClick={() => navigate("/invoices")}
              >
                ✕
              </button>
            </div>

            {/* Zoho-style action bar: Edit · Send ▾ · Share · PDF/Print ▾ · Record Payment · ⋯ */}
            <div className="action-bar zoho-bar print-hide">
              <button
                className="btn btn-bar"
                disabled={busy || inv.status !== "draft"}
                title={inv.status !== "draft" ? "Only drafts can be edited" : undefined}
                onClick={() => navigate(`/invoices/${inv.dbId}/edit`)}
              >
                ✎ Edit
              </button>
              <Menu
                trigger={
                  <button className="btn btn-bar" disabled={busy}>
                    ✉ Send <i className="caret">▾</i>
                  </button>
                }
                items={[
                  {
                    icon: "✉",
                    label: "Send Email",
                    disabled: inv.status !== "draft",
                    title:
                      inv.status !== "draft"
                        ? "Already sent"
                        : "Marks the invoice as sent (real email goes out once the email module ships)",
                    onClick: markSent,
                  },
                  { icon: "◎", label: "WhatsApp Message", disabled: true, title: "Coming later" },
                  { icon: "🕓", label: "Schedule Email", disabled: true, title: "Coming with the email module" },
                ]}
              />
              <button className="btn btn-bar" onClick={() => void shareLink()}>
                ⇗ Share
              </button>
              <Menu
                trigger={
                  <button className="btn btn-bar">
                    ⎙ PDF/Print <i className="caret">▾</i>
                  </button>
                }
                items={[
                  { icon: "⤓", label: "PDF", onClick: () => window.print(), title: "Print dialog → Save as PDF" },
                  { icon: "⎙", label: "Print", onClick: () => window.print() },
                  { sep: true },
                  { icon: "⎙", label: "Print Delivery Note", disabled: true, title: "Coming later" },
                  { icon: "⎙", label: "Print Packing Slip", disabled: true, title: "Coming later" },
                ]}
              />
              {(inv.status === "due" || inv.status === "partial" || inv.status === "overdue") && (
                <button className="btn btn-bar strong" disabled={busy} onClick={() => setPaying(true)}>
                  ◉ Record Payment
                </button>
              )}
              <Menu
                align="right"
                trigger={
                  <button className="btn btn-bar" disabled={busy}>
                    ⋯
                  </button>
                }
                items={[
                  {
                    icon: "✉",
                    label: "Mark As Sent",
                    disabled: inv.status !== "draft",
                    onClick: markSent,
                  },
                  { icon: "⧉", label: "Clone", onClick: () => void cloneInvoice() },
                  {
                    icon: "⊘",
                    label: "Void",
                    disabled: inv.status === "draft" || inv.status === "void" || inv.paid > 0,
                    title:
                      inv.paid > 0
                        ? "Remove its payments before voiding"
                        : inv.status === "draft"
                          ? "Drafts are deleted, not voided"
                          : undefined,
                    onClick: () => setConfirm({ kind: "void" }),
                  },
                  {
                    icon: "🗑",
                    label: "Delete",
                    danger: true,
                    disabled: inv.status !== "draft",
                    title: inv.status !== "draft" ? "Only drafts can be deleted — void it instead" : undefined,
                    onClick: () => setConfirm({ kind: "delete" }),
                  },
                  { sep: true },
                  {
                    icon: "⚙",
                    label: "Customize Template",
                    onClick: () => navigate("/settings/template"),
                  },
                ]}
              />
            </div>

            {inv.status === "draft" && (
              <div className="whats-next zoho-next print-hide">
                <span>
                  ✨ <b>WHAT'S NEXT?</b>{" "}
                  {detail.raw.send_later_at ? (
                    <>
                      Scheduled to send on{" "}
                      <b>{fmtLong(String(detail.raw.send_later_at).slice(0, 10))}</b> — or send
                      it now.
                    </>
                  ) : (
                    <>Send this Invoice to your customer or mark it as Sent.</>
                  )}
                </span>
                <span className="next-actions">
                  <button className="btn btn-primary" disabled={busy} onClick={markSent}>
                    Send Invoice
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={markSent}>
                    Mark As Sent
                  </button>
                </span>
              </div>
            )}
            {(inv.status === "due" || inv.status === "partial" || inv.status === "overdue") && (
              <div className="whats-next zoho-next print-hide">
                <span>
                  ✨ <b>WHAT'S NEXT?</b> Record payment for it as soon as you receive it.
                  {inv.paid > 0 && (
                    <>
                      {" "}
                      So far <b>{money(inv.paid)}</b> of <b>{money(inv.total)}</b> received.
                    </>
                  )}
                </span>
                <span className="next-actions">
                  <button className="btn btn-primary" disabled={busy} onClick={() => setPaying(true)}>
                    Record Payment
                  </button>
                </span>
              </div>
            )}

            <div className="paper-stage">
              <InvoicePaper tpl={template} data={paper} />
            </div>

            {detail.payments.length > 0 && (
              <div className="card print-hide" style={{ marginTop: 22 }}>
                <div className="panel-head">
                  <h2>Payments received</h2>
                </div>
                <div className="panel-body">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Mode</th>
                        <th>Reference</th>
                        <th className="right">Amount</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="num">{fmtLong(String(p.paid_on).slice(0, 10))}</td>
                          <td>{p.mode ?? "—"}</td>
                          <td className="num">{p.reference ?? "—"}</td>
                          <td className="num right" style={{ color: "var(--green)", fontWeight: 600 }}>
                            {money(Number(p.amount))}
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="icon-btn"
                                title="Remove payment"
                                onClick={() => setConfirm({ kind: "payment", pid: p.id })}
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {confirm && inv && (
        <ConfirmModal
          title={
            confirm.kind === "delete"
              ? "Delete this draft?"
              : confirm.kind === "void"
                ? "Void this invoice?"
                : "Remove this payment?"
          }
          message={
            confirm.kind === "delete" ? (
              <>
                Draft <b>{inv.number}</b> will be permanently deleted.
              </>
            ) : confirm.kind === "void" ? (
              <>
                <b>{inv.number}</b> will be marked void — it stays on record but no longer
                counts as receivable.
              </>
            ) : (
              <>The payment is removed and the invoice re-opens for the amount.</>
            )
          }
          confirmLabel={
            confirm.kind === "delete"
              ? "Yes, delete it"
              : confirm.kind === "void"
                ? "Yes, void it"
                : "Yes, remove it"
          }
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            if (c.kind === "delete") void deleteDraft();
            else if (c.kind === "void") void voidInvoice();
            else void removePayment(c.pid);
          }}
          onClose={() => setConfirm(null)}
        />
      )}

      {paying && inv && customer && (
        <RecordPaymentModal
          invoice={inv}
          onClose={() => setPaying(false)}
          onDone={async () => {
            setPaying(false);
            await Promise.all([load(), refresh()]);
          }}
        />
      )}
    </section>
  );
}

const MODES = ["Bank Transfer", "Card", "Cash", "Check", "Other"];

function RecordPaymentModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: Invoice;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(invoice.balance.toFixed(2));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState(MODES[0]);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/invoices/${invoice.dbId}/payments`, {
        amount: Number(amount),
        paidOn,
        mode,
        reference: reference.trim() || null,
      });
      toast(`Payment of ${money(Number(amount))} recorded on ${invoice.number}`);
      await onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to record payment", "error");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>Record payment — {invoice.number}</h3>
        <div className="f-row">
          <div className="field">
            <input
              type="number"
              min={0.01}
              step="0.01"
              max={invoice.balance}
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <small>Amount (balance {money(invoice.balance)})</small>
          </div>
          <div className="field">
            <DatePicker value={paidOn} onChange={setPaidOn} required />
            <small>Payment date</small>
          </div>
        </div>
        <div className="f-row">
          <div className="field">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <small>Payment mode</small>
          </div>
          <div className="field">
            <input
              placeholder="e.g. wire #4417"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <small>Reference (optional)</small>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Recording…" : "Record payment"}
          </button>
        </div>
      </form>
    </div>
  );
}
