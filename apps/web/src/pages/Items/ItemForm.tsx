import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBilling } from "../../lib/store";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";

const UNITS = ["pcs", "box", "kg", "g", "lb", "oz", "ml", "l", "dozen", "pack", "set", "hrs", "days"];

/** Zoho-style New Item / Edit Item full-page form. */
export function ItemForm() {
  const { id } = useParams(); // present → edit mode
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, refresh } = useBilling();
  const editing = id ? items.find((i) => String(i.id) === id) : undefined;

  const [name, setName] = useState("");
  const [type, setType] = useState<"Goods" | "Service">("Goods");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setType(editing.type === "Service" ? "Service" : "Goods");
    setUnit(editing.unit ?? "");
    setPrice(String(editing.sellingPrice));
    setDescription(editing.description ?? "");
  }, [editing]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        type,
        unit: unit.trim() || null,
        sellingPrice: Number(price),
        description: description.trim() || null,
      };
      if (id) {
        await api.put(`/items/${id}`, body);
        await refresh();
        toast(`Item "${body.name}" saved`);
        navigate(`/items/${id}`);
      } else {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const res = await api.post<{ item: any }>("/items", body);
        await refresh();
        toast(`Item "${body.name}" created`);
        navigate(`/items/${res.item.id}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save item", "error");
      setSaving(false);
    }
  }

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>{id ? "Edit Item" : "New Item"}</h1>
        </div>
        <div className="right">
          <button className="icon-btn" title="Close" onClick={() => navigate("/items")}>
            ✕
          </button>
        </div>
      </div>

      <form className="card item-form" onSubmit={submit}>
        <div className="item-form-grid">
          <div className="item-form-main">
            <div className="form-lrow">
              <span className="f-lab req">Name*</span>
              <input
                required
                autoFocus
                maxLength={300}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-lrow">
              <span className="f-lab">Type</span>
              <div className="radio-row">
                <label className="check">
                  <input
                    type="radio"
                    name="itemtype"
                    checked={type === "Goods"}
                    onChange={() => setType("Goods")}
                  />
                  Goods
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="itemtype"
                    checked={type === "Service"}
                    onChange={() => setType("Service")}
                  />
                  Service
                </label>
              </div>
            </div>
            <div className="form-lrow">
              <span className="f-lab">Unit</span>
              <div>
                <input
                  list="unit-options"
                  placeholder="Select or type to add"
                  maxLength={40}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
                <datalist id="unit-options">
                  {UNITS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
          <div
            className="item-img-drop"
            title="Item images are coming later — they'll show on the item page and picker"
          >
            <span className="img-ic">🖼</span>
            <span>
              Drag image(s) here or <b>Browse images</b>
            </span>
            <small>(coming later)</small>
          </div>
        </div>

        <h3 className="ov-h">Sales Information</h3>
        <div className="item-form-grid">
          <div className="item-form-main">
            <div className="form-lrow">
              <span className="f-lab req">Selling Price*</span>
              <div className="money-in">
                <span className="cur">USD</span>
                <input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="form-lrow desc-row">
            <span className="f-lab">Description</span>
            <textarea
              rows={3}
              maxLength={2000}
              placeholder={"Syrup 750 ml\nSKU: SY-5505"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/items")}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
