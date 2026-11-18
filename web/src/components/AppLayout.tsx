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
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-sand bg-card pb-[max(env(safe-area-inset-bottom),12px)] pt-1.5 lg:static lg:flex lg:w-56 lg:flex-col lg:gap-1 lg:border-r lg:border-t-0 lg:px-3 lg:pt-6"
      >
        <div className="hidden px-3 pb-6 lg:block">
          <span className="font-display text-2xl font-semibold">1Market</span>
        </div>
        {TABS.map(({ to, label, icon: TabIcon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] font-bold no-underline lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-base ${
                isActive ? "text-ink lg:bg-muted-soft" : "text-ink-muted hover:text-ink"
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
