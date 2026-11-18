import { CalendarBlank, House, Storefront, Rows } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { NavLink, Outlet } from "react-router";

const TABS: { to: string; label: string; icon: Icon; end?: boolean }[] = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/calendar", label: "Calendar", icon: CalendarBlank },
  { to: "/posts", label: "Posts", icon: Rows },
  { to: "/business", label: "Business", icon: Storefront },
];

/** Phone: content + bottom tab bar. Desktop (≥1024px): left rail + centered 640px column. */
export function AppLayout() {
  return (
    <div className="min-h-dvh lg:flex">
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-rule bg-card pb-[max(env(safe-area-inset-bottom),12px)] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-56 lg:flex-col lg:border-r lg:border-t-0 lg:pb-0"
      >
        <div className="hidden px-4 py-6 lg:block">
          <span className="font-display text-[30px] font-bold leading-none">1Market</span>
          <span className="label-caps mt-1 block">Post desk</span>
        </div>
        {TABS.map(({ to, label, icon: TabIcon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `relative flex min-h-14 flex-col items-center justify-center gap-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] no-underline lg:flex-row lg:justify-start lg:gap-3 lg:mx-3 lg:mb-1 lg:rounded-[12px] lg:px-3 lg:text-[13px] ${
                isActive
                  ? "bg-muted-soft text-ink before:absolute before:inset-x-6 before:top-0 before:h-[3px] before:rounded-b-full before:bg-ink lg:before:hidden"
                  : "text-ink-muted hover:bg-paper hover:text-ink"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <TabIcon size={24} weight={isActive ? "fill" : "regular"} aria-hidden="true" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-[640px] px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
