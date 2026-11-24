import { Link } from "react-router";
import { DraftCard } from "../components/DraftCard";
import { ErrorBlock, LoadingBlock, PageHeader } from "../components/PageHeader";
import { RequestBox } from "../components/RequestBox";
import { formatWhen } from "../lib/format";
import { useAllDrafts, useProfile } from "../lib/queries";
import { displayStatus, draftDate } from "../lib/status";

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const profile = useProfile();
  const drafts = useAllDrafts();

  const all = drafts.data ?? [];
  const needsOk = all
    .filter((d) => ["needs-ok", "missed"].includes(displayStatus(d)))
    // missed first, then soonest date
    .sort((a, b) => {
      const am = displayStatus(a) === "missed" ? 0 : 1;
      const bm = displayStatus(b) === "missed" ? 0 : 1;
      return am - bm || draftDate(a).localeCompare(draftDate(b));
    });
  const next = all
    .filter((d) => displayStatus(d) === "scheduled")
    .sort((a, b) => draftDate(a).localeCompare(draftDate(b)))[0];

  const count = needsOk.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={profile.data?.name} title={`${greeting()}.`}>
        {drafts.isLoading
          ? "Checking your posts…"
          : count === 0
            ? "Nothing needs your OK right now. Nice."
            : `${count} ${count === 1 ? "post needs" : "posts need"} your OK.`}
      </PageHeader>

      {/* First thing on the page, so asking for a post never needs scrolling. */}
      <RequestBox />

      {next && (
        <p className="meta">
          Next up: <Link to={`/drafts/${next.draft_id}`}>{formatWhen(draftDate(next))}</Link>
        </p>
      )}

      {drafts.isLoading && <LoadingBlock label="Loading your posts…" />}
      {drafts.isError && <ErrorBlock message={drafts.error.message} onRetry={() => drafts.refetch()} />}

      {needsOk.length > 0 && (
        <section aria-label="Posts that need your OK" className="flex flex-col gap-4">
          {needsOk.map((d) => (
            <DraftCard key={d.draft_id} draft={d} />
          ))}
        </section>
      )}
    </div>
  );
}
