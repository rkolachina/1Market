// Runs one owner request through the agent and records the outcome on the request.
// Called in-process by the local API, and by the agent Lambda (SQS) when deployed.

import { invokeAgent } from "../agent/index.js";
import { getRequest, setRequestStatus } from "../db/index.js";

const FRIENDLY_ERROR = "Something went wrong while making this post. Please try again.";

export async function runRequest(businessId: string, requestId: string): Promise<void> {
  const req = await getRequest(businessId, requestId);
  if (!req) {
    console.warn(`runRequest: ${businessId}/${requestId} not found`);
    return;
  }
  // Claim it. If another worker already did (a retried queue message), stop here.
  try {
    await setRequestStatus(businessId, requestId, "queued", "running");
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") return;
    throw err;
  }

  try {
    const outcome = await invokeAgent({
      businessId,
      request: req.request,
      photoKey: req.photo_key,
      answers: req.answers,
      targetDate: req.target_date,
    });
    if (outcome.kind === "draft") {
      await setRequestStatus(businessId, requestId, "running", "done", {
        result: { kind: "draft", draft_id: outcome.draft_id, message: outcome.message },
      });
    } else if (outcome.kind === "question") {
      await setRequestStatus(businessId, requestId, "running", "done", {
        result: { kind: "question", questions: outcome.questions, message: outcome.message },
      });
    } else {
      console.error(`runRequest ${requestId}: agent error: ${outcome.message}`);
      await setRequestStatus(businessId, requestId, "running", "failed", { error: FRIENDLY_ERROR });
    }
  } catch (err) {
    console.error(`runRequest ${requestId} failed`, err);
    await setRequestStatus(businessId, requestId, "running", "failed", { error: FRIENDLY_ERROR });
  }
}
