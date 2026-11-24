// Post ideas ("Recommendations"): Claude suggests timely posts from the business profile,
// the date and season, recent posts and what's already scheduled. Each idea is a request
// the owner can edit and send to the assistant; the usual fact checks apply when it's written.

import { ulid } from "ulid";
import { z } from "zod";
import { POST_TYPES } from "../copy/draftCopy.js";
import { type Business, type Draft, type Post } from "../db/index.js";
import { claudeJson } from "../llm/client.js";

const IdeasSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().describe("Short headline for the idea, max ~8 words"),
      why_now: z.string().describe("One or two sentences: why this is a good post right now for this business"),
      request: z
        .string()
        .describe("What the owner would send to their assistant to make this post, 1-3 sentences, using only facts from the profile"),
      post_type: z.enum(POST_TYPES),
      suggested_date: z.string().describe("YYYY-MM-DD, within the next 21 days"),
      wants_photo: z.boolean().describe("true if the post would be much better with the owner's own job photo"),
    }),
  ),
});

export type Idea = z.infer<typeof IdeasSchema>["ideas"][number] & { id: string; used?: boolean };

/** "Monday, November 24, 2026" in the business's time zone. */
function today(timeZone: string): { long: string; iso: string } {
  const now = new Date();
  const long = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(now);
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { long, iso };
}

function system(business: Business): string {
  return `You are a social media planner for one local service business. Suggest posts the owner could make in the next three weeks.

Think about what would make a good post right now:
- The date and season, and what that means for this kind of business in the towns it serves (weather, yard and home chores people are thinking about, local seasonal patterns).
- Holidays and events coming up in the next three weeks that fit naturally. Skip ones that don't fit the business.
- Current offers, especially ones ending soon. Services that haven't been posted about recently.
- A healthy mix of post types: don't repeat the type or topic of recent posts or of drafts already planned.
- Days in the next three weeks that have nothing scheduled are good suggested dates.

Rules:
- Use only facts from the BUSINESS PROFILE: never invent prices, discounts, offers, guarantees or events. If an idea would need a new fact (for example a new promotion), say in the request that the owner should add the details.
- Respect the tone of voice, banned words and banned topics.
- Write each request in the owner's voice, as they'd type it to their assistant ("Write a post about our..."). Don't refer to "the owner".
- "showcase" posts work best with the owner's own job photo: set wants_photo for those (the app tells the owner; don't mention photos in the request).
- Give 6 ideas, each meaningfully different.

BUSINESS PROFILE:
${JSON.stringify({ name: business.name, ...business.profile }, null, 2)}`;
}

export async function generateIdeas(business: Business, posts: Post[], planned: Draft[]): Promise<Idea[]> {
  const tz = ((business.settings ?? {}) as { timezone?: string }).timezone ?? "America/New_York";
  const t = today(tz);
  const recent = posts
    .slice(0, 15)
    .map((p) => `- ${p.posted_at.slice(0, 10)} (${p.post_type ?? "post"}): ${(p.caption ?? "").slice(0, 140)}`)
    .join("\n");
  const upcoming = planned
    .map((d) => `- ${(d.scheduled_at ?? d.target_date ?? "no date").slice(0, 10)} [${d.status}] (${d.post_type ?? "post"}): ${(d.copy.facebook?.caption ?? d.request ?? "").slice(0, 120)}`)
    .join("\n");

  const res = await claudeJson({
    schema: IdeasSchema,
    schemaName: "post_ideas",
    system: system(business),
    effort: "medium",
    turns: [
      {
        role: "user",
        text: `Today is ${t.long} (${t.iso}).

RECENT POSTS (newest first):
${recent || "(none yet)"}

ALREADY PLANNED (drafts waiting for approval or scheduled):
${upcoming || "(nothing planned)"}

Suggest 6 post ideas for the next three weeks.`,
      },
    ],
  });
  if (!res.data) throw new Error(`No ideas returned (stop: ${res.stopReason})`);
  return res.data.ideas.slice(0, 8).map((i) => ({ ...i, id: `idea_${ulid()}` }));
}
