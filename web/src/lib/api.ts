// Thin client for the 1Market API. Sends the Cognito ID token on every request.
import { getIdToken } from "./auth";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  }).catch(() => {
    throw new ApiError(0, "We couldn't reach 1Market. Check your connection and try again.");
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const b = body as { error?: string; code?: string };
    throw new ApiError(res.status, b.error ?? "Something went wrong", b.code);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  upload: <T>(path: string, file: File) =>
    request<T>(path, { method: "POST", body: file, headers: { "Content-Type": file.type } }),
};

// ---- Shared shapes (mirrors src/db on the backend) ----

export type DraftStatus = "pending" | "approved" | "scheduled" | "publishing" | "posted" | "skipped" | "expired" | "failed";
export type Platform = "facebook" | "instagram" | "gbp";

export interface Profile {
  business_id: string;
  name: string;
  profile: Record<string, unknown>;
  brand_kit: Record<string, unknown>;
  settings: Record<string, unknown>;
  logo_url: string | null;
  /** Filling in the profile from the business's website. */
  profile_import: ProfileImport | null;
}

export interface ImportedProfile {
  name: string;
  tagline: string;
  description: string;
  phone: string;
  email: string;
  booking_url: string;
  hours: string;
  services: { name: string; price: string; notes: string }[];
  current_offers: { name: string; details: string; valid_until: string }[];
  service_area: string[];
  differentiators: string[];
  tone_of_voice: string;
  audience: string;
}

export interface ProfileImport {
  status: "running" | "done" | "failed";
  url: string;
  result?: ImportedProfile;
  error?: string;
}

export interface Draft {
  draft_id: string;
  status: DraftStatus;
  post_type?: string;
  request?: string;
  copy: Partial<Record<Platform, { caption: string; variants?: string[]; cta?: string }>>;
  image_urls: string[];
  target_date?: string;
  scheduled_at?: string;
  last_error?: string;
  publish_results?: Partial<Record<Platform, { url?: string; error?: string }>>;
  created_at: string;
}

export interface Post {
  post_key: string;
  draft_id: string;
  platform: Platform;
  url?: string;
  caption?: string;
  post_type?: string;
  posted_at: string;
}

export type RequestStatus = "queued" | "running" | "done" | "failed";

/** An owner's request to the assistant and how it's going. */
export interface AssistantRequest {
  request_id: string;
  status: RequestStatus;
  request: string;
  result?: { kind: "draft"; draft_id: string; message: string } | { kind: "question"; questions: string[]; message: string };
  error?: string;
  created_at: string;
}

/** Upload a file straight to S3 with a presigned PUT URL from the API. */
export async function uploadToS3(url: string, file: File): Promise<void> {
  const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } }).catch(() => {
    throw new ApiError(0, "We couldn't upload your photo. Check your connection and try again.");
  });
  if (!res.ok) throw new ApiError(res.status, "We couldn't upload your photo. Please try again.");
}

/** A recommended post idea (Recommendations page). */
export interface Idea {
  id: string;
  title: string;
  why_now: string;
  /** What gets sent to the assistant; the owner can edit it first. */
  request: string;
  post_type: string;
  /** YYYY-MM-DD */
  suggested_date: string;
  wants_photo: boolean;
  used?: boolean;
}

export interface IdeasState {
  status: "none" | "running" | "done" | "failed";
  items: Idea[];
  generated_at: string | null;
  error?: string;
  /** Older than a week: time for fresh ideas. */
  expired: boolean;
}
