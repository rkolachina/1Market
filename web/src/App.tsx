import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { HomePage } from "./pages/HomePage";
import { Placeholder } from "./pages/Placeholder";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="calendar" element={<Placeholder title="Calendar" note="Your month of posts lands here in step 5." />} />
            <Route path="posts" element={<Placeholder title="Posts" note="Drafts, scheduled and posted items land here in step 4." />} />
            <Route path="business" element={<Placeholder title="Your business" note="Your profile and brand land here in step 3." />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
