// Draft lifecycle (plain code, no AI). Enforces which status moves are allowed.
//
//   pending ──approve──▶ approved ──publish──▶ publishing ──▶ posted
//      │                    │                      │
//      ├──schedule──▶ scheduled ──(at time)──▶ publishing └──▶ failed ──retry──▶ publishing
//      ├──skip──▶ skipped ──restore──▶ pending
//      └──expire──▶ expired

import {
  type Draft,
  type DraftStatus,
  type Platform,
  getDraft,
  setDraftStatus,
  updateDraftCaption,
  updateDraftImages,
} from "../db/index.js";

export const TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
  pending: ["approved", "scheduled", "skipped", "expired"],
  approved: ["publishing", "scheduled", "skipped"],
  scheduled: ["publishing", "pending", "skipped"],
  publishing: ["posted", "failed"],
  failed: ["publishing", "skipped"],
  posted: [],
  skipped: ["pending"], // the owner changed their mind
  expired: [],
};

export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftError";
  }
}

async function load(businessId: string, draftId: string): Promise<Draft> {
  const draft = await getDraft(businessId, draftId);
  if (!draft) throw new DraftError(`Draft ${draftId} not found`);
  return draft;
}

/** Move a draft to a new status if the transition is allowed. */
export async function transition(
  businessId: string,
  draftId: string,
  to: DraftStatus,
  extra: Parameters<typeof setDraftStatus>[4] = {},
): Promise<Draft> {
  const draft = await load(businessId, draftId);
  if (!TRANSITIONS[draft.status].includes(to)) {
    throw new DraftError(`Cannot move draft from "${draft.status}" to "${to}"`);
  }
  try {
    return await setDraftStatus(businessId, draftId, draft.status, to, extra);
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") {
      throw new DraftError(`Draft ${draftId} changed while updating; try again`);
    }
    throw err;
  }
}

export const approve = (b: string, d: string) => transition(b, d, "approved");
export const skip = (b: string, d: string) => transition(b, d, "skipped");
/** Bring a skipped draft back to "needs your OK". */
export const restore = (b: string, d: string) => transition(b, d, "pending");

export function schedule(businessId: string, draftId: string, scheduledAt: Date): Promise<Draft> {
  if (scheduledAt.getTime() <= Date.now()) throw new DraftError("scheduled time must be in the future");
  return transition(businessId, draftId, "scheduled", { scheduled_at: scheduledAt.toISOString() });
}

export async function editCaption(
  businessId: string,
  draftId: string,
  platform: Platform,
  newCaption: string,
): Promise<Draft> {
  const draft = await load(businessId, draftId);
  if (draft.status !== "pending") throw new DraftError("Only pending drafts can be edited");
  const before = draft.copy[platform]?.caption;
  if (before === undefined) throw new DraftError(`Draft has no ${platform} copy`);
  if (!newCaption.trim()) throw new DraftError("Caption cannot be empty");
  return updateDraftCaption(businessId, draftId, platform, before, newCaption);
}

export async function swapImages(businessId: string, draftId: string, imageKeys: string[]): Promise<Draft> {
  for (const key of imageKeys) {
    if (!key.startsWith(`businesses/${businessId}/`)) throw new DraftError(`Image ${key} is not this business's`);
  }
  return updateDraftImages(businessId, draftId, imageKeys);
}
