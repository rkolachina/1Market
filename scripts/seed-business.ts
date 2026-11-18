// Seed the fictional demo business: profile row, a generated logo in S3,
// and a few past posts so the agent has history to look at.
//
// Usage: npm run seed

import { readFileSync } from "node:fs";
import sharp from "sharp";
import { type Business, listPosts, putBusiness, recordPost } from "../src/db/index.js";
import { putMedia } from "../src/media/index.js";

const seed = JSON.parse(readFileSync("seed/brightside/profile.json", "utf8")) as Business & {
  brand_kit: { colors: Record<string, string>; logo_key: string };
};
const { business_id: id, brand_kit } = seed;

// Simple generated logo: blue rounded square, sun + house mark, wordmark.
const { primary, accent } = brand_kit.colors;
const logoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" rx="96" fill="${primary}"/>
  <circle cx="300" cy="230" r="70" fill="${accent}"/>
  <g stroke="${accent}" stroke-width="14" stroke-linecap="round">
    <line x1="300" y1="120" x2="300" y2="140"/><line x1="190" y1="230" x2="210" y2="230"/>
    <line x1="390" y1="230" x2="410" y2="230"/><line x1="222" y1="152" x2="236" y2="166"/>
    <line x1="378" y1="152" x2="364" y2="166"/>
  </g>
  <path d="M170 330 L300 240 L430 330 V410 H170 Z" fill="#FFFFFF"/>
  <rect x="270" y="350" width="60" height="60" fill="${primary}"/>
  <text x="300" y="500" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="64" font-weight="700" fill="#FFFFFF">BRIGHTSIDE</text>
  <text x="300" y="550" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="30" fill="#FFFFFF" letter-spacing="4">GUTTER &amp; WINDOW CO.</text>
</svg>`;
const logo = await sharp(Buffer.from(logoSvg)).png().toBuffer();
await putMedia(id, brand_kit.logo_key, logo, "image/png");
console.log(`Logo uploaded: ${brand_kit.logo_key}`);

await putBusiness(seed);
console.log(`Business saved: ${id} (${seed.name})`);

// Past posts (only seeded once)
const existing = await listPosts(id, 10);
if (existing.length === 0) {
  const day = 24 * 60 * 60 * 1000;
  const history = [
    {
      daysAgo: 21,
      post_type: "tip",
      caption:
        "Quick tip from the crew 🍂 If water spills over the top of your gutters when it rains, they're probably clogged — not broken. A cleaning usually fixes it. Call (919) 555-0142 or book online.",
    },
    {
      daysAgo: 12,
      post_type: "showcase",
      caption:
        "Before ➡️ after on a two-story in Cary this week. Three years of leaves out, downspouts flowing again, and not a single leaf left on the lawn. That's our clean-up guarantee. 🏡",
    },
    {
      daysAgo: 4,
      post_type: "promo",
      caption:
        "Doing gutters this fall? Add exterior window washing and save $50 with our Gutter + Window Bundle. Book at brightsidegutters.example/book ✨",
    },
  ];
  for (const [i, h] of history.entries()) {
    await recordPost(id, {
      draft_id: `seed_${i}`,
      platform: "facebook",
      platform_post_id: `seed_post_${i}`,
      caption: h.caption,
      post_type: h.post_type,
      posted_at: new Date(Date.now() - h.daysAgo * day).toISOString(),
    });
  }
  console.log(`Seeded ${history.length} past posts`);
} else {
  console.log(`Post history already present (${existing.length} posts), skipping`);
}
