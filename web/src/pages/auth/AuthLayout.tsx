import type { ReactNode } from "react";

/** Shell for the logged-out screens: brand on top, one card in the middle. */
export function AuthLayout({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-display text-[36px] font-bold leading-none">1Market</span>
          <span className="label-caps">Posts for your business, handled</span>
        </div>
        <main className="card flex flex-col gap-5 p-5 sm:p-6">
          <header className="flex flex-col gap-1.5">
            <h1 className="text-[32px]">{title}</h1>
            {intro && <p className="text-ink-muted">{intro}</p>}
          </header>
          {children}
        </main>
        {footer && <div className="text-center text-[15px]">{footer}</div>}
      </div>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[10px] bg-[#F6DDD8] px-3 py-2.5 text-[15px] font-semibold text-brick">
      {message}
    </p>
  );
}

/** Remembers the email between the form and the code screen. */
export interface PendingAuth {
  mode: "login" | "signup";
  email: string;
  businessName?: string;
}
const KEY = "1market.pendingAuth";
export const savePending = (p: PendingAuth) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: the code screen will ask for the email again */
  }
};
export const readPending = (): PendingAuth | null => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};
export const clearPending = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
