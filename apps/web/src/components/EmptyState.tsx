import type { ReactNode } from "react";

/** Friendly empty state: soft icon badge + title + note + optional action. */
export function EmptyState({
  icon,
  title,
  note,
  action,
}: {
  icon?: ReactNode;
  title: string;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="es-icon">{icon ?? <BoxIcon />}</div>
      <b>{title}</b>
      {note && <span>{note}</span>}
      {action}
    </div>
  );
}

/* Ready-made icons for the common cases. */

export function BoxIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  );
}

export function SearchOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
      <path d="M8.5 8.5l5 5M13.5 8.5l-5 5" />
    </svg>
  );
}
