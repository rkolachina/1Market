// Experiment: send a post to a Make scenario, which publishes it to a Facebook Page.
//
// Usage:
//   npm run post:test -- --caption "Hello from 1Market" [--image https://example.com/photo.jpg]
//
// Requires MAKE_WEBHOOK_URL in .env (and MAKE_API_KEY if the webhook has key auth enabled).

import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    caption: { type: "string", default: "Test post from 1Market 🚀" },
    image: { type: "string" },
    business: { type: "string", default: "test-business" },
  },
});

const webhookUrl = process.env.MAKE_WEBHOOK_URL;
if (!webhookUrl) {
  console.error("MAKE_WEBHOOK_URL is not set in .env");
  process.exit(1);
}

const payload = {
  business_id: values.business,
  platform: "facebook",
  caption: values.caption,
  image_url: values.image ?? "",
};

const headers: Record<string, string> = { "Content-Type": "application/json" };
if (process.env.MAKE_API_KEY) headers["x-make-apikey"] = process.env.MAKE_API_KEY;

console.log("Sending to Make:", payload);

const res = await fetch(webhookUrl, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});

const text = await res.text();
let body: unknown = text;
try {
  body = JSON.parse(text);
} catch {
  // Make returns plain "Accepted" when the scenario has no Webhook Response module.
}

console.log(`Make responded ${res.status}:`, body);

if (!res.ok) process.exit(1);

const postId = (body as { post_id?: string })?.post_id;
if (postId) {
  console.log(`Post link: https://www.facebook.com/${postId}`);
}
