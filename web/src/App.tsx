import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { ToastProvider } from "./components/Toast";
import { BusinessPage } from "./pages/BusinessPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DraftPage } from "./pages/DraftPage";
import { HomePage } from "./pages/HomePage";
import { PostsPage } from "./pages/PostsPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="posts" element={<PostsPage />} />
              <Route path="business" element={<BusinessPage />} />
              <Route path="drafts/:id" element={<DraftPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
