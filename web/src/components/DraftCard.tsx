import { FacebookLogo, GoogleLogo, InstagramLogo } from "@phosphor-icons/react";
import { Link } from "react-router";
import type { Draft } from "../lib/api";
import { formatWhen } from "../lib/format";
import { useDraftAction } from "../lib/queries";
import { displayStatus } from "../lib/status";
import { StatusBadge } from "./StatusBadge";
import { useToast } from "./Toast";

export function PlatformIcons({ draft }: { draft: Draft }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-muted">
      {draft.copy.facebook && <FacebookLogo size={18} aria-label="Facebook" />}
      {draft.copy.instagram && <InstagramLogo size={18} aria-label="Instagram" />}
      {draft.copy.gbp && <GoogleLogo size={18} aria-label="Google Business Profile" />}
    </span>
  );
}

/** Home feed card for a draft that needs the owner's OK. */
export function DraftCard({ draft }: { draft: Draft }) {
  const action = useDraftAction();
  const toast = useToast();
  const status = displayStatus(draft);
  const when = draft.target_date;
  const future = when && new Date(when).getTime() > Date.now();
  const busy = action.isPending;

  const run = (kind: "approve" | "skip", done: string) =>
    action.mutate(
      { id: draft.draft_id, action: { kind } },
      { onSuccess: () => toast(done), onError: (e) => toast(e.message, "error") },
    );

  return (
    <article className="card overflow-hidden">
      <Link to={`/drafts/${draft.draft_id}`} className="block no-underline" aria-label="Open this post">
        {draft.image_urls[0] && (
          <img src={draft.image_urls[0]} alt="" className="aspect-square w-full object-cover sm:aspect-[4/3]" loading="lazy" />
        )}
      </Link>
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={status} />
          <PlatformIcons draft={draft} />
        </div>
        <p className="line-clamp-3">{draft.copy.facebook?.caption}</p>
        {when && <p className="meta">{status === "missed" ? `Was planned for ${formatWhen(when)}` : formatWhen(when)}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {status === "missed" ? (
            <Link to={`/drafts/${draft.draft_id}`} className="btn-primary grow no-underline">
              Post now or pick a new date
            </Link>
          ) : (
            <button
              type="button"
              className="btn-primary grow"
              disabled={busy}
              onClick={() => run("approve", future ? `Scheduled for ${formatWhen(when!)}.` : "Posted to Facebook.")}
            >
              {busy ? "Working…" : "Approve"}
            </button>
          )}
          <Link to={`/drafts/${draft.draft_id}`} className="btn-secondary no-underline">
            Edit
          </Link>
          <button type="button" className="btn-text" disabled={busy} onClick={() => run("skip", "Post skipped.")}>
            Skip
          </button>
        </div>
      </div>
    </article>
  );
}
