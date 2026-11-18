import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Draft, type Platform, type Post, type Profile } from "./api";

export const useProfile = () => useQuery({ queryKey: ["profile"], queryFn: () => api.get<Profile>("/profile") });
export const useAllDrafts = () => useQuery({ queryKey: ["drafts"], queryFn: () => api.get<Draft[]>("/drafts?status=all") });
export const useDraft = (id: string) =>
  useQuery({ queryKey: ["draft", id], queryFn: () => api.get<Draft>(`/drafts/${id}`) });
export const usePosts = () => useQuery({ queryKey: ["posts"], queryFn: () => api.get<Post[]>("/posts") });

type Action =
  | { kind: "approve" }
  | { kind: "post-now" }
  | { kind: "skip" }
  | { kind: "unschedule" }
  | { kind: "caption"; platform: Platform; caption: string }
  | { kind: "date"; target_date: string };

/** All owner actions on a draft; refreshes every list that could change. */
export function useDraftAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: Action }) => {
      switch (action.kind) {
        case "caption":
          return api.patch<Draft>(`/drafts/${id}/caption`, { platform: action.platform, caption: action.caption });
        case "date":
          return api.patch<Draft>(`/drafts/${id}/date`, { target_date: action.target_date });
        default:
          return api.post<Draft>(`/drafts/${id}/${action.kind}`);
      }
    },
    onSuccess: (draft) => {
      qc.setQueryData(["draft", draft.draft_id], draft);
      qc.invalidateQueries({ queryKey: ["drafts"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}
