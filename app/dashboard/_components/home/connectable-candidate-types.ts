export type ConnectableConfidence = "high" | "medium" | "low";

export type ConnectableSourceKind = "public_figure" | "general_person";

export type ConnectableCategory =
  | "business"
  | "sports"
  | "entertainment"
  | "culture"
  | "media"
  | "food"
  | "technology"
  | "finance"
  | "startup"
  | "public_service";

export type ConnectableCandidate = {
  pid: string;
  name: string;
  score: number;
  reason: string;
  bridgeHint: string;
  confidence: ConnectableConfidence;
  sourceKind: ConnectableSourceKind;
  category: ConnectableCategory;
  imageUrl?: string | null;
  badge?: string | null;
};

export type ConnectableCandidateSource = {
  pid: string;
  name: string;
  score?: number | null;
  reason?: string | null;
  bridgeHint?: string | null;
  confidence?: ConnectableConfidence | null;
  sourceKind?: ConnectableSourceKind | null;
  category?: ConnectableCategory | null;
  imageUrl?: string | null;
  badge?: string | null;
};

export type UseConnectableCandidatesParams = {
  ownerUserId: string;
  limit?: number;
  enabled?: boolean;
};

export type UseConnectableCandidatesResult = {
  candidates: ConnectableCandidate[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export type ConnectableRecommendationApiResponse = {
  ok?: boolean;
  items?: ConnectableCandidateSource[];
  error?: string;
  userMessage?: string;
};