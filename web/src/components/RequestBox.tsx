import { ArrowRight, Camera, X } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "./Toast";

/** "What should we post about?" — sends a request to the assistant. */
export function RequestBox() {
  const id = useId();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [date, setDate] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const send = useMutation({
    mutationFn: () => api.post("/requests", { request: text, target_date: date || undefined, has_photo: Boolean(photo) }),
    onSuccess: () => {
      setText("");
      setPhoto(null);
      setDate("");
      toast("Got it. We'll have a draft for you in a minute.");
    },
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
        What should we post about?
      </label>
      <textarea
        id={`${id}-text`}
        rows={3}
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
      <div className="flex items-center justify-between gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          id={`${id}-photo`}
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
          <Camera size={20} aria-hidden="true" />
          {photo ? "Change photo" : "Add photo"}
        </button>
        <button type="submit" className="btn-primary" disabled={!text.trim() || send.isPending}>
          {send.isPending ? "Sending…" : "Send"}
          <ArrowRight size={20} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
