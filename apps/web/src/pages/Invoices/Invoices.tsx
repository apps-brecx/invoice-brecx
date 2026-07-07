import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CURRENCIES,
  INVOICE_FILTERS,
  INVOICE_STATUS_LABELS,
  type InvoiceFilter,
} from "@inv/shared";
import { api, qs, ApiError } from "../../lib/api";
import { formatMoney, formatDate, todayISO, daysFromNowISO } from "../../lib/format";
import { statusBadgeClass, type InvoiceRow, type InvoiceStatRow } from "../../lib/invoices";
import { useToast } from "../../components/Toast";

interface ClientRow {
  id: number;
  name: string;
  company: string | null;
}

interface ItemDraft {
  description: string;
  quantity: string;
  unitPrice: string;
}

const emptyItem = (): ItemDraft => ({ description: "", quantity: "1", unitPrice: "" });

export function Invoices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", filter, q],
    queryFn: () =>
      api.get<{ invoices: InvoiceRow[]; stats: InvoiceStatRow[] }>(
        `/invoices${qs({ filter, q })}`,
      ),
  });

  const counts: Record<string, number> = { all: 0 };
  for (const s of data?.stats ?? []) {
    counts[s.status] = s.n;
    counts.all += s.n;
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Invoices</h1>
          <div className="sub">Create, send and track invoices.</div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setShowNew(true)}>
            + New invoice
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="filters">
          {INVOICE_FILTERS.map((f) => (
            <button
              key={f}
              className={"chip" + (filter === f ? " on" : "")}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : INVOICE_STATUS_LABELS[f]}
              <span className="count">{counts[f] ?? 0}</span>
            </button>
          ))}
          <input
            className="input"
            style={{ maxWidth: 220, marginLeft: "auto" }}
            placeholder="Search number or client…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : (data?.invoices.length ?? 0) === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div className="empty-state-title">No invoices here</div>
            <div className="empty-state-desc">
              Create your first invoice with the button above. You'll need at
              least one client — add one on the Clients page.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data!.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="order-id">
                      <Link to={`/invoices/${inv.id}`}>{inv.number ?? `#${inv.id}`}</Link>
                    </td>
                    <td>
                      <span className="name">{inv.client_name}</span>
                      {inv.client_company && <div className="muted">{inv.client_company}</div>}
                    </td>
                    <td>
                      <span className={statusBadgeClass(inv.status)}>
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    <td>{formatDate(inv.issue_date)}</td>
                    <td>{formatDate(inv.due_date)}</td>
                    <td>{formatMoney(inv.total, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && (
        <NewInvoiceModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void queryClient.invalidateQueries({ queryKey: ["invoices"] });
            toast("Invoice created.");
          }}
        />
      )}
    </>
  );
}

function NewInvoiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get<{ clients: ClientRow[] }>("/clients"),
  });

  const [clientId, setClientId] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(daysFromNowISO(14));
  const [currency, setCurrency] = useState<string>("EUR");
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);

  const create = useMutation({
    mutationFn: () =>
      api.post("/invoices", {
        clientId: Number(clientId),
        issueDate,
        dueDate,
        currency,
        taxRate: Number(taxRate) || 0,
        notes: notes || null,
        items: items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
        })),
      }),
    onSuccess: onCreated,
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "Could not create the invoice.", "error"),
  });

  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const total = subtotal * (1 + (Number(taxRate) || 0) / 100);

  function setItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <div className="modal-title">New invoice</div>
        <form className="modal-body" onSubmit={onSubmit}>
          <div className="group">
            <label>
              Client<span className="req">*</span>
            </label>
            <select
              className="select"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Select a client…</option>
              {(clients.data?.clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company ? ` — ${c.company}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
            <div>
              <label>Issue date</label>
              <input className="input" type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <label>Due date</label>
              <input className="input" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label>Currency</label>
              <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Tax %</label>
              <input className="input" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label>Line items</label>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 90px 120px 32px", gap: 8, marginTop: 6 }}>
                <input
                  className="input"
                  placeholder="Description"
                  required
                  value={it.description}
                  onChange={(e) => setItem(idx, { description: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Qty"
                  required
                  value={it.quantity}
                  onChange={(e) => setItem(idx, { quantity: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit price"
                  required
                  value={it.unitPrice}
                  onChange={(e) => setItem(idx, { unitPrice: e.target.value })}
                />
                <button
                  type="button"
                  className="btn"
                  aria-label="Remove line"
                  disabled={items.length === 1}
                  onClick={() => setItems((cur) => cur.filter((_, i) => i !== idx))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setItems((cur) => [...cur, emptyItem()])}>
              + Add line
            </button>
          </div>

          <div className="group" style={{ marginTop: 12 }}>
            <label>Notes</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Payment terms, references… (shown on the invoice)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <div style={{ marginRight: "auto", fontWeight: 600 }}>
              Total: {formatMoney(total, currency)}
            </div>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={create.isPending || !clientId}>
              {create.isPending ? "Creating…" : "Create draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
