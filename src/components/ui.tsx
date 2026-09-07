"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";

/**
 * A ruled section. `index` prints a plate number in the margin, the way a
 * spec sheet numbers its sections.
 */
export function Panel({
  index,
  eyebrow,
  title,
  note,
  aside,
  children,
  className = "",
}: {
  index?: string;
  eyebrow?: string;
  title?: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title || eyebrow ? (
        <header className="mb-5 flex items-start justify-between gap-5">
          <div className="flex gap-3">
            {index ? (
              <span className="data mt-[3px] text-[11px] font-medium text-ink-faint">{index}</span>
            ) : null}
            <div>
              {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
              {title ? <h2 className="display text-[26px]">{title}</h2> : null}
              {note ? <p className="annot mt-1.5 max-w-prose">{note}</p> : null}
            </div>
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "quiet" | "warn";
};

export function Button({ variant = "solid", className = "", ...props }: ButtonProps) {
  const variantClass = { solid: "", quiet: "btn-quiet", warn: "btn-warn" }[variant];
  return <button {...props} className={`btn ${variantClass} ${className}`} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] text-ink-faint">{hint}</span> : null}
    </label>
  );
}

/** Label, dotted leader, value — the spec-sheet row. */
export function Datum({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="datum">
      <dt>{label}</dt>
      <span className="leader" aria-hidden />
      <dd>{children}</dd>
    </div>
  );
}

export function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="border-t border-rule pt-3">
      <p className="eyebrow">{label}</p>
      <p className="data mt-2 text-[28px] leading-none">{value}</p>
      {note ? <p className="mt-2 text-[11px] text-ink-faint">{note}</p> : null}
    </div>
  );
}

export function Copyable({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="data group inline-flex items-center gap-2 text-[12px] text-ink"
    >
      <span className="underline decoration-rule decoration-1 underline-offset-4 group-hover:decoration-ink">
        {label ?? value}
      </span>
      {copied ? (
        <Check className="h-3 w-3 text-verify" />
      ) : (
        <Copy className="h-3 w-3 text-ink-faint" />
      )}
    </button>
  );
}

export function ExternalRef({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="eyebrow inline-flex items-center gap-1 hover:text-ink">
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}

const TONES = {
  plain: "text-ink-soft",
  verify: "text-verify",
  flag: "text-flag",
  signal: "text-signal",
} as const;

export type Tone = keyof typeof TONES;

export function Tag({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag ${TONES[tone]}`}>{children}</span>;
}

export function Stamp({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`stamp ${TONES[tone]}`}>{children}</span>;
}

/** A margin note, set as a hanging italic paragraph beside a rule. */
export function Note({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  const border = {
    plain: "border-rule",
    verify: "border-verify",
    flag: "border-flag",
    signal: "border-signal",
  }[tone];
  return (
    <div className={`border-l-2 pl-3.5 ${border}`}>
      <p className={`annot ${tone === "plain" ? "" : TONES[tone]}`}>{children}</p>
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin border-[1.5px] border-current border-t-transparent" />
  );
}

export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-rule ${className}`} />;
}
