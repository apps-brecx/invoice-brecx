import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBilling, money, fmtShort, fmtLong, fmtDateTime, initialsOf } from "../../lib/store";
import { api } from "../../lib/api";
import { useTemplate } from "../../lib/template";
import { CustomizeDrawer } from "../../components/CustomizeDrawer";
import { DateRangePicker } from "../../components/DateRangePicker";
import { EmailStatementModal } from "../../components/EmailStatementModal";
import { Menu } from "../../components/Menu";
import { Tooltip } from "../../components/Tooltip";
import { Pagination } from "../../components/Pagination";
import { ConfirmModal } from "../../components/ConfirmModal";
import { AddCustomerModal } from "../../components/CustomerModal";
import { DetailSkeleton } from "../../components/TableSkeleton";
import { Stamp, DueText } from "../../components/bits";
import { useToast } from "../../components/Toast";

type Tab = "overview" | "comments" | "transactions" | "mails" | "statement";

interface Comment {
  id: number;
  body: string;
  created_at: string;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MINI_PAGE = 15;

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { customers, invoices, payments, refresh, loading } = useBilling();
  const { template, reload: reloadTemplate } = useTemplate();

  const [tab, setTab] = useState<Tab>("overview");
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [raw, setRaw] = useState<any | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [newComment, setNewComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [customizing, setCustomizing] = useState<null | "home" | "templates">(null);
  // Which tab the edit modal opens on — the overview's quick links ("New
  // Address", contact-person ⊕) jump straight to the right section.
  const [editTab, setEditTab] = useState<"other" | "address" | "contacts">("other");
  const openEditAt = (t: "other" | "address" | "contacts") => {
    setEditTab(t);
    setEditing(true);
  };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Mini-list: search + paging + bulk selection (mirrors the full list view).
  const [miniQ, setMiniQ] = useState("");
  const [miniPage, setMiniPage] = useState(1);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const q = miniQ.trim().toLowerCase();
  const miniRows = customers.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || (c.company ?? "").toLowerCase().includes(q),
  );
  const miniPages = Math.max(1, Math.ceil(miniRows.length / MINI_PAGE));
  const safeMiniPage = Math.min(miniPage, miniPages);
  const pageRows = miniRows.slice((safeMiniPage - 1) * MINI_PAGE, safeMiniPage * MINI_PAGE);
  const allChecked = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(pageRows.map((r) => r.id)));
  const toggleOne = (rowId: number) =>
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  useEffect(() => {
    setMiniPage(1);
  }, [q]);

  const plural = (n: number) => `${n} customer${n === 1 ? "" : "s"}`;
  async function bulkActive(active: boolean) {
    setBusy(true);
    try {
      for (const s of sel) await api.patch(`/clients/${s}/active`, { active });
      await refresh();
      toast(`${plural(sel.size)} marked as ${active ? "active" : "inactive"}`);
      setSel(new Set());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  }
  async function bulkDelete() {
    setBusy(true);
    const goHome = id ? sel.has(Number(id)) : false;
    let ok = 0;
    let failed = 0;
    for (const s of sel) {
      try {
        await api.del(`/clients/${s}`);
        ok++;
      } catch {
        failed++;
      }
    }
    await refresh();
    setSel(new Set());
    setBusy(false);
    if (failed > 0) {
      toast(`${ok} deleted — ${failed} skipped (customers with invoices can't be deleted)`, "error");
    } else {
      toast(`${plural(ok)} deleted`);
    }
    if (goHome && ok > 0) navigate("/customers");
  }

  const customer = customers.find((c) => String(c.id) === id);
  const custInvoices = useMemo(
    () => invoices.filter((i) => String(i.customerId) === id),
    [invoices, id],
  );
  const custPayments = useMemo(
    () => payments.filter((p) => String(p.customerId) === id),
    [payments, id],
  );
  const receivable = custInvoices
    .filter((i) => i.status !== "draft" && i.status !== "void")
    .reduce((s, i) => s + i.balance, 0);

  const loadRaw = useCallback(async () => {
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = await api.get<{ client: any }>(`/clients/${id}`);
      setRaw(res.client);
    } catch {
      setRaw(null);
    }
  }, [id]);

  useEffect(() => {
    setTab("overview");
    setRaw(null);
    setComments(null);
    void loadRaw();
  }, [loadRaw]);

  useEffect(() => {
    if (tab !== "comments" || comments !== null || !id) return;
    api
      .get<{ comments: Comment[] }>(`/clients/${id}/comments`)
      .then((res) => setComments(res.comments))
      .catch(() => setComments([]));
  }, [tab, comments, id]);

  async function addComment() {
    if (!newComment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/clients/${id}/comments`, { body: newComment.trim() });
      setNewComment("");
      const res = await api.get<{ comments: Comment[] }>(`/clients/${id}/comments`);
      setComments(res.comments);
      toast("Comment added");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add comment", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(cid: number) {
    try {
      await api.del(`/clients/${id}/comments/${cid}`);
      setComments((cur) => (cur ? cur.filter((c) => c.id !== cid) : cur));
      toast("Comment removed");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove comment", "error");
    }
  }

  async function deleteCustomer() {
    setBusy(true);
    try {
      await api.del(`/clients/${id}`);
      await refresh();
      toast("Customer deleted");
      navigate("/customers");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete customer", "error");
      setBusy(false);
    }
  }

  /* ---------------- income chart: last 6 months of invoiced sales -------- */
  const chart = useMemo(() => {
    const months: Array<{ label: string; total: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      const total = custInvoices
        .filter((inv) => inv.status !== "draft" && inv.status !== "void" && inv.issued.startsWith(key))
        .reduce((s, inv) => s + inv.total, 0);
      months.push({ label: m.toLocaleDateString("en-US", { month: "short" }), total });
    }
    return months;
  }, [custInvoices]);
  const chartMax = Math.max(1, ...chart.map((m) => m.total));
  // Round the axis top up to a "nice" number (1/2/5 × power of ten) so the
  // Y ticks land on readable values.
  const yMax = useMemo(() => {
    const pow = Math.pow(10, Math.floor(Math.log10(chartMax)));
    const n = chartMax / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }, [chartMax]);
  const kFmt = (n: number) =>
    n >= 1000 ? `${Number((n / 1000).toFixed(1))}K` : String(Math.round(n));

  /* ------------- activity timeline: what happened, when, by whom --------- */
  const timeline = useMemo(() => {
    const ev: Array<{ ts: string; title: string; detail: string }> = [];
    if (raw?.created_at) {
      ev.push({
        ts: String(raw.created_at),
        title: "Customer created",
        detail: `by ${raw.created_by ?? "Admin"}`,
      });
    }
    if (raw?.updated_at && raw.updated_at !== raw.created_at) {
      ev.push({
        ts: String(raw.updated_at),
        title: "Customer updated",
        detail: `by ${raw.updated_by ?? "Admin"}`,
      });
    }
    for (const inv of custInvoices) {
      ev.push({
        ts: `${inv.issued}T12:00:00`,
        title: `Invoice ${inv.number} created`,
        detail: `${money(inv.total)}${inv.status === "void" ? " · since voided" : ""}`,
      });
    }
    for (const p of custPayments) {
      ev.push({
        ts: `${p.paidOn}T12:00:00`,
        title: `Payment received for ${p.invoiceNumber}`,
        detail: `${money(p.amount)}${p.mode ? ` · ${p.mode}` : ""}`,
      });
    }
    return ev.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 12);
  }, [raw, custInvoices, custPayments]);

  /* ---------------- statement ---------------- */
  const now = new Date();
  const [stmtFrom, setStmtFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [stmtTo, setStmtTo] = useState(iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  const statement = useMemo(() => {
    const real = custInvoices.filter((i) => i.status !== "draft" && i.status !== "void");
    const opening =
      real.filter((i) => i.issued < stmtFrom).reduce((s, i) => s + i.total, 0) -
      custPayments.filter((p) => p.paidOn < stmtFrom).reduce((s, p) => s + p.amount, 0);
    const rows: Array<{ date: string; label: string; details: string; amount: number; payment: number }> = [
      ...real
        .filter((i) => i.issued >= stmtFrom && i.issued <= stmtTo)
        .map((i) => ({
          date: i.issued,
          label: `Invoice ${i.number}`,
          details: i.orderNumber ? `Order ${i.orderNumber}` : "",
          amount: i.total,
          payment: 0,
        })),
      ...custPayments
        .filter((p) => p.paidOn >= stmtFrom && p.paidOn <= stmtTo)
        .map((p) => ({
          date: p.paidOn,
          label: "Payment Received",
          details: p.invoiceNumber,
          amount: 0,
          payment: p.amount,
        })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let bal = opening;
    const withBal = rows.map((r) => {
      bal += r.amount - r.payment;
      return { ...r, balance: bal };
    });
    return {
      opening,
      rows: withBal,
      invoiced: rows.reduce((s, r) => s + r.amount, 0),
      received: rows.reduce((s, r) => s + r.payment, 0),
      closing: bal,
    };
  }, [custInvoices, custPayments, stmtFrom, stmtTo]);

  /** Captures the on-screen statement paper pixel-for-pixel (same HTML the
   *  print view uses) into a jsPDF doc — used by both the PDF download and
   *  the email attachment. Libraries load lazily. */
  const [pdfBusy, setPdfBusy] = useState(false);
  const stmtPdfName = () =>
    `statement_${(customer?.name ?? "customer").replace(/[^a-zA-Z0-9]+/g, "_")}_${stmtFrom}_${stmtTo}.pdf`;

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  async function buildStatementPdf(): Promise<any> {
    const el = document.querySelector<HTMLElement>(".stmt-paper");
    if (!el) throw new Error("Open the Statement tab first");
    const [{ domToCanvas }, { jsPDF }] = await Promise.all([
      import("modern-screenshot"),
      import("jspdf"),
    ]);
    const canvas = await domToCanvas(el, {
      scale: 2, // crisp text
      backgroundColor: "#ffffff",
      // decorative chrome doesn't belong in the PDF
      onCloneNode: (cloned) => {
        const paper = cloned as HTMLElement;
        paper.classList.add("pdf-capture");
        paper.style.boxShadow = "none";
        paper.style.borderRadius = "0";
      },
    });
    // JPEG (q0.92) instead of PNG: ~5-10x smaller file → much faster SMTP
    // upload when attached to email, no visible quality loss at 2x scale.
    const img = canvas.toDataURL("image/jpeg", 0.92);

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const margin = 26;
    const imgW = W - margin * 2;
    const imgH = canvas.height * (imgW / canvas.width);
    const pageH = H - margin * 2;

    // First page, then keep offsetting the same image for the overflow.
    let heightLeft = imgH;
    let position = margin;
    pdf.addImage(img, "JPEG", margin, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(img, "JPEG", margin, position, imgW, imgH);
      heightLeft -= pageH;
    }
    return pdf;
  }

  /** Email attachment: the same exact PDF as base64. */
  async function statementPdfAttachment(): Promise<{ filename: string; data: string }> {
    const pdf = await buildStatementPdf();
    const uri: string = pdf.output("datauristring");
    return { filename: stmtPdfName(), data: uri.slice(uri.indexOf("base64,") + 7) };
  }

  async function exportPdf() {
    if (!customer || pdfBusy) return;
    setPdfBusy(true);
    try {
      const pdf = await buildStatementPdf();
      pdf.save(stmtPdfName());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not generate the PDF", "error");
    } finally {
      setPdfBusy(false);
    }
  }

  /** Excel opens an HTML table saved as .xls — no library needed. */
  function exportXls() {
    if (!customer) return;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const num = (n: number) => n.toFixed(2);
    const rows = statement.rows
      .map(
        (r) =>
          `<tr><td>${esc(fmtLong(r.date))}</td><td>${esc(r.label)}${r.details ? ` (${esc(r.details)})` : ""}</td><td>${r.amount ? num(r.amount) : ""}</td><td>${r.payment ? num(r.payment) : ""}</td><td>${num(r.balance)}</td></tr>`,
      )
      .join("");
    const html =
      `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body>` +
      `<table><tr><th colspan="5">Statement of Accounts — ${esc(customer.name)} (${esc(fmtLong(stmtFrom))} to ${esc(fmtLong(stmtTo))})</th></tr>` +
      `<tr><td>Opening Balance</td><td></td><td></td><td></td><td>${num(statement.opening)}</td></tr>` +
      `<tr><th>Date</th><th>Transactions</th><th>Amount</th><th>Payments</th><th>Balance</th></tr>` +
      rows +
      `<tr><td colspan="4"><b>Balance Due</b></td><td><b>${num(statement.closing)}</b></td></tr></table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `statement_${customer.name.replace(/[^a-zA-Z0-9]+/g, "_")}_${stmtFrom}_${stmtTo}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const billingAddr = raw
    ? [raw.address_line1, raw.address_line2, [raw.city, raw.billing_state, raw.postal_code].filter(Boolean).join(", "), raw.country].filter(Boolean)
    : [];
  const shippingAddr = raw
    ? [raw.shipping_street1, raw.shipping_street2, [raw.shipping_city, raw.shipping_state, raw.shipping_zip].filter(Boolean).join(", "), raw.shipping_country].filter(Boolean)
    : [];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const contactPersons: any[] = Array.isArray(raw?.contact_persons) ? raw.contact_persons : [];

  // On a hard refresh the store is still loading — show the skeleton, not a
  // misleading "not found".
  if (!customer && loading) return <DetailSkeleton />;
  if (!customer) {
    return (
      <section className="view">
        <div className="empty-note card" style={{ padding: 40 }}>
          <b>Customer not found</b>
          It may have been deleted.
        </div>
      </section>
    );
  }

  return (
    <section className="view detail-grid">
      {/* left: compact customer list */}
      <aside className="card inv-mini-list print-hide">
        <div className="panel-head">
          <button className="back-nav" title="Back to all customers" onClick={() => navigate("/customers")}>
            <span className="bn-ic">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </span>
            All Customers
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
              placeholder="Search customers…"
            />
            {miniQ && (
              <button type="button" className="ls-clear" aria-label="Clear search" onClick={() => setMiniQ("")}>
                ✕
              </button>
            )}
          </label>
        </div>
        <div className="mini-list-body">
          {pageRows.map((row) => {
            const open = invoices
              .filter((i) => i.customerId === row.id && i.status !== "draft" && i.status !== "void")
              .reduce((s, i) => s + i.balance, 0);
            return (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                className={"mini-inv" + (String(row.id) === id ? " on" : "")}
                onClick={() => navigate(`/customers/${row.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/customers/${row.id}`);
                }}
              >
                <input
                  type="checkbox"
                  className="mini-check"
                  checked={sel.has(row.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleOne(row.id)}
                />
                <div className="mini-inv-main">
                  <div className="mini-inv-top">
                    <b>{row.name}</b>
                    <span className="num">{money(open)}</span>
                  </div>
                  {!row.active && (
                    <div className="mini-inv-status">
                      <span className="stamp void">Inactive</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {miniRows.length === 0 && (
            <div className="empty-note">
              <b>{customers.length === 0 ? "No customers yet" : "No matches"}</b>
            </div>
          )}
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
            <button className="bb-btn" disabled={busy} onClick={() => void bulkActive(true)}>
              Mark as Active
            </button>
            <button className="bb-btn" disabled={busy} onClick={() => void bulkActive(false)}>
              Mark as Inactive
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

      {/* right: the customer */}
      <div className="inv-detail">
        <div className="detail-head print-hide">
          <div>
            <h1>{customer.name}</h1>
            <p>
              {customer.type} · {customer.terms}
            </p>
          </div>
          <div className="detail-actions">
            <button
              className="btn btn-ghost da-btn"
              disabled={busy || !raw}
              onClick={() => openEditAt("other")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              Edit
            </button>
            <Menu
              align="right"
              trigger={
                <button className="btn btn-primary da-btn-primary">
                  New Transaction
                  <svg className="da-caret-light" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              }
              items={[
                {
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 2h9l4 4v16l-2.5-1.5L14 22l-2.5-1.5L9 22l-2.5-1.5L4 22V4a2 2 0 0 1 2-2z" />
                      <path d="M9 8h7M9 12h7M9 16h4" />
                    </svg>
                  ),
                  label: "New Invoice",
                  onClick: () => navigate("/invoices/new"),
                },
                {
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                      <path d="M14 2v5h5M9 13h6M9 17h4" />
                    </svg>
                  ),
                  label: "New Quote",
                  disabled: true,
                  title: "Quotes module coming later",
                },
              ]}
            />
            <Menu
              align="right"
              trigger={
                <button className="btn btn-ghost da-btn" disabled={busy}>
                  More
                  <svg className="da-caret" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              }
              items={[
                {
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                      <path d="M19 6l-.8 13.2A2 2 0 0 1 16.2 21H7.8a2 2 0 0 1-2-1.8L5 6" />
                      <path d="M10 11v5M14 11v5" />
                    </svg>
                  ),
                  label: "Delete",
                  danger: true,
                  title: "Customers with invoices can't be deleted",
                  onClick: () => setConfirmDelete(true),
                },
              ]}
            />
          </div>
        </div>

        <div className="tabs print-hide">
          {(
            [
              ["overview", "Overview"],
              ["comments", "Comments"],
              ["transactions", "Transactions"],
              ["mails", "Mails"],
              ["statement", "Statement"],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button key={key} className={"tab" + (tab === key ? " on" : "")} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="cd-grid">
            <div className="card cd-left">
              <div className="cd-id">
                <div className="cust-dot lg" style={{ background: customer.dotBg, color: customer.dotFg }}>
                  {initialsOf(customer.name)}
                </div>
                <div>
                  <b>{customer.name}</b>
                  {customer.email && <span>{customer.email}</span>}
                  {customer.phone && <span>{customer.phone}</span>}
                </div>
              </div>

              <h3 className="ov-h">Address</h3>
              <div className="ov-grid">
                <div className="ov-row">
                  <span>Billing Address</span>
                  <b style={{ whiteSpace: "pre-line" }}>
                    {billingAddr.length ? (
                      <>
                        {billingAddr.join("\n")}
                        <button type="button" className="ov-link" onClick={() => openEditAt("address")}>
                          Edit
                        </button>
                      </>
                    ) : (
                      <span className="ov-empty">
                        No billing address —{" "}
                        <button type="button" className="ov-link" onClick={() => openEditAt("address")}>
                          New Address
                        </button>
                      </span>
                    )}
                  </b>
                </div>
                <div className="ov-row">
                  <span>Shipping Address</span>
                  <b style={{ whiteSpace: "pre-line" }}>
                    {shippingAddr.length ? (
                      <>
                        {shippingAddr.join("\n")}
                        <button type="button" className="ov-link" onClick={() => openEditAt("address")}>
                          Edit
                        </button>
                      </>
                    ) : (
                      <span className="ov-empty">
                        No shipping address —{" "}
                        <button type="button" className="ov-link" onClick={() => openEditAt("address")}>
                          New Address
                        </button>
                      </span>
                    )}
                  </b>
                </div>
              </div>

              <h3 className="ov-h">Other Details</h3>
              <div className="ov-grid">
                <div className="ov-row">
                  <span>Customer Type</span>
                  <b>{customer.type}</b>
                </div>
                <div className="ov-row">
                  <span>Default Currency</span>
                  <b>USD</b>
                </div>
                <div className="ov-row">
                  <span>Payment Terms</span>
                  <b>{customer.terms}</b>
                </div>
                <div className="ov-row">
                  <span>Portal Status</span>
                  <b style={{ color: raw?.portal_enabled ? "var(--green)" : "var(--red)" }}>
                    {raw?.portal_enabled ? "Enabled" : "Disabled"}
                  </b>
                </div>
                <div className="ov-row">
                  <span>Customer Language</span>
                  <b>{raw?.language ?? "English"}</b>
                </div>
                {raw?.website && (
                  <div className="ov-row">
                    <span>Website</span>
                    <b>{raw.website}</b>
                  </div>
                )}
              </div>

              <h3 className="ov-h ov-h-action">
                Contact Persons
                <button
                  type="button"
                  className="cp-add"
                  title="Add contact person"
                  aria-label="Add contact person"
                  onClick={() => openEditAt("contacts")}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </h3>
              {contactPersons.length === 0 ? (
                <p className="tab-note" style={{ padding: "2px 0 8px" }}>
                  No contact persons found —{" "}
                  <button type="button" className="ov-link" onClick={() => openEditAt("contacts")}>
                    add one
                  </button>
                </p>
              ) : (
                <div className="cd-cps">
                  {contactPersons.map((p, i) => (
                    <div className="cd-cp" key={i}>
                      <b>
                        {[p.salutation, p.firstName, p.lastName].filter(Boolean).join(" ") || "—"}
                      </b>
                      {p.email && <span>{p.email}</span>}
                      {(p.workPhone || p.mobile) && <span>{p.workPhone || p.mobile}</span>}
                    </div>
                  ))}
                </div>
              )}

              {raw?.notes && (
                <>
                  <h3 className="ov-h">Remarks</h3>
                  <p className="tab-note" style={{ padding: "2px 0 8px", whiteSpace: "pre-line" }}>
                    {raw.notes}
                  </p>
                </>
              )}

              <h3 className="ov-h">Record Info</h3>
              <div className="ov-grid">
                <div className="ov-row">
                  <span>Customer ID</span>
                  <b className="num">CUST-{String(customer.id).padStart(6, "0")}</b>
                </div>
                <div className="ov-row">
                  <span>Created On</span>
                  <b>{fmtDateTime(raw?.created_at ?? null)}</b>
                </div>
                <div className="ov-row">
                  <span>Created By</span>
                  <b>{raw?.created_by ?? "Admin"}</b>
                </div>
                {raw?.updated_at && raw.updated_at !== raw.created_at && (
                  <div className="ov-row">
                    <span>Last Updated</span>
                    <b>
                      {fmtDateTime(raw.updated_at)}
                      {raw.updated_by ? ` — ${raw.updated_by}` : ""}
                    </b>
                  </div>
                )}
              </div>
            </div>

            <div className="cd-right">
              <div className="whats-next zoho-next" style={{ marginBottom: 14 }}>
                <span>
                  ✨ <b>WHAT'S NEXT?</b> Create an invoice and send it to your customer.
                </span>
                <span className="next-actions">
                  <button className="btn btn-primary" onClick={() => navigate("/invoices/new")}>
                    New Invoice
                  </button>
                </span>
              </div>

              <div className="card" style={{ padding: "18px 22px", marginBottom: 14 }}>
                <h3 className="ov-h" style={{ margin: "0 0 10px" }}>
                  Receivables
                </h3>
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th className="right">Outstanding Receivables</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>USD — United States Dollar</td>
                      <td className="num right" style={receivable > 0 ? { fontWeight: 700 } : undefined}>
                        {money(receivable)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="card" style={{ padding: "18px 22px" }}>
                <h3 className="ov-h" style={{ margin: "0 0 14px" }}>
                  Income <small style={{ color: "var(--mut-2)", fontWeight: 400 }}>(last 6 months)</small>
                </h3>
                <div className="cd-chart">
                  <div className="cd-yaxis">
                    {[4, 3, 2, 1, 0].map((i) => (
                      <span key={i}>{kFmt((yMax / 4) * i)}</span>
                    ))}
                  </div>
                  <div className="cd-plot">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="cd-gridline" style={{ bottom: `${i * 25}%` }} />
                    ))}
                    <div className="cd-cols">
                      {chart.map((m) => (
                        <div className="cd-col" key={m.label}>
                          <div
                            className="cd-colbar"
                            style={{ height: `${Math.max(1.5, (m.total / yMax) * 100)}%` }}
                          >
                            <span className="cd-tip">
                              {m.label} · {money(m.total)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="cd-xaxis">
                  <span className="cd-xpad" />
                  <div className="cd-xlabels">
                    {chart.map((m) => (
                      <span key={m.label}>{m.label}</span>
                    ))}
                  </div>
                </div>
                <p className="tab-note" style={{ padding: "8px 0 0" }}>
                  Total income (last 6 months) —{" "}
                  <b>{money(chart.reduce((s, m) => s + m.total, 0))}</b>
                </p>
              </div>

              {timeline.length > 0 && (
                <div className="card" style={{ padding: "18px 22px", marginTop: 14 }}>
                  <h3 className="ov-h" style={{ margin: "0 0 14px" }}>
                    Activity Timeline
                  </h3>
                  <div className="cd-timeline">
                    {timeline.map((e, i) => (
                      <div className="tl-item" key={i}>
                        <div className="tl-when">
                          <b>{fmtLong(e.ts.slice(0, 10))}</b>
                          {!e.ts.includes("T12:00:00") && (
                            <span>{fmtDateTime(e.ts).split(" ").slice(3).join(" ")}</span>
                          )}
                        </div>
                        <div className="tl-rail">
                          <span className="tl-dot" />
                        </div>
                        <div className="tl-card">
                          <b>{e.title}</b>
                          <span>{e.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "comments" && (
          <div className="card" style={{ padding: "18px 22px" }}>
            <div className="cd-comment-box">
              <textarea
                rows={3}
                placeholder="Write an internal comment about this customer…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button className="btn btn-primary" disabled={busy || !newComment.trim()} onClick={() => void addComment()}>
                Add Comment
              </button>
            </div>
            <h3 className="ov-h">All Comments</h3>
            {comments === null ? (
              <div className="center-fill" style={{ minHeight: 80 }}>
                <div className="spinner" />
              </div>
            ) : comments.length === 0 ? (
              <p className="tab-note">No comments yet.</p>
            ) : (
              <div className="cd-comments">
                {comments.map((c) => (
                  <div className="cd-comment" key={c.id}>
                    <div>
                      <p>{c.body}</p>
                      <small>{fmtLong(String(c.created_at).slice(0, 10))}</small>
                    </div>
                    <button className="icon-btn" title="Delete comment" onClick={() => void removeComment(c.id)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "transactions" && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="panel-head">
                <h2>Invoices</h2>
                <button className="link" onClick={() => navigate("/invoices/new")}>
                  + New
                </button>
              </div>
              <div className="panel-body">
                {custInvoices.length === 0 ? (
                  <div className="empty-note">
                    <b>There are no invoices</b>
                  </div>
                ) : (
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice#</th>
                        <th>Order Number</th>
                        <th>Status</th>
                        <th className="right">Amount</th>
                        <th className="right">Balance Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custInvoices.map((inv) => (
                        <tr key={inv.dbId} className="row-link" onClick={() => navigate(`/invoices/${inv.dbId}`)}>
                          <td className="num">{fmtShort(inv.issued)}</td>
                          <td>
                            <span className="inv-id">{inv.number}</span>
                          </td>
                          <td className="num">{inv.orderNumber ?? "—"}</td>
                          <td>
                            {inv.status === "due" || inv.status === "overdue" ? (
                              <DueText status={inv.status} dueInDays={inv.dueInDays} />
                            ) : (
                              <Stamp status={inv.status} />
                            )}
                          </td>
                          <td className="num right">{money(inv.total)}</td>
                          <td className="num right">{inv.status === "draft" ? "—" : money(inv.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="card">
              <div className="panel-head">
                <h2>Customer Payments</h2>
              </div>
              <div className="panel-body">
                {custPayments.length === 0 ? (
                  <div className="empty-note">
                    <b>No payments have been received or recorded yet.</b>
                  </div>
                ) : (
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice#</th>
                        <th>Payment Mode</th>
                        <th>Reference</th>
                        <th className="right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custPayments.map((p) => (
                        <tr key={p.id} className="row-link" onClick={() => navigate(`/invoices/${p.invoiceId}`)}>
                          <td className="num">{fmtShort(p.paidOn)}</td>
                          <td>
                            <span className="inv-id">{p.invoiceNumber}</span>
                          </td>
                          <td>{p.mode ?? "—"}</td>
                          <td className="num">{p.reference ?? "—"}</td>
                          <td className="num right" style={{ color: "var(--green)", fontWeight: 600 }}>
                            {money(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {tab === "mails" && (
          <div className="card" style={{ padding: "40px 22px" }}>
            <div className="empty-note">
              <b>No emails sent</b>
              Invoice emails will appear here once the email module ships.
            </div>
          </div>
        )}

        {tab === "statement" && (
          <>
            <div className="rv-filters print-hide" style={{ marginBottom: 16 }}>
              <span className="rv-lab">Period :</span>
              <DateRangePicker
                start={stmtFrom}
                end={stmtTo}
                onChange={(a, b) => {
                  setStmtFrom(a);
                  setStmtTo(b);
                }}
              />
              <div className="stmt-actions">
                <Tooltip label="Print" side="bottom">
                  <button type="button" className="icon-btn stmt-ic" aria-label="Print" onClick={() => window.print()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9V2h12v7" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip label={pdfBusy ? "Preparing PDF…" : "Download PDF"} side="bottom">
                  <button type="button" className="icon-btn stmt-ic" aria-label="Download PDF" disabled={pdfBusy} onClick={() => void exportPdf()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                      <path d="M14 2v5h5" />
                      <path d="M9 14h6M9 18h4" />
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip label="Export XLS" side="bottom">
                  <button type="button" className="icon-btn stmt-ic" aria-label="Export XLS" onClick={exportXls}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
                    </svg>
                  </button>
                </Tooltip>
                <button className="btn btn-primary" onClick={() => setEmailOpen(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 6L2 7" />
                  </svg>
                  Send Email
                </button>
              </div>
            </div>

            <div className="stmt-stage">
              <div className="stmt-customize print-hide">
                <Menu
                  align="right"
                  trigger={
                    <button className="btn btn-primary da-btn-primary">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.5-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.4-2.6a7 7 0 0 0 2-1.2l2.5 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2z" />
                      </svg>
                      Customize
                      <svg className="da-caret-light" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  }
                  items={[
                    { heading: "Template" },
                    {
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 3h5v5M8 21H3v-5" />
                          <path d="M21 3l-7 7M3 21l7-7" />
                        </svg>
                      ),
                      label: "Change Template",
                      onClick: () => setCustomizing("templates"),
                    },
                    {
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      ),
                      label: "Edit Template",
                      onClick: () => navigate("/settings/template"),
                    },
                    {
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2.5" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.8-3.8a2 2 0 0 0-2.8 0L6 19.5" />
                        </svg>
                      ),
                      label: "Update Logo & Address",
                      onClick: () => navigate("/settings/template"),
                    },
                  ]}
                />
              </div>
            <div className="paper stmt-paper">
              <div className="stmt-head">
                <div>
                  {template.showLogo && template.logoDataUrl ? (
                    <img className="pp-logo" src={template.logoDataUrl} alt={template.orgName} />
                  ) : (
                    <b className="stmt-org">{template.orgName}</b>
                  )}
                </div>
                <div className="stmt-org-meta">
                  <b>{template.orgName}</b>
                  {template.orgAddress.split("\n").filter(Boolean).map((l, i) => (
                    <span key={i}>{l}</span>
                  ))}
                  {template.orgPhone && <span>{template.orgPhone}</span>}
                  {template.orgEmail && <span>{template.orgEmail}</span>}
                </div>
              </div>
              <div className="stmt-title">
                <div className="stmt-to">
                  <small>To</small>
                  <b>{customer.name}</b>
                  {billingAddr.map((l, i) => (
                    <span key={i}>{l}</span>
                  ))}
                </div>
                <div className="stmt-name">
                  <h2>Statement of Accounts</h2>
                  <span>
                    {fmtShort(stmtFrom)} — {fmtShort(stmtTo)}
                  </span>
                  <table className="stmt-summary">
                    <tbody>
                      <tr>
                        <td>Opening Balance</td>
                        <td>{money(statement.opening)}</td>
                      </tr>
                      <tr>
                        <td>Invoiced Amount</td>
                        <td>{money(statement.invoiced)}</td>
                      </tr>
                      <tr>
                        <td>Amount Received</td>
                        <td>{money(statement.received)}</td>
                      </tr>
                      <tr className="strong">
                        <td>Balance Due</td>
                        <td>{money(statement.closing)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <table className="ledger stmt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transactions</th>
                    <th>Details</th>
                    <th className="right">Amount</th>
                    <th className="right">Payments</th>
                    <th className="right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="num">{fmtShort(stmtFrom)}</td>
                    <td>*** Opening Balance ***</td>
                    <td></td>
                    <td className="num right"></td>
                    <td className="num right"></td>
                    <td className="num right">{money(statement.opening)}</td>
                  </tr>
                  {statement.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{fmtShort(r.date)}</td>
                      <td>{r.label}</td>
                      <td className="mut-cell">{r.details}</td>
                      <td className="num right">{r.amount ? money(r.amount) : ""}</td>
                      <td className="num right">{r.payment ? money(r.payment) : ""}</td>
                      <td className="num right">{money(r.balance)}</td>
                    </tr>
                  ))}
                  <tr className="rv-total">
                    <td colSpan={5} style={{ textAlign: "right" }}>
                      Balance Due
                    </td>
                    <td className="num right">{money(statement.closing)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>
          </>
        )}
      </div>

      {customizing && (
        <CustomizeDrawer
          initialView={customizing}
          onClose={() => {
            setCustomizing(null);
            void reloadTemplate();
          }}
        />
      )}

      {emailOpen && customer && (
        <EmailStatementModal
          customer={customer}
          periodFrom={stmtFrom}
          periodTo={stmtTo}
          statement={statement}
          getAttachment={statementPdfAttachment}
          attachmentName={stmtPdfName()}
          onClose={() => setEmailOpen(false)}
        />
      )}

      {editing && raw && (
        <AddCustomerModal
          initial={raw}
          initialTab={editTab}
          onClose={() => setEditing(false)}
          onAdded={async (c) => {
            setEditing(false);
            await Promise.all([refresh(), loadRaw()]);
            toast(`${c.name} saved`);
          }}
        />
      )}

      {confirmBulk && (
        <ConfirmModal
          title={`Delete ${sel.size} customer${sel.size === 1 ? "" : "s"}?`}
          message={
            <>
              Selected customer{sel.size === 1 ? "" : "s"} will be permanently deleted.
              Customers with invoices are skipped — void or delete their invoices first.
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

      {confirmDelete && (
        <ConfirmModal
          title="Delete this customer?"
          message={
            <>
              <b>“{customer.name}”</b> will be permanently deleted. This only works when the
              customer has no invoices.
            </>
          }
          confirmLabel="Yes, delete"
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteCustomer();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
