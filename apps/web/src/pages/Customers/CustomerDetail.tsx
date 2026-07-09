import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBilling, money, fmtShort, fmtLong, initialsOf } from "../../lib/store";
import { api } from "../../lib/api";
import { useTemplate } from "../../lib/template";
import { Menu } from "../../components/Menu";
import { ConfirmModal } from "../../components/ConfirmModal";
import { AddCustomerModal } from "../../components/CustomerModal";
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

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { customers, invoices, payments, refresh } = useBilling();
  const { template } = useTemplate();

  const [tab, setTab] = useState<Tab>("overview");
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [raw, setRaw] = useState<any | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [newComment, setNewComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const billingAddr = raw
    ? [raw.address_line1, raw.address_line2, [raw.city, raw.billing_state, raw.postal_code].filter(Boolean).join(", "), raw.country].filter(Boolean)
    : [];
  const shippingAddr = raw
    ? [raw.shipping_street1, raw.shipping_street2, [raw.shipping_city, raw.shipping_state, raw.shipping_zip].filter(Boolean).join(", "), raw.shipping_country].filter(Boolean)
    : [];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const contactPersons: any[] = Array.isArray(raw?.contact_persons) ? raw.contact_persons : [];

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
        <div className="mini-list-body">
          {customers.map((row) => {
            const open = invoices
              .filter((i) => i.customerId === row.id && i.status !== "draft" && i.status !== "void")
              .reduce((s, i) => s + i.balance, 0);
            return (
              <button
                key={row.id}
                className={"mini-inv" + (String(row.id) === id ? " on" : "")}
                onClick={() => navigate(`/customers/${row.id}`)}
              >
                <div className="mini-inv-top">
                  <b>{row.name}</b>
                  <span className="num">{money(open)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* right: the customer */}
      <div className="inv-detail">
        <div className="detail-head print-hide">
          <div>
            <h1>{customer.name}</h1>
            <p>
              {customer.type} · {customer.terms}
            </p>
          </div>
          <div className="right" style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button className="btn btn-ghost" disabled={busy || !raw} onClick={() => setEditing(true)}>
              ✎ Edit
            </button>
            <Menu
              align="right"
              trigger={
                <button className="btn btn-primary">
                  New Transaction <i className="caret">▾</i>
                </button>
              }
              items={[
                { icon: "🧾", label: "New Invoice", onClick: () => navigate("/invoices/new") },
                { icon: "◫", label: "New Quote", disabled: true, title: "Quotes module coming later" },
              ]}
            />
            <Menu
              align="right"
              trigger={
                <button className="btn btn-ghost" disabled={busy}>
                  More <i className="caret">▾</i>
                </button>
              }
              items={[
                {
                  icon: "🗑",
                  label: "Delete",
                  danger: true,
                  title: "Customers with invoices can't be deleted",
                  onClick: () => setConfirmDelete(true),
                },
              ]}
            />
            <button className="icon-btn" title="Back to customers" onClick={() => navigate("/customers")}>
              ✕
            </button>
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
                    {billingAddr.length ? billingAddr.join("\n") : "No billing address"}
                  </b>
                </div>
                <div className="ov-row">
                  <span>Shipping Address</span>
                  <b style={{ whiteSpace: "pre-line" }}>
                    {shippingAddr.length ? shippingAddr.join("\n") : "No shipping address"}
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

              <h3 className="ov-h">Contact Persons</h3>
              {contactPersons.length === 0 ? (
                <p className="tab-note" style={{ padding: "2px 0 8px" }}>
                  No contact persons found — add them from ✎ Edit.
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
                <h3 className="ov-h" style={{ margin: "0 0 4px" }}>
                  Income <small style={{ color: "var(--mut-2)", fontWeight: 400 }}>(last 6 months)</small>
                </h3>
                <div className="cd-bars">
                  {chart.map((m) => (
                    <div className="cd-bar" key={m.label} title={`${m.label}: ${money(m.total)}`}>
                      <div
                        className="cd-bar-fill"
                        style={{ height: `${Math.round((m.total / chartMax) * 100)}%` }}
                      />
                      <span>{m.label}</span>
                    </div>
                  ))}
                </div>
                <p className="tab-note" style={{ padding: "6px 0 0" }}>
                  Total income (last 6 months) —{" "}
                  <b>{money(chart.reduce((s, m) => s + m.total, 0))}</b>
                </p>
              </div>

              {raw?.created_at && (
                <p className="tab-note" style={{ padding: "10px 4px 0" }}>
                  Record created on <b>{fmtLong(String(raw.created_at).slice(0, 10))}</b>
                </p>
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
              <div className="field" style={{ margin: 0 }}>
                <input type="date" value={stmtFrom} onChange={(e) => setStmtFrom(e.target.value)} />
                <small>From</small>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <input type="date" value={stmtTo} onChange={(e) => setStmtTo(e.target.value)} />
                <small>To</small>
              </div>
              <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => window.print()}>
                ⎙ Print / PDF
              </button>
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
          </>
        )}
      </div>

      {editing && raw && (
        <AddCustomerModal
          initial={raw}
          onClose={() => setEditing(false)}
          onAdded={async (c) => {
            setEditing(false);
            await Promise.all([refresh(), loadRaw()]);
            toast(`${c.name} saved`);
          }}
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
