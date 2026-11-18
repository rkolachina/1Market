// Dates are shown in the business's time zone (America/New_York for the pilot).
export const TZ = "America/New_York";

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const longDayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "Tue, Nov 25" */
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));
/** "Tuesday, Nov 25" */
export const formatLongDay = (iso: string) => longDayFmt.format(new Date(iso));
/** "9:00 AM" */
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
/** "Tue, Nov 25 · 9:00 AM" */
export const formatWhen = (iso: string) => `${formatDay(iso)} · ${formatTime(iso)}`;
/** "2026-11-25" in the business time zone, for grouping by day. */
export const dayKey = (iso: string | Date) => keyFmt.format(typeof iso === "string" ? new Date(iso) : iso);

/** Offset (ms) of the business time zone from UTC at a given instant. */
function tzOffset(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

/** "2026-11-25T09:00" (business local) → ISO UTC string. */
export function localInputToIso(value: string): string {
  const [d, t] = value.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, h, min);
  return new Date(guess - tzOffset(new Date(guess))).toISOString();
}

/** ISO UTC → "2026-11-25T09:00" (business local), for <input type="datetime-local">. */
export function isoToLocalInput(iso: string): string {
  const at = new Date(iso);
  const local = new Date(at.getTime() + tzOffset(at));
  return local.toISOString().slice(0, 16);
}

/** First sentence of a caption, as a short title. */
export function captionTitle(caption: string | undefined, max = 56): string {
  if (!caption) return "Untitled post";
  const first = caption.split(/(?<=[.!?])\s/)[0].replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}
