import { ArrowCounterClockwise, ArrowLeft, ArrowSquareOut, CalendarBlank, FacebookLogo, GoogleLogo, InstagramLogo } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ErrorBlock, LoadingBlock } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import type { Draft, Platform } from "../lib/api";
import { formatWhen, isoToLocalInput, localInputToIso } from "../lib/format";
import { useDraft, useDraftAction } from "../lib/queries";
import { displayStatus } from "../lib/status";

const PLATFORMS: { key: Platform; label: string; icon: Icon }[] = [
  { key: "facebook", label: "Facebook", icon: FacebookLogo },
  { key: "instagram", label: "Instagram", icon: InstagramLogo },
  { key: "gbp", label: "Google", icon: GoogleLogo },
];

const LIVE: Platform[] = ["facebook"]; // platforms we can post to today

export function DraftPage() {
  const { id = "" } = useParams();
  const draft = useDraft(id);

  return (
    <div className="flex flex-col gap-5 pb-28">
      <Link to="/" className="btn-text -ml-2 self-start no-underline">
        <ArrowLeft size={20} aria-hidden="true" /> Back
      </Link>
      {draft.isLoading && <LoadingBlock label="Loading this post…" />}
      {draft.isError && <ErrorBlock message={draft.error.message} onRetry={() => draft.refetch()} />}
      {draft.data && <DraftEditor draft={draft.data} />}
    </div>
  );
}

