// Send a request to the agent, like the owner would from the app.
//
//   npm run agent -- "post about our fall gutter special"
//   npm run agent -- "show off this job" --photo ./before-after.jpg
//   npm run agent -- "post about our fall special" --answers "20% off, through Nov 30, gutter cleaning only"

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import { ulid } from "ulid";
import { invokeAgent } from "../src/agent/index.js";
import { businessKey, putMedia } from "../src/media/index.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    business: { type: "string", default: "biz_demo_brightside" },
    photo: { type: "string" },
    answers: { type: "string" },
  },
});

const request = positionals.join(" ");
if (!request) {
  console.error('Usage: npm run agent -- "your request" [--photo path] [--answers "..."]');
  process.exit(1);
}

let photoKey: string | undefined;
if (values.photo) {
  const ext = extname(values.photo).toLowerCase() || ".jpg";
  photoKey = businessKey(values.business!, "uploads", `${ulid()}${ext}`);
  await putMedia(values.business!, photoKey, readFileSync(values.photo), ext === ".png" ? "image/png" : "image/jpeg");
}

const started = Date.now();
const outcome = await invokeAgent({ businessId: values.business!, request, photoKey, answers: values.answers });
const secs = ((Date.now() - started) / 1000).toFixed(1);

switch (outcome.kind) {
  case "draft":
    console.log(`\n✅ Draft ready (${secs}s): ${outcome.draft_id}\n`);
    console.log(`Facebook caption:\n${outcome.facebook_caption}\n`);
    if (outcome.image_key) console.log(`Image: s3://…/${outcome.image_key}`);
    console.log(`\nAgent: ${outcome.message}`);
    console.log(`\nReview:  npm run drafts -- show ${outcome.draft_id}`);
    console.log(`Approve: npm run drafts -- approve ${outcome.draft_id}`);
    break;
  case "question":
    console.log(`\n❓ The agent needs more info (${secs}s):`);
    for (const q of outcome.questions) console.log(`  - ${q}`);
    console.log(`\nAnswer with: npm run agent -- "${request}" --answers "..."`);
    break;
  case "error":
    console.log(`\n❌ ${outcome.message}`);
    process.exitCode = 1;
}
