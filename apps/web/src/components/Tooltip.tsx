/* eslint-disable @typescript-eslint/no-explicit-any */
import { cloneElement, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

/** App-styled tooltip that replaces the browser's native `title` bubble.
 *  Renders into <body> via a portal, so it never gets clipped by cards or
 *  scroll containers. Shows on hover AND keyboard focus. */
export function Tooltip({
  label,
  side = "top",
  children,
}: {
  label: string;
  /** Which side of the target the bubble appears on. */
  side?: "top" | "bottom";
  children: ReactElement;
}) {
  const [box, setBox] = useState<DOMRect | null>(null);

  const childProps: any = (children as any).props ?? {};
  const show = (e: any) => setBox(e.currentTarget.getBoundingClientRect());
  const hide = () => setBox(null);

  const child = cloneElement(children as any, {
    onPointerEnter: (e: any) => {
      childProps.onPointerEnter?.(e);
      show(e);
    },
    onPointerLeave: (e: any) => {
      childProps.onPointerLeave?.(e);
      hide();
    },
    onFocus: (e: any) => {
      childProps.onFocus?.(e);
      show(e);
    },
    onBlur: (e: any) => {
      childProps.onBlur?.(e);
      hide();
    },
    // Hide as soon as it's clicked — the action usually navigates away.
    onClick: (e: any) => {
      hide();
      childProps.onClick?.(e);
    },
  });

  return (
    <>
      {child}
      {label &&
        box &&
        createPortal(
          <div
            className={"app-tip " + side}
            role="tooltip"
            style={{
              left: box.left + box.width / 2,
              top: side === "top" ? box.top : box.bottom,
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
