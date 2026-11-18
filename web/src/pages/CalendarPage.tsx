import { ArrowSquareOut, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ErrorBlock, LoadingBlock } from "../components/PageHeader";
import { StatusBadge, StatusDot } from "../components/StatusBadge";
import { captionTitle, dayKey, formatLongDay, formatTime } from "../lib/format";
import { useAllDrafts, usePosts } from "../lib/queries";
import { type DisplayStatus, STATUS_META, displayStatus, draftDate } from "../lib/status";

interface CalItem {
  key: string;
  at: string;
  title: string;
  status: DisplayStatus;
  image?: string;
  href: string;
  external?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEGEND: DisplayStatus[] = ["needs-ok", "scheduled", "posted", "missed"];

export function CalendarPage() {
  const drafts = useAllDrafts();
  const posts = usePosts();
  const todayKey = dayKey(new Date());
  const [year0, month0] = todayKey.split("-").map(Number);
  const [view, setView] = useState({ y: year0, m: month0 - 1 }); // m is 0-based
  const [selected, setSelected] = useState(todayKey);

  // Everything on the calendar, grouped by day (business time zone).
  const byDay = useMemo(() => {
    const items: CalItem[] = [];
    for (const d of drafts.data ?? []) {
      if (d.status === "posted") continue; // shown via the posts list
      items.push({
        key: d.draft_id,
        at: draftDate(d),
        title: captionTitle(d.copy.facebook?.caption),
        status: displayStatus(d),
        image: d.image_urls[0],
        href: `/drafts/${d.draft_id}`,
      });
    }
    const draftIds = new Set((drafts.data ?? []).map((d) => d.draft_id));
    const imageByDraft = new Map((drafts.data ?? []).map((d) => [d.draft_id, d.image_urls[0]]));
    for (const p of posts.data ?? []) {
      const ours = draftIds.has(p.draft_id);
      items.push({
        key: p.post_key,
        at: p.posted_at,
        title: captionTitle(p.caption),
        status: "posted",
        image: imageByDraft.get(p.draft_id),
        href: ours ? `/drafts/${p.draft_id}` : (p.url ?? "#"),
        external: !ours && Boolean(p.url),
      });
    }
    const map = new Map<string, CalItem[]>();
    for (const it of items.sort((a, b) => a.at.localeCompare(b.at))) {
      const k = dayKey(it.at);
      map.set(k, [...(map.get(k) ?? []), it]);
    }
    return map;
  }, [drafts.data, posts.data]);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(view.y, view.m, 1));
    const start = new Date(first);
    start.setUTCDate(1 - first.getUTCDay());
    const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const total = Math.ceil((first.getUTCDay() + daysInMonth) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      return { key, day: d.getUTCDate(), inMonth: d.getUTCMonth() === view.m, items: byDay.get(key) ?? [] };
    });
  }, [view, byDay]);

  const monthLabel = new Date(Date.UTC(view.y, view.m, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const move = (delta: number) => setView(({ y, m }) => ({ y: y + Math.floor((m + delta) / 12), m: (((m + delta) % 12) + 12) % 12 }));
  const dayItems = byDay.get(selected) ?? [];
  const loading = drafts.isLoading || posts.isLoading;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-[40px]">{monthLabel.split(" ")[0]}</h1>
        <div className="flex items-center gap-1">
          <span className="meta mr-2">{view.y}</span>
          <button type="button" aria-label="Previous month" className="flex size-11 items-center justify-center rounded-[10px] border border-rule bg-card" onClick={() => move(-1)}>
            <CaretLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next month" className="flex size-11 items-center justify-center rounded-[10px] border border-rule bg-card" onClick={() => move(1)}>
            <CaretRight size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {(drafts.isError || posts.isError) && <ErrorBlock message="We couldn't load your calendar." onRetry={() => (drafts.refetch(), posts.refetch())} />}

      <div>
        <div className="grid grid-cols-7 pb-1.5 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted" aria-hidden="true">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div role="grid" aria-label={monthLabel} className="grid grid-cols-7 gap-px overflow-hidden rounded-[16px] border border-rule bg-rule">
          {cells.map((c) => {
            const isToday = c.key === todayKey;
            const isSel = c.key === selected;
            const statuses = c.items.map((i) => i.status);
            return (
              <button
                key={c.key}
                type="button"
                role="gridcell"
                aria-selected={isSel}
                aria-label={`${formatLongDay(`${c.key}T17:00:00Z`)}${c.items.length ? `, ${c.items.length} post${c.items.length > 1 ? "s" : ""}: ${statuses.map((s) => STATUS_META[s].label).join(", ")}` : ""}`}
                onClick={() => setSelected(c.key)}
                className={`flex min-h-16 flex-col items-start gap-1.5 p-1.5 sm:min-h-24 ${isSel ? "bg-muted-soft" : c.inMonth ? "bg-card hover:bg-paper" : "bg-paper hover:bg-card"}`}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-full font-mono text-[14px] font-medium tabular-nums ${
                    isSel ? "bg-ink font-bold text-white" : isToday ? "border-2 border-ink-muted font-bold" : ""
                  } ${!c.inMonth && !isSel ? "text-ink-muted/60" : ""}`}
                >
                  {c.day}
                </span>
                <span className="flex h-2 items-center gap-0.5">
                  {statuses.slice(0, 3).map((s, i) => (
                    <StatusDot key={i} status={s} />
                  ))}
                  {statuses.length > 3 && <span className="text-[11px] font-bold leading-none text-ink-muted">+{statuses.length - 3}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[13px] text-ink-muted">
          {LEGEND.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <StatusDot status={s} /> {STATUS_META[s].label}
            </span>
          ))}
        </div>
      </div>

      <section aria-live="polite" className="card flex flex-col gap-3 p-4">
        <h2 className="text-[26px]">{formatLongDay(`${selected}T17:00:00Z`)}</h2>
        {loading && <LoadingBlock />}
        {!loading && dayItems.length === 0 && (
          <p className="text-ink-muted">
            Nothing planned this day. <Link to="/">Ask for a post</Link>
          </p>
        )}
        {dayItems.map((it) => {
          const inner = (
            <>
              {it.image ? (
                <img src={it.image} alt="" className="size-14 shrink-0 rounded-[10px] object-cover" loading="lazy" />
              ) : (
                <span aria-hidden="true" className="size-14 shrink-0 rounded-[10px] bg-muted-soft" />
              )}
              <span className="flex min-w-0 grow flex-col gap-1">
                <span className="truncate font-bold">{it.title}</span>
                <span className="meta flex flex-wrap items-center gap-2">
                  <StatusBadge status={it.status} /> {formatTime(it.at)}
                </span>
              </span>
              {it.external && <ArrowSquareOut size={18} aria-label="Opens Facebook" className="shrink-0 text-ink-muted" />}
            </>
          );
          const cls = "flex items-center gap-3 rounded-[16px] border border-rule p-2.5 text-ink no-underline hover:bg-paper";
          return it.external ? (
            <a key={it.key} href={it.href} target="_blank" rel="noreferrer" className={cls}>
              {inner}
            </a>
          ) : (
            <Link key={it.key} to={it.href} className={cls}>
              {inner}
            </Link>
          );
        })}
      </section>
    </div>
  );
}
