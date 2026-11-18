import { useQuery } from "@tanstack/react-query";
import { Squiggle } from "../components/Squiggle";
import { api, type Draft, type Profile } from "../lib/api";

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api.get<Profile>("/profile") });
  const pending = useQuery({ queryKey: ["drafts", "pending"], queryFn: () => api.get<Draft[]>("/drafts?status=pending") });

  const count = pending.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-[15px] text-ink-muted">{profile.data?.name ?? " "}</p>
        <h1 className="text-[32px] font-semibold">{greeting()}.</h1>
        <Squiggle />
        <p className="mt-1 text-ink-muted">
          {pending.isLoading
            ? "Checking your posts…"
            : count === 0
              ? "Nothing needs your OK right now. Nice."
              : `${count} ${count === 1 ? "post needs" : "posts need"} your OK.`}
        </p>
      </header>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-xl font-semibold">What should we post about?</h2>
        <p className="text-[15px] text-ink-muted">The request box arrives in step 6, once your assistant is connected.</p>
      </section>
    </div>
  );
}
