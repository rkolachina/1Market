import { ArrowRight, Camera, CheckCircle, CircleNotch, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { type AssistantRequest, api, uploadToS3 } from "../lib/api";
import { localInputToIso } from "../lib/format";
import { useToast } from "./Toast";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ACTIVE_KEY = "1market.activeRequest";

// Remember the request being worked on, so a page refresh picks it back up.
function loadActive(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function saveActive(id: string | null) {
  try {
    if (id) sessionStorage.setItem(ACTIVE_KEY, id);
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    // storage unavailable; the request still works, it just won't survive a refresh
  }
}

/** "What should we post about?" — sends a request to the assistant and shows how it's going. */
export function RequestBox() {
  const [activeId, setActiveId] = useState<string | null>(loadActive);
  const start = (id: string | null) => {
    saveActive(id);
    setActiveId(id);
  };
  return activeId ? <RequestProgress id={activeId} onDone={() => start(null)} /> : <RequestForm onSent={start} />;
}

/** The request form. `initial` pre-fills it (e.g. from a recommended idea). */
export function RequestForm({
  onSent,
  initial,
  heading = "What should we post about?",
  onCancel,
}: {
  onSent: (id: string) => void;
  initial?: { text: string; date?: string };
  heading?: string;
  onCancel?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(initial?.text ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [date, setDate] = useState(initial?.date ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const send = useMutation({
    mutationFn: async () => {
      let photo_key: string | undefined;
      if (photo) {
        const up = await api.post<{ key: string; url: string }>("/media/upload-url", { content_type: photo.type });
        await uploadToS3(up.url, photo);
        photo_key = up.key;
      }
      return api.post<AssistantRequest>("/requests", {
        request: text,
        target_date: date ? localInputToIso(date) : undefined,
        photo_key,
      });
    },
    onSuccess: (r) => onSent(r.request_id),
    onError: (e) => toast(e.message, "error"),
  });

  return (
    <form
      className="card flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) send.mutate();
      }}
    >
      <label htmlFor={`${id}-text`} className="font-display text-[24px] font-bold leading-tight">
        {heading}
      </label>
      <textarea
        id={`${id}-text`}
        rows={initial ? 5 : 3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. we're closed Thanksgiving Day, or show off this job"
        className="w-full resize-none rounded-[10px] border border-rule bg-paper p-3 text-[17px] placeholder:text-ink-muted"
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-date`} className="text-[15px] font-bold">
          When should it go out? <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id={`${id}-date`}
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-h-12 rounded-[10px] border border-rule bg-paper px-3"
        />
      </div>
      {photo && (
        <div className="flex items-center justify-between gap-2 rounded-[10px] bg-muted-soft px-3 py-2 text-[15px]">
          <span className="truncate">{photo.name}</span>
          <button type="button" aria-label="Remove photo" className="flex size-11 items-center justify-center" onClick={() => setPhoto(null)}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={PHOTO_TYPES.join(",")}
          className="sr-only"
          id={`${id}-photo`}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (f && !PHOTO_TYPES.includes(f.type)) return toast("Use a JPG, PNG or WebP photo.", "error");
            if (f && f.size > 15 * 1024 * 1024) return toast("That photo is over 15 MB. Try a smaller one.", "error");
            setPhoto(f);
          }}
        />
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
          <Camera size={20} aria-hidden="true" />
          {photo ? "Change photo" : "Add photo"}
        </button>
        <div className="flex items-center gap-1">
          {onCancel && (
            <button type="button" className="btn-text" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={!text.trim() || send.isPending}>
            {send.isPending ? "Sending…" : initial ? "Make this post" : "Send"}
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  );
}

/** How a sent request is going: working, questions to answer, failed, or the finished draft. */
export function RequestProgress({ id, onDone }: { id: string; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const answersId = useId();
  const [answers, setAnswers] = useState("");

  const req = useQuery({
    queryKey: ["request", id],
    queryFn: () => api.get<AssistantRequest>(`/requests/${id}`),
    refetchInterval: (q) => (q.state.data && ["queued", "running"].includes(q.state.data.status) ? 2000 : false),
  });
  const r = req.data;

  // A new draft exists: refresh the lists on Home and the calendar.
  const draftId = r?.result?.kind === "draft" ? r.result.draft_id : undefined;
  useEffect(() => {
    if (draftId) qc.invalidateQueries({ queryKey: ["drafts"] });
  }, [draftId, qc]);

  const act = useMutation({
    mutationFn: (kind: "answers" | "retry") =>
      api.post<AssistantRequest>(`/requests/${id}/${kind}`, kind === "answers" ? { answers } : undefined),
    onSuccess: (updated) => {
      setAnswers("");
      qc.setQueryData(["request", id], updated);
    },
    onError: (e) => toast(e.message, "error"),
  });

  if (req.isError) {
    return (
      <div role="alert" className="card flex flex-col items-start gap-3 p-5">
        <p className="text-brick">We lost track of this request. {req.error.message}</p>
        <button type="button" className="btn-secondary" onClick={onDone}>
          Ask for a new post
        </button>
      </div>
    );
  }

  if (!r || r.status === "queued" || r.status === "running") {
    return (
      <div role="status" aria-live="polite" className="card flex flex-col gap-2 p-5">
        <p className="flex items-center gap-2 font-bold">
          <CircleNotch size={22} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          Working on your post…
        </p>
        <p className="text-ink-muted">Writing the captions and making the image. This usually takes under a minute.</p>
        {r && <p className="meta">“{r.request}”</p>}
      </div>
    );
  }

  if (r.status === "failed") {
    return (
      <div role="alert" className="card flex flex-col items-start gap-3 p-5">
        <p className="text-brick">{r.error ?? "Something went wrong while making this post."}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={act.isPending} onClick={() => act.mutate("retry")}>
            Try again
          </button>
          <button type="button" className="btn-text" onClick={onDone}>
            Ask for something else
          </button>
        </div>
      </div>
    );
  }

  if (r.result?.kind === "question") {
    return (
      <form
        className="card flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (answers.trim()) act.mutate("answers");
        }}
      >
        <p className="font-display text-[24px] font-bold leading-tight">A quick question first</p>
        <p className="meta">“{r.request}”</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {r.result.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
        <label htmlFor={answersId} className="text-[15px] font-bold">
          Your answer
        </label>
        <textarea
          id={answersId}
          rows={3}
          value={answers}
          onChange={(e) => setAnswers(e.target.value)}
          className="w-full resize-none rounded-[10px] border border-rule bg-paper p-3 text-[17px]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn-text" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!answers.trim() || act.isPending}>
            {act.isPending ? "Sending…" : "Send answer"}
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      </form>
    );
  }

  // Done with a draft.
  return (
    <div role="status" className="card flex flex-col gap-3 p-5">
      <p className="flex items-center gap-2 font-bold">
        <CheckCircle size={22} weight="fill" aria-hidden="true" className="text-olive" />
        Your draft is ready.
      </p>
      {r.result?.message && <p className="text-ink-muted">{r.result.message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {draftId && (
          <Link to={`/drafts/${draftId}`} className="btn-primary" onClick={onDone}>
            Review draft
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        )}
        <button type="button" className="btn-text" onClick={onDone}>
          Ask for another post
        </button>
      </div>
    </div>
  );
}
