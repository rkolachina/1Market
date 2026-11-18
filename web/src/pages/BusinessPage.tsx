import { CheckCircle, FacebookLogo, GoogleLogo, InstagramLogo, UploadSimple } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ListEditor, Section, TagInput, TextArea, TextField } from "../components/Fields";
import { ErrorBlock, LoadingBlock, PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { api, type Profile } from "../lib/api";
import { authEnabled } from "../lib/auth";
import { useProfile } from "../lib/queries";
import { useSession } from "../lib/session";

type Service = { name: string; price: string; notes: string };
type Offer = { name: string; details: string; valid_until: string };

interface Form {
  name: string;
  tagline: string;
  description: string;
  phone: string;
  email: string;
  website: string;
  booking_url: string;
  services: Service[];
  offers: Offer[];
  hours: string;
  service_area: string[];
  tone_of_voice: string;
  audience: string;
  differentiators: string[];
  banned_words: string[];
  banned_topics: string[];
  hashtags: string[];
  primary: string;
  accent: string;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function toForm(p: Profile): Form {
  const pr = p.profile as Record<string, unknown>;
  const colors = ((p.brand_kit as Record<string, unknown>).colors ?? {}) as Record<string, string>;
  return {
    name: p.name,
    tagline: s(pr.tagline),
    description: s(pr.description),
    phone: s(pr.phone),
    email: s(pr.email),
    website: s(pr.website),
    booking_url: s(pr.booking_url),
    services: ((pr.services as Service[]) ?? []).map((x) => ({ name: s(x.name), price: s(x.price), notes: s(x.notes) })),
    offers: ((pr.current_offers as Offer[]) ?? []).map((x) => ({ name: s(x.name), details: s(x.details), valid_until: s(x.valid_until) })),
    hours: s(pr.hours),
    service_area: arr(pr.service_area),
    tone_of_voice: s(pr.tone_of_voice),
    audience: s(pr.audience),
    differentiators: arr(pr.differentiators),
    banned_words: arr(pr.banned_words),
    banned_topics: arr(pr.banned_topics),
    hashtags: arr(pr.hashtags),
    primary: colors.primary ?? "#2B2420",
    accent: colors.accent ?? "#E3D6BF",
  };
}

function toPayload(f: Form, p: Profile) {
  const kit = p.brand_kit as Record<string, unknown>;
  return {
    name: f.name.trim(),
    profile: {
      ...p.profile,
      tagline: f.tagline,
      description: f.description,
      phone: f.phone,
      email: f.email,
      website: f.website,
      booking_url: f.booking_url,
      services: f.services.filter((x) => x.name.trim()),
      current_offers: f.offers.filter((x) => x.name.trim()).map((x) => ({ ...x, valid_until: x.valid_until || null })),
      hours: f.hours,
      service_area: f.service_area,
      tone_of_voice: f.tone_of_voice,
      audience: f.audience,
      differentiators: f.differentiators,
      banned_words: f.banned_words,
      banned_topics: f.banned_topics,
      hashtags: f.hashtags,
    },
    brand_kit: { ...kit, colors: { ...((kit.colors as object) ?? {}), primary: f.primary, accent: f.accent } },
  };
}

export function BusinessPage() {
  const profile = useProfile();
  if (profile.isLoading) return <LoadingBlock label="Loading your business…" />;
  if (profile.isError) return <ErrorBlock message={profile.error.message} onRetry={() => profile.refetch()} />;
  return <BusinessForm profile={profile.data!} />;
}

function BusinessForm({ profile }: { profile: Profile }) {
  const ids = useId();
  const qc = useQueryClient();
  const toast = useToast();
  const initial = useMemo(() => toForm(profile), [profile]);
  const [form, setForm] = useState<Form>(initial);
  useEffect(() => setForm(initial), [initial]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: () => api.put<Profile>("/profile", toPayload(form, profile)),
    onSuccess: (p) => {
      qc.setQueryData(["profile"], p);
      toast("Saved. Your next posts will use these details.");
    },
    onError: (e) => toast(e.message, "error"),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => api.upload<Profile>("/media/logo", file),
    onSuccess: (p) => {
      qc.setQueryData(["profile"], p);
      toast("New logo saved.");
    },
    onError: (e) => toast(e.message, "error"),
  });

  return (
    <form
      className="flex flex-col gap-5 pb-28"
      onSubmit={(e) => {
        e.preventDefault();
        if (form.name.trim()) save.mutate();
      }}
    >
      <PageHeader title="Your business">Everything here shapes your posts. Keep prices and offers current.</PageHeader>

      <Section title="Basics">
        <TextField label="Business name" value={form.name} onChange={set("name")} />
        <TextField label="Tagline" value={form.tagline} onChange={set("tagline")} />
        <TextArea label="About" value={form.description} onChange={set("description")} rows={4} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Phone" type="tel" value={form.phone} onChange={set("phone")} />
          <TextField label="Email" type="email" value={form.email} onChange={set("email")} />
        </div>
        <TextField label="Website" type="url" value={form.website} onChange={set("website")} />
        <TextField label="Booking link" type="url" value={form.booking_url} onChange={set("booking_url")} help="Where posts send people to book." />
      </Section>

      <Section title="Services & prices" description="We only mention prices that are written here.">
        <ListEditor<Service>
          items={form.services}
          onChange={set("services")}
          blank={{ name: "", price: "", notes: "" }}
          addLabel="Add a service"
          itemLabel={(x, i) => x.name || `Service ${i + 1}`}
          render={(x, patch) => (
            <>
              <TextField label="Service" value={x.name} onChange={(v) => patch({ name: v })} />
              <TextField label="Price" value={x.price} onChange={(v) => patch({ price: v })} placeholder="e.g. From $149" />
              <TextField label="Details" value={x.notes} onChange={(v) => patch({ notes: v })} />
            </>
          )}
        />
      </Section>

      <Section title="Current offers" description="Offers with an end date stop appearing in posts after that day.">
        <ListEditor<Offer>
          items={form.offers}
          onChange={set("offers")}
          blank={{ name: "", details: "", valid_until: "" }}
          addLabel="Add an offer"
          itemLabel={(x, i) => x.name || `Offer ${i + 1}`}
          render={(x, patch) => (
            <>
              <TextField label="Offer name" value={x.name} onChange={(v) => patch({ name: v })} />
              <TextArea label="Details" value={x.details} onChange={(v) => patch({ details: v })} rows={2} />
              <TextField label="Ends on (optional)" type="date" value={x.valid_until} onChange={(v) => patch({ valid_until: v })} />
            </>
          )}
        />
      </Section>

      <Section title="Hours & service area">
        <TextField label="Hours" value={form.hours} onChange={set("hours")} placeholder="Mon-Fri 8am-6pm, Sat 9am-2pm" />
        <TagInput label="Towns you serve" values={form.service_area} onChange={set("service_area")} placeholder="Add a town" />
      </Section>

      <Section title="Your voice" description="How your posts should sound, and what they should never say.">
        <TextArea label="Tone of voice" value={form.tone_of_voice} onChange={set("tone_of_voice")} rows={3} />
        <TextArea label="Who your customers are" value={form.audience} onChange={set("audience")} rows={3} />
        <TagInput label="What makes you different" values={form.differentiators} onChange={set("differentiators")} placeholder="e.g. Clean-up guarantee" />
        <TagInput label="Words to never use" values={form.banned_words} onChange={set("banned_words")} placeholder="e.g. cheap" />
        <TagInput label="Topics to avoid" values={form.banned_topics} onChange={set("banned_topics")} placeholder="e.g. politics" />
        <TagInput label="Hashtags" values={form.hashtags} onChange={set("hashtags")} placeholder="#YourTown" />
      </Section>

      <Section title="Brand" description="Used on the graphics we make for you.">
        <div className="flex items-center gap-4">
          {profile.logo_url ? (
            <img src={profile.logo_url} alt="Your logo" className="size-24 rounded-[16px] border border-rule bg-paper object-contain" />
          ) : (
            <span className="flex size-24 items-center justify-center rounded-[16px] border border-dashed border-rule text-[13px] text-ink-muted">No logo</span>
          )}
          <div className="flex flex-col gap-1">
            <input
              ref={fileRef}
              id={`${ids}-logo`}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn-secondary" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              <UploadSimple size={18} aria-hidden="true" /> {upload.isPending ? "Uploading…" : "Upload new logo"}
            </button>
            <p className="text-[13px] text-ink-muted">PNG, JPG or SVG, up to 5 MB.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {(["primary", "accent"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-${k}`} className="text-[15px] font-bold">
                {k === "primary" ? "Main color" : "Accent color"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`${ids}-${k}`}
                  type="color"
                  value={form[k]}
                  onChange={(e) => set(k)(e.target.value.toUpperCase())}
                  className="size-12 shrink-0 cursor-pointer rounded-[10px] border border-rule bg-paper p-1"
                />
                <span className="font-mono text-[15px] text-ink-muted">{form[k]}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Connected accounts">
        <ul className="flex flex-col gap-2">
          <li className="flex items-center gap-3 rounded-[16px] border border-rule p-3">
            <FacebookLogo size={28} aria-hidden="true" />
            <div className="flex grow flex-col">
              <span className="font-bold">Facebook</span>
              <span className="text-[13px] text-ink-muted">Posting to your Page</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[15px] font-bold text-olive">
              <CheckCircle size={20} weight="fill" aria-hidden="true" /> Connected
            </span>
          </li>
          {[
            { label: "Instagram", icon: InstagramLogo },
            { label: "Google Business Profile", icon: GoogleLogo },
          ].map(({ label, icon: I }) => (
            <li key={label} className="flex items-center gap-3 rounded-[16px] border border-rule p-3">
              <I size={28} aria-hidden="true" />
              <div className="flex grow flex-col">
                <span className="font-bold">{label}</span>
                <span className="text-[13px] text-ink-muted">Coming soon</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <AccountSection />

      {dirty && (
        <div className="fixed inset-x-0 bottom-[76px] z-10 border-t border-rule bg-card/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-56">
          <div className="mx-auto flex max-w-[640px] items-center gap-2">
            <p className="grow text-[15px]">You have unsaved changes.</p>
            <button type="button" className="btn-text" onClick={() => setForm(initial)}>
              Undo
            </button>
            <button type="submit" className="btn-primary" disabled={save.isPending || !form.name.trim()}>
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function AccountSection() {
  const { account, signOut } = useSession();
  return (
    <Section title="Your account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-bold">{account?.name ?? "Signed in"}</span>
          <span className="meta normal-case">{account?.email}</span>
        </div>
        {authEnabled ? (
          <button type="button" className="btn-secondary" onClick={() => signOut()}>
            Log out
          </button>
        ) : (
          <span className="text-[13px] text-ink-muted">Login is off in local dev</span>
        )}
      </div>
    </Section>
  );
}
