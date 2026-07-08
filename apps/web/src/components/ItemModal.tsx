import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { mapItem, type Item } from "../lib/store";
import { useToast } from "./Toast";

const UNITS = ["pcs", "box", "kg", "g", "lb", "dozen", "hour", "case", "pack"];

/** Zoho-parity New Item modal — Name, Goods/Service, Unit, Selling Price,
 *  Description. Saves to the items catalog via the API. */
export function NewItemModal({
  initialName = "",
  onClose,
  onCreated,
}: {
  initialName?: string;
  onClose: () => void;
  onCreated: (item: Item) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<"Goods" | "Service">("Goods");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const { item } = await api.post<{ item: any }>("/items", {
        name: name.trim(),
        type,
        unit: unit.trim() || null,
        sellingPrice: Number(price),
        description: description.trim() || null,
      });
      toast(`Item "${item.name}" added to the catalog`);
      await onCreated(mapItem(item));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add item", "error");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal modal-lg" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>New Item</h3>

        <div className="z-row">
          <label className="req">Name *</label>
          <div className="z-field">
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div className="z-row">
          <label>Type</label>
          <div className="z-field">
            <div className="radio-row">
              <label className="check">
                <input
                  type="radio"
                  name="itype"
                  checked={type === "Goods"}
                  onChange={() => setType("Goods")}
                />
                Goods
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="itype"
                  checked={type === "Service"}
                  onChange={() => setType("Service")}
                />
                Service
              </label>
            </div>
          </div>
        </div>

        <div className="z-row">
          <label>Unit</label>
          <div className="z-field">
            <input
              list="item-units"
              placeholder="Select or type to add"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
            <datalist id="item-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="f-lab" style={{ margin: "14px 0 10px" }}>
          Sales information
        </div>

        <div className="z-row">
          <label className="req">Selling price *</label>
          <div className="z-field">
            <div className="z-inline">
              <span className="cur-tag">USD</span>
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

        <div className="z-row">
          <label>Description</label>
          <div className="z-field">
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
