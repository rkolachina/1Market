import { Squiggle } from "../components/Squiggle";

/** Temporary page body for tabs built in later steps. */
export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[32px] font-semibold">{title}</h1>
      <Squiggle width={110} />
      <p className="mt-2 text-ink-muted">{note}</p>
    </div>
  );
}
