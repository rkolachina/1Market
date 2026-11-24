// publish(draft_id): sends an approved (or scheduled/failed) draft to each platform.
// Plain code — the agent never calls this. Only approved drafts get here.

import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { config } from "../config.js";
import { type Business, type Draft, type Platform, getBusiness, getDraft, recordPost } from "../db/index.js";
import { DraftError, transition } from "../drafts/service.js";
import { presignedGetUrl } from "../media/index.js";

const secrets = new SecretsManagerClient({ region: config.region });
let makeWebhookUrl: string | undefined;

async function getMakeWebhookUrl(): Promise<string> {
  if (!makeWebhookUrl) {
    const res = await secrets.send(new GetSecretValueCommand({ SecretId: config.makeWebhookSecret }));
    if (!res.SecretString) throw new Error("Make webhook secret is empty");
    makeWebhookUrl = res.SecretString;
  }
  return makeWebhookUrl;
}

interface PlatformResult {
  platform_post_id?: string;
  url?: string;
  error?: string;
  at: string;
}

/** Platforms we can publish to right now. */
const SUPPORTED: Platform[] = ["facebook"];

/** The business's Facebook Page, or a DraftError the owner can understand. */
export function facebookPageOf(business: Business | undefined): { page_id: string; page_name?: string } {
  const fb = business?.connections?.facebook;
  if (!fb?.page_id) throw new DraftError("Your Facebook Page isn't connected yet. We'll let you know as soon as it is.");
  return fb;
}

async function publishFacebook(draft: Draft): Promise<PlatformResult> {
  const caption = draft.copy.facebook?.caption;
  if (!caption) throw new Error("Draft has no Facebook caption");
  // Every business posts to its own Page: Make maps page_id into the Facebook module.
  const page = facebookPageOf(await getBusiness(draft.business_id));

  const imageKey = draft.image_keys?.[0];
  const imageUrl = imageKey ? await presignedGetUrl(draft.business_id, imageKey, 3600) : "";

  const res = await fetch(await getMakeWebhookUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_id: draft.business_id,
      draft_id: draft.draft_id,
      platform: "facebook",
      page_id: page.page_id,
      caption,
      image_url: imageUrl,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Make returned ${res.status}: ${text.slice(0, 300)}`);

  let postId: string | undefined;
  try {
    postId = (JSON.parse(text) as { post_id?: string }).post_id?.trim() || undefined;
  } catch {
    // "Accepted" means the scenario is off and the request was only queued.
  }
  if (!postId) throw new Error(`Make did not return a post_id (got: ${text.slice(0, 100)}). Is the scenario on?`);

  return { platform_post_id: postId, url: `https://www.facebook.com/${postId}`, at: new Date().toISOString() };
}

const PUBLISHERS: Partial<Record<Platform, (d: Draft) => Promise<PlatformResult>>> = {
  facebook: publishFacebook,
};

export async function publish(businessId: string, draftId: string): Promise<Draft> {
  const current = await getDraft(businessId, draftId);
  if (!current) throw new DraftError(`Draft ${draftId} not found`);

  // The conditional status write is the lock: only one caller can move it to
  // "publishing", so retries and double-clicks can't double-post.
  const draft = await transition(businessId, draftId, "publishing");

  const platforms = (Object.keys(draft.copy) as Platform[]).filter((p) => SUPPORTED.includes(p));
  if (platforms.length === 0) {
    return transition(businessId, draftId, "failed", { last_error: "No supported platforms on this draft" });
  }

  // Skip platforms that already succeeded on a previous attempt.
  const results: Partial<Record<Platform, PlatformResult>> = { ...(draft.publish_results ?? {}) };
  for (const platform of platforms) {
    if (results[platform]?.platform_post_id) continue;
    try {
      const result = await PUBLISHERS[platform]!(draft);
      results[platform] = result;
      await recordPost(businessId, {
        draft_id: draftId,
        platform,
        platform_post_id: result.platform_post_id!,
        url: result.url,
        caption: draft.copy[platform]?.caption,
        post_type: draft.post_type,
        posted_at: result.at,
      });
    } catch (err) {
      results[platform] = { error: (err as Error).message, at: new Date().toISOString() };
    }
  }

  const failures = platforms.filter((p) => !results[p]?.platform_post_id);
  if (failures.length > 0) {
    const last_error = failures.map((p) => `${p}: ${results[p]?.error}`).join("; ");
    return transition(businessId, draftId, "failed", { publish_results: results, last_error });
  }
  return transition(businessId, draftId, "posted", { publish_results: results });
}
