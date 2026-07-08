import { useState, type FormEvent } from "react";
import { createPaymentTerm } from "../lib/terms";
import { useToast } from "./Toast";

/** Zoho's New Payment Term dialog: Term Name + Due After N days. */
export function NewTermModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string, days: number) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPaymentTerm(name.trim(), Number(days));
      toast(`Payment term "${name.trim()}" added`);
      await onCreated(name.trim(), Number(days));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add payment term", "error");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>New Payment Term</h3>
        <div className="z-row">
          <label className="req">Term name *</label>
          <div className="z-field">
            <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="z-row">
          <label className="req">Due after *</label>
          <div className="z-field">
            <div className="z-inline">
              <input
                required
                type="number"
                min={0}
                max={1000}
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
              <span className="cur-tag">Days</span>
            </div>
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
