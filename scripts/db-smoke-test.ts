// Step 1 "done when": create a business and a draft, read both back,
// and prove one business cannot read another business's draft.
//
// Usage: npm run db:smoke

import {
  createBusiness,
  createDraft,
  getBusiness,
  getDraft,
  listDraftsByStatus,
  listPosts,
  recordPost,
  setDraftStatus,
} from "../src/db/index.js";

function check(label: string, ok: boolean) {
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) process.exitCode = 1;
}

const runTag = new Date().toISOString();

const bizA = await createBusiness({ name: `Smoke Test A ${runTag}`, profile: { tone: "friendly" } });
const bizB = await createBusiness({ name: `Smoke Test B ${runTag}` });
console.log("Businesses:", bizA.business_id, bizB.business_id);

const readA = await getBusiness(bizA.business_id);
check("business A reads back", readA?.name === bizA.name);

const draft = await createDraft(bizA.business_id, {
  request: "post about our fall special",
  copy: { facebook: { caption: "Fall special: 20% off this week 🍂" } },
});
console.log("Draft:", draft.draft_id);

const readDraft = await getDraft(bizA.business_id, draft.draft_id);
check("draft reads back for its own business", readDraft?.copy.facebook?.caption === draft.copy.facebook?.caption);

const pendingA = await listDraftsByStatus(bizA.business_id, "pending");
check("draft appears in A's pending list", pendingA.some((d) => d.draft_id === draft.draft_id));

// Tenant isolation
const leaked = await getDraft(bizB.business_id, draft.draft_id);
check("business B CANNOT read A's draft", leaked === undefined);

const pendingB = await listDraftsByStatus(bizB.business_id, "pending");
check("A's draft does not appear in B's pending list", !pendingB.some((d) => d.draft_id === draft.draft_id));

let crossUpdateBlocked = false;
try {
  await setDraftStatus(bizB.business_id, draft.draft_id, "pending", "approved");
} catch (err) {
  crossUpdateBlocked = (err as Error).name === "ConditionalCheckFailedException";
}
check("business B CANNOT change A's draft status", crossUpdateBlocked);

// Status change + post record
const approved = await setDraftStatus(bizA.business_id, draft.draft_id, "pending", "approved");
check("A can approve its own draft", approved.status === "approved");

await recordPost(bizA.business_id, {
  draft_id: draft.draft_id,
  platform: "facebook",
  platform_post_id: "smoke_test_post",
});
const postsA = await listPosts(bizA.business_id);
const postsB = await listPosts(bizB.business_id);
check("post recorded for A", postsA.some((p) => p.draft_id === draft.draft_id));
check("B sees no posts", postsB.length === 0);

console.log(process.exitCode ? "\nSMOKE TEST FAILED" : "\nSMOKE TEST PASSED");
