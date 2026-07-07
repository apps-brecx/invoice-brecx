import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "@inv/shared";
import { api, ApiError } from "../../lib/api";
import { formatMoney, formatDate } from "../../lib/format";
import { statusBadgeClass } from "../../lib/invoices";
import { useToast } from "../../components/Toast";

interface InvoiceFull {
  id: number;
  number: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  currency: string;
  tax_rate: string;
  subtotal: string;
  tax_total: string;
  total: string;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  client_id: number;
  client_name: string;
  client_company: string | null;
  client_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  tax_id: string | null;
}

interface ItemRow {
  id: number;
  description: string;
  quantity: string;
  unit_price: string;
  amount: string;
}

export function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => api.get<{ invoice: InvoiceFull; items: ItemRow[] }>(`/invoices/${id}`),
  });

  const setStatus = useMutation({
    mutationFn: (status: InvoiceStatus) => api.patch(`/invoices/${id}/status`, { status }),
    onSuccess: (_res, status) => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast(`Invoice marked ${INVOICE_STATUS_LABELS[status].toLowerCase()}.`);
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "Could not update the invoice.", "error"),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/invoices/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast("Draft deleted.");
      navigate("/invoices");
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "Could not delete the invoice.", "error"),
  });

  if (isLoading) {
    return (
      <div className="center-fill">
        <div className="spinner" />
      </div>
    );
  }
  if (!data) return <div className="empty">Invoice not found.</div>;

  const inv = data.invoice;
  const address = [
    inv.address_line1,
    inv.address_line2,
    [inv.postal_code, inv.city].filter(Boolean).join(" "),
    inv.country,
  ].filter(Boolean);

  return (
    <>
      <div className="crumbs">
        <Link to="/invoices">Invoices</Link>
        <span className="crumb-sep">/</span>
        <span className="crumb-here">{inv.number ?? `#${inv.id}`}</span>
      </div>

      <div className="topbar">
        <div>
          <h1>
            {inv.number ?? `#${inv.id}`}{" "}
            <span className={statusBadgeClass(inv.status)}>
              {INVOICE_STATUS_LABELS[inv.status]}
            </span>
          </h1>
          <div className="sub">
            Issued {formatDate(inv.issue_date)} · due {formatDate(inv.due_date)}
            {inv.paid_at ? ` · paid ${formatDate(inv.paid_at)}` : ""}
          </div>
        </div>
        <div className="actions">
          {inv.status === "draft" && (
            <>
              <button className="btn danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Delete draft
              </button>
              <button className="btn primary" onClick={() => setStatus.mutate("sent")} disabled={setStatus.isPending}>
                Mark sent
              </button>
            </>
          )}
          {(inv.status === "sent" || inv.status === "overdue") && (
            <>
              <button className="btn" onClick={() => setStatus.mutate("void")} disabled={setStatus.isPending}>
                Void
              </button>
              <button className="btn primary" onClick={() => setStatus.mutate("paid")} disabled={setStatus.isPending}>
                Mark paid
              </button>
            </>
          )}
          {inv.status === "paid" && (
            <button className="btn" onClick={() => setStatus.mutate("sent")} disabled={setStatus.isPending}>
              Reopen as sent
            </button>
          )}
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="card">
          <div className="label">Subtotal</div>
          <div className="value">{formatMoney(inv.subtotal, inv.currency)}</div>
        </div>
        <div className="card">
          <div className="label">Tax ({Number(inv.tax_rate)}%)</div>
          <div className="value">{formatMoney(inv.tax_total, inv.currency)}</div>
        </div>
        <div className="card">
          <div className="label">Total</div>
          <div className="value">{formatMoney(inv.total, inv.currency)}</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="head">
          <h2>Billed to</h2>
        </div>
        <div className="body">
          <div className="name">{inv.client_name}</div>
          {inv.client_company && <div>{inv.client_company}</div>}
          {inv.client_email && <div className="muted">{inv.client_email}</div>}
          {address.map((line) => (
            <div key={line} className="muted">{line}</div>
          ))}
          {inv.tax_id && <div className="muted">Tax ID: {inv.tax_id}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="head">
          <h2>Line items</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.description}</td>
                  <td>{Number(it.quantity)}</td>
                  <td>{formatMoney(it.unit_price, inv.currency)}</td>
                  <td>{formatMoney(it.amount, inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {inv.notes && (
          <div className="foot">
            <span className="muted">{inv.notes}</span>
          </div>
        )}
      </div>
    </>
  );
}
