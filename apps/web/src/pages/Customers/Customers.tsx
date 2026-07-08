import { useState } from "react";
import { useBilling, moneyK, money, type Customer } from "../../lib/store";
import { Cust } from "../../components/bits";
import { AddCustomerModal } from "../../components/CustomerModal";
import { useToast } from "../../components/Toast";

export function Customers() {
  const { customers, invoices, loading, refresh } = useBilling();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  const openOf = (c: Customer) =>
    invoices
      .filter((i) => i.customerId === c.id && i.status !== "draft" && i.status !== "void")
      .reduce((s, i) => s + i.balance, 0);

  const hasOverdue = (c: Customer) =>
    invoices.some((i) => i.customerId === c.id && i.status === "overdue");

  const sorted = [...customers].sort((a, b) => openOf(b) - openOf(a));

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p>{customers.length} accounts · sorted by open balance.</p>
        </div>
        <div className="right">
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Add customer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="center-fill" style={{ minHeight: "30vh" }}>
          <div className="spinner" />
        </div>
      ) : customers.length === 0 ? (
        <div className="card empty-note" style={{ padding: 40 }}>
          <b>No customers yet</b>
          Add your first customer to start invoicing.
        </div>
      ) : (
        <div className="cust-grid">
          {sorted.map((c) => {
            const open = openOf(c);
            return (
              <div className="card cust-card" key={c.id}>
                <Cust
                  customer={c}
                  sub={[c.type, c.terms, c.city].filter(Boolean).join(" · ")}
                />
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
                    <div className="v">{c.avgPayDays !== null ? `${c.avgPayDays}d` : "—"}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <AddCustomerModal
          onClose={() => setAdding(false)}
          onAdded={async (c) => {
            setAdding(false);
            await refresh();
            toast(`${c.name} added to customers`);
          }}
        />
      )}
    </section>
  );
}
