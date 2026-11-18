// The 1Market agent: turns an owner's request into a pending draft, or a question.
//
// Design rules:
// - business_id is bound here from the session; no tool lets the model choose it.
// - The model never passes caption text into create_draft. create_draft only saves
//   the last copy that passed draft_copy's fact checks, so unchecked text can't
//   become a draft.
// - There is no publish tool. Publishing happens only after the owner approves.

import { Agent, BedrockModel, tool } from "@strands-agents/sdk";
import { ulid } from "ulid";
import { z } from "zod";
import { config } from "../config.js";
import { type DraftCopyOutput, POST_TYPES, draftCopy } from "../copy/draftCopy.js";
import { type Business, createDraft, getBusiness, listPosts } from "../db/index.js";
import { brandOwnerPhoto, composeBrandedGraphic } from "../media/compose.js";
import { businessKey, getMedia, putMedia } from "../media/index.js";

export type AgentOutcome =
  | { kind: "draft"; draft_id: string; facebook_caption: string; image_key?: string; message: string }
  | { kind: "question"; questions: string[]; message: string }
  | { kind: "error"; message: string };

export interface AgentRequest {
  businessId: string;
  request: string;
  /** S3 key of a photo the owner attached (already uploaded under their business). */
  photoKey?: string;
  /** Owner's answers to questions from a previous run. */
  answers?: string;
}

const SYSTEM_PROMPT = `You are the 1Market assistant for one local business. The owner sends a request; you turn it into a ready-to-review social media draft.

Steps:
1. Call get_brand_profile and get_post_history.
2. Decide the post type: promo, tip, seasonal, showcase, or announcement.
3. Call draft_copy with the owner's request (and any answers they gave).
   - If it returns questions, call ask_owner with them and stop.
   - If it reports problems, you may call it once more with clarified instructions; if it still fails, call ask_owner explaining what is unclear.
4. Call prepare_image. Use the owner's photo if one was attached; otherwise make a branded graphic.
5. Call create_draft.
6. Reply to the owner in 1-2 friendly sentences saying the draft is ready for review.

Never invent facts. You cannot publish; the owner approves drafts separately.`;

