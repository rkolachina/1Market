import { STATUS_META, type DisplayStatus } from "../lib/status";

/** Rounded status tag: mono uppercase label with a round marker. */
export function StatusBadge({ status }: { status: DisplayStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[12px] font-semibold uppercase tracking-[0.05em] ${meta.chip}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function StatusDot({ status }: { status: DisplayStatus }) {
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${STATUS_META[status].dot}`} />;
}
