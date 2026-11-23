// The 1Market agent: turns an owner's request into a pending draft, or a question.
//
// Design rules:
// - business_id is bound here from the session; no tool lets the model choose it.
// - The model never passes caption text into create_draft. create_draft only saves
//   the last copy that passed draft_copy's fact checks, so unchecked text can't
//   become a draft.
// - There is no publish tool. Publishing happens only after the owner approves.

import { Agent, BedrockModel, tool } from "@strands-agents/sdk";
import { AnthropicModel } from "@strands-agents/sdk/models/anthropic";
import { ulid } from "ulid";
import { z } from "zod";
import { config } from "../config.js";
import { type DraftCopyOutput, POST_TYPES, draftCopy } from "../copy/draftCopy.js";
import { type Business, createDraft, getBusiness, listPosts } from "../db/index.js";
import { brandOwnerPhoto, composeBrandedGraphic } from "../media/compose.js";
import { canGenerateImages, generateBackground } from "../media/generate.js";
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
  /** When the owner wants it posted (ISO UTC); saved on the draft. */
  targetDate?: string;
}

const SYSTEM_PROMPT = `You are the 1Market assistant for one local business. The owner sends a request; you turn it into a ready-to-review social media draft.

Steps:
1. Call get_brand_profile and get_post_history.
2. Decide the post type: promo, tip, seasonal, showcase, or announcement.
3. Call draft_copy with the owner's request (and any answers they gave).
   - If it returns questions, call ask_owner with them and stop.
   - If it reports problems, you may call it once more with clarified instructions; if it still fails, call ask_owner explaining what is unclear.
4. Call prepare_image. If the owner attached a photo, it is used automatically. Otherwise also give a short scene for the background photo: a generic setting that fits the post (e.g. "a two-story suburban house with clean gutters, autumn leaves on the lawn, sunny afternoon"). No text, people or branding in the scene.
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
      "Prepare the post image. Call after draft_copy succeeds. Uses the owner's attached photo (with a logo badge) if there is one. Otherwise generates a background photo from the scene and puts the checked headline from draft_copy, contact details and logo on top; without a scene it makes a plain branded graphic.",
    inputSchema: z.object({
      scene: z
        .string()
        .max(300)
        .optional()
        .describe("Background photo to generate: a generic setting, no text, people or branding (ignored when the owner attached a photo)"),
    }),
    callback: async ({ scene }) => {
      // The headline is the fact-checked one from draft_copy, never text the model passes in.
      if (!req.photoKey && !state.copy) {
        return JSON.stringify({ ok: false, error: "No checked copy yet. Call draft_copy first." });
      }
      const headline = state.copy?.image_headline ?? "";
      let source: "owner_photo" | "generated" | "branded_graphic";
      let image: Buffer;
      let note: string | undefined;
      if (req.photoKey) {
        source = "owner_photo";
        image = await brandOwnerPhoto(business as Business, await getMedia(businessId, req.photoKey));
      } else {
        let background: Buffer | undefined;
        if (scene && canGenerateImages()) {
          try {
            background = await generateBackground(business as Business, scene);
          } catch (err) {
            // Never block a draft on image generation: fall back to the plain graphic.
            note = `Background generation failed, used the plain graphic: ${(err as Error).message}`;
            console.warn(note);
          }
        }
        source = background ? "generated" : "branded_graphic";
        image = await composeBrandedGraphic(business as Business, headline, background);
      }
      const key = businessKey(businessId, "generated", `${ulid()}.jpg`);
      await putMedia(businessId, key, image, "image/jpeg");
      state.imageKey = key;
      return JSON.stringify({ ok: true, source, ...(note ? { note } : {}) });
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
        target_date: req.targetDate,
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
    model:
      config.llmProvider === "anthropic"
        ? new AnthropicModel({ modelId: config.agentModelId, maxTokens: 8000 }) // reads ANTHROPIC_API_KEY
        : new BedrockModel({ region: config.region, modelId: config.agentModelId, maxTokens: 8000 }),
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
