// Demo drafts for the Brightside business so every page looks like a real account.
// Safe to re-run: drafts already seeded (by slug) are skipped.
//
// Usage: npm run seed:drafts

import { ulid } from "ulid";
import { type DraftStatus, createDraft, getBusiness, listDrafts, setDraftStatus } from "../src/db/index.js";
import { composeBrandedGraphic } from "../src/media/compose.js";
import { businessKey, putMedia } from "../src/media/index.js";

const BUSINESS = "biz_demo_brightside";

/** 2026-11-DD at HH:MM New York time (EST, UTC-5 in late November). */
const et = (day: number, hour: number, min = 0) =>
  new Date(Date.UTC(2026, 10, day, hour + 5, min)).toISOString();

interface Demo {
  slug: string;
  status: DraftStatus;
  when: string;
  post_type: string;
  headline: string;
  facebook: [string, string];
  instagram: [string, string];
  gbp: string;
}

const DEMOS: Demo[] = [
  {
    slug: "veterans-day",
    status: "pending",
    when: et(11, 9),
    post_type: "seasonal",
    headline: "Thank You, Veterans",
    facebook: [
      "Thank you to every veteran in the Triangle. 🇺🇸 As a small thank-you, active and retired military always get 10% off any service with us. Call (919) 555-0142 or book at brightsidegutters.example/book.",
      "Today we're thinking of the veterans in our neighborhoods. Active and retired military save 10% on any Brightside service, every day. Book at brightsidegutters.example/book.",
    ],
    instagram: [
      "Thank you, veterans. 🇺🇸 Active and retired military always save 10% with us. #BrightsideGutters #RaleighHomes",
      "Grateful for everyone who served. 10% off any service for military, always. #BrightsideGutters #TriangleLiving",
    ],
    gbp: "Thank you to all veterans. Active and retired military receive 10% off any service. Call (919) 555-0142.",
  },
  {
    slug: "rainy-tip",
    status: "skipped",
    when: et(13, 9),
    post_type: "tip",
    headline: "Watch Your Downspouts",
    facebook: [
      "Rainy day tip: step outside during the next storm and look at your downspouts. If water's gushing over the gutter edge instead, they're probably clogged. We can help: (919) 555-0142.",
      "Next time it rains, take a 30-second walk around the house. Overflowing gutters usually mean a clog, not a broken gutter. Book a cleaning at brightsidegutters.example/book.",
    ],
    instagram: [
      "30-second rainy day check: are your gutters overflowing? That's usually a clog. #BrightsideGutters #RaleighHomes",
      "Water pouring over the edge = clogged gutters, not broken ones. #BrightsideGutters #TriangleLiving",
    ],
    gbp: "Overflowing gutters in the rain usually mean a clog. Book a cleaning online or call (919) 555-0142.",
  },
  {
    slug: "holiday-windows",
    status: "pending",
    when: et(20, 9),
    post_type: "promo",
    headline: "Sparkling Windows for the Holidays",
    facebook: [
      "Hosting family this year? ✨ Get your windows streak-free before the holidays. Exterior window washing starts at $199, and interior + exterior from $329. Book at brightsidegutters.example/book.",
      "Let the holiday lights shine through. Exterior window washing from $199, inside and out from $329. Our pure-water system leaves zero streaks. Call (919) 555-0142.",
    ],
    instagram: [
      "Holiday guests are coming. Are your windows ready? ✨ Exterior from $199. #BrightsideGutters #RaleighHomes",
      "Streak-free for the holidays. Inside and out from $329. #BrightsideGutters #TriangleLiving",
    ],
    gbp: "Get holiday-ready windows. Exterior window washing from $199, interior and exterior from $329.",
  },
  {
    slug: "cary-showcase",
    status: "scheduled",
    when: et(21, 10),
    post_type: "showcase",
    headline: "Before & After in Cary",
    facebook: [
      "Before ➡️ after on a two-story in Cary this week. Three years of leaves out, downspouts flowing again, and not a leaf left on the lawn. That's our clean-up guarantee. 🏡",
      "This Cary homeowner hadn't had the gutters done in three years. One morning later: clear gutters, flowing downspouts, spotless yard. If we leave a mess, the job is free.",
    ],
    instagram: [
      "Three years of leaves, gone in one morning. 🏡 #BrightsideGutters #RaleighHomes",
      "Before ➡️ after in Cary. Clean gutters, clean yard. #BrightsideGutters #TriangleLiving",
    ],
    gbp: "Before and after: full gutter cleaning on a two-story home in Cary, with our clean-up guarantee.",
  },
  {
    slug: "fall-gutters",
    status: "pending",
    when: et(25, 9),
    post_type: "promo",
    headline: "Fall Gutter Cleaning",
    facebook: [
      "Leaves are coming down 🍂 Book your fall gutter cleaning before the first big storm. From $149 for single-story homes and $219 for two-story. Call (919) 555-0142 or book at brightsidegutters.example/book.",
      "Don't wait for the overflow. Fall gutter cleaning from $149 (single-story) or $219 (two-story), downspout flush included. Book at brightsidegutters.example/book.",
    ],
    instagram: [
      "Leaves falling = gutters filling. 🍂 Fall cleanings from $149. #BrightsideGutters #RaleighHomes",
      "Beat the first big storm. Gutter cleaning from $149. #BrightsideGutters #TriangleLiving",
    ],
    gbp: "Fall gutter cleaning from $149 for single-story homes and $219 for two-story homes. Book online today.",
  },
  {
    slug: "guard-tip",
    status: "pending",
    when: et(25, 16),
    post_type: "tip",
    headline: "Never Clean Gutters Again?",
    facebook: [
      "Tired of cleaning gutters every fall? Micro-mesh gutter guards keep leaves out and come with a 20-year warranty. We'll give you a free on-site quote: (919) 555-0142.",
      "Gutter guards aren't all the same. Ours are micro-mesh, so even pine needles stay out, backed by a 20-year warranty. Get a free quote at brightsidegutters.example/book.",
    ],
    instagram: [
      "What if you never had to clean your gutters again? Micro-mesh guards, 20-year warranty. #BrightsideGutters #RaleighHomes",
      "Pine needles, meet micro-mesh. Free on-site quotes. #BrightsideGutters #TriangleLiving",
    ],
    gbp: "Micro-mesh gutter guards with a 20-year warranty. Call (919) 555-0142 for a free on-site quote.",
  },
  {
    slug: "thanksgiving-hours",
    status: "pending",
    when: et(26, 8),
    post_type: "announcement",
    headline: "Closed Thanksgiving Day",
    facebook: [
      "Happy Thanksgiving from all of us at Brightside! 🦃 We're closed Thursday, Nov 27 so our crews can be with their families. We're back Friday at 8am. Book anytime at brightsidegutters.example/book.",
      "Our crews are taking Thanksgiving Day off to be with family. We're closed Thursday, Nov 27 and back Friday at 8am. Thank you for a great year, neighbors.",
    ],
    instagram: [
      "Closed Thursday, Nov 27 for Thanksgiving. 🦃 Back Friday at 8am. #BrightsideGutters #TriangleLiving",
      "Grateful for our neighbors. Closed Thanksgiving Day, back Friday. #BrightsideGutters #RaleighHomes",
    ],
    gbp: "We're closed Thursday, Nov 27 for Thanksgiving and reopen Friday at 8am.",
  },
  {
    slug: "bundle",
    status: "scheduled",
    when: et(28, 9),
    post_type: "promo",
    headline: "$50 Off the Bundle",
    facebook: [
      "Two jobs, one visit, $50 off. Book gutter cleaning and exterior window washing together with our Gutter + Window Bundle. Book at brightsidegutters.example/book.",
      "Doing gutters this fall? Add exterior windows and save $50 with the Gutter + Window Bundle. Call (919) 555-0142.",
    ],
    instagram: [
      "Gutters + windows in one visit, $50 off. #BrightsideGutters #RaleighHomes",
      "Bundle and save $50 this season. #BrightsideGutters #TriangleLiving",
    ],
    gbp: "Save $50 when you book gutter cleaning and exterior window washing together.",
  },
];

