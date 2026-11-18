import type { ReactNode } from "react";

/** Page header: mono eyebrow, condensed title, short intro. No lines underneath. */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5">
      {eyebrow && <p className="label-caps">{eyebrow}</p>}
      <h1 className="text-[40px]">{title}</h1>
      {children && <div className="text-ink-muted">{children}</div>}
    </header>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="card flex min-h-32 items-center justify-center p-6 text-ink-muted">
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-start gap-3 p-5">
      <p className="text-brick">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