export async function invokeAgent(req: AgentRequest): Promise<AgentOutcome> {
  const businessId = req.businessId;
  const business = await getBusiness(businessId);
  if (!business) return { kind: "error", message: `Unknown business ${businessId}` };
  if (req.photoKey && !req.photoKey.startsWith(`businesses/${businessId}/`)) {
    return { kind: "error", message: "Photo does not belong to this business" };
  }

  // Session state shared by the tools (never exposed to the model as parameters).
  const state: {
    copy?: DraftCopyOutput;
    request: string;
    imageKey?: string;
    questions?: string[];
    draftId?: string;
  } = { request: req.request };

  const getBrandProfile = tool({
    name: "get_brand_profile",
    description: "Get this business's profile: services, prices, offers, hours, tone of voice, banned words.",
    inputSchema: z.object({}),
    callback: () => JSON.stringify({ name: business.name, ...business.profile }),
  });

  const getPostHistory = tool({
    name: "get_post_history",
    description: "Get this business's most recent published posts, newest first.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
    callback: async ({ limit }) => {
      const posts = await listPosts(businessId, limit ?? 5);
      return JSON.stringify(posts.map((p) => ({ date: p.posted_at.slice(0, 10), type: p.post_type, caption: p.caption })));
    },
  });

  const draftCopyTool = tool({
    name: "draft_copy",
    description:
      "Write Facebook, Instagram and Google Business Profile captions for the request. Facts are checked against the profile. Returns the copy, or questions for the owner, or problems.",
    inputSchema: z.object({
      request: z.string().describe("The owner's request, verbatim or lightly clarified. Never add facts."),
      post_type: z.enum(POST_TYPES).optional(),
    }),
    callback: async ({ request, post_type }) => {
      const history = await listPosts(businessId, 5);
      const result = await draftCopy(business as Business, history, {
        request: `${req.request}${request !== req.request ? `\n(Assistant note: ${request})` : ""}`,
        post_type,
        owner_answers: req.answers,
        has_photo: Boolean(req.photoKey),
      });
      if (result.ok && result.copy) {
        state.copy = result.copy;
        return JSON.stringify({ ok: true, post_type: result.copy.post_type, facebook: result.copy.facebook.caption, image_headline: result.copy.image_headline });
      }
      if (result.questions?.length) return JSON.stringify({ ok: false, questions: result.questions });
      return JSON.stringify({ ok: false, problems: result.problems });
    },
  });

  const prepareImage = tool({
    name: "prepare_image",
    description:
      "Prepare the post image. Uses the owner's attached photo (with a logo badge) if there is one, otherwise builds a branded graphic with the given headline.",
    inputSchema: z.object({
      headline: z.string().max(60).describe("Short headline for a branded graphic (ignored when the owner attached a photo)"),
    }),
    callback: async ({ headline }) => {
      const image = req.photoKey
        ? await brandOwnerPhoto(business as Business, await getMedia(businessId, req.photoKey))
        : await composeBrandedGraphic(business as Business, headline);
      const key = businessKey(businessId, "generated", `${ulid()}.jpg`);
      await putMedia(businessId, key, image, "image/jpeg");
      state.imageKey = key;
      return JSON.stringify({ ok: true, source: req.photoKey ? "owner_photo" : "branded_graphic" });
    },
  });

  const createDraftTool = tool({
    name: "create_draft",
    description: "Save the checked copy and prepared image as a pending draft for the owner to review.",
    inputSchema: z.object({}),
    callback: async () => {
      if (!state.copy) return JSON.stringify({ ok: false, error: "No checked copy yet. Call draft_copy first." });
      const c = state.copy;
      const draft = await createDraft(businessId, {
        request: req.answers ? `${req.request}\n\nOwner answers: ${req.answers}` : req.request,
        post_type: c.post_type,
        copy: {
          facebook: { caption: c.facebook.caption, variants: [c.facebook.variant], cta: c.facebook.cta },
          instagram: { caption: `${c.instagram.caption}\n\n${c.instagram.hashtags.join(" ")}`, variants: [c.instagram.variant] },
          gbp: { caption: c.gbp.text, cta: c.gbp.cta_type },
        },
        image_keys: state.imageKey ? [state.imageKey] : undefined,
      });
      state.draftId = draft.draft_id;
      return JSON.stringify({ ok: true, draft_id: draft.draft_id });
    },
  });

  const askOwner = tool({
    name: "ask_owner",
    description: "Ask the owner clarifying questions instead of guessing. Ends the run.",
    inputSchema: z.object({ questions: z.array(z.string()).min(1) }),
    callback: ({ questions }) => {
      state.questions = questions;
      return "Questions recorded. Reply to the owner with them and stop.";
    },
  });

  const agent = new Agent({
    model: new BedrockModel({ region: config.region, modelId: config.agentModelId, maxTokens: 8000 }),
    systemPrompt: SYSTEM_PROMPT,
    tools: [getBrandProfile, getPostHistory, draftCopyTool, prepareImage, createDraftTool, askOwner],
    printer: false,
  });

  const prompt = [
    `Owner request: ${req.request}`,
    req.answers ? `Owner's answers to your earlier questions: ${req.answers}` : "",
    req.photoKey ? "The owner attached a photo." : "No photo attached.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await agent.invoke(prompt);
  const message = (result.lastMessage?.content ?? [])
    .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
    .join("")
    .trim();

  if (state.draftId && state.copy) {
    return {
      kind: "draft",
      draft_id: state.draftId,
      facebook_caption: state.copy.facebook.caption,
      image_key: state.imageKey,
      message,
    };
  }
  if (state.questions) return { kind: "question", questions: state.questions, message };
  return { kind: "error", message: message || "The agent finished without a draft or a question." };
}
