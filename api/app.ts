// 1Market HTTP API. The same Hono app runs locally (api/dev.ts) and later in Lambda.
//
// Tenant rule: business_id comes from the authenticated session (c.get("businessId")),
// never from the URL or request body.

import { Hono } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import sharp from "sharp";
import { ulid } from "ulid";
import { type AuthUser, authEnabled, setUserBusiness, verifyRequest } from "./auth.js";
import {
  type Business,
  type Draft,
  createBusiness,
  createRequest,
  type DraftStatus,
  getRequest,
  getBusiness,
  getDraft,
  listDrafts,
  listDraftsByStatus,
  listPosts,
  putBusiness,
  setDraftDate,
  setIdeas,
  setProfileImport,
  setRequestStatus,
} from "../src/db/index.js";
import { normalizeWebsite } from "../src/profile/import.js";
import { DraftError, approve, editCaption, skip, transition } from "../src/drafts/service.js";
import { businessKey, presignedGetUrl, presignedPutUrl, putMedia } from "../src/media/index.js";
import { dispatchRequest } from "../src/requests/dispatch.js";
import { cancelPublish, schedulePublish } from "../src/schedule/index.js";
import { publish } from "../src/publish/index.js";

type Env = { Variables: { businessId: string; user: AuthUser } };

export const app = new Hono<Env>().basePath("/api");

// One line per request: method, path, status, time.
app.use("*", logger());

// Public: health check (registered before the auth middleware, so it answers without a login).
app.get("/health", (c) => c.json({ ok: true }));

// ---- Auth ----
// Every request must carry a valid Cognito ID token. business_id comes ONLY from
// that verified token. (If Cognito isn't configured locally, fall back to the demo
// business so the app still runs; deployed environments always configure it.)
app.use("*", async (c, next) => {
  if (!authEnabled) {
    c.set("user", { sub: "dev", username: "dev", email: "dev@localhost" });
    c.set("businessId", process.env.DEV_BUSINESS_ID ?? "biz_demo_brightside");
    return next();
  }
  const user = await verifyRequest(c.req.header("authorization"));
  if (!user) return c.json({ error: "Please log in again." }, 401);
  c.set("user", user);
  const path = new URL(c.req.url).pathname;
  if (!user.businessId) {
    // Brand-new account: only allowed to see itself and create its business.
    if (path === "/api/account" || path === "/api/account/setup") return next();
    return c.json({ error: "Finish setting up your business first.", code: "NO_BUSINESS" }, 403);
  }
  c.set("businessId", user.businessId);
  return next();
});

// ---- Account ----
app.get("/account", (c) => {
  const u = c.get("user");
  return c.json({ email: u.email, name: u.name ?? null, business_id: u.businessId ?? null, auth: authEnabled });
});

const Setup = z.object({ business_name: z.string().trim().min(1).max(120), website: z.string().trim().max(300).optional() });

/** First login after sign-up: create the owner's business and link it to their login. */
app.post("/account/setup", async (c) => {
  const user = c.get("user");
  if (user.businessId) return c.json({ error: "Your business is already set up." }, 409);
  const { business_name, website: rawWebsite } = Setup.parse(await c.req.json());
  let website: string | undefined;
  if (rawWebsite) {
    try {
      website = normalizeWebsite(rawWebsite);
    } catch {
      return c.json({ error: "Enter a website address like yourbusiness.com" }, 400);
    }
  }
  const business = await createBusiness({
    name: business_name,
    profile: website ? { website } : {},
    brand_kit: { colors: { primary: "#2B2420", accent: "#E3D6BF" } },
    settings: { platforms: ["facebook"], timezone: "America/New_York", owner_sub: user.sub },
  });
  await setUserBusiness(user.username, business.business_id);
  // With a website, start filling in the profile from it right away.
  if (website) await startProfileImport(business.business_id, website);
  return c.json({ business_id: business.business_id, importing: Boolean(website) }, 201);
});

