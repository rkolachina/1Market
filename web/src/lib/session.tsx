import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { api } from "./api";
import { authEnabled, getIdToken, signOut as authSignOut } from "./auth";

export interface Account {
  email: string;
  name: string | null;
  business_id: string | null;
}

interface Session {
  status: "loading" | "signed-out" | "signed-in";
  account?: Account;
  /** Re-read the session (after login, setup, or logout). */
  refresh: (forceTokenRefresh?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session>({ status: "loading", refresh: async () => {}, signOut: async () => {} });

async function loadAccount(): Promise<Account | null> {
  if (authEnabled && !(await getIdToken())) return null;
  return api.get<Account>("/account");
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["account"], queryFn: loadAccount, retry: false, staleTime: Infinity });

  const refresh = useCallback(
    async (force = false) => {
      if (force) await getIdToken(true); // pick up a new business_id on the token
      // Load the account and write it straight into the cache (rather than just
      // invalidating), so the session is "signed in" before the caller navigates.
      // Errors propagate to the caller so they can be shown on screen.
      const account = await loadAccount();
      qc.setQueryData(["account"], account);
    },
    [qc],
  );

  const signOut = useCallback(async () => {
    await authSignOut().catch(() => {}); // local tokens are cleared even if the server call fails
    // Mark the session signed out right away (so the login page doesn't see a
    // stale "signed in" and bounce back), then drop every other cached business data.
    qc.setQueryData(["account"], null);
    qc.removeQueries({ predicate: (query) => query.queryKey[0] !== "account" });
  }, [qc]);

  const status: Session["status"] = q.isLoading ? "loading" : q.data ? "signed-in" : "signed-out";
  return <SessionContext.Provider value={{ status, account: q.data ?? undefined, refresh, signOut }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
