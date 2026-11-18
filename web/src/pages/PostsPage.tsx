import { ArrowSquareOut } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { ErrorBlock, LoadingBlock, PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { captionTitle, formatWhen } from "../lib/format";
import { useAllDrafts, usePosts } from "../lib/queries";
import { type DisplayStatus, displayStatus, draftDate } from "../lib/status";

type Filter = "needs-ok" | "scheduled" | "posted" | "skipped";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "needs-ok", label: "Needs your OK" },
  { key: "scheduled", label: "Scheduled" },
  { key: "posted", label: "Posted" },
  { key: "skipped", label: "Skipped" },
];

interface Row {
  key: string;
  title: string;
  status: DisplayStatus;
  at: string;
  image?: string;
  href?: string;
  external?: string;
}

const EMPTY: Record<Filter, string> = {
  "needs-ok": "Nothing needs your OK right now. Nice.",
  scheduled: "Nothing scheduled yet. Approve a post with a future date and it shows up here.",
  posted: "Nothing posted yet.",
  skipped: "No skipped posts.",
};

export function PostsPage() {
  const ids = useId();
  const [filter, setFilter] = useState<Filter>("needs-ok");
  const drafts = useAllDrafts();
  const posts = usePosts();

  const draftRows: Row[] = (drafts.data ?? [])
    .filter((d) => d.status !== "posted")
    .map((d) => ({
      key: d.draft_id,
      title: captionTitle(d.copy.facebook?.caption),
      status: displayStatus(d),
      at: draftDate(d),
      image: d.image_urls[0],
      href: `/drafts/${d.draft_id}`,
    }));
  const draftIds = new Set((drafts.data ?? []).map((d) => d.draft_id));
  const images = new Map((drafts.data ?? []).map((d) => [d.draft_id, d.image_urls[0]]));
  const postRows: Row[] = (posts.data ?? []).map((p) => ({
    key: p.post_key,
    title: captionTitle(p.caption),
    status: "posted",
    at: p.posted_at,
    image: images.get(p.draft_id),
    href: draftIds.has(p.draft_id) ? `/drafts/${p.draft_id}` : undefined,
    external: p.url,
  }));

  const match: Record<Filter, (r: Row) => boolean> = {
    "needs-ok": (r) => r.status === "needs-ok" || r.status === "missed",
    scheduled: (r) => r.status === "scheduled" || r.status === "posting",
    posted: (r) => r.status === "posted",
    skipped: (r) => r.status === "skipped" || r.status === "failed",
  };
  const rows = [...draftRows, ...postRows]
    .filter(match[filter])
    .sort((a, b) => (filter === "posted" || filter === "skipped" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, [...draftRows, ...postRows].filter(match[f.key]).length]));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Posts" />

      <div role="tablist" aria-label="Filter posts" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            aria-controls={`${ids}-list`}
            onClick={() => setFilter(f.key)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] border px-4 text-[15px] font-bold ${
              filter === f.key ? "border-ink bg-ink text-white" : "border-rule bg-card text-ink"
            }`}
          >
            {f.label}
            <span className={`tabular-nums ${filter === f.key ? "text-white/80" : "text-ink-muted"}`}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {(drafts.isLoading || posts.isLoading) && <LoadingBlock label="Loading your posts…" />}
      {(drafts.isError || posts.isError) && <ErrorBlock message="We couldn't load your posts." onRetry={() => (drafts.refetch(), posts.refetch())} />}

      <ul id={`${ids}-list`} role="tabpanel" className="flex flex-col gap-2.5">
        {!drafts.isLoading && !posts.isLoading && rows.length === 0 && <li className="card p-5 text-ink-muted">{EMPTY[filter]}</li>}
        {rows.map((r) => (
          <li key={r.key} className="card flex items-center gap-3 p-2.5">
            {r.image ? (
              <img src={r.image} alt="" className="size-16 shrink-0 rounded-[10px] object-cover" loading="lazy" />
            ) : (
              <span aria-hidden="true" className="size-16 shrink-0 rounded-[10px] bg-muted-soft" />
            )}
            <div className="flex min-w-0 grow flex-col gap-1">
              {r.href ? (
                <Link to={r.href} className="truncate font-bold no-underline hover:underline">
                  {r.title}
                </Link>
              ) : (
                <span className="truncate font-bold">{r.title}</span>
              )}
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                <StatusBadge status={r.status} />
                <span className="meta">{formatWhen(r.at)}</span>
              </div>
            </div>
            {r.external && (
              <a href={r.external} target="_blank" rel="noreferrer" aria-label="View on Facebook" className="flex size-11 shrink-0 items-center justify-center text-ink-muted">
                <ArrowSquareOut size={20} aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
