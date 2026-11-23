// Starts the agent for a request without making the caller wait.
// Deployed (AGENT_QUEUE_URL set): sends a job to SQS; the agent Lambda picks it up.
// Locally: runs in the background in this process.

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { config } from "../config.js";
import { runRequest } from "./run.js";

let sqs: SQSClient | undefined;

export interface AgentJob {
  businessId: string;
  requestId: string;
}

export async function dispatchRequest(job: AgentJob): Promise<void> {
  const queueUrl = process.env.AGENT_QUEUE_URL;
  if (queueUrl) {
    sqs ??= new SQSClient({ region: config.region });
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job) }));
    return;
  }
  void runRequest(job.businessId, job.requestId).catch((err) => console.error("background agent run failed", err));
}
