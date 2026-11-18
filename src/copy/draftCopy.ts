// draft_copy: on-brand, platform-specific captions from a request + brand profile.
// The model writes; plain code then checks every fact. Missing facts produce
// questions for the owner, never guesses.

import { z } from "zod";
import { type Business, type Post } from "../db/index.js";
import { type ChatTurn, claudeJson } from "../llm/client.js";

export const POST_TYPES = ["promo", "tip", "seasonal", "showcase", "announcement"] as const;
export type PostType = (typeof POST_TYPES)[number];

const CopySchema = z.object({
  status: z.enum(["ok", "needs_info"]),
  questions: z.array(z.string()).describe("Questions for the owner when a needed fact is missing. Empty if status is ok."),
  post_type: z.enum(POST_TYPES),
  facebook: z.object({
    caption: z.string(),
    variant: z.string().describe("A second, different take on the caption"),
    cta: z.string().describe("The call to action used, e.g. 'Book at brightsidegutters.example/book'"),
  }),
  instagram: z.object({
    caption: z.string().describe("Strong first-line hook, no links (IG captions are not clickable)"),
    variant: z.string(),
    hashtags: z.array(z.string()),
  }),
  gbp: z.object({
    text: z.string(),
    cta_type: z.enum(["BOOK", "CALL", "LEARN_MORE", "ORDER", "SHOP", "SIGN_UP"]),
  }),
  image_headline: z.string().describe("Max 6 words for a graphic overlay, empty if none fits"),
});
export type DraftCopyOutput = z.infer<typeof CopySchema>;

export interface DraftCopyInput {
  request: string;
  post_type?: PostType;
  /** Answers to earlier clarifying questions. */
  owner_answers?: string;
  has_photo?: boolean;
}

export interface DraftCopyResult {
  ok: boolean;
  copy?: DraftCopyOutput;
  questions?: string[];
  problems?: string[];
}

const LIMITS = { facebook: 2000, instagram: 2200, gbp: 1500, hashtags: 30 };

function systemPrompt(business: Business): string {
  return `You write social media posts for one local business. You work for the owner, who must approve every post before it goes out.

Rules:
- Use ONLY facts from the BUSINESS PROFILE or the OWNER REQUEST: prices, discounts, dates, phone numbers, URLs, service names, guarantees. Never invent or round a number.
- If the request needs a fact you don't have (e.g. an end date, which services a discount covers, a price that isn't in the profile), set status to "needs_info", list short specific questions, and still fill the fields with your best draft that leaves the unknown out.
- Match the tone of voice. Never use banned words or touch banned topics.
- Facebook: 2-5 short sentences, one clear call to action (phone or booking link).
- Instagram: hook in the first line, no URLs, end with 3-6 hashtags in the hashtags field (not in the caption).
- Google Business Profile: 1-3 plain sentences, no hashtags, no emoji.
- Don't repeat the wording or angle of recent posts.
- No placeholders like [name] or TBD.

BUSINESS PROFILE:
${JSON.stringify({ name: business.name, ...business.profile }, null, 2)}`;
}

function userPrompt(input: DraftCopyInput, history: Post[], today: string): string {
  const recent = history
    .slice(0, 5)
    .map((p) => `- (${p.posted_at.slice(0, 10)}, ${p.post_type ?? "post"}) ${p.caption ?? ""}`)
    .join("\n");
  return `Today is ${today}.

OWNER REQUEST:
${input.request}
${input.owner_answers ? `\nOWNER ANSWERS TO YOUR EARLIER QUESTIONS:\n${input.owner_answers}\n` : ""}
${input.post_type ? `Post type: ${input.post_type}` : "Pick the best post type."}
${input.has_photo ? "The owner attached a photo that will be used with this post." : "A branded graphic will be made for this post."}

RECENT POSTS (avoid repeating):
${recent || "(none)"}`;
}

// ---------- Fact and format checks (plain code) ----------

const digits = (s: string) => s.replace(/\D/g, "");

