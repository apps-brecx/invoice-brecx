import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, qs, ApiError } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { useToast } from "../../components/Toast";

interface ClientRow {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  tax_id: string | null;
  notes: string | null;
  invoices_count: number;
  invoiced_total: string;
}

const emptyForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  country: "",
  taxId: "",
  notes: "",
};
type ClientForm = typeof emptyForm;

function toForm(c: ClientRow): ClientForm {
  return {
    name: c.name,
    company: c.company ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    addressLine1: c.address_line1 ?? "",
    addressLine2: c.address_line2 ?? "",
    city: c.city ?? "",
    postalCode: c.postal_code ?? "",
    country: c.country ?? "",
    taxId: c.tax_id ?? "",
    notes: c.notes ?? "",
  };
}

export function Clients() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ClientRow | "new" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", q],
    queryFn: () => api.get<{ clients: ClientRow[] }>(`/clients${qs({ q })}`),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/clients/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast("Client deleted.");
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "Could not delete the client.", "error"),
  });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Clients</h1>
          <div className="sub">The businesses and people you invoice.</div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setEditing("new")}>
            + New client
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="filters">
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Search name, company or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {isLoading ? (
          <div className="empty">Loading…</div>
        ) : (data?.clients.length ?? 0) === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-title">No clients yet</div>
            <div className="empty-state-desc">
              Add your first client — invoices are always billed to a client.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th>Invoices</th>
                  <th>Invoiced</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data!.clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="name">{c.name}</span>
                      {c.company && <div className="muted">{c.company}</div>}
                    </td>
                    <td>
                      {c.email && <div>{c.email}</div>}
                      {c.phone && <div className="muted">{c.phone}</div>}
                    </td>
                    <td>{[c.city, c.country].filter(Boolean).join(", ") || "—"}</td>
                    <td>{c.invoices_count}</td>
                    <td>{formatMoney(c.invoiced_total)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn" onClick={() => setEditing(c)}>
                        Edit
                      </button>{" "}
                      <button
                        className="btn danger"
                        disabled={c.invoices_count > 0 || remove.isPending}
                        title={c.invoices_count > 0 ? "Client has invoices" : undefined}
                        onClick={() => remove.mutate(c.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ClientModal
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ["clients"] });
            toast("Client saved.");
          }}
        />
      )}
    </>
  );
}

function ClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: ClientRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ClientForm>(client ? toForm(client) : emptyForm);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        company: form.company || null,
        email: form.email || null,
        phone: form.phone || null,
        addressLine1: form.addressLine1 || null,
        addressLine2: form.addressLine2 || null,
        city: form.city || null,
        postalCode: form.postalCode || null,
        country: form.country || null,
        taxId: form.taxId || null,
        notes: form.notes || null,
      };
      return client ? api.put(`/clients/${client.id}`, body) : api.post("/clients", body);
    },
    onSuccess: onSaved,
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "Could not save the client.", "error"),
  });

  function set(patch: Partial<ClientForm>) {
    setForm((cur) => ({ ...cur, ...patch }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <div className="modal-title">{client ? "Edit client" : "New client"}</div>
        <form className="modal-body" onSubmit={onSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>
                Name<span className="req">*</span>
              </label>
              <input className="input" required value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
            </div>
            <div>
              <label>Company</label>
              <input className="input" value={form.company} onChange={(e) => set({ company: e.target.value })} />
            </div>
            <div>
              <label>Email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div>
              <label>Phone</label>
              <input className="input" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Address line 1</label>
              <input className="input" value={form.addressLine1} onChange={(e) => set({ addressLine1: e.target.value })} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Address line 2</label>
              <input className="input" value={form.addressLine2} onChange={(e) => set({ addressLine2: e.target.value })} />
            </div>
            <div>
              <label>Postal code</label>
              <input className="input" value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} />
            </div>
            <div>
              <label>City</label>
              <input className="input" value={form.city} onChange={(e) => set({ city: e.target.value })} />
            </div>
            <div>
              <label>Country</label>
              <input className="input" value={form.country} onChange={(e) => set({ country: e.target.value })} />
            </div>
            <div>
              <label>Tax ID</label>
              <input className="input" value={form.taxId} onChange={(e) => set({ taxId: e.target.value })} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Notes</label>
              <textarea className="input" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