function DraftEditor({ draft }: { draft: Draft }) {
  const ids = useId();
  const toast = useToast();
  const navigate = useNavigate();
  const action = useDraftAction();
  const status = displayStatus(draft);
  const editable = draft.status === "pending";
  const movable = draft.status === "pending" || draft.status === "scheduled";

  const available = PLATFORMS.filter((p) => draft.copy[p.key]);
  const [tab, setTab] = useState<Platform>(available[0]?.key ?? "facebook");
  const copy = draft.copy[tab];

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(copy?.caption ?? "");
  useEffect(() => {
    setText(draft.copy[tab]?.caption ?? "");
    setEditing(false);
  }, [tab, draft]);

  const [dateInput, setDateInput] = useState(draft.target_date ? isoToLocalInput(draft.target_date) : "");
  useEffect(() => setDateInput(draft.target_date ? isoToLocalInput(draft.target_date) : ""), [draft.target_date]);
  const dateChanged = dateInput !== (draft.target_date ? isoToLocalInput(draft.target_date) : "");

  const run = (a: Parameters<typeof action.mutate>[0]["action"], done: string, then?: () => void) =>
    action.mutate({ id: draft.draft_id, action: a }, { onSuccess: () => (toast(done), then?.()), onError: (e) => toast(e.message, "error") });

  const when = draft.scheduled_at ?? draft.target_date;
  const future = when && new Date(when).getTime() > Date.now();
  const busy = action.isPending;

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          {draft.post_type && <span className="label-caps">{draft.post_type}</span>}
        </div>
        <h1 className="text-[36px]">
          {status === "posted" ? "Posted" : status === "scheduled" ? "Scheduled post" : status === "skipped" ? "Skipped post" : "Review your post"}
        </h1>
        {when && <p className="meta">{status === "missed" ? `Was planned for ${formatWhen(when)}` : formatWhen(when)}</p>}
      </header>

      {status === "missed" && (
        <div role="note" className="rounded-[16px] border border-brick/40 bg-[#F6DDD8] p-4 text-[15px]">
          <strong className="text-brick">This date has passed, so we didn't post it.</strong> Post it now, pick a new date below, or skip it.
        </div>
      )}
      {draft.status === "failed" && draft.last_error && (
        <div role="alert" className="rounded-[16px] border border-brick/40 bg-[#F6DDD8] p-4 text-[15px]">
          <strong className="text-brick">We couldn't post this.</strong> {draft.last_error}
        </div>
      )}

      {draft.image_urls[0] && (
        <img src={draft.image_urls[0]} alt="Post image" className="w-full rounded-[16px] border border-rule object-cover" />
      )}

      <section className="card flex flex-col gap-3 p-4">
        <div role="tablist" aria-label="Platform" className="flex gap-1 rounded-[14px] bg-muted-soft p-1">
          {available.map(({ key, label, icon: PIcon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${ids}-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`${ids}-panel`}
              onClick={() => setTab(key)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[15px] font-bold ${
                tab === key ? "bg-card text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              <PIcon size={18} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${tab}`} className="flex flex-col gap-3">
          {!LIVE.includes(tab) && (
            <p className="text-[13px] text-ink-muted">Preview only. Posting to {PLATFORMS.find((p) => p.key === tab)?.label} is coming soon.</p>
          )}
          {editing ? (
            <>
              <label htmlFor={`${ids}-caption`} className="sr-only">
                Caption
              </label>
              <textarea
                id={`${ids}-caption`}
                value={text}
                rows={7}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-[10px] border border-rule bg-paper p-3"
              />
              <p className="text-[13px] text-ink-muted">{text.length} characters</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || !text.trim() || text === copy?.caption}
                  onClick={() => run({ kind: "caption", platform: tab, caption: text }, "Caption saved.", () => setEditing(false))}
                >
                  Save caption
                </button>
                <button type="button" className="btn-text" onClick={() => (setText(copy?.caption ?? ""), setEditing(false))}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="whitespace-pre-line">{copy?.caption}</p>
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                    Edit caption
                  </button>
                  {copy?.variants?.[0] && (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => {
                        setText(copy.variants![0]);
                        setEditing(true);
                      }}
                    >
                      Try the other version
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {movable && (
        <section className="card flex flex-col gap-2 p-4">
          <label htmlFor={`${ids}-date`} className="flex items-center gap-2 font-bold">
            <CalendarBlank size={20} aria-hidden="true" /> Post on
          </label>
          <input
            id={`${ids}-date`}
            type="datetime-local"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="min-h-12 rounded-[10px] border border-rule bg-paper px-3"
          />
          <p className="text-[13px] text-ink-muted">Eastern Time</p>
          {dateChanged && dateInput && (
            <button
              type="button"
              className="btn-secondary self-start"
              disabled={busy}
              onClick={() => run({ kind: "date", target_date: localInputToIso(dateInput) }, "Date updated.")}
            >
              Save new date
            </button>
          )}
        </section>
      )}

      {status === "posted" && draft.publish_results && (
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-[26px]">Live posts</h2>
          {Object.entries(draft.publish_results).map(([platform, r]) =>
            r?.url ? (
              <a key={platform} href={r.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2">
                View on {platform === "facebook" ? "Facebook" : platform} <ArrowSquareOut size={18} aria-hidden="true" />
              </a>
            ) : null,
          )}
        </section>
      )}

      {/* Sticky action bar */}
      {(editable || draft.status === "scheduled" || draft.status === "failed" || draft.status === "skipped") && (
        <div className="fixed inset-x-0 bottom-[76px] z-10 border-t border-rule bg-card/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-56">
          <div className="mx-auto flex max-w-[640px] flex-wrap items-center gap-2">
            {status === "needs-ok" && (
              <button
                type="button"
                className="btn-primary grow"
                disabled={busy || editing || dateChanged}
                onClick={() => run({ kind: "approve" }, future ? `Scheduled for ${formatWhen(when!)}.` : "Posted to Facebook.", () => navigate("/"))}
              >
                {busy ? "Working…" : future ? `Approve for ${formatWhen(when!)}` : "Approve & post now"}
              </button>
            )}
            {status === "missed" && (
              <button type="button" className="btn-primary grow" disabled={busy || editing} onClick={() => run({ kind: "post-now" }, "Posted to Facebook.", () => navigate("/"))}>
                {busy ? "Posting…" : "Post now"}
              </button>
            )}
            {draft.status === "failed" && (
              <button type="button" className="btn-primary grow" disabled={busy} onClick={() => run({ kind: "post-now" }, "Posted to Facebook.")}>
                {busy ? "Trying again…" : "Try again"}
              </button>
            )}
            {draft.status === "skipped" && (
              <>
                <p className="grow text-[15px]">You skipped this post.</p>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => run({ kind: "restore" }, "Moved back to Needs your OK.")}
                >
                  <ArrowCounterClockwise size={20} aria-hidden="true" />
                  {busy ? "Bringing it back…" : "Bring it back"}
                </button>
              </>
            )}
            {draft.status === "scheduled" && (
              <>
                <p className="grow text-[15px]">Goes out {formatWhen(when!)}</p>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => run({ kind: "unschedule" }, "Moved back to Needs your OK.")}>
                  Unschedule
                </button>
              </>
            )}
            {(editable || draft.status === "scheduled") && (
              <button type="button" className="btn-text" disabled={busy} onClick={() => run({ kind: "skip" }, "Post skipped.", () => navigate("/"))}>
                Skip
              </button>
            )}
          </div>
          {dateChanged && <p className="mx-auto mt-1 max-w-[640px] text-[13px] text-ink-muted">Save the new date first.</p>}
        </div>
      )}
    </>
  );
}
