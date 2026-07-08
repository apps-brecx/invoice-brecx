import { useEffect, type ReactNode } from "react";

/** App-styled confirmation dialog — used before destructive actions. */
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onConfirm]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()} role="alertdialog">
        <div className={"confirm-ic" + (danger ? " danger" : "")}>{danger ? "🗑" : "?"}</div>
        <h3>{title}</h3>
        <p className="confirm-msg">{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={"btn " + (danger ? "btn-solid-danger" : "btn-primary")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
