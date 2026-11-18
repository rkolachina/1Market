import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastMsg {
  id: number;
  text: string;
  tone: "info" | "error";
}

const ToastContext = createContext<(text: string, tone?: "info" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((text: string, tone: "info" | "error" = "info") => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), text, tone });
    timer.current = setTimeout(() => setToast(null), tone === "error" ? 6000 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
        {toast && (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-[16px] px-4 py-3 text-[15px] shadow-float ${
              toast.tone === "error" ? "bg-brick text-white" : "bg-ink text-paper"
            }`}
          >
            <span>{toast.text}</span>
            <button type="button" onClick={() => setToast(null)} className="min-h-11 font-bold underline-offset-4 hover:underline">
              Dismiss
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
