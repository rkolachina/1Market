// 1Market HTTP API. The same Hono app runs locally (api/dev.ts) and later in Lambda.
//
// Tenant rule: business_id comes from the authenticated session (c.get("businessId")),
// never from the URL or request body.

import { Hono } from "hono";
import { z } from "zod";
import sharp from "sharp";
import { ulid } from "ulid";
import {
  type Business,
  type Draft,
  type DraftStatus,
  getBusiness,
  getDraft,
  listDrafts,
  listDraftsByStatus,
  listPosts,
  putBusiness,
  setDraftDate,
} from "../src/db/index.js";
import { DraftError, approve, editCaption, skip, transition } from "../src/drafts/service.js";
import { businessKey, presignedGetUrl, putMedia } from "../src/media/index.js";
import { publish } from "../src/publish/index.js";

type Env = { Variables: { businessId: string } };

export const app = new Hono<Env>().basePath("/api");

// ---- Auth (placeholder until Cognito in step 2) ----
// Every request is treated as the demo business. Step 2 replaces this with
// a Cognito token check that reads business_id from the verified token.
app.use("*", async (c, next) => {
  c.set("businessId", process.env.DEV_BUSINESS_ID ?? "biz_demo_brightside");
  await next();
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

async function profileResponse(b: Business) {
  const kit = (b.brand_kit ?? {}) as { logo_key?: string };
  const logo_url = kit.logo_key ? await presignedGetUrl(b.business_id, kit.logo_key, 3600) : null;
  return { business_id: b.business_id, name: b.name, profile: b.profile ?? {}, brand_kit: b.brand_kit ?? {}, settings: b.settings ?? {}, logo_url };
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
  });
  return c.json(await profileResponse(saved));
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
 * (The timer that publishes scheduled drafts is EventBridge Scheduler, wired in step 5.)
 */
app.post("/drafts/:id/approve", async (c) => {
  const businessId = c.get("businessId");
  const id = c.req.param("id");
  const draft = await getDraft(businessId, id);
  if (!draft) return c.json({ error: "Draft not found" }, 404);
  const when = draft.target_date ? new Date(draft.target_date) : undefined;
  if (when && when.getTime() > Date.now() + 60_000) {
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
  const d = await publish(businessId, id);
  return c.json(await withImageUrls(businessId, d));
});

app.post("/drafts/:id/unschedule", async (c) => {
  const businessId = c.get("businessId");
  const d = await transition(businessId, c.req.param("id"), "pending");
  return c.json(await withImageUrls(businessId, d));
});

const DateEdit = z.object({ target_date: z.string().datetime() });

app.patch("/drafts/:id/date", async (c) => {
  const businessId = c.get("businessId");
  const { target_date } = DateEdit.parse(await c.req.json());
  try {
    const d = await setDraftDate(businessId, c.req.param("id"), target_date);
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
  const d = await skip(businessId, c.req.param("id"));
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

// ---- Assistant requests ----
app.post("/requests", (c) =>
  c.json({ error: "Your assistant isn't connected yet. We're finishing its setup." }, 503),
);

app.get("/health", (c) => c.json({ ok: true }));
