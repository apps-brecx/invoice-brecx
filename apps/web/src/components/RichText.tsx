import { useEffect, useRef, type ReactNode } from "react";

/** Zoho-style rich-text editor for email bodies — bold/italic/underline/
 *  strike, font size, alignment, lists, links. contentEditable +
 *  execCommand keeps it dependency-free; output is the resulting HTML. */
export function RichText({
  initialHtml,
  onChange,
  minHeight = 240,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Seed once — after that the DOM owns the content (re-setting innerHTML
  // on each render would reset the caret).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(ref.current?.innerHTML ?? "");
  const exec = (cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    emit();
  };

  const Btn = ({
    cmd,
    val,
    title,
    children,
    onClick,
  }: {
    cmd?: string;
    val?: string;
    title: string;
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      className="rt-btn"
      title={title}
      // preventDefault keeps the text selection alive while clicking
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (onClick ? onClick() : cmd && exec(cmd, val))}
    >
      {children}
    </button>
  );

  return (
    <div className="rt">
      <div className="rt-toolbar">
        <Btn cmd="bold" title="Bold">
          <b>B</b>
        </Btn>
        <Btn cmd="italic" title="Italic">
          <i>I</i>
        </Btn>
        <Btn cmd="underline" title="Underline">
          <u>U</u>
        </Btn>
        <Btn cmd="strikeThrough" title="Strikethrough">
          <s>S</s>
        </Btn>
        <span className="rt-sep" />
        <select
          className="rt-size"
          title="Font size"
          defaultValue="3"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => exec("fontSize", e.target.value)}
        >
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="4">Large</option>
          <option value="5">Huge</option>
        </select>
        <span className="rt-sep" />
        <Btn cmd="justifyLeft" title="Align left">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 6h18M3 12h12M3 18h15" /></svg>
        </Btn>
        <Btn cmd="justifyCenter" title="Align center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 6h18M6 12h12M4.5 18h15" /></svg>
        </Btn>
        <Btn cmd="justifyRight" title="Align right">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 6h18M9 12h12M6 18h15" /></svg>
        </Btn>
        <span className="rt-sep" />
        <Btn cmd="insertUnorderedList" title="Bulleted list">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" /></svg>
        </Btn>
        <Btn cmd="insertOrderedList" title="Numbered list">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M10 6h11M10 12h11M10 18h11" /><path d="M3 5.5h2M4 4v3.5M3 10.6c0-.8 2-.9 2 0 0 .7-2 1.4-2 2.4h2M3.2 15.5H5l-1 1.4c.7 0 1.2.4 1.2 1s-.6 1.6-2 .8" /></svg>
        </Btn>
        <span className="rt-sep" />
        <Btn
          title="Insert link"
          onClick={() => {
            const url = window.prompt("Link URL (https://…)");
            if (url) exec("createLink", url);
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
        </Btn>
        <Btn cmd="removeFormat" title="Clear formatting">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5h13M9 5l-3 14M12 15l6 6M18 15l-6 6" /></svg>
        </Btn>
      </div>
      <div
        ref={ref}
        className="rt-area"
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}
