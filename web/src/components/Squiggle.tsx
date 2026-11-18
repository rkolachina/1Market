/** The one hand-drawn touch: a squiggle underline under page greetings. Decorative. */
export function Squiggle({ width = 150 }: { width?: number }) {
  return (
    <svg width={width} height="12" viewBox="0 0 150 12" aria-hidden="true" className="text-ink-muted">
      <path
        d="M2 8 C 20 2, 38 11, 60 6 S 100 2, 120 7 S 140 10, 148 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
