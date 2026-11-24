// Agent Lambda: runs background jobs from the SQS queue (owner post requests and
// website imports), one at a time per invocation.
import type { SQSEvent } from "aws-lambda";
import { type AgentJob, runJob } from "../src/requests/dispatch.js";
import { loadApiKeys } from "../src/secrets.js";

export async function handler(event: SQSEvent): Promise<void> {
  await loadApiKeys();
  for (const record of event.Records) {
    // Jobs record their own failures (on the request or the business), so the owner sees them in the app.
    await runJob(JSON.parse(record.body) as AgentJob);
  }
}
