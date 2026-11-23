// Scheduled publishing: one EventBridge Scheduler one-time schedule per scheduled draft.
// At scheduled_at it invokes the publisher Lambda with { businessId, draftId, scheduledAt }.
// Configured by PUBLISHER_FUNCTION_ARN + SCHEDULER_ROLE_ARN (set on the deployed API).
// Without them (plain local dev) nothing is scheduled; the draft is still marked scheduled.

import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { config } from "../config.js";

let scheduler: SchedulerClient | undefined;

export interface PublishJob {
  businessId: string;
  draftId: string;
  /** The scheduled_at this schedule was made for; if the draft moved since, the publisher skips. */
  scheduledAt: string;
}

const scheduleName = (draftId: string) => `publish-${draftId}`;
const targetArn = () => process.env.PUBLISHER_FUNCTION_ARN;
const roleArn = () => process.env.SCHEDULER_ROLE_ARN;

/** Create (or replace) the schedule that publishes this draft at `at` (ISO UTC). */
export async function schedulePublish(businessId: string, draftId: string, at: string): Promise<void> {
  const arn = targetArn();
  const role = roleArn();
  if (!arn || !role) {
    console.warn(`Scheduler not configured: draft ${draftId} won't publish automatically at ${at}`);
    return;
  }
  await cancelPublish(draftId);
  scheduler ??= new SchedulerClient({ region: config.region });
  const job: PublishJob = { businessId, draftId, scheduledAt: at };
  await scheduler.send(
    new CreateScheduleCommand({
      Name: scheduleName(draftId),
      ScheduleExpression: `at(${new Date(at).toISOString().slice(0, 19)})`,
      ScheduleExpressionTimezone: "UTC",
      FlexibleTimeWindow: { Mode: "OFF" },
      ActionAfterCompletion: "DELETE",
      Target: {
        Arn: arn,
        RoleArn: role,
        Input: JSON.stringify(job),
        RetryPolicy: { MaximumRetryAttempts: 3, MaximumEventAgeInSeconds: 3600 },
      },
    }),
  );
}

/** Remove a draft's schedule if it has one. */
export async function cancelPublish(draftId: string): Promise<void> {
  if (!targetArn() || !roleArn()) return;
  scheduler ??= new SchedulerClient({ region: config.region });
  try {
    await scheduler.send(new DeleteScheduleCommand({ Name: scheduleName(draftId) }));
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }
}
