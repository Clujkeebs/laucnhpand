"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

export function Card({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-6 ${className}`}>
      {title ? (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {description ? <p className="mt-1 text-xs text-ink-400">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-mint-500 text-ink-950 hover:bg-mint-400",
    ghost: "border border-ink-600 text-ink-200 hover:border-ink-400 hover:text-white",
    danger: "border border-danger-500/40 text-danger-500 hover:bg-danger-500/10",
  }[variant];

  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    />
  );
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
      <span className="mb-1.5 block text-xs font-medium text-ink-300">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium text-ink-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-ink-400">{sub}</p> : null}
    </div>
  );
}

export function Copyable({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-300 transition hover:text-mint-400"
      title="Copy"
    >
      {label ?? value}
      {copied ? <Check className="h-3.5 w-3.5 text-mint-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function ExternalRef({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-mint-400 transition hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "danger" | "good";
  children: ReactNode;
}) {
  const styles = {
    info: "border-ink-600 bg-ink-850 text-ink-300",
    warn: "border-warn-500/30 bg-warn-500/5 text-warn-500",
    danger: "border-danger-500/30 bg-danger-500/5 text-danger-500",
    good: "border-mint-500/30 bg-mint-900/40 text-mint-400",
  }[tone];
  return (
    <div className={`rounded-lg border px-4 py-3 text-xs leading-relaxed ${styles}`}>{children}</div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "danger";
  children: ReactNode;
}) {
  const styles = {
    neutral: "bg-ink-800 text-ink-300",
    good: "bg-mint-900 text-mint-400",
    warn: "bg-warn-500/10 text-warn-500",
    danger: "bg-danger-500/10 text-danger-500",
  }[tone];
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${styles}`}>{children}</span>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-600 border-t-mint-400" />
  );
}
