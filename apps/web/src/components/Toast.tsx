import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  leaving?: boolean;
}

interface ToastApi {
  /** Show a toast. Type defaults to "success"; use "error" for failures. */
  toast: (message: string, type?: ToastType) => void;
}

const ToastCtx = createContext<ToastApi>({ toast: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastCtx);
}

const SHOW_MS = 4500;
const LEAVE_MS = 180;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    // Two-phase: mark as leaving (plays the exit animation), then remove.
    setItems((cur) => cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = nextId.current++;
      setItems((cur) => [...cur, { id, type, message }]);
      setTimeout(() => dismiss(id), SHOW_MS);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}${t.leaving ? " leaving" : ""}`}
            role="status"
          >
            <span className="toast-icon">
              {t.type === "success" ? <CheckIcon /> : t.type === "error" ? <AlertIcon /> : <InfoIcon />}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
