// 1Market HTTP API. The same Hono app runs locally (api/dev.ts) and later in Lambda.
//
// Tenant rule: business_id comes from the authenticated session (c.get("businessId")),
// never from the URL or request body.

import { Hono } from "hono";
import { z } from "zod";
import {
  type Business,
  type Draft,
  type DraftStatus,
  getBusiness,
  getDraft,
  listDraftsByStatus,
  listPosts,
  putBusiness,
} from "../src/db/index.js";
import { DraftError, approve, editCaption, skip } from "../src/drafts/service.js";
import { presignedGetUrl } from "../src/media/index.js";
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
  const status = (c.req.query("status") ?? "pending") as DraftStatus;
  if (!STATUSES.includes(status)) return c.json({ error: "Unknown status" }, 400);
  const drafts = await listDraftsByStatus(businessId, status, 50);
  return c.json(await Promise.all(drafts.map((d) => withImageUrls(businessId, d))));
});

app.get("/drafts/:id", async (c) => {
  const businessId = c.get("businessId");
  const d = await getDraft(businessId, c.req.param("id"));
  if (!d) return c.json({ error: "Draft not found" }, 404);
  return c.json(await withImageUrls(businessId, d));
});

app.post("/drafts/:id/approve", async (c) => {
  const businessId = c.get("businessId");
  const id = c.req.param("id");
  await approve(businessId, id);
  const d = await publish(businessId, id); // scheduling arrives in step 5
  return c.json(await withImageUrls(businessId, d));
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
  return c.json(await listPosts(c.get("businessId"), 50));
});

app.get("/health", (c) => c.json({ ok: true }));
