import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export function PageShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-6 shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-display text-3xl font-bold tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-brand-slate-soft">{hint}</p> : null}
    </div>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  const styles = {
    primary:
      "bg-primary text-white shadow-soft hover:bg-primary-hover hover:-translate-y-px hover:shadow-lift",
    secondary:
      "bg-white text-ink border border-border hover:border-primary/30 hover:bg-surface",
    accent:
      "bg-accent text-white shadow-soft hover:bg-accent-hover hover:-translate-y-px hover:shadow-lift",
    danger: "bg-danger text-white hover:bg-red-700",
    ghost: "bg-transparent text-brand-slate hover:bg-surface hover:text-ink",
  }[variant];

  const sizing = {
    sm: "px-3 py-1.5 text-[13px]",
    md: "px-4 py-2.5 text-sm",
  }[size];

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none ${sizing} ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input({
  label,
  error,
  hint,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      {label ? <span className="block text-[13px] font-medium text-ink">{label}</span> : null}
      <input
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-brand-slate-soft focus:ring-4 focus:ring-primary/10 ${
          error ? "border-danger focus:border-danger" : "border-border focus:border-primary"
        } ${className}`}
        {...props}
      />
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-brand-slate-soft">{hint}</span>
      ) : null}
    </label>
  );
}

export function Textarea({
  label,
  error,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
}) {
  return (
    <label className="block space-y-1.5">
      {label ? <span className="block text-[13px] font-medium text-ink">{label}</span> : null}
      <textarea
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-brand-slate-soft focus:ring-4 focus:ring-primary/10 ${
          error ? "border-danger focus:border-danger" : "border-border focus:border-primary"
        } ${className}`}
        {...props}
      />
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "yellow" | "red" | "blue";
}) {
  const map = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    yellow: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-red-50 text-red-600 ring-red-200",
    blue: "bg-primary-soft text-primary ring-primary/15",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${map}`}>
      {children}
    </span>
  );
}

export function Alert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  const map = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-primary/15 bg-primary-soft text-primary",
  }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${map}`}>{children}</div>;
}

/** Card-wrapped table. Pass <thead>/<tbody> as children. */
export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className={`w-full text-left text-sm ${className}`}>{children}</table>
      </div>
    </div>
  );
}

export function statusTone(status: string): "slate" | "green" | "yellow" | "red" | "blue" {
  const s = status.toUpperCase();
  if (["APPROVED", "ACTIVE", "SUCCESS", "PAID"].includes(s)) return "green";
  if (["PENDING", "PENDING_PAYMENT", "PROVISIONING", "NOT_STARTED"].includes(s)) return "yellow";
  if (["REJECTED", "FAILED", "PAYMENT_FAILED", "PROVISIONING_FAILED", "EXPIRED", "EXHAUSTED", "CANCELLED"].includes(s)) {
    return "red";
  }
  if (["HUMAN", "AI"].includes(s)) return "blue";
  return "slate";
}
