export type LayerPerson = {
  id: string;
  initials: string;
  canonicalName: string;
  myAlias?: string;
  urgent?: boolean;
  isMe?: boolean;
  profileHref?: string;
  type?: "person" | "group";
  groupPreview?: string[];
  imageUrl?: string;
  avatarEmoji?: string;
};

export type FolderEntity = {
  id: string;
  type: "folder";
  memberIds: Array<string | null>;
  customName?: string;
};

export type FolderMap = Record<string, FolderEntity>;

export type LayerBlueprint = {
  id: string;
  label: string;
  countLabel: string;
  labelClass: string;
  iconTintClass: string;
  people: LayerPerson[];
};

export type LayerLayoutState = {
  visibleSlotIds: Array<string | null>;
  hiddenSlotIds: Array<string | null>;
};

export type DragSourceArea = "visible" | "hidden";

export type HoverAction = "swap" | "combine";

export type DragState = {
  sourceLayerId: string;
  sourceIndex: number;
  entityId: string;
  sourceArea: DragSourceArea;
} | null;

export type DragOverState =
  | {
      targetLayerId: string;
      targetIndex: number;
      targetArea: DragSourceArea;
      action: HoverAction;
    }
  | null;

export type FolderDragState = {
  folderId: string;
  sourceIndex: number;
  entityId: string;
} | null;

export type FolderDragOverState =
  | {
      folderId: string;
      targetIndex: number;
      action: HoverAction;
    }
  | null;

export type NormalizedStoredState = {
  layout: Record<string, LayerLayoutState>;
  folders: FolderMap;
} | null;

export type EntityLocation =
  | {
      layerId: string;
      area: DragSourceArea;
      index: number;
    }
  | null;

export type FolderMoveMenuState =
  | {
      folderId: string;
      entityId: string;
    }
  | null;

export type HomeLayerDerivedState = {
  hiddenCount: number;
  dynamicCountLabel: string;
};

export type ConnectableCandidate = LayerPerson & {
  sourceType: "connectable";
  pathTargetPid: string;
};

export type DynamicConnectableCatalogInput = {
  entityId?: string;
  targetPid: string;
  name: string;
  imageUrl?: string | null;
  confidence?: "high" | "medium" | "low" | null;
};

export type ConnectableCandidateLifecycleStatus =
  | "recommended"
  | "added_to_layer"
  | "explored"
  | "dismissed"
  | "deferred";

export type ConnectableCandidateStateRecord = {
  entityId: string;
  targetPid: string;
  name: string;
  status: ConnectableCandidateLifecycleStatus;
  statusUpdatedAt: string;
  addedToLayerId?: string;
  addedToArea?: DragSourceArea;
  addedAt?: string;
  exploredAt?: string;
  dismissedUntil?: string;
  deferredUntil?: string;
  lastRecommendedAt?: string;
  source?: string;
};

export type ConnectableCandidateStateMap = Record<
  string,
  ConnectableCandidateStateRecord
>;

export const VISIBLE_SLOT_COUNT = 4;
export const HIDDEN_MIN_SLOT_COUNT = 9;
export const STORAGE_KEY = "dunbar-link-home-layout-v16";
export const SHEET_CLOSE_MS = 220;
export const FOLDER_SHEET_CLOSE_MS = 180;

export const HOME_TILE_WIDTH = 60;
export const SHEET_TILE_WIDTH = 60;
export const HOME_GRID_GAP_X = 14;
export const SHEET_GRID_GAP_X = 10;
export const SHEET_GRID_COLUMN_COUNT = 5;

export const FOLDER_PREVIEW_GRID_SLOT_COUNT = 9;
export const FOLDER_HOVER_CENTER_MIN = 0.24;
export const FOLDER_HOVER_CENTER_MAX = 0.76;

export const CONNECTABLE_SOURCE_LAYER_ID = "connectable";
export const CONNECTABLE_CANDIDATE_STATE_STORAGE_KEY =
  "dunbar-link-connectable-candidate-state-v1";

export const layerBlueprints: LayerBlueprint[] = [
  {
    id: "maintain",
    label: "친근",
    countLabel: "0/150",
    labelClass: "text-[#6C8A77]",
    iconTintClass: "bg-[#EEF7F0]",
    people: [],
  },
  {
    id: "trust",
    label: "친밀",
    countLabel: "0/50",
    labelClass: "text-[#6D86A5]",
    iconTintClass: "bg-[#EEF4FB]",
    people: [],
  },
  {
    id: "intimate",
    label: "신뢰",
    countLabel: "0/15",
    labelClass: "text-[#8172A8]",
    iconTintClass: "bg-[#F3F0FB]",
    people: [],
  },
  {
    id: "core",
    label: "핵심",
    countLabel: "0/5",
    labelClass: "text-[#9B7D52]",
    iconTintClass: "bg-[#FBF4E9]",
    people: [],
  },
  {
    id: "family",
    label: "가족",
    countLabel: "1/family",
    labelClass: "text-[#9A6D78]",
    iconTintClass: "bg-[#FAEEF2]",
    people: [
      {
        id: "family-me",
        initials: "나",
        canonicalName: "나",
        isMe: true,
        profileHref: "/dashboard/me",
      },
    ],
  },
];

export const connectableCandidates: ConnectableCandidate[] = [];

export const personCatalog: Record<string, LayerPerson | ConnectableCandidate> =
  Object.fromEntries(
    [...layerBlueprints.flatMap((layer) => layer.people), ...connectableCandidates].map(
      (person) => [person.id, person]
    )
  );

function getInitialsFromName(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    return "?";
  }

  if (trimmed.length === 1) {
    return trimmed;
  }

  return trimmed.slice(0, 2);
}

function shouldMarkUrgent(
  confidence?: "high" | "medium" | "low" | null
): boolean {
  return confidence === "high";
}

export function buildDynamicConnectableEntityId(targetPid: string): string {
  return `connectable:${targetPid}`;
}

export function isDynamicConnectableEntityId(entityId: string): boolean {
  return entityId.startsWith("connectable:");
}

export function parseDynamicConnectableTargetPid(
  entityId: string
): string | null {
  if (!isDynamicConnectableEntityId(entityId)) {
    return null;
  }

  const value = entityId.slice("connectable:".length).trim();

  return value ? value : null;
}

export function upsertDynamicConnectableCandidate(
  input: DynamicConnectableCatalogInput
): ConnectableCandidate {
  const entityId = input.entityId ?? buildDynamicConnectableEntityId(input.targetPid);

  const nextCandidate: ConnectableCandidate = {
    id: entityId,
    pathTargetPid: input.targetPid,
    initials: getInitialsFromName(input.name),
    canonicalName: input.name,
    urgent: shouldMarkUrgent(input.confidence),
    imageUrl: input.imageUrl ?? undefined,
    sourceType: "connectable",
  };

  const existingIndex = connectableCandidates.findIndex(
    (candidate) => candidate.id === entityId
  );

  if (existingIndex >= 0) {
    connectableCandidates[existingIndex] = nextCandidate;
  } else {
    connectableCandidates.push(nextCandidate);
  }

  personCatalog[entityId] = nextCandidate;

  return nextCandidate;
}