import { ArrowRight, ArrowsClockwise, Camera, CircleNotch } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ErrorBlock, LoadingBlock, PageHeader } from "../components/PageHeader";
import { RequestForm, RequestProgress } from "../components/RequestBox";
import { useToast } from "../components/Toast";
import { type Idea, type IdeasState, api } from "../lib/api";
import { formatDay } from "../lib/format";

const TYPE_LABEL: Record<string, string> = {
  promo: "Offer",
  tip: "Tip",
  seasonal: "Seasonal",
  showcase: "Show your work",
  announcement: "News",
};

/** "2026-11-27" → noon UTC that day, so it formats as the same calendar day in the business time zone. */
const dayIso = (ymd: string) => `${ymd}T12:00:00.000Z`;

/** Recommendations: timely post ideas the owner can tweak and turn into a draft. */
export function IdeasPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const ideas = useQuery({
    queryKey: ["ideas"],
    queryFn: () => api.get<IdeasState>("/ideas"),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2500 : false),
  });
  const refresh = useMutation({
    mutationFn: () => api.post<IdeasState>("/ideas/refresh"),
    onSuccess: (v) => qc.setQueryData(["ideas"], v),
    onError: (e) => toast(e.message, "error"),
  });

  // First visit, or ideas older than a week: make a fresh set automatically (once).
  const asked = useRef(false);
  const data = ideas.data;
  useEffect(() => {
    if (!data || asked.current) return;
    if (data.status !== "running" && data.status !== "failed" && data.expired) {
      asked.current = true;
      refresh.mutate();
    }
  }, [data, refresh]);

  const [openId, setOpenId] = useState<string | null>(null);

  if (ideas.isLoading) return <LoadingBlock label="Loading ideas…" />;
  if (ideas.isError) return <ErrorBlock message={ideas.error.message} onRetry={() => ideas.refetch()} />;
  const v = data!;
  const running = v.status === "running" || refresh.isPending;
  const items = v.items;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Recommendations" title="Post ideas">
        Ideas that fit this time of year and your business. Pick one, make it yours, and we'll write it.
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="meta">{v.generated_at ? `Ideas from ${formatDay(v.generated_at)}` : " "}</p>
        <button type="button" className="btn-secondary" disabled={running} onClick={() => refresh.mutate()}>
          <ArrowsClockwise size={20} aria-hidden="true" className={running ? "animate-spin motion-reduce:animate-none" : ""} />
          {running ? "Thinking…" : "Get new ideas"}
        </button>
      </div>

      {running && (
        <div role="status" aria-live="polite" className="card flex flex-col gap-1 p-4">
          <p className="flex items-center gap-2 font-bold">
            <CircleNotch size={22} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            Coming up with ideas…
          </p>
          <p className="text-ink-muted">
            Looking at your services, offers, the season and what you've posted lately. This takes about 15 seconds.
          </p>
        </div>
      )}

      {v.status === "failed" && !running && <ErrorBlock message={v.error ?? "We couldn't come up with ideas."} onRetry={() => refresh.mutate()} />}

      {items.length > 0 && (
        <ul className="flex flex-col gap-4" aria-label="Post ideas">
          {items.map((idea) => (
            <li key={idea.id}>
              <IdeaCard idea={idea} open={openId === idea.id} onOpen={() => setOpenId(idea.id)} onClose={() => setOpenId(null)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IdeaCard({ idea, open, onOpen, onClose }: { idea: Idea; open: boolean; onOpen: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const [requestId, setRequestId] = useState<string | null>(null);
  const markUsed = useMutation({
    mutationFn: () => api.post<IdeasState>(`/ideas/${idea.id}/used`),
    onSuccess: (v) => qc.setQueryData(["ideas"], v),
  });

  return (
    <article className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps rounded-full bg-muted-soft px-2.5 py-1 text-ink">{TYPE_LABEL[idea.post_type] ?? idea.post_type}</span>
        <span className="meta">Suggested {formatDay(dayIso(idea.suggested_date))}</span>
        {idea.used && <span className="label-caps rounded-full bg-olive-soft px-2.5 py-1 text-olive">Used</span>}
      </div>
      <h2 className="text-[24px] leading-tight">{idea.title}</h2>
      <p className="text-ink-muted">{idea.why_now}</p>
      {idea.wants_photo && (
        <p className="flex items-center gap-2 text-[15px]">
          <Camera size={18} aria-hidden="true" /> Best with a photo of your own work.
        </p>
      )}

      {requestId ? (
        <RequestProgress
          id={requestId}
          onDone={() => {
            setRequestId(null);
            onClose();
          }}
        />
      ) : open ? (
        <RequestForm
          heading="Make it yours"
          initial={{ text: idea.request, date: `${idea.suggested_date}T09:00` }}
          onCancel={onClose}
          onSent={(id) => {
            setRequestId(id);
            markUsed.mutate();
          }}
        />
      ) : (
        <div>
          <button type="button" className="btn-primary" onClick={onOpen}>
            {idea.used ? "Use again" : "Use this idea"}
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  );
}
