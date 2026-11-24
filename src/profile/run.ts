// Runs a website import for a business and stores the result for the owner to review.
// Called in-process by the local API, and by the agent Lambda (SQS) when deployed.

import { getBusiness, setProfileImport } from "../db/index.js";
import { importFromWebsite } from "./import.js";

export async function runProfileImport(businessId: string): Promise<void> {
  const business = await getBusiness(businessId);
  const job = business?.profile_import;
  if (!job || job.status !== "running") return; // dismissed, or already finished (retried message)
  const onlyIf = { status: "running" as const, url: job.url };
  try {
    const result = await importFromWebsite(job.url);
    await setProfileImport(
      businessId,
      result.site_readable
        ? { ...job, status: "done", result, finished_at: new Date().toISOString() }
        : { ...job, status: "failed", error: "We couldn't read that website. Check the address, or fill in the details yourself.", finished_at: new Date().toISOString() },
      onlyIf,
    );
  } catch (err) {
    console.error(`profile import for ${businessId} failed`, err);
    try {
      await setProfileImport(
        businessId,
        { ...job, status: "failed", error: "We couldn't read that website. Please try again, or fill in the details yourself.", finished_at: new Date().toISOString() },
        onlyIf,
      );
    } catch (e) {
      if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
    }
  }
}
