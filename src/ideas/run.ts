// Generates post ideas for a business in the background and stores them on the business.
import { getBusiness, listDraftsByStatus, listPosts, setIdeas } from "../db/index.js";
import { generateIdeas } from "./generate.js";

export async function runIdeas(businessId: string): Promise<void> {
  const business = await getBusiness(businessId);
  const state = business?.ideas;
  if (!business || !state || state.status !== "running") return;
  try {
    const [posts, pending, scheduled] = await Promise.all([
      listPosts(businessId, 15),
      listDraftsByStatus(businessId, "pending", 20),
      listDraftsByStatus(businessId, "scheduled", 20),
    ]);
    const items = await generateIdeas(business, posts, [...scheduled, ...pending]);
    await setIdeas(businessId, { status: "done", started_at: state.started_at, generated_at: new Date().toISOString(), items: items as unknown as Record<string, unknown>[] }, state.started_at);
  } catch (err) {
    console.error(`ideas for ${businessId} failed`, err);
    try {
      // Keep the previous ideas visible if there were any.
      await setIdeas(
        businessId,
        { ...state, status: "failed", error: "We couldn't come up with ideas just now. Please try again." },
        state.started_at,
      );
    } catch (e) {
      if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
    }
  }
}
