import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { ToastProvider } from "./components/Toast";
import { authEnabled } from "./lib/auth";
import { SessionProvider, useSession } from "./lib/session";
import { BusinessPage } from "./pages/BusinessPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DraftPage } from "./pages/DraftPage";
import { HomePage } from "./pages/HomePage";
import { IdeasPage } from "./pages/IdeasPage";
import { PostsPage } from "./pages/PostsPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SetupPage } from "./pages/auth/SetupPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { VerifyPage } from "./pages/auth/VerifyPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

function Splash() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center font-display text-[28px] font-bold">
      1Market
    </div>
  );
}

/** Logged-in pages. Sends visitors to /login and new accounts to /setup. */
function RequireAccount({ children }: { children: ReactNode }) {
  const { status, account } = useSession();
  if (!authEnabled) return children;
  if (status === "loading") return <Splash />;
  if (status === "signed-out") return <Navigate to="/login" replace />;
  if (!account?.business_id) return <Navigate to="/setup" replace />;
  return children;
}

/** Logged-out pages. Already signed in? Go home. */
function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (!authEnabled) return <Navigate to="/" replace />;
  if (status === "loading") return <Splash />;
  if (status === "signed-in") return <Navigate to="/" replace />;
  return children;
}

function NeedsSetup({ children }: { children: ReactNode }) {
  const { status, account } = useSession();
  if (status === "loading") return <Splash />;
  if (status === "signed-out") return <Navigate to="/login" replace />;
  if (account?.business_id) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SessionProvider>
          <BrowserRouter>
            <Routes>
              <Route path="login" element={<GuestOnly><LoginPage /></GuestOnly>} />
              <Route path="signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
              <Route path="verify" element={<GuestOnly><VerifyPage /></GuestOnly>} />
              <Route path="setup" element={<NeedsSetup><SetupPage /></NeedsSetup>} />
              <Route element={<RequireAccount><AppLayout /></RequireAccount>}>
                <Route index element={<HomePage />} />
                <Route path="ideas" element={<IdeasPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="posts" element={<PostsPage />} />
                <Route path="business" element={<BusinessPage />} />
                <Route path="drafts/:id" element={<DraftPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