export function checkCopy(copy: DraftCopyOutput, business: Business, input: DraftCopyInput): string[] {
  const problems: string[] = [];
  const profile = (business.profile ?? {}) as Record<string, unknown>;
  const sources = [JSON.stringify(profile), input.request, input.owner_answers ?? ""].join("\n").toLowerCase();
  const sourceDigits = digits(sources);

  const texts: [string, string][] = [
    ["facebook", copy.facebook.caption],
    ["facebook variant", copy.facebook.variant],
    ["instagram", copy.instagram.caption],
    ["instagram variant", copy.instagram.variant],
    ["gbp", copy.gbp.text],
    ["image headline", copy.image_headline],
  ];

  if (copy.facebook.caption.length > LIMITS.facebook) problems.push(`facebook caption is over ${LIMITS.facebook} chars`);
  if (copy.instagram.caption.length > LIMITS.instagram) problems.push(`instagram caption is over ${LIMITS.instagram} chars`);
  if (copy.gbp.text.length > LIMITS.gbp) problems.push(`gbp text is over ${LIMITS.gbp} chars`);
  if (copy.instagram.hashtags.length > LIMITS.hashtags) problems.push("too many hashtags");
  if (!copy.facebook.cta.trim()) problems.push("facebook is missing a call to action");
  if (/https?:\/\/|www\./i.test(copy.instagram.caption)) problems.push("instagram caption contains a link");

  const banned = ((profile.banned_words as string[]) ?? []).map((w) => w.toLowerCase());

  for (const [where, text] of texts) {
    const lower = text.toLowerCase();
    if (/\[[^\]]*\]|\{[^}]*\}|\bTBD\b|\bXXX\b|lorem ipsum/i.test(text)) problems.push(`${where}: contains a placeholder`);
    for (const w of banned) if (lower.includes(w)) problems.push(`${where}: uses banned word "${w}"`);

    // Prices and percentages must appear in the profile or request.
    for (const m of text.matchAll(/\$\s?\d[\d,]*(?:\.\d{2})?|\d+(?:\.\d+)?\s?%/g)) {
      const value = m[0].replace(/\s/g, "").toLowerCase();
      if (!sources.replace(/\s/g, "").includes(value)) problems.push(`${where}: "${m[0]}" is not in the profile or request`);
    }
    // Phone numbers must match a number in the profile or request.
    for (const m of text.matchAll(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g)) {
      if (!sourceDigits.includes(digits(m[0]))) problems.push(`${where}: phone "${m[0]}" is not in the profile or request`);
    }
    // Links/domains must be the business's own.
    for (const m of text.matchAll(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|example|co|io|us)\b/gi)) {
      if (!sources.includes(m[0].toLowerCase())) problems.push(`${where}: link "${m[0]}" is not the business's`);
    }
  }
  return [...new Set(problems)];
}

// ---------- Main ----------

export async function draftCopy(
  business: Business,
  history: Post[],
  input: DraftCopyInput,
  today = new Date().toISOString().slice(0, 10),
): Promise<DraftCopyResult> {
  const turns: ChatTurn[] = [{ role: "user", text: userPrompt(input, history, today) }];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await claudeJson({
      schema: CopySchema,
      schemaName: "post_copy",
      system: systemPrompt(business),
      turns,
      effort: "medium",
    });

    const copy = res.data;
    if (!copy) return { ok: false, problems: [`The model did not return valid copy (stop: ${res.stopReason}).`] };

    if (copy.status === "needs_info" && copy.questions.length > 0) {
      return { ok: false, copy, questions: copy.questions };
    }

    const problems = checkCopy(copy, business, input);
    if (problems.length === 0) return { ok: true, copy };

    // One repair attempt with the exact problems.
    if (attempt === 1) {
      turns.push(
        { role: "assistant", text: JSON.stringify(copy) },
        {
          role: "user",
          text: `Your draft failed these checks. Fix them and return the full JSON again. If a fact is missing, ask instead of guessing.\n- ${problems.join("\n- ")}`,
        },
      );
    } else {
      return { ok: false, copy, problems };
    }
  }
  return { ok: false, problems: ["unreachable"] };
}
