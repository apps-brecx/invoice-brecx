import { useState, type FormEvent } from "react";
import {
  useBilling,
  invoiceBalance,
  moneyK,
  money,
  type Customer,
} from "../../lib/store";
import { Cust } from "../../components/bits";
import { useToast } from "../../components/Toast";

export function Customers() {
  const { customers, invoices, addCustomer } = useBilling();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  const openOf = (c: Customer) =>
    invoices
      .filter((i) => i.customerId === c.id && i.status !== "draft")
      .reduce((s, i) => s + invoiceBalance(i), 0);

  const hasOverdue = (c: Customer) =>
    invoices.some((i) => i.customerId === c.id && i.status === "overdue");

  const sorted = [...customers].sort((a, b) => openOf(b) - openOf(a));

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p>
            {customers.length} accounts · sorted by open balance.
          </p>
        </div>
        <div className="right">
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add customer
          </button>
        </div>
      </div>

      <div className="cust-grid">
        {sorted.map((c) => {
          const open = openOf(c);
          return (
            <div className="card cust-card" key={c.id}>
              <Cust customer={c} sub={`${c.type} · ${c.terms} · ${c.city}`} />
              <div className="cust-stats">
                <div>
                  <div className="lab">Open</div>
                  <div className="v" style={hasOverdue(c) ? { color: "var(--red)" } : undefined}>
                    {open >= 1000 ? "$" + Math.round(open).toLocaleString("en-US") : money(open)}
                  </div>
                </div>
                <div>
                  <div className="lab">Lifetime</div>
                  <div className="v">{moneyK(c.lifetime)}</div>
                </div>
                <div>
                  <div className="lab">Avg pay</div>
                  <div className="v">{c.avgPayDays ? `${c.avgPayDays}d` : "—"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {adding && (
        <AddCustomerModal
          onClose={() => setAdding(false)}
          onAdd={(c) => {
            addCustomer(c);
            setAdding(false);
            toast(`${c.name} added to customers`);
          }}
        />
      )}
    </section>
  );
}

function AddCustomerModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (c: { name: string; type: "Wholesale" | "Retail"; terms: string; city: string }) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"Wholesale" | "Retail">("Wholesale");
  const [terms, setTerms] = useState("Net 30");
  const [city, setCity] = useState("");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onAdd({ name: name.trim(), type, terms, city: city.trim() });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>Add customer</h3>
        <div className="field">
          <input
            placeholder="Business name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <small>Customer name</small>
        </div>
        <div className="f-row">
          <div className="field">
            <select value={type} onChange={(e) => setType(e.target.value as "Wholesale" | "Retail")}>
              <option>Wholesale</option>
              <option>Retail</option>
            </select>
            <small>Account type</small>
          </div>
          <div className="field">
            <select value={terms} onChange={(e) => setTerms(e.target.value)}>
              <option>Net 15</option>
              <option>Net 30</option>
              <option>Net 45</option>
              <option>Due on receipt</option>
            </select>
            <small>Payment terms</small>
          </div>
        </div>
        <div className="field">
          <input placeholder="e.g. Portland, OR" value={city} onChange={(e) => setCity(e.target.value)} />
          <small>Location</small>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add customer
          </button>
        </div>
      </form>
    </div>
  );
}
