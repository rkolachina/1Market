// Data-access module. ALL reads and writes to the 1Market tables go through here.
// Every function requires a business_id, and every key starts with it, so one
// business can never read or write another business's records.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";

export const TABLES = {
  businesses: process.env.BUSINESSES_TABLE ?? "onemarket-businesses",
  drafts: process.env.DRAFTS_TABLE ?? "onemarket-drafts",
  posts: process.env.POSTS_TABLE ?? "onemarket-posts",
  requests: process.env.REQUESTS_TABLE ?? "onemarket-requests",
};

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

function requireBusinessId(businessId: string): string {
  if (!businessId || typeof businessId !== "string") {
    throw new Error("business_id is required");
  }
  return businessId;
}

// ---------- Businesses ----------

/** Filling in the profile from the business's website (reviewed by the owner before saving). */
export interface ProfileImport {
  status: "running" | "done" | "failed";
  url: string;
  started_at: string;
  finished_at?: string;
  /** Imported fields (see src/profile/import.ts), shown to the owner to review. */
  result?: Record<string, unknown>;
  /** Owner-facing message when status is failed. */
  error?: string;
}

export interface Business {
  business_id: string;
  name: string;
  profile?: Record<string, unknown>;
  brand_kit?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  profile_import?: ProfileImport;
  created_at: string;
  updated_at: string;
}

export async function createBusiness(
  input: Omit<Business, "business_id" | "created_at" | "updated_at"> & { business_id?: string },
): Promise<Business> {
  const now = new Date().toISOString();
  const item: Business = {
    ...input,
    business_id: input.business_id ?? `biz_${ulid()}`,
    created_at: now,
    updated_at: now,
  };
  await doc.send(
    new PutCommand({
      TableName: TABLES.businesses,
      Item: item,
      ConditionExpression: "attribute_not_exists(business_id)",
    }),
  );
  return item;
}

/** Create or fully replace a business (used by seed scripts and profile edits). */
export async function putBusiness(
  input: Omit<Business, "created_at" | "updated_at"> & { created_at?: string },
): Promise<Business> {
  const now = new Date().toISOString();
  const item: Business = {
    ...input,
    business_id: requireBusinessId(input.business_id),
    created_at: input.created_at ?? now,
    updated_at: now,
  };
  await doc.send(new PutCommand({ TableName: TABLES.businesses, Item: item }));
  return item;
}

export async function getBusiness(businessId: string): Promise<Business | undefined> {
  const res = await doc.send(
    new GetCommand({
      TableName: TABLES.businesses,
      Key: { business_id: requireBusinessId(businessId) },
    }),
  );
  return res.Item as Business | undefined;
}

/**
 * Set (or with null, clear) the website import on a business. With `onlyIf`, it only
 * writes while the import is still that status and URL (so a stale run can't overwrite a newer one).
 */
export async function setProfileImport(
  businessId: string,
  value: ProfileImport | null,
  onlyIf?: { status: ProfileImport["status"]; url: string },
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: TABLES.businesses,
      Key: { business_id: requireBusinessId(businessId) },
      UpdateExpression: value ? "SET profile_import = :v, updated_at = :now" : "REMOVE profile_import SET updated_at = :now",
      ConditionExpression: onlyIf
        ? "attribute_exists(business_id) AND profile_import.#s = :s AND profile_import.#u = :u"
        : "attribute_exists(business_id)",
      ExpressionAttributeNames: onlyIf ? { "#s": "status", "#u": "url" } : undefined,
      ExpressionAttributeValues: {
        ":now": new Date().toISOString(),
        ...(value ? { ":v": value } : {}),
        ...(onlyIf ? { ":s": onlyIf.status, ":u": onlyIf.url } : {}),
      },
    }),
  );
}

// ---------- Drafts ----------

export type DraftStatus =
  | "pending"
  | "approved"
  | "scheduled"
  | "publishing"
  | "posted"
  | "skipped"
  | "expired"
  | "failed";

export type Platform = "facebook" | "instagram" | "gbp";

export interface Draft {
  business_id: string;
  draft_id: string;
  status: DraftStatus;
  status_created: string; // "<status>#<created_at>" for the by_status index
  request?: string;
  post_type?: string;
  copy: Partial<Record<Platform, PlatformCopy>>;
  image_keys?: string[];
  /** The date/time the owner wants this posted (set before approval). */
  target_date?: string;
  scheduled_at?: string;
  /** Owner edits, kept for future style learning. */
  edits?: { platform: Platform; before: string; after: string; at: string }[];
  /** Per-platform publish results. */
  publish_results?: Partial<Record<Platform, { platform_post_id?: string; url?: string; error?: string; at: string }>>;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformCopy {
  caption: string;
  variants?: string[];
  cta?: string;
}

/** All drafts for a business, newest first (paginates through the partition). */
export async function listDrafts(businessId: string, max = 500): Promise<Draft[]> {
  const items: Draft[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: TABLES.drafts,
        KeyConditionExpression: "business_id = :b",
        ExpressionAttributeValues: { ":b": requireBusinessId(businessId) },
        ScanIndexForward: false,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((res.Items ?? []) as Draft[]));
    startKey = res.LastEvaluatedKey;
  } while (startKey && items.length < max);
  return items.slice(0, max);
}