app.onError((err, c) => {
  if (err instanceof DraftError) return c.json({ error: err.message }, 409);
  if (err instanceof z.ZodError) return c.json({ error: "Invalid input", issues: err.issues }, 400);
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

// ---- Helpers ----
async function withImageUrls(businessId: string, d: Draft) {
  const image_urls = await Promise.all((d.image_keys ?? []).map((k) => presignedGetUrl(businessId, k, 3600)));
  return { ...d, image_urls };
}

/** Reading a website takes a minute or two; one still "running" after 10 minutes crashed. */
const IMPORT_STALE_MS = 10 * 60 * 1000;

function importView(b: Business) {
  const imp = b.profile_import;
  if (!imp) return null;
  if (imp.status === "running" && Date.now() - Date.parse(imp.started_at) > IMPORT_STALE_MS) {
    return { status: "failed" as const, url: imp.url, error: "We couldn't read that website. Please try again, or fill in the details yourself." };
  }
  return { status: imp.status, url: imp.url, result: imp.result, error: imp.error };
}

async function profileResponse(b: Business) {
  const kit = (b.brand_kit ?? {}) as { logo_key?: string };
  const logo_url = kit.logo_key ? await presignedGetUrl(b.business_id, kit.logo_key, 3600) : null;
  return {
    business_id: b.business_id,
    name: b.name,
    profile: b.profile ?? {},
    brand_kit: b.brand_kit ?? {},
    settings: b.settings ?? {},
    logo_url,
    profile_import: importView(b),
  };
}

async function startProfileImport(businessId: string, url: string) {
  await setProfileImport(businessId, { status: "running", url, started_at: new Date().toISOString() });
  await dispatchRequest({ kind: "profile_import", businessId });
}

// ---- Profile ----
app.get("/profile", async (c) => {
  const b = await getBusiness(c.get("businessId"));
  if (!b) return c.json({ error: "Business not found" }, 404);
  return c.json(await profileResponse(b));
});

const ProfileUpdate = z.object({
  name: z.string().min(1).max(120),
  profile: z.record(z.string(), z.unknown()),
  brand_kit: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

app.put("/profile", async (c) => {
  const businessId = c.get("businessId");
  const existing = await getBusiness(businessId);
  if (!existing) return c.json({ error: "Business not found" }, 404);
  const body = ProfileUpdate.parse(await c.req.json());
  const saved = await putBusiness({
    ...existing,
    name: body.name,
    profile: body.profile,
    brand_kit: body.brand_kit ?? existing.brand_kit,
    settings: body.settings ?? existing.settings,
    business_id: businessId, // always from the session
    created_at: existing.created_at,
    // Saving means the owner has reviewed a finished website import, so it's done with.
    profile_import: existing.profile_import?.status === "running" ? existing.profile_import : undefined,
  });
  return c.json(await profileResponse(saved));
});

/** Fill in the profile from a website (runs in the background; GET /profile shows progress). */
app.post("/profile/import", async (c) => {
  const businessId = c.get("businessId");
  const { url } = z.object({ url: z.string().trim().min(1).max(300) }).parse(await c.req.json());
  let website: string;
  try {
    website = normalizeWebsite(url);
  } catch {
    return c.json({ error: "Enter a website address like yourbusiness.com" }, 400);
  }
  await startProfileImport(businessId, website);
  const b = await getBusiness(businessId);
  return c.json(await profileResponse(b!), 202);
});

/** Throw away a website import without using it. */
app.post("/profile/import/dismiss", async (c) => {
  const businessId = c.get("businessId");
  await setProfileImport(businessId, null);
  const b = await getBusiness(businessId);
  return c.json(await profileResponse(b!));
});

// ---- Drafts ----
const STATUSES: DraftStatus[] = ["pending", "approved", "scheduled", "publishing", "posted", "skipped", "expired", "failed"];

app.get("/drafts", async (c) => {
  const businessId = c.get("businessId");
  const status = c.req.query("status") ?? "pending";
  if (status === "all") {
    const drafts = await listDrafts(businessId, 500);
    return c.json(await Promise.all(drafts.map((d) => withImageUrls(businessId, d))));
  }
  if (!STATUSES.includes(status as DraftStatus)) return c.json({ error: "Unknown status" }, 400);
  const drafts = await listDraftsByStatus(businessId, status as DraftStatus, 50);
  return c.json(await Promise.all(drafts.map((d) => withImageUrls(businessId, d))));
});

app.get("/drafts/:id", async (c) => {
  const businessId = c.get("businessId");
  const d = await getDraft(businessId, c.req.param("id"));
  if (!d) return c.json({ error: "Draft not found" }, 404);
  return c.json(await withImageUrls(businessId, d));
});

/**
 * Approve. If the draft has a future date, it becomes "scheduled" for that time;
 * otherwise it is published right away.
 * A scheduled draft gets a one-time EventBridge schedule that publishes it at that time.
 */
app.post("/drafts/:id/approve", async (c) => {
  const businessId = c.get("businessId");
  const id = c.req.param("id");
  const draft = await getDraft(businessId, id);
  if (!draft) return c.json({ error: "Draft not found" }, 404);
  const when = draft.target_date ? new Date(draft.target_date) : undefined;
  if (when && when.getTime() > Date.now() + 60_000) {
    // Schedule first: if the status write then fails, the publisher skips drafts that aren't "scheduled".
    await schedulePublish(businessId, id, when.toISOString());
    const d = await transition(businessId, id, "scheduled", { scheduled_at: when.toISOString() });
    return c.json(await withImageUrls(businessId, d));
  }
  await approve(businessId, id);
  const d = await publish(businessId, id);
  return c.json(await withImageUrls(businessId, d));
});

/** Missed or scheduled draft: post it right now. */
app.post("/drafts/:id/post-now", async (c) => {
  const businessId = c.get("businessId");
  const id = c.req.param("id");
  const draft = await getDraft(businessId, id);
  if (!draft) return c.json({ error: "Draft not found" }, 404);
  if (draft.status === "pending") await approve(businessId, id);
  if (draft.status === "scheduled") await cancelPublish(id);
  const d = await publish(businessId, id);
  return c.json(await withImageUrls(businessId, d));
});

app.post("/drafts/:id/unschedule", async (c) => {
  const businessId = c.get("businessId");
  const id = c.req.param("id");
  await cancelPublish(id);
  const d = await transition(businessId, id, "pending");
  return c.json(await withImageUrls(businessId, d));
});

const DateEdit = z.object({ target_date: z.string().datetime() });

app.patch("/drafts/:id/date", async (c) => {
  const businessId = c.get("businessId");
  const { target_date } = DateEdit.parse(await c.req.json());
  try {
    const id = c.req.param("id");
    let d = await setDraftDate(businessId, id, target_date);
    if (d.status === "scheduled") {
      // Move the schedule too. A date that's already passed goes back to needing the owner's OK.
      if (Date.parse(target_date) > Date.now() + 60_000) await schedulePublish(businessId, id, target_date);
      else {
        await cancelPublish(id);
        d = await transition(businessId, id, "pending");
      }
    }
    return c.json(await withImageUrls(businessId, d));
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") {
      throw new DraftError("Only drafts that haven't posted yet can be moved");
    }
    throw err;
  }
});

app.post("/drafts/:id/skip", async (c) => {
  const businessId = c.get("businessId");
  const id = c.req.param("id");
  await cancelPublish(id);
  const d = await skip(businessId, id);
  return c.json(await withImageUrls(businessId, d));
});

const CaptionEdit = z.object({ platform: z.enum(["facebook", "instagram", "gbp"]), caption: z.string().min(1).max(5000) });

app.patch("/drafts/:id/caption", async (c) => {
  const businessId = c.get("businessId");
  const body = CaptionEdit.parse(await c.req.json());
  const d = await editCaption(businessId, c.req.param("id"), body.platform, body.caption);
  return c.json(await withImageUrls(businessId, d));
});

// ---- Posts ----
app.get("/posts", async (c) => {
  return c.json(await listPosts(c.get("businessId"), 100));
});

// ---- Media ----
/** Upload a new logo (raw image body, ≤ 5 MB). Normalized to a 600px PNG. */
app.post("/media/logo", async (c) => {
  const businessId = c.get("businessId");
  const type = c.req.header("content-type") ?? "";
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(type)) return c.json({ error: "Use a PNG, JPG, WebP or SVG image" }, 400);
  const body = Buffer.from(await c.req.arrayBuffer());
  if (body.length === 0 || body.length > 5 * 1024 * 1024) return c.json({ error: "Logo must be under 5 MB" }, 400);
  const png = await sharp(body).resize(600, 600, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const key = businessKey(businessId, "brand", `logo-${ulid()}.png`);
  await putMedia(businessId, key, png, "image/png");
  const b = await getBusiness(businessId);
  if (!b) return c.json({ error: "Business not found" }, 404);
  const saved = await putBusiness({ ...b, brand_kit: { ...(b.brand_kit ?? {}), logo_key: key } });
  return c.json(await profileResponse(saved));
});

/** Upload link for a photo the owner attaches to a request (browser PUTs straight to S3). */
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

app.post("/media/upload-url", async (c) => {
  const businessId = c.get("businessId");
  const { content_type } = z.object({ content_type: z.string() }).parse(await c.req.json());
  const ext = PHOTO_TYPES[content_type];
  if (!ext) return c.json({ error: "Use a JPG, PNG or WebP photo" }, 400);
  const key = businessKey(businessId, "uploads", `${ulid()}.${ext}`);
  return c.json({ key, url: await presignedPutUrl(businessId, key, content_type) });
});

// ---- Recommendations (post ideas) ----
// Generated in the background (~15s); the app polls GET /ideas while status is "running".

const IDEAS_STALE_MS = 5 * 60 * 1000;
const IDEAS_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function ideasView(b: Business) {
  const st = b.ideas;
  if (!st) return { status: "none" as const, items: [], generated_at: null, expired: true };
  const crashed = st.status === "running" && Date.now() - Date.parse(st.started_at) > IDEAS_STALE_MS;
  return {
    status: crashed ? ("failed" as const) : st.status,
    items: st.items ?? [],
    generated_at: st.generated_at ?? null,
    error: crashed ? "We couldn't come up with ideas just now. Please try again." : st.error,
    // Older than a week: the app asks for fresh ones.
    expired: !st.generated_at || Date.now() - Date.parse(st.generated_at) > IDEAS_MAX_AGE_MS,
  };
}

app.get("/ideas", async (c) => {
  const b = await getBusiness(c.get("businessId"));
  if (!b) return c.json({ error: "Business not found" }, 404);
  return c.json(ideasView(b));
});

/** Come up with a new set of ideas (keeps showing the old ones until the new ones are ready). */
app.post("/ideas/refresh", async (c) => {
  const businessId = c.get("businessId");
  const b = await getBusiness(businessId);
  if (!b) return c.json({ error: "Business not found" }, 404);
  if (ideasView(b).status === "running") return c.json(ideasView(b), 202);
  await setIdeas(businessId, { ...(b.ideas ?? {}), status: "running", started_at: new Date().toISOString(), error: undefined });
  await dispatchRequest({ kind: "ideas", businessId });
  return c.json(ideasView((await getBusiness(businessId))!), 202);
});

/** The owner made a post from this idea; it's shown as used. */
app.post("/ideas/:id/used", async (c) => {
  const businessId = c.get("businessId");
  const b = await getBusiness(businessId);
  const st = b?.ideas;
  if (!st?.items?.some((i) => i.id === c.req.param("id"))) return c.json({ error: "Idea not found" }, 404);
  const items = st.items.map((i) => (i.id === c.req.param("id") ? { ...i, used: true } : i));
  try {
    await setIdeas(businessId, { ...st, items }, st.started_at);
  } catch (err) {
    if ((err as Error).name !== "ConditionalCheckFailedException") throw err; // a new set replaced it; nothing to mark
  }
  return c.json(ideasView((await getBusiness(businessId))!));
});

// ---- Assistant requests ----
// The agent takes 20-60s, so a request is saved and run in the background; the app
// polls GET /requests/:id until it's done (a draft, or questions for the owner).

const NewRequest = z.object({
  request: z.string().trim().min(1).max(1000),
  target_date: z.string().datetime().optional(),
  photo_key: z.string().optional(),
});

type RequestRecord = NonNullable<Awaited<ReturnType<typeof getRequest>>>;

/** A run that has been "running" this long crashed (an agent run takes about a minute). */
const STALE_MS = 5 * 60 * 1000;
const isStale = (r: RequestRecord) => r.status === "running" && Date.now() - Date.parse(r.updated_at) > STALE_MS;

/** What the app sees: no internal fields; a crashed run shows as failed so it can be retried. */
const requestView = (r: RequestRecord) => ({
  request_id: r.request_id,
  status: isStale(r) ? "failed" : r.status,
  request: r.request,
  result: r.result,
  error: isStale(r) ? "Something went wrong while making this post. Please try again." : r.error,
  created_at: r.created_at,
});

app.post("/requests", async (c) => {
  const businessId = c.get("businessId");
  const body = NewRequest.parse(await c.req.json());
  if (body.photo_key && !body.photo_key.startsWith(`businesses/${businessId}/uploads/`)) {
    return c.json({ error: "That photo doesn't belong to your business" }, 400);
  }
  const r = await createRequest(businessId, body);
  await dispatchRequest({ businessId, requestId: r.request_id });
  return c.json(requestView(r), 202);
});

app.get("/requests/:id", async (c) => {
  const r = await getRequest(c.get("businessId"), c.req.param("id"));
  if (!r) return c.json({ error: "Request not found" }, 404);
  return c.json(requestView(r));
});

/** Owner answers the assistant's questions; the same request runs again with the answers. */
app.post("/requests/:id/answers", async (c) => {
  const businessId = c.get("businessId");
  const id = c.req.param("id");
  const { answers } = z.object({ answers: z.string().trim().min(1).max(2000) }).parse(await c.req.json());
  const r = await getRequest(businessId, id);
  if (!r) return c.json({ error: "Request not found" }, 404);
  if (r.status !== "done" || r.result?.kind !== "question") {
    return c.json({ error: "This request isn't waiting for answers" }, 409);
  }
  const all = r.answers ? `${r.answers}\n${answers}` : answers;
  const updated = await setRequestStatus(businessId, id, "done", "queued", { answers: all }, ["result"]);
  await dispatchRequest({ businessId, requestId: id });
  return c.json(requestView(updated), 202);
});

/** Run a failed request again. */
app.post("/requests/:id/retry", async (c) => {
  const businessId = c.get("businessId");
  const id = c.req.param("id");
  const r = await getRequest(businessId, id);
  if (!r) return c.json({ error: "Request not found" }, 404);
  if (r.status !== "failed" && !isStale(r)) return c.json({ error: "Only a request that didn't work can be tried again" }, 409);
  const updated = await setRequestStatus(businessId, id, r.status, "queued", {}, ["error"]);
  await dispatchRequest({ businessId, requestId: id });
  return c.json(requestView(updated), 202);
});