const business = await getBusiness(BUSINESS);
if (!business) throw new Error(`Run npm run seed first (missing ${BUSINESS})`);

const existing = await listDrafts(BUSINESS);
const seeded = new Set(existing.map((d) => d.request).filter((r) => r?.startsWith("demo:")));

for (const demo of DEMOS) {
  const tag = `demo:${demo.slug}`;
  if (seeded.has(tag)) {
    console.log(`skip  ${demo.slug} (already seeded)`);
    continue;
  }
  const image = await composeBrandedGraphic(business, demo.headline);
  const key = businessKey(BUSINESS, "generated", `${ulid()}.jpg`);
  await putMedia(BUSINESS, key, image, "image/jpeg");

  const draft = await createDraft(BUSINESS, {
    request: tag,
    post_type: demo.post_type,
    target_date: demo.when,
    image_keys: [key],
    copy: {
      facebook: { caption: demo.facebook[0], variants: [demo.facebook[1]] },
      instagram: { caption: demo.instagram[0], variants: [demo.instagram[1]] },
      gbp: { caption: demo.gbp },
    },
  });
  if (demo.status === "scheduled") {
    await setDraftStatus(BUSINESS, draft.draft_id, "pending", "scheduled", { scheduled_at: demo.when });
  } else if (demo.status === "skipped") {
    await setDraftStatus(BUSINESS, draft.draft_id, "pending", "skipped");
  }
  console.log(`added ${demo.slug.padEnd(20)} ${demo.status.padEnd(10)} ${demo.when}`);
}
