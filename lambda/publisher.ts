// Publisher Lambda: called by EventBridge Scheduler when a scheduled draft's time comes.
import { getDraft } from "../src/db/index.js";
import { publish } from "../src/publish/index.js";
import { type PublishJob } from "../src/schedule/index.js";

export async function handler(job: PublishJob): Promise<void> {
  const draft = await getDraft(job.businessId, job.draftId);
  if (!draft || draft.status !== "scheduled") {
    console.log(`Skip ${job.draftId}: status is ${draft?.status ?? "missing"}, not scheduled`);
    return;
  }
  if (draft.scheduled_at !== job.scheduledAt) {
    console.log(`Skip ${job.draftId}: moved to ${draft.scheduled_at} (this run was for ${job.scheduledAt})`);
    return;
  }
  const result = await publish(job.businessId, job.draftId);
  console.log(`Published ${job.draftId}: ${result.status}${result.last_error ? ` (${result.last_error})` : ""}`);
}
