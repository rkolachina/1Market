// Owner actions on drafts, from the command line (the web app replaces this later).
//
//   npm run drafts -- list    [--business ID] [--status pending]
//   npm run drafts -- show    <draft_id>
//   npm run drafts -- create  --caption "..." [--image path.jpg]   (manual draft, no AI)
//   npm run drafts -- approve <draft_id>     (approve + publish now)
//   npm run drafts -- edit    <draft_id> --caption "new text"
//   npm run drafts -- skip    <draft_id>
//   npm run drafts -- retry   <draft_id>     (re-publish a failed draft)

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import { ulid } from "ulid";
import { type DraftStatus, createDraft, getDraft, listDraftsByStatus } from "../src/db/index.js";
import { approve, editCaption, skip } from "../src/drafts/service.js";
import { businessKey, putMedia } from "../src/media/index.js";
import { publish } from "../src/publish/index.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    business: { type: "string", default: "biz_demo_brightside" },
    status: { type: "string", default: "pending" },
    caption: { type: "string" },
    image: { type: "string" },
  },
});
const [command, draftId] = positionals;
const b = values.business!;

function need<T>(v: T | undefined, msg: string): T {
  if (v === undefined || v === "") {
    console.error(msg);
    process.exit(1);
  }
  return v;
}

switch (command) {
  case "list": {
    const drafts = await listDraftsByStatus(b, values.status as DraftStatus);
    if (drafts.length === 0) console.log(`No ${values.status} drafts.`);
    for (const d of drafts) {
      console.log(`${d.draft_id}  ${d.status.padEnd(10)} ${d.created_at}  ${(d.copy.facebook?.caption ?? "").slice(0, 70)}`);
    }
    break;
  }
  case "show": {
    console.log(JSON.stringify(await getDraft(b, need(draftId, "draft_id required")), null, 2));
    break;
  }
  case "create": {
    const caption = need(values.caption, "--caption required");
    let image_keys: string[] | undefined;
    if (values.image) {
      const ext = extname(values.image).toLowerCase() || ".jpg";
      const key = businessKey(b, "uploads", `${ulid()}${ext}`);
      const type = ext === ".png" ? "image/png" : "image/jpeg";
      await putMedia(b, key, readFileSync(values.image), type);
      image_keys = [key];
    }
    const d = await createDraft(b, { copy: { facebook: { caption } }, image_keys, post_type: "manual" });
    console.log(`Created pending draft ${d.draft_id}`);
    break;
  }
  case "approve": {
    const id = need(draftId, "draft_id required");
    await approve(b, id);
    console.log("Approved. Publishing…");
    const d = await publish(b, id);
    report(d);
    break;
  }
  case "retry": {
    report(await publish(b, need(draftId, "draft_id required")));
    break;
  }
  case "edit": {
    const d = await editCaption(b, need(draftId, "draft_id required"), "facebook", need(values.caption, "--caption required"));
    console.log(`Updated. New caption:\n${d.copy.facebook?.caption}`);
    break;
  }
  case "skip": {
    await skip(b, need(draftId, "draft_id required"));
    console.log("Skipped.");
    break;
  }
  default:
    console.error("Commands: list | show | create | approve | edit | skip | retry");
    process.exit(1);
}

function report(d: Awaited<ReturnType<typeof publish>>) {
  console.log(`Status: ${d.status}`);
  for (const [platform, r] of Object.entries(d.publish_results ?? {})) {
    console.log(`  ${platform}: ${r?.url ?? r?.error}`);
  }
  if (d.status === "failed") process.exitCode = 1;
}
