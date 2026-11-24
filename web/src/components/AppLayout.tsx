import { CalendarBlank, House, Lightbulb, Rows, SignOut, Storefront } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { authEnabled } from "../lib/auth";
import { useSession } from "../lib/session";

// `short` is the phone tab label where the full one doesn't fit five across.
const TABS: { to: string; label: string; short?: string; icon: Icon; end?: boolean }[] = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/ideas", label: "Recommendations", short: "Ideas", icon: Lightbulb },
  { to: "/calendar", label: "Calendar", icon: CalendarBlank },
  { to: "/posts", label: "Posts", icon: Rows },
  { to: "/business", label: "Business", icon: Storefront },
];

function useLogout() {
  const { signOut } = useSession();
  const navigate = useNavigate();
  return async () => {
    await signOut();
    navigate("/login", { replace: true });
  };
}

/** Phone: top bar + content + bottom tab bar. Desktop (≥1024px): left rail + centered 640px column. */
export function AppLayout() {
  const { account } = useSession();
  const logout = useLogout();

  return (
    <div className="min-h-dvh lg:flex">
      {/* Phone top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-rule bg-paper/95 px-4 py-2 backdrop-blur lg:hidden">
        <span className="font-display text-[24px] font-bold leading-none">1Market</span>
        {authEnabled && (
          <button type="button" onClick={logout} className="btn-text text-[15px] no-underline hover:underline">
            <SignOut size={20} aria-hidden="true" /> Log out
          </button>
        )}
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-rule bg-card pb-[max(env(safe-area-inset-bottom),12px)] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-56 lg:flex-col lg:border-r lg:border-t-0 lg:pb-0"
      >
        <div className="hidden px-4 py-6 lg:block">
          <span className="font-display text-[30px] font-bold leading-none">1Market</span>
          <span className="label-caps mt-1 block">Post desk</span>
        </div>
        {TABS.map(({ to, label, short, icon: TabIcon, end }) => (
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
                {short ? (
                  <>
                    <span className="lg:hidden">{short}</span>
                    <span className="hidden lg:inline">{label}</span>
                  </>
                ) : (
                  label
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Desktop: account + log out at the bottom of the rail */}
        {authEnabled && (
          <div className="mt-auto hidden flex-col gap-2 border-t border-rule p-4 lg:flex">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-bold">{account?.name ?? "Signed in"}</span>
              <span className="truncate font-mono text-[12px] text-ink-muted">{account?.email}</span>
            </div>
            <button type="button" onClick={logout} className="btn-secondary min-h-11 text-[15px]">
              <SignOut size={18} aria-hidden="true" /> Log out
            </button>
          </div>
        )}
      </nav>

      <main className="mx-auto w-full max-w-[640px] px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
