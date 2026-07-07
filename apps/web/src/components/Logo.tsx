import { useId } from "react";

interface LogoProps {
  size?: number;
}

/**
 * Invoice Brecx brand mark — a white invoice document inside a deep-blue
 * rounded square, with an emerald "paid" dot. Same monochrome-blue palette
 * as the rest of the Brecx apps so they read as one family.
 *
 * `useId` gives us a per-instance gradient id so two Logos on the same page
 * don't fight over `<defs>` references.
 */
export function Logo({ size = 32 }: LogoProps) {
  const rawId = useId().replace(/:/g, "");
  const gradId = `inv-grad-${rawId}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Invoice Brecx"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradId})`} />
      {/* Invoice sheet with a folded corner */}
      <path d="M11 5h7l4 4v18H11z" fill="#ffffff" />
      <path d="M18 5v4h4" fill="none" stroke="#c7dbfb" strokeWidth="1.6" strokeLinejoin="round" />
      {/* Line items */}
      <g stroke="#1e3a8a" strokeWidth="1.7" strokeLinecap="round">
        <line x1="13.5" y1="14" x2="19.5" y2="14" />
        <line x1="13.5" y1="18" x2="19.5" y2="18" />
        <line x1="13.5" y1="22" x2="17" y2="22" />
      </g>
      {/* Emerald "paid" dot — the outcome the app drives towards. */}
      <circle cx="21.5" cy="23" r="2.4" fill="#10b981" />
    </svg>
  );
}
