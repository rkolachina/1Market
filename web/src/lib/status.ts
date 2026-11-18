import type { Draft } from "./api";

/** What the owner sees. "missed" = still pending after its date passed. */
export type DisplayStatus = "needs-ok" | "missed" | "scheduled" | "posting" | "posted" | "skipped" | "failed";

export function displayStatus(d: Draft, now = Date.now()): DisplayStatus {
  switch (d.status) {
    case "pending":
    case "approved":
      return d.target_date && new Date(d.target_date).getTime() < now ? "missed" : "needs-ok";
    case "scheduled":
      return "scheduled";
    case "publishing":
      return "posting";
    case "posted":
      return "posted";
    case "failed":
      return "failed";
    default:
      return "skipped";
  }
}

export const STATUS_META: Record<DisplayStatus, { label: string; dot: string; chip: string }> = {
  "needs-ok": { label: "Needs your OK", dot: "bg-mustard", chip: "bg-mustard-soft text-ink" },
  missed: { label: "Missed", dot: "bg-brick", chip: "bg-[#F6DDD8] text-brick" },
  scheduled: { label: "Scheduled", dot: "bg-olive", chip: "bg-olive-soft text-olive" },
  posting: { label: "Posting…", dot: "bg-ink-muted", chip: "bg-muted-soft text-ink" },
  posted: { label: "Posted", dot: "bg-ink", chip: "bg-muted-soft text-ink" },
  skipped: { label: "Skipped", dot: "bg-sand", chip: "bg-muted-soft text-ink-muted" },
  failed: { label: "Didn't post", dot: "bg-brick", chip: "bg-[#F6DDD8] text-brick" },
};

/** The date a draft belongs to on the calendar. */
export const draftDate = (d: Draft) => d.scheduled_at ?? d.target_date ?? d.created_at;
