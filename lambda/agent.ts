// Agent Lambda: runs owner requests from the SQS queue (one at a time per invocation).
import type { SQSEvent } from "aws-lambda";
import { type AgentJob } from "../src/requests/dispatch.js";
import { runRequest } from "../src/requests/run.js";
import { loadApiKeys } from "../src/secrets.js";

export async function handler(event: SQSEvent): Promise<void> {
  await loadApiKeys();
  for (const record of event.Records) {
    const job = JSON.parse(record.body) as AgentJob;
    // runRequest records failures on the request itself, so the owner sees them in the app.
    await runRequest(job.businessId, job.requestId);
  }
}
