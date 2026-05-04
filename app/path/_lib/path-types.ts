export type DiscoverPathNode = {
  pid: string;
  name: string;
  city?: string | null;
  school?: string | null;
  company?: string | null;
  isCelebrity?: boolean;
};

export type PresentedPath = {
  nodes: DiscoverPathNode[];
  hops: number;
  score: number;
  firstConnector?: DiscoverPathNode | null;
};

export type DiscoverPayload = {
  ok?: boolean;
  found?: boolean;

  // 기존
  hops?: number;
  avgTrust?: number;
  bottleneckTrust?: number;

  // 확장
  confidence?: number;
  confidenceLabel?: string;
  cost?: number;

  // 메시지
  error?: string;
  errorCode?: string;
  userMessage?: string;

  // 기존 path
  path?: DiscoverPathNode[];

  // ✅ 신규 핵심
  bestPath?: PresentedPath;
  allPaths?: PresentedPath[];
  firstConnectorEvidence?: string;
};

export type DiscoverResponse =
  | {
      ok: true;
      result: DiscoverPayload;
      balance_before?: number | null;
      balance_after?: number | null;
    }
  | {
      ok: false;
      error: string;
      errorCode?: string;
      userMessage?: string;
    };

export type SearchPerson = {
  pid: string;
  displayName: string;
  category: string;
  country?: string;
  city?: string | null;
  company?: string | null;
  school?: string | null;
};

export type SearchApiItem = {
  pid?: string;
  displayName?: string;
  display_name?: string;
  category?: string;
  isCelebrity?: boolean;
  is_celebrity?: boolean;
  country?: string;
  city?: string | null;
  company?: string | null;
  school?: string | null;
};

export type SearchResponse =
  | {
      ok: true;
      items: SearchApiItem[];
    }
  | {
      ok: false;
      error: string;
    };