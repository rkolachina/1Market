// Thin client for the 1Market API. Auth headers are added in step 2 (Cognito).

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? "Something went wrong");
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
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
}

export interface Draft {
  draft_id: string;
  status: DraftStatus;
  post_type?: string;
  request?: string;
  copy: Partial<Record<Platform, { caption: string; variants?: string[]; cta?: string }>>;
  image_urls: string[];
  scheduled_at?: string;
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
