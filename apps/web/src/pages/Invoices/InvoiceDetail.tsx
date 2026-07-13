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
import { templateSettingsSchema } from "@inv/shared";
import { DEFAULT_TEMPLATE, type TemplateSettings } from "../../lib/template";
import { InvoicePaper, type PaperData } from "../../components/InvoicePaper";
import { Stamp, DueText, ActionIcon, AiBadge } from "../../components/bits";
import { DatePicker } from "../../components/DatePicker";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Menu } from "../../components/Menu";
import { ShareInvoiceModal } from "../../components/ShareInvoiceModal";
import { InvoiceEmailModal } from "../../components/InvoiceEmailModal";
import { Pagination } from "../../components/Pagination";
import { DetailSkeleton, PaperSkeleton } from "../../components/TableSkeleton";
import { useToast } from "../../components/Toast";
import { exportInvoicesPdf } from "../../lib/invoicePdf";
import { downloadCsv } from "../Dashboard/Dashboard";

const MINI_PAGE = 15;

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
  /** The template THIS invoice prints with (its own, or the active one). */
  template: TemplateSettings;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { customers, invoices, refresh, loading } = useBilling();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    | { kind: "delete" }
    | { kind: "void" }
    | { kind: "payment"; pid: number }
    | null
  >(null);
  const [params, setParams] = useSearchParams();

  // Mini-list: search + paging + bulk selection (mirrors the full list view).
  const [miniQ, setMiniQ] = useState("");
  const [miniPage, setMiniPage] = useState(1);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const mq = miniQ.trim().toLowerCase();
  const miniRows = invoices.filter(
    (i) =>
      !mq ||
      i.number.toLowerCase().includes(mq) ||
      i.customerName.toLowerCase().includes(mq),
  );
  const miniPages = Math.max(1, Math.ceil(miniRows.length / MINI_PAGE));
  const safeMiniPage = Math.min(miniPage, miniPages);
  const pageRows = miniRows.slice((safeMiniPage - 1) * MINI_PAGE, safeMiniPage * MINI_PAGE);
  const allChecked = pageRows.length > 0 && pageRows.every((r) => sel.has(r.dbId));
  const toggleAll = () =>
    setSel(allChecked ? new Set() : new Set(pageRows.map((r) => r.dbId)));
  const toggleOne = (rowId: number) =>
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  useEffect(() => {
    setMiniPage(1);
  }, [mq]);

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
      const res = await api.get<{ invoice: any; items: any[]; payments: any[]; template?: unknown }>(
        `/invoices/${id}`,
      );
      /* eslint-enable @typescript-eslint/no-explicit-any */
      let template = DEFAULT_TEMPLATE;
      try {
        template = templateSettingsSchema.parse(res.template ?? {});
      } catch {
        /* defaults stay */
      }
      setDetail({
        invoice: mapInvoice(res.invoice),
        raw: res.invoice,
        items: res.items,
        payments: res.payments,
        template,
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

  // On a hard refresh the store is still loading — skeleton, not an empty
  // mini list with a lone spinner.
  if (!detail && loading) return <DetailSkeleton />;

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

  // Bulk operations over the mini-list selection (same as the invoices list).
  const selDrafts = invoices.filter((i) => sel.has(i.dbId) && i.status === "draft");

  const bulkMarkSent = () =>
    act(async () => {
      for (const d of selDrafts) {
        await api.patch(`/invoices/${d.dbId}/status`, { status: "sent" });
      }
      setSel(new Set());
    }, `${selDrafts.length} invoice${selDrafts.length === 1 ? "" : "s"} marked as sent`);

  function bulkExportCsv() {
    const list = invoices.filter((i) => sel.has(i.dbId));
    downloadCsv("brecx-invoices.csv", [
      ["No.", "Order number", "Customer", "Status", "Issued", "Due", "Amount", "Balance"],
      ...list.map((i) => [
        i.number,
        i.orderNumber ?? "",
        i.customerName,
        i.status,
        i.issued,
        i.due,
        i.total.toFixed(2),
        i.status === "draft" ? "" : i.balance.toFixed(2),
      ]),
    ]);
    toast(`Exported ${list.length} invoice${list.length === 1 ? "" : "s"} as CSV`);
  }

  async function bulkDelete() {
    setBusy(true);
    const goHome = id ? sel.has(Number(id)) && inv?.status === "draft" : false;
    let ok = 0;
    let failed = 0;
    for (const s of sel) {
      try {
        await api.del(`/invoices/${s}`);
        ok++;
      } catch {
        failed++;
      }
    }
    setSel(new Set());
    if (goHome) {
      await refresh();
      setBusy(false);
      navigate("/invoices");
    } else {
      await Promise.all([load(), refresh()]);
      setBusy(false);
    }
    if (failed > 0) {
      toast(`${ok} deleted — ${failed} skipped (only drafts can be deleted)`, "error");
    } else {
      toast(`${ok} draft${ok === 1 ? "" : "s"} deleted`);
    }
  }


  // Direct download through the same pixel-perfect pipeline as bulk export —
  // no print dialog detour.
  async function downloadPdf() {
    if (pdfBusy || !inv || !detail) return;
    setPdfBusy(true);
    try {
      await exportInvoicesPdf([inv.dbId], detail.template);
      toast(`${inv.number}.pdf downloaded`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not generate the PDF", "error");
    } finally {
      setPdfBusy(false);
    }
  }

  const customer = inv ? customerOf(customers, inv.customerId) : null;
  // The compose modal needs the REAL customer record (email, name) — the
  // customerOf fallback would prefill "Dear Unknown" with an empty To while
  // the store is still loading.
  const emailCustomer = inv ? customers.find((c) => c.id === inv.customerId) ?? null : null;

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
          <button className="back-nav" title="Back to all invoices" onClick={() => navigate("/invoices")}>
            <span className="bn-ic">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </span>
            All Invoices
          </button>
        </div>
        <div className="mini-tools">
          <input
            type="checkbox"
            className="mini-check"
            title="Select all on this page"
            checked={allChecked}
            onChange={toggleAll}
          />
          <label className="list-search mini-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={miniQ}
              onChange={(e) => setMiniQ(e.target.value)}
              placeholder="Search invoices…"
            />
            {miniQ && (
              <button type="button" className="ls-clear" aria-label="Clear search" onClick={() => setMiniQ("")}>
                ✕
              </button>
            )}
          </label>
        </div>
        <div className="mini-list-body">
          {pageRows.map((row) => (
            <div
              key={row.dbId}
              role="button"
              tabIndex={0}
              className={"mini-inv" + (String(row.dbId) === id ? " on" : "")}
              onClick={() => navigate(`/invoices/${row.dbId}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/invoices/${row.dbId}`);
              }}
            >
              <input
                type="checkbox"
                className="mini-check"
                checked={sel.has(row.dbId)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleOne(row.dbId)}
              />
              <div className="mini-inv-main">
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
              </div>
            </div>
          ))}
          {miniRows.length === 0 &&
            (loading ? (
              // Store still refreshing (e.g. detail fetch won the race) —
              // shimmer instead of a misleading "No invoices yet".
              Array.from({ length: 8 }, (_, i) => (
                <div className="skel-mini-row" key={i} aria-hidden="true">
                  <span className="skel-bar" style={{ width: `${42 + ((i * 13) % 34)}%` }} />
                  <span className="skel-bar" style={{ width: "17%" }} />
                </div>
              ))
            ) : (
              <div className="empty-note">
                <b>{invoices.length === 0 ? "No invoices yet" : "No matches"}</b>
              </div>
            ))}
        </div>
        {miniPages > 1 && (
          <div className="mini-foot">
            <Pagination page={safeMiniPage} pages={miniPages} onPage={setMiniPage} />
          </div>
        )}
      </aside>

      {sel.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">
            <strong>{sel.size}</strong> selected
          </span>
          <div className="bulk-actions">
            <button
              className="bb-btn"
              disabled={busy || selDrafts.length === 0}
              title={selDrafts.length === 0 ? "Only drafts can be marked as sent" : undefined}
              onClick={() => void bulkMarkSent()}
            >
              Mark as Sent
            </button>
            <button className="bb-btn" disabled={busy} onClick={bulkExportCsv}>
              Export CSV
            </button>
            <button
              className="bb-btn danger bb-icon"
              disabled={busy}
              title="Delete selected"
              aria-label="Delete selected"
              onClick={() => setConfirmBulk(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M19 6l-.8 13.2A2 2 0 0 1 16.2 21H7.8a2 2 0 0 1-2-1.8L5 6" />
                <path d="M10 11v5M14 11v5" />
              </svg>
            </button>
          </div>
          <button className="bb-close" aria-label="Clear selection" onClick={() => setSel(new Set())}>
            ✕
          </button>
        </div>
      )}

      {/* right: the document */}
      <div className="inv-detail">
        {!inv || !paper ? (
          <PaperSkeleton />
        ) : (
          <>
            <div className="detail-head print-hide">
              <div>
                <h1>
                  {inv.number}
                  {inv.viaAi && <AiBadge by={inv.createdBy} />}
                </h1>
                <p>
                  {inv.customerName} · issued {fmtLong(inv.issued)}
                  <DueText status={inv.status} dueInDays={inv.dueInDays} />
                </p>
              </div>
            </div>

            {/* Zoho-style action bar: Edit · Send ▾ · Share · PDF/Print ▾ · Record Payment · ⋯ */}
            <div className="action-bar zoho-bar print-hide">
              <button
                className="btn btn-bar"
                disabled={busy || inv.status !== "draft"}
                title={inv.status !== "draft" ? "Only drafts can be edited" : undefined}
                onClick={() => navigate(`/invoices/${inv.dbId}/edit`)}
              >
                <ActionIcon name="pencil" /> Edit
              </button>
              <Menu
                trigger={
                  <button className="btn btn-bar" disabled={busy}>
                    <ActionIcon name="send" /> Send{" "}
                    <i className="caret">
                      <ActionIcon name="chevron" size={12} />
                    </i>
                  </button>
                }
                items={[
                  {
                    icon: <ActionIcon name="mail" />,
                    label: "Send Email",
                    title: "Compose and email this invoice to the customer",
                    onClick: () => setEmailing(true),
                  },
                  { icon: <ActionIcon name="chat" />, label: "WhatsApp Message", disabled: true, title: "Coming later" },
                  { icon: <ActionIcon name="clock" />, label: "Schedule Email", disabled: true, title: "Coming with the email module" },
                ]}
              />
              <button className="btn btn-bar" onClick={() => setSharing(true)}>
                <ActionIcon name="share" /> Share
              </button>
              <Menu
                trigger={
                  <button className="btn btn-bar">
                    <ActionIcon name="printer" /> PDF/Print{" "}
                    <i className="caret">
                      <ActionIcon name="chevron" size={12} />
                    </i>
                  </button>
                }
                items={[
                  {
                    icon: <ActionIcon name="download" />,
                    label: pdfBusy ? "Preparing PDF…" : "PDF",
                    disabled: pdfBusy,
                    title: "Download as PDF",
                    onClick: () => void downloadPdf(),
                  },
                  { icon: <ActionIcon name="printer" />, label: "Print", onClick: () => window.print() },
                  { sep: true },
                  { icon: <ActionIcon name="printer" />, label: "Print Delivery Note", disabled: true, title: "Coming later" },
                  { icon: <ActionIcon name="printer" />, label: "Print Packing Slip", disabled: true, title: "Coming later" },
                ]}
              />
              {(inv.status === "due" || inv.status === "partial" || inv.status === "overdue") && (
                <button className="btn btn-bar strong" disabled={busy} onClick={() => setPaying(true)}>
                  <ActionIcon name="payment" /> Record Payment
                </button>
              )}
              <Menu
                align="right"
                trigger={
                  <button className="btn btn-bar" disabled={busy} aria-label="More actions">
                    <ActionIcon name="more" size={17} />
                  </button>
                }
                items={[
                  {
                    icon: <ActionIcon name="mailCheck" />,
                    label: "Mark As Sent",
                    disabled: inv.status !== "draft",
                    onClick: markSent,
                  },
                  { icon: <ActionIcon name="copy" />, label: "Clone", onClick: () => void cloneInvoice() },
                  {
                    icon: <ActionIcon name="ban" />,
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
                    icon: <ActionIcon name="trash" />,
                    label: "Delete",
                    danger: true,
                    disabled: inv.status !== "draft",
                    title: inv.status !== "draft" ? "Only drafts can be deleted — void it instead" : undefined,
                    onClick: () => setConfirm({ kind: "delete" }),
                  },
                  { sep: true },
                  {
                    icon: <ActionIcon name="sliders" />,
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
                  <button className="btn btn-primary" disabled={busy} onClick={() => setEmailing(true)}>
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
              <InvoicePaper tpl={detail.template} data={paper} />
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

      {confirmBulk && (
        <ConfirmModal
          title={`Delete ${sel.size} invoice${sel.size === 1 ? "" : "s"}?`}
          message={
            <>
              Selected draft{sel.size === 1 ? "" : "s"} will be permanently deleted. Sent or
              paid invoices are skipped — void those instead.
            </>
          }
          confirmLabel="Yes, delete"
          onConfirm={() => {
            setConfirmBulk(false);
            void bulkDelete();
          }}
          onClose={() => setConfirmBulk(false)}
        />
      )}

      {sharing && inv && <ShareInvoiceModal invoice={inv} onClose={() => setSharing(false)} />}

      {emailing && inv && emailCustomer && detail && (
        <InvoiceEmailModal
          invoice={inv}
          customer={emailCustomer}
          template={detail.template}
          onDone={async () => {
            await Promise.all([load(), refresh()]);
          }}
          onClose={() => setEmailing(false)}
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
