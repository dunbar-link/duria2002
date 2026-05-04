export type DiscoverErrorCode =
  | "NONE"
  | "INVALID_REQUEST"
  | "TARGET_REQUIRED"
  | "INSUFFICIENT_COINS"
  | "WALLET_NOT_FOUND"
  | "PATH_NOT_FOUND"
  | "RPC_ERROR"
  | "UNKNOWN_ERROR";

export type RecommendationType =
  | "PRIMARY"
  | "FASTEST"
  | "STRONGEST"
  | "BALANCED"
  | "BACKUP";

export type DiscoverNode = {
  pid: string;
  name: string;
  city?: string | null;
  school?: string | null;
  company?: string | null;
  isCelebrity?: boolean;
};

export type BridgeEvidence = {
  type: "school" | "company" | "city" | "unknown";
  label: string;
};

export type DiscoverPathCandidate = {
  people: DiscoverNode[];
  stepCount: number;
  firstConnectorPid: string | null;
  firstConnectorName: string | null;
  firstConnectorEvidence: BridgeEvidence | null;
  tierAverage: number | null;
  score: number;
  presentedPath: string;
  recommendationType?: RecommendationType;
};

export type DiscoverResult = {
  ok: boolean;
  found: boolean;
  cost: number | null;
  hops: number | null;
  avgTrust: number | null;
  bottleneckTrust: number | null;
  confidence: number | null;
  confidenceLabel: string;
  error: string;
  errorCode: DiscoverErrorCode;
  userMessage: string;
  path: DiscoverNode[];
  stepCount: number;
  firstConnectorPid: string | null;
  firstConnectorName: string | null;
  firstConnectorEvidence: BridgeEvidence | null;
  tierAverage: number | null;
  score: number | null;
  presentedPathText: string;
  bestPath: DiscoverPathCandidate | null;
  allPaths: DiscoverPathCandidate[];
};

export type DiscoverApiResponse = {
  ok: boolean;
  result?: DiscoverResult;
  error?: string;
  errorCode?: DiscoverErrorCode;
  userMessage?: string;
  balance_before?: number | null;
  balance_after?: number | null;
  debug?: Record<string, unknown>;
};