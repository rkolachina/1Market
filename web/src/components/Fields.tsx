import { Plus, X } from "@phosphor-icons/react";
import { useId, useState, type ReactNode } from "react";

const inputCls = "min-h-12 w-full rounded-[10px] border border-rule bg-paper px-3 text-[17px]";

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  type?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-bold">
        {props.label}
      </label>
      <input
        id={id}
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        aria-describedby={props.help ? `${id}-help` : undefined}
        className={inputCls}
      />
      {props.help && (
        <p id={`${id}-help`} className="text-[13px] text-ink-muted">
          {props.help}
        </p>
      )}
    </div>
  );
}

export function TextArea(props: { label: string; value: string; onChange: (v: string) => void; help?: string; rows?: number }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-bold">
        {props.label}
      </label>
      <textarea
        id={id}
        rows={props.rows ?? 3}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-describedby={props.help ? `${id}-help` : undefined}
        className="w-full rounded-[10px] border border-rule bg-paper p-3 text-[17px]"
      />
      {props.help && (
        <p id={`${id}-help`} className="text-[13px] text-ink-muted">
          {props.help}
        </p>
      )}
    </div>
  );
}

/** A list of short words/phrases as removable chips. Enter or comma adds. */
export function TagInput(props: { label: string; values: string[]; onChange: (v: string[]) => void; help?: string; placeholder?: string }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().replace(/,$/, "");
    if (v && !props.values.includes(v)) props.onChange([...props.values, v]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-bold">
        {props.label}
      </label>
      {props.values.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={props.label}>
          {props.values.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-[10px] border border-rule bg-card py-1 pl-3 pr-1 text-[15px]">
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                className="flex size-9 items-center justify-center rounded-[10px] hover:bg-muted-soft"
                onClick={() => props.onChange(props.values.filter((x) => x !== v))}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          placeholder={props.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          aria-describedby={props.help ? `${id}-help` : undefined}
          className={inputCls}
        />
        <button type="button" className="btn-secondary shrink-0" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
      {props.help && (
        <p id={`${id}-help`} className="text-[13px] text-ink-muted">
          {props.help}
        </p>
      )}
    </div>
  );
}

/** Repeatable group of fields (services, offers). */
export function ListEditor<T extends Record<string, string>>(props: {
  items: T[];
  onChange: (items: T[]) => void;
  blank: T;
  addLabel: string;
  itemLabel: (item: T, i: number) => string;
  render: (item: T, set: (patch: Partial<T>) => void) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {props.items.map((item, i) => (
        <fieldset key={i} className="flex flex-col gap-3 rounded-[16px] border border-rule bg-paper p-3">
          <div className="flex items-center justify-between gap-2">
            <legend className="font-bold">{props.itemLabel(item, i)}</legend>
            <button
              type="button"
              className="btn-text text-[15px]"
              onClick={() => props.onChange(props.items.filter((_, j) => j !== i))}
              aria-label={`Remove ${props.itemLabel(item, i)}`}
            >
              Remove
            </button>
          </div>
          {props.render(item, (patch) => props.onChange(props.items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
        </fieldset>
      ))}
      <button type="button" className="btn-secondary self-start" onClick={() => props.onChange([...props.items, { ...props.blank }])}>
        <Plus size={18} aria-hidden="true" /> {props.addLabel}
      </button>
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[26px]">{title}</h2>
        {description && <p className="text-[15px] text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}
