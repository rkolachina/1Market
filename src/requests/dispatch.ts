// Starts background work without making the caller wait: an owner's post request, or
// filling in a profile from a website.
// Deployed (AGENT_QUEUE_URL set): sends a job to SQS; the agent Lambda picks it up.
// Locally: runs in the background in this process.

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { config } from "../config.js";
import { runProfileImport } from "../profile/run.js";
import { runRequest } from "./run.js";

let sqs: SQSClient | undefined;

export type AgentJob =
  | { kind?: "post"; businessId: string; requestId: string }
  | { kind: "profile_import"; businessId: string };

/** Run one job (used by the agent Lambda and by local dev). */
export function runJob(job: AgentJob): Promise<void> {
  return job.kind === "profile_import" ? runProfileImport(job.businessId) : runRequest(job.businessId, job.requestId);
}

export async function dispatchRequest(job: AgentJob): Promise<void> {
  const queueUrl = process.env.AGENT_QUEUE_URL;
  if (queueUrl) {
    sqs ??= new SQSClient({ region: config.region });
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job) }));
    return;
  }
  void runJob(job).catch((err) => console.error("background job failed", err));
}