/** Set the requested post date on a pending or scheduled draft (also moves scheduled_at). */
export async function setDraftDate(businessId: string, draftId: string, targetDate: string): Promise<Draft> {
  const res = await doc.send(
    new UpdateCommand({
      TableName: TABLES.drafts,
      Key: { business_id: requireBusinessId(businessId), draft_id: draftId },
      ConditionExpression: "#status IN (:pending, :scheduled)",
      UpdateExpression: "SET target_date = :d, updated_at = :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":pending": "pending",
        ":scheduled": "scheduled",
        ":d": targetDate,
        ":now": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  const d = res.Attributes as Draft;
  if (d.status === "scheduled") {
    // keep the schedule in step with the new date
    const r2 = await doc.send(
      new UpdateCommand({
        TableName: TABLES.drafts,
        Key: { business_id: businessId, draft_id: draftId },
        UpdateExpression: "SET scheduled_at = :d",
        ExpressionAttributeValues: { ":d": targetDate },
        ReturnValues: "ALL_NEW",
      }),
    );
    return r2.Attributes as Draft;
  }
  return d;
}

export async function createDraft(
  businessId: string,
  input: Pick<Draft, "copy"> & Partial<Pick<Draft, "request" | "image_keys" | "post_type" | "target_date">>,
): Promise<Draft> {
  const now = new Date().toISOString();
  const item: Draft = {
    ...input,
    business_id: requireBusinessId(businessId),
    draft_id: `drf_${ulid()}`,
    status: "pending",
    status_created: `pending#${now}`,
    created_at: now,
    updated_at: now,
  };
  await doc.send(new PutCommand({ TableName: TABLES.drafts, Item: item }));
  return item;
}

export async function getDraft(businessId: string, draftId: string): Promise<Draft | undefined> {
  const res = await doc.send(
    new GetCommand({
      TableName: TABLES.drafts,
      Key: { business_id: requireBusinessId(businessId), draft_id: draftId },
    }),
  );
  return res.Item as Draft | undefined;
}

/** Newest first. */
export async function listDraftsByStatus(
  businessId: string,
  status: DraftStatus,
  limit = 50,
): Promise<Draft[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLES.drafts,
      IndexName: "by_status",
      KeyConditionExpression: "business_id = :b AND begins_with(status_created, :s)",
      ExpressionAttributeValues: { ":b": requireBusinessId(businessId), ":s": `${status}#` },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []) as Draft[];
}

/**
 * Low-level status write. Only succeeds if the draft is currently in `from`.
 * Transition rules (which moves are allowed) live in the draft service (Step 5).
 */
export async function setDraftStatus(
  businessId: string,
  draftId: string,
  from: DraftStatus,
  to: DraftStatus,
  extra: Partial<Pick<Draft, "scheduled_at" | "publish_results" | "last_error">> = {},
): Promise<Draft> {
  const now = new Date().toISOString();
  const sets = ["#status = :to", "status_created = :sc", "updated_at = :now"];
  const values: Record<string, unknown> = { ":from": from, ":to": to, ":sc": `${to}#${now}`, ":now": now };
  if (extra.scheduled_at !== undefined) {
    sets.push("scheduled_at = :sa");
    values[":sa"] = extra.scheduled_at;
  }
  if (extra.publish_results !== undefined) {
    sets.push("publish_results = :pr");
    values[":pr"] = extra.publish_results;
  }
  if (extra.last_error !== undefined) {
    sets.push("last_error = :le");
    values[":le"] = extra.last_error;
  }
  const res = await doc.send(
    new UpdateCommand({
      TableName: TABLES.drafts,
      Key: { business_id: requireBusinessId(businessId), draft_id: draftId },
      ConditionExpression: "#status = :from",
      UpdateExpression: "SET " + sets.join(", "),
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return res.Attributes as Draft;
}

/** Replace one platform's caption on a pending draft, recording before/after. */
export async function updateDraftCaption(
  businessId: string,
  draftId: string,
  platform: Platform,
  before: string,
  after: string,
): Promise<Draft> {
  const now = new Date().toISOString();
  const res = await doc.send(
    new UpdateCommand({
      TableName: TABLES.drafts,
      Key: { business_id: requireBusinessId(businessId), draft_id: draftId },
      ConditionExpression: "#status = :pending AND #copy.#p.caption = :before",
      UpdateExpression:
        "SET #copy.#p.caption = :after, updated_at = :now, edits = list_append(if_not_exists(edits, :empty), :edit)",
      ExpressionAttributeNames: { "#status": "status", "#copy": "copy", "#p": platform },
      ExpressionAttributeValues: {
        ":pending": "pending",
        ":before": before,
        ":after": after,
        ":now": now,
        ":empty": [],
        ":edit": [{ platform, before, after, at: now }],
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  return res.Attributes as Draft;
}

/** Replace image keys on a pending draft. */
export async function updateDraftImages(businessId: string, draftId: string, imageKeys: string[]): Promise<Draft> {
  const res = await doc.send(
    new UpdateCommand({
      TableName: TABLES.drafts,
      Key: { business_id: requireBusinessId(businessId), draft_id: draftId },
      ConditionExpression: "#status = :pending",
      UpdateExpression: "SET image_keys = :k, updated_at = :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":pending": "pending", ":k": imageKeys, ":now": new Date().toISOString() },
      ReturnValues: "ALL_NEW",
    }),
  );
  return res.Attributes as Draft;
}

// ---------- Posts ----------

export interface Post {
  business_id: string;
  post_key: string; // "<posted_at>#<platform>#<platform_post_id>"
  draft_id: string;
  platform: Platform;
  platform_post_id: string;
  url?: string;
  caption?: string;
  post_type?: string;
  posted_at: string;
}

export async function recordPost(
  businessId: string,
  input: Omit<Post, "business_id" | "post_key" | "posted_at"> & { posted_at?: string },
): Promise<Post> {
  const postedAt = input.posted_at ?? new Date().toISOString();
  const item: Post = {
    ...input,
    business_id: requireBusinessId(businessId),
    posted_at: postedAt,
    post_key: `${postedAt}#${input.platform}#${input.platform_post_id}`,
  };
  await doc.send(new PutCommand({ TableName: TABLES.posts, Item: item }));
  return item;
}

/** Newest first. */
export async function listPosts(businessId: string, limit = 50): Promise<Post[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLES.posts,
      KeyConditionExpression: "business_id = :b",
      ExpressionAttributeValues: { ":b": requireBusinessId(businessId) },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []) as Post[];
}

// ---------- Requests (owner asks the assistant for a post) ----------

export type RequestStatus = "queued" | "running" | "done" | "failed";

export type RequestResult =
  | { kind: "draft"; draft_id: string; message: string }
  | { kind: "question"; questions: string[]; message: string };

export interface AgentRequestRecord {
  business_id: string;
  request_id: string;
  status: RequestStatus;
  request: string;
  /** Owner's answers to the assistant's questions (set when they reply). */
  answers?: string;
  /** S3 key of an attached photo, under businesses/<business_id>/uploads/. */
  photo_key?: string;
  /** When the owner wants it posted (ISO UTC). */
  target_date?: string;
  result?: RequestResult;
  /** Owner-facing error message when status is failed. */
  error?: string;
  created_at: string;
  updated_at: string;
  /** TTL (epoch seconds). */
  expires_at: number;
}

export async function createRequest(
  businessId: string,
  input: Pick<AgentRequestRecord, "request"> & Partial<Pick<AgentRequestRecord, "photo_key" | "target_date">>,
): Promise<AgentRequestRecord> {
  const now = new Date();
  const item: AgentRequestRecord = {
    ...input,
    business_id: requireBusinessId(businessId),
    request_id: `req_${ulid()}`,
    status: "queued",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: Math.floor(now.getTime() / 1000) + 30 * 24 * 3600,
  };
  await doc.send(new PutCommand({ TableName: TABLES.requests, Item: item }));
  return item;
}

export async function getRequest(businessId: string, requestId: string): Promise<AgentRequestRecord | undefined> {
  const res = await doc.send(
    new GetCommand({
      TableName: TABLES.requests,
      Key: { business_id: requireBusinessId(businessId), request_id: requestId },
    }),
  );
  return res.Item as AgentRequestRecord | undefined;
}

/**
 * Move a request from one status to another, setting fields on the way. Only succeeds if
 * it is currently in `from` (so a retried queue message never runs the agent twice).
 * `remove` deletes fields (e.g. the previous result when the owner answers questions).
 */
export async function setRequestStatus(
  businessId: string,
  requestId: string,
  from: RequestStatus,
  to: RequestStatus,
  fields: Partial<Pick<AgentRequestRecord, "result" | "error" | "answers">> = {},
  remove: ("result" | "error")[] = [],
): Promise<AgentRequestRecord> {
  // Names go through #placeholders: "result" and "status" are DynamoDB reserved words.
  const sets = ["#status = :to", "updated_at = :now"];
  const names: Record<string, string> = { "#status": "status" };
  const values: Record<string, unknown> = { ":from": from, ":to": to, ":now": new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    sets.push(`#${k} = :${k}`);
    names[`#${k}`] = k;
    values[`:${k}`] = v;
  }
  for (const k of remove) names[`#${k}`] = k;
  const res = await doc.send(
    new UpdateCommand({
      TableName: TABLES.requests,
      Key: { business_id: requireBusinessId(businessId), request_id: requestId },
      ConditionExpression: "#status = :from",
      UpdateExpression: "SET " + sets.join(", ") + (remove.length ? " REMOVE " + remove.map((k) => `#${k}`).join(", ") : ""),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }),
  );
  return res.Attributes as AgentRequestRecord;
}
