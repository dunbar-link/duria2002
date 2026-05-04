import type { DragEvent } from "react";
import type {
  ConnectableCandidateStateMap,
  ConnectableCandidateStateRecord,
  DragSourceArea,
  DragState,
  EntityLocation,
  FolderMap,
  HomeLayerDerivedState,
  LayerBlueprint,
  LayerLayoutState,
  NormalizedStoredState,
} from "./home-page-types";
import {
  CONNECTABLE_CANDIDATE_STATE_STORAGE_KEY,
  CONNECTABLE_SOURCE_LAYER_ID,
  FOLDER_HOVER_CENTER_MAX,
  FOLDER_HOVER_CENTER_MIN,
  HIDDEN_MIN_SLOT_COUNT,
  SHEET_GRID_COLUMN_COUNT,
  VISIBLE_SLOT_COUNT,
  isDynamicConnectableEntityId,
  layerBlueprints,
  parseDynamicConnectableTargetPid,
  personCatalog,
} from "./home-page-types";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function fillSlots(
  ids: Array<string | null>,
  minSlots: number
): Array<string | null> {
  const slots: Array<string | null> = [...ids];

  while (slots.length < minSlots) {
    slots.push(null);
  }

  return slots;
}

export function countFilled(ids: Array<string | null>) {
  return ids.filter(Boolean).length;
}

export function normalizeHiddenSlots(ids: Array<string | null>) {
  const compacted = ids.filter(
    (value, index, source) =>
      value !== undefined && !(value === null && index >= source.length)
  ) as Array<string | null>;

  const withoutTrailingNoise = [...compacted];

  while (
    withoutTrailingNoise.length > HIDDEN_MIN_SLOT_COUNT &&
    withoutTrailingNoise[withoutTrailingNoise.length - 1] === null
  ) {
    withoutTrailingNoise.pop();
  }

  const filledCount = countFilled(withoutTrailingNoise);
  const targetLength = Math.max(
    HIDDEN_MIN_SLOT_COUNT,
    Math.ceil(
      Math.max(filledCount, HIDDEN_MIN_SLOT_COUNT) / SHEET_GRID_COLUMN_COUNT
    ) * SHEET_GRID_COLUMN_COUNT
  );

  while (withoutTrailingNoise.length < targetLength) {
    withoutTrailingNoise.push(null);
  }

  return withoutTrailingNoise;
}

function normalizeFolderMemberSlots(
  ids: Array<string | null | undefined>
): Array<string | null> {
  const seen = new Set<string>();
  const normalized: Array<string | null> = [];

  for (const value of ids) {
    if (typeof value === "string") {
      if (seen.has(value)) {
        normalized.push(null);
        continue;
      }

      seen.add(value);
      normalized.push(value);
      continue;
    }

    normalized.push(null);
  }

  while (normalized.length > 0 && normalized[normalized.length - 1] === null) {
    normalized.pop();
  }

  return normalized;
}

function getFolderFilledMemberCount(memberIds: Array<string | null>) {
  return memberIds.filter(Boolean).length;
}

function getSingleRemainingMemberId(memberIds: Array<string | null>) {
  return memberIds.find((value): value is string => typeof value === "string") ?? null;
}

function shouldKeepFolderWithSingleMember(
  memberIds: Array<string | null>,
  folders: FolderMap
) {
  const singleMemberId = getSingleRemainingMemberId(memberIds);

  if (!singleMemberId) {
    return false;
  }

  return Boolean(folders[singleMemberId]);
}

function insertIntoFolderSlots(
  memberIds: Array<string | null>,
  entityId: string
): Array<string | null> {
  const next = [...memberIds];
  const emptyIndex = next.findIndex((value) => value === null);

  if (emptyIndex >= 0) {
    next[emptyIndex] = entityId;
    return normalizeFolderMemberSlots(next);
  }

  next.push(entityId);
  return normalizeFolderMemberSlots(next);
}

export function createInitialLayoutState(): Record<string, LayerLayoutState> {
  return Object.fromEntries(
    layerBlueprints.map((layer) => {
      const ids = layer.people.map((person) => person.id);

      return [
        layer.id,
        {
          visibleSlotIds: fillSlots(
            ids.slice(0, VISIBLE_SLOT_COUNT),
            VISIBLE_SLOT_COUNT
          ),
          hiddenSlotIds: normalizeHiddenSlots(ids.slice(VISIBLE_SLOT_COUNT)),
        },
      ];
    })
  );
}

export function getDisplayName(person: {
  myAlias?: string;
  canonicalName: string;
}) {
  return person.myAlias?.trim() || person.canonicalName;
}

export function getEntityRealCount(entityId: string, folders: FolderMap): number {
  if (folders[entityId]) {
    return folders[entityId].memberIds.reduce((sum, memberId) => {
      if (!memberId) {
        return sum;
      }

      return sum + getEntityRealCount(memberId, folders);
    }, 0);
  }

  const person = personCatalog[entityId];

  if (!person) {
    return 0;
  }

  if (person.type === "group") {
    return person.groupPreview?.length ?? 0;
  }

  return 1;
}

export function getLayerRealCount(
  layerState: LayerLayoutState,
  folders: FolderMap
) {
  const allEntityIds = [
    ...layerState.visibleSlotIds,
    ...layerState.hiddenSlotIds,
  ].filter(Boolean) as string[];

  return allEntityIds.reduce((sum, entityId) => {
    return sum + getEntityRealCount(entityId, folders);
  }, 0);
}

export function getDynamicCountLabel(
  layer: LayerBlueprint,
  layoutState: Record<string, LayerLayoutState>,
  folders: FolderMap
) {
  const currentCount = getLayerRealCount(layoutState[layer.id], folders);

  if (layer.countLabel.includes("/")) {
    const [, maxPart] = layer.countLabel.split("/");
    return `${currentCount}/${maxPart}`;
  }

  return `${currentCount}명`;
}

export function getHiddenEntityRealCount(
  hiddenSlotIds: Array<string | null>,
  folders: FolderMap
) {
  return hiddenSlotIds
    .filter(Boolean)
    .reduce((sum, entityId) => {
      return sum + getEntityRealCount(entityId as string, folders);
    }, 0);
}

export function getHomeLayerDerivedStateMap(
  layoutState: Record<string, LayerLayoutState>,
  folders: FolderMap
): Record<string, HomeLayerDerivedState> {
  return Object.fromEntries(
    layerBlueprints.map((layer) => [
      layer.id,
      {
        hiddenCount: getHiddenEntityRealCount(
          layoutState[layer.id].hiddenSlotIds,
          folders
        ),
        dynamicCountLabel: getDynamicCountLabel(layer, layoutState, folders),
      },
    ])
  );
}

export function getFirstEmptyIndex(ids: Array<string | null>) {
  const index = ids.findIndex((value) => value === null);
  return index >= 0 ? index : -1;
}

export function getFirstEmptyHiddenIndex(ids: Array<string | null>) {
  const index = getFirstEmptyIndex(ids);
  return index >= 0 ? index : ids.length;
}

function createBaseAllowedEntityIdSet() {
  return new Set(
    Object.keys(personCatalog).filter(
      (id) => !id.startsWith(`${CONNECTABLE_SOURCE_LAYER_ID}-`)
    )
  );
}

function normalizeVisibleIds(
  ids: unknown,
  takenIds: Set<string>,
  allowedRootIds: Set<string>
) {
  if (!Array.isArray(ids)) {
    return fillSlots([], VISIBLE_SLOT_COUNT);
  }

  const result: Array<string | null> = [];

  for (const value of ids.slice(0, VISIBLE_SLOT_COUNT)) {
    if (
      typeof value === "string" &&
      allowedRootIds.has(value) &&
      !takenIds.has(value)
    ) {
      takenIds.add(value);
      result.push(value);
    } else {
      result.push(null);
    }
  }

  while (result.length < VISIBLE_SLOT_COUNT) {
    result.push(null);
  }

  return result;
}

function normalizeHiddenIds(
  ids: unknown,
  takenIds: Set<string>,
  allowedRootIds: Set<string>
) {
  if (!Array.isArray(ids)) {
    return normalizeHiddenSlots([]);
  }

  const result: Array<string | null> = [];

  for (const value of ids) {
    if (
      typeof value === "string" &&
      allowedRootIds.has(value) &&
      !takenIds.has(value)
    ) {
      takenIds.add(value);
      result.push(value);
    } else {
      result.push(null);
    }
  }

  return normalizeHiddenSlots(result);
}

function normalizeFolderMap(rawFolders: unknown): FolderMap {
  if (!rawFolders || typeof rawFolders !== "object") {
    return {};
  }

  const baseIds = createBaseAllowedEntityIdSet();
  const provisional: FolderMap = {};

  for (const [folderId, rawFolder] of Object.entries(
    rawFolders as Record<string, unknown>
  )) {
    if (!rawFolder || typeof rawFolder !== "object") {
      continue;
    }

    const folderSource = rawFolder as Record<string, unknown>;
    const memberIdsRaw = folderSource.memberIds;

    if (!Array.isArray(memberIdsRaw)) {
      continue;
    }

    provisional[folderId] = {
      id: folderId,
      type: "folder",
      memberIds: normalizeFolderMemberSlots(
        memberIdsRaw.map((value) => {
          if (typeof value === "string") {
            return value === folderId ? null : value;
          }

          return value === null ? null : undefined;
        })
      ),
      customName:
        typeof folderSource.customName === "string" &&
        folderSource.customName.trim()
          ? folderSource.customName.trim()
          : undefined,
    };
  }

  const folderIds = new Set(Object.keys(provisional));
  const allowedIds = new Set<string>([...baseIds, ...folderIds]);

  for (const folderId of Object.keys(provisional)) {
    provisional[folderId].memberIds = normalizeFolderMemberSlots(
      provisional[folderId].memberIds.map((value) => {
        if (!value) {
          return null;
        }

        return allowedIds.has(value) && value !== folderId ? value : null;
      })
    );
  }

  const result: FolderMap = {};

  for (const folderId of Object.keys(provisional)) {
    const folder = provisional[folderId];
    const filledCount = getFolderFilledMemberCount(folder.memberIds);

    if (
      filledCount >= 2 ||
      (filledCount === 1 && shouldKeepFolderWithSingleMember(folder.memberIds, provisional))
    ) {
      result[folderId] = folder;
    }
  }

  return result;
}

export function normalizeStoredState(raw: unknown): NormalizedStoredState {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const normalizedFolders = normalizeFolderMap(source.folders);

  const folderIds = Object.keys(normalizedFolders);
  const directPersonMemberIds = new Set(
    Object.values(normalizedFolders)
      .flatMap((folder) => folder.memberIds)
      .filter(
        (memberId): memberId is string =>
          typeof memberId === "string" && !normalizedFolders[memberId]
      )
  );

  const allowedRootIds = new Set<string>([
    ...Object.keys(personCatalog).filter(
      (id) =>
        !directPersonMemberIds.has(id) &&
        !id.startsWith(`${CONNECTABLE_SOURCE_LAYER_ID}-`)
    ),
    ...folderIds,
  ]);

  const container =
    source.layers && typeof source.layers === "object"
      ? (source.layers as Record<string, unknown>)
      : source;

  const layout: Record<string, LayerLayoutState> = {};
  const takenIds = new Set<string>();

  for (const layer of layerBlueprints) {
    const sourceLayer = container[layer.id];
    const sourceObject =
      sourceLayer && typeof sourceLayer === "object"
        ? (sourceLayer as Record<string, unknown>)
        : null;

    layout[layer.id] = {
      visibleSlotIds: normalizeVisibleIds(
        sourceObject?.visibleSlotIds,
        takenIds,
        allowedRootIds
      ),
      hiddenSlotIds: normalizeHiddenIds(
        sourceObject?.hiddenSlotIds,
        takenIds,
        allowedRootIds
      ),
    };
  }

  const missingIds = [...allowedRootIds].filter((id) => !takenIds.has(id));

  if (missingIds.length > 0) {
    for (const entityId of missingIds) {
      let fallbackLayerId = layerBlueprints[0].id;

      if (!normalizedFolders[entityId]) {
        const foundLayer = layerBlueprints.find((layer) =>
          layer.people.some((person) => person.id === entityId)
        );
        fallbackLayerId = foundLayer?.id ?? fallbackLayerId;
      }

      const nextHidden = [...layout[fallbackLayerId].hiddenSlotIds];
      const emptyIndex = nextHidden.findIndex((value) => value === null);

      if (emptyIndex >= 0) {
        nextHidden[emptyIndex] = entityId;
      } else {
        nextHidden.push(entityId);
      }

      layout[fallbackLayerId] = {
        ...layout[fallbackLayerId],
        hiddenSlotIds: normalizeHiddenSlots(nextHidden),
      };
    }
  }

  return {
    layout,
    folders: normalizedFolders,
  };
}

export function resolveRailTarget(
  current: Record<string, LayerLayoutState>,
  targetLayerId: string
) {
  const targetLayer = current[targetLayerId];
  const visibleEmptyIndex = getFirstEmptyIndex(targetLayer.visibleSlotIds);

  if (visibleEmptyIndex >= 0) {
    return {
      targetArea: "visible" as DragSourceArea,
      targetIndex: visibleEmptyIndex,
    };
  }

  return {
    targetArea: "hidden" as DragSourceArea,
    targetIndex: getFirstEmptyHiddenIndex(targetLayer.hiddenSlotIds),
  };
}

function getArrayByArea(layerState: LayerLayoutState, area: DragSourceArea) {
  return area === "visible" ? layerState.visibleSlotIds : layerState.hiddenSlotIds;
}

export function createFolderId() {
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function dedupeIds(ids: string[]) {
  return [...new Set(ids)];
}

export function getFolderDisplayName(folderId: string, folders: FolderMap) {
  const folder = folders[folderId];

  if (!folder) {
    return "폴더";
  }

  if (folder.customName?.trim()) {
    return folder.customName.trim();
  }

  return `${getEntityRealCount(folderId, folders)}명`;
}

export function findEntityLocation(
  layoutState: Record<string, LayerLayoutState>,
  entityId: string
): EntityLocation {
  for (const layer of layerBlueprints) {
    const visibleIndex = layoutState[layer.id].visibleSlotIds.findIndex(
      (id) => id === entityId
    );

    if (visibleIndex >= 0) {
      return {
        layerId: layer.id,
        area: "visible",
        index: visibleIndex,
      };
    }

    const hiddenIndex = layoutState[layer.id].hiddenSlotIds.findIndex(
      (id) => id === entityId
    );

    if (hiddenIndex >= 0) {
      return {
        layerId: layer.id,
        area: "hidden",
        index: hiddenIndex,
      };
    }
  }

  return null;
}

function cloneLayoutState(
  current: Record<string, LayerLayoutState>
): Record<string, LayerLayoutState> {
  return Object.fromEntries(
    Object.entries(current).map(([layerId, layerState]) => [
      layerId,
      {
        visibleSlotIds: [...layerState.visibleSlotIds],
        hiddenSlotIds: [...layerState.hiddenSlotIds],
      },
    ])
  );
}

function insertEntityToVisibleFirst(layerState: LayerLayoutState, entityId: string) {
  const visibleEmptyIndex = getFirstEmptyIndex(layerState.visibleSlotIds);

  if (visibleEmptyIndex >= 0) {
    layerState.visibleSlotIds[visibleEmptyIndex] = entityId;
    return;
  }

  const hiddenEmptyIndex = getFirstEmptyHiddenIndex(layerState.hiddenSlotIds);

  while (hiddenEmptyIndex >= layerState.hiddenSlotIds.length) {
    layerState.hiddenSlotIds.push(null);
  }

  layerState.hiddenSlotIds[hiddenEmptyIndex] = entityId;
}

export function renameFolderEntity(
  folders: FolderMap,
  folderId: string,
  customName: string
) {
  const folder = folders[folderId];

  if (!folder) {
    return folders;
  }

  return {
    ...folders,
    [folderId]: {
      ...folder,
      customName: customName.trim() ? customName.trim() : undefined,
    },
  };
}

export function moveEntityToTarget(
  current: Record<string, LayerLayoutState>,
  dragState: NonNullable<DragState>,
  targetLayerId: string,
  targetArea: DragSourceArea,
  targetIndex?: number
) {
  const sourceLayer = current[dragState.sourceLayerId];
  const targetLayer = current[targetLayerId];

  if (!sourceLayer || !targetLayer) {
    return current;
  }

  const nextSourceVisible = [...sourceLayer.visibleSlotIds];
  const nextSourceHidden = [...sourceLayer.hiddenSlotIds];

  const nextTargetVisible =
    dragState.sourceLayerId === targetLayerId
      ? nextSourceVisible
      : [...targetLayer.visibleSlotIds];

  const nextTargetHidden =
    dragState.sourceLayerId === targetLayerId
      ? nextSourceHidden
      : [...targetLayer.hiddenSlotIds];

  const sourceArray =
    dragState.sourceArea === "visible" ? nextSourceVisible : nextSourceHidden;

  const targetArray =
    targetArea === "visible" ? nextTargetVisible : nextTargetHidden;

  const sourceEntityId = sourceArray[dragState.sourceIndex];

  if (!sourceEntityId) {
    return current;
  }

  let resolvedTargetIndex = targetIndex;

  if (targetArea === "hidden" && typeof resolvedTargetIndex !== "number") {
    resolvedTargetIndex = getFirstEmptyHiddenIndex(targetArray);
  }

  if (targetArea === "hidden") {
    while (
      typeof resolvedTargetIndex === "number" &&
      resolvedTargetIndex >= targetArray.length
    ) {
      targetArray.push(null);
    }
  }

  if (typeof resolvedTargetIndex !== "number" || resolvedTargetIndex < 0) {
    return current;
  }

  if (
    dragState.sourceLayerId === targetLayerId &&
    dragState.sourceArea === targetArea &&
    dragState.sourceIndex === resolvedTargetIndex
  ) {
    return current;
  }

  const targetEntityId = targetArray[resolvedTargetIndex] ?? null;

  sourceArray[dragState.sourceIndex] = targetEntityId;
  targetArray[resolvedTargetIndex] = sourceEntityId;

  const finalSourceHidden = normalizeHiddenSlots(nextSourceHidden);
  const finalTargetHidden =
    dragState.sourceLayerId === targetLayerId
      ? finalSourceHidden
      : normalizeHiddenSlots(nextTargetHidden);

  return {
    ...current,
    [dragState.sourceLayerId]: {
      visibleSlotIds: nextSourceVisible,
      hiddenSlotIds: finalSourceHidden,
    },
    [targetLayerId]: {
      visibleSlotIds: nextTargetVisible,
      hiddenSlotIds: finalTargetHidden,
    },
  };
}

export function hasEntityInLayout(
  current: Record<string, LayerLayoutState>,
  entityId: string
) {
  return Boolean(findEntityLocation(current, entityId));
}

export function insertExternalEntityToTarget(
  current: Record<string, LayerLayoutState>,
  entityId: string,
  targetLayerId: string,
  targetArea: DragSourceArea,
  targetIndex?: number
) {
  if (hasEntityInLayout(current, entityId)) {
    return current;
  }

  const targetLayer = current[targetLayerId];

  if (!targetLayer) {
    return current;
  }

  const next = cloneLayoutState(current);
  const nextTargetLayer = next[targetLayerId];

  if (targetArea === "visible") {
    const exactVisibleIndex =
      typeof targetIndex === "number" &&
      targetIndex >= 0 &&
      targetIndex < nextTargetLayer.visibleSlotIds.length &&
      nextTargetLayer.visibleSlotIds[targetIndex] === null
        ? targetIndex
        : -1;

    const visibleIndex =
      exactVisibleIndex >= 0
        ? exactVisibleIndex
        : getFirstEmptyIndex(nextTargetLayer.visibleSlotIds);

    if (visibleIndex >= 0) {
      nextTargetLayer.visibleSlotIds[visibleIndex] = entityId;
      nextTargetLayer.hiddenSlotIds = normalizeHiddenSlots(
        nextTargetLayer.hiddenSlotIds
      );
      return next;
    }

    const hiddenIndex = getFirstEmptyHiddenIndex(nextTargetLayer.hiddenSlotIds);

    while (hiddenIndex >= nextTargetLayer.hiddenSlotIds.length) {
      nextTargetLayer.hiddenSlotIds.push(null);
    }

    nextTargetLayer.hiddenSlotIds[hiddenIndex] = entityId;
    nextTargetLayer.hiddenSlotIds = normalizeHiddenSlots(
      nextTargetLayer.hiddenSlotIds
    );
    return next;
  }

  const preferredHiddenIndex =
    typeof targetIndex === "number" &&
    targetIndex >= 0 &&
    nextTargetLayer.hiddenSlotIds[targetIndex] === null
      ? targetIndex
      : getFirstEmptyHiddenIndex(nextTargetLayer.hiddenSlotIds);

  while (preferredHiddenIndex >= nextTargetLayer.hiddenSlotIds.length) {
    nextTargetLayer.hiddenSlotIds.push(null);
  }

  nextTargetLayer.hiddenSlotIds[preferredHiddenIndex] = entityId;
  nextTargetLayer.hiddenSlotIds = normalizeHiddenSlots(
    nextTargetLayer.hiddenSlotIds
  );

  return next;
}

export function combineEntityIntoTarget(
  current: Record<string, LayerLayoutState>,
  folders: FolderMap,
  dragState: NonNullable<DragState>,
  targetLayerId: string,
  targetArea: DragSourceArea,
  targetIndex: number
) {
  const sourceLayer = current[dragState.sourceLayerId];
  const targetLayer = current[targetLayerId];

  if (!sourceLayer || !targetLayer) {
    return {
      layout: current,
      folders,
    };
  }

  const nextLayout: Record<string, LayerLayoutState> = {
    ...current,
    [dragState.sourceLayerId]: {
      visibleSlotIds: [...sourceLayer.visibleSlotIds],
      hiddenSlotIds: [...sourceLayer.hiddenSlotIds],
    },
    [targetLayerId]:
      dragState.sourceLayerId === targetLayerId
        ? {
            visibleSlotIds: [...sourceLayer.visibleSlotIds],
            hiddenSlotIds: [...sourceLayer.hiddenSlotIds],
          }
        : {
            visibleSlotIds: [...targetLayer.visibleSlotIds],
            hiddenSlotIds: [...targetLayer.hiddenSlotIds],
          },
  };

  const sourceTargetLayer = nextLayout[dragState.sourceLayerId];
  const finalTargetLayer = nextLayout[targetLayerId];

  const sourceArray = getArrayByArea(sourceTargetLayer, dragState.sourceArea);
  const targetArray = getArrayByArea(finalTargetLayer, targetArea);

  const sourceEntityId = sourceArray[dragState.sourceIndex];
  const targetEntityId = targetArray[targetIndex];

  if (!sourceEntityId || !targetEntityId || sourceEntityId === targetEntityId) {
    return {
      layout: current,
      folders,
    };
  }

  sourceArray[dragState.sourceIndex] = null;

  const nextFolders: FolderMap = { ...folders };

  if (folders[targetEntityId]) {
    nextFolders[targetEntityId] = {
      ...folders[targetEntityId],
      memberIds: insertIntoFolderSlots(
        folders[targetEntityId].memberIds,
        sourceEntityId
      ),
    };
  } else {
    const newFolderId = createFolderId();

    nextFolders[newFolderId] = {
      id: newFolderId,
      type: "folder",
      memberIds: [targetEntityId, sourceEntityId],
    };

    targetArray[targetIndex] = newFolderId;
  }

  sourceTargetLayer.hiddenSlotIds = normalizeHiddenSlots(
    sourceTargetLayer.hiddenSlotIds
  );

  if (dragState.sourceLayerId !== targetLayerId) {
    finalTargetLayer.hiddenSlotIds = normalizeHiddenSlots(
      finalTargetLayer.hiddenSlotIds
    );
  }

  return {
    layout: nextLayout,
    folders: nextFolders,
  };
}

export function getHoverActionFromPointer(event: DragEvent) {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();

  const xRatio = (event.clientX - bounds.left) / bounds.width;
  const yRatio = (event.clientY - bounds.top) / bounds.height;

  const isCenteredX =
    xRatio >= FOLDER_HOVER_CENTER_MIN && xRatio <= FOLDER_HOVER_CENTER_MAX;
  const isCenteredY =
    yRatio >= FOLDER_HOVER_CENTER_MIN && yRatio <= FOLDER_HOVER_CENTER_MAX;

  return isCenteredX && isCenteredY ? "combine" : "swap";
}

function findFolderParentId(folders: FolderMap, folderId: string) {
  for (const folder of Object.values(folders)) {
    if (folder.memberIds.includes(folderId)) {
      return folder.id;
    }
  }

  return null;
}

function getFolderAncestorChain(folders: FolderMap, folderId: string) {
  const chain = [folderId];
  const visited = new Set<string>([folderId]);

  let currentFolderId = folderId;

  while (true) {
    const parentId = findFolderParentId(folders, currentFolderId);

    if (!parentId || visited.has(parentId)) {
      break;
    }

    chain.push(parentId);
    visited.add(parentId);
    currentFolderId = parentId;
  }

  return chain;
}

export function getTopFolderId(folders: FolderMap, folderId: string) {
  const chain = getFolderAncestorChain(folders, folderId);
  return chain[chain.length - 1] ?? folderId;
}

function commitFolderDirectMembers(
  layout: Record<string, LayerLayoutState>,
  folders: FolderMap,
  folderId: string,
  nextDirectMembers: Array<string | null>
) {
  const chain = getFolderAncestorChain(folders, folderId);
  const topFolderId = chain[chain.length - 1] ?? folderId;
  const topLocation = findEntityLocation(layout, topFolderId);

  const nextLayout = cloneLayoutState(layout);
  const nextFolders: FolderMap = { ...folders };

  let childOldId = folderId;
  let childReplacementId: string | null = null;

  const normalizedDirectMembers = normalizeFolderMemberSlots(nextDirectMembers);
  const directCount = getFolderFilledMemberCount(normalizedDirectMembers);

  if (directCount >= 2) {
    nextFolders[folderId] = {
      ...nextFolders[folderId],
      memberIds: normalizedDirectMembers,
    };
    childReplacementId = folderId;
  } else if (
    directCount === 1 &&
    shouldKeepFolderWithSingleMember(normalizedDirectMembers, nextFolders)
  ) {
    nextFolders[folderId] = {
      ...nextFolders[folderId],
      memberIds: normalizedDirectMembers,
    };
    childReplacementId = folderId;
  } else if (directCount === 1) {
    delete nextFolders[folderId];
    childReplacementId = getSingleRemainingMemberId(normalizedDirectMembers);
  } else {
    delete nextFolders[folderId];
    childReplacementId = null;
  }

  for (const parentId of chain.slice(1)) {
    const parentFolder = nextFolders[parentId];

    if (!parentFolder) {
      childOldId = parentId;
      continue;
    }

    const replacedMemberIds = normalizeFolderMemberSlots(
      parentFolder.memberIds.map((memberId) => {
        if (memberId !== childOldId) {
          return memberId;
        }

        return childReplacementId;
      })
    );

    const replacedCount = getFolderFilledMemberCount(replacedMemberIds);

    if (replacedCount >= 2) {
      nextFolders[parentId] = {
        ...parentFolder,
        memberIds: replacedMemberIds,
      };
      childOldId = parentId;
      childReplacementId = parentId;
    } else if (
      replacedCount === 1 &&
      shouldKeepFolderWithSingleMember(replacedMemberIds, nextFolders)
    ) {
      nextFolders[parentId] = {
        ...parentFolder,
        memberIds: replacedMemberIds,
      };
      childOldId = parentId;
      childReplacementId = parentId;
    } else if (replacedCount === 1) {
      delete nextFolders[parentId];
      childOldId = parentId;
      childReplacementId = getSingleRemainingMemberId(replacedMemberIds);
    } else {
      delete nextFolders[parentId];
      childOldId = parentId;
      childReplacementId = null;
    }
  }

  if (topLocation) {
    const topLayer = nextLayout[topLocation.layerId];
    const targetArray =
      topLocation.area === "visible"
        ? topLayer.visibleSlotIds
        : topLayer.hiddenSlotIds;

    targetArray[topLocation.index] = childReplacementId;

    if (topLocation.area === "hidden") {
      topLayer.hiddenSlotIds = normalizeHiddenSlots(topLayer.hiddenSlotIds);
    }
  }

  return {
    layout: nextLayout,
    folders: nextFolders,
    topLayerId: topLocation?.layerId ?? null,
    topArea: topLocation?.area ?? null,
    topReplacementId: childReplacementId,
  };
}

export function extractEntityFromFolderHierarchy(
  layout: Record<string, LayerLayoutState>,
  folders: FolderMap,
  folderId: string,
  entityId: string
) {
  const directFolder = folders[folderId];

  if (!directFolder || !directFolder.memberIds.includes(entityId)) {
    return {
      layout,
      folders,
      extractedInserted: false,
      insertLayerId: null as string | null,
    };
  }

  const topFolderId = getTopFolderId(folders, folderId);
  const topLocation = findEntityLocation(layout, topFolderId);

  const nextDirectMembers = directFolder.memberIds.map((id) =>
    id === entityId ? null : id
  );

  const committed = commitFolderDirectMembers(
    layout,
    folders,
    folderId,
    nextDirectMembers
  );

  if (topLocation) {
    const layerState = committed.layout[topLocation.layerId];
    insertEntityToVisibleFirst(layerState, entityId);
    layerState.hiddenSlotIds = normalizeHiddenSlots(layerState.hiddenSlotIds);

    return {
      layout: committed.layout,
      folders: committed.folders,
      extractedInserted: true,
      insertLayerId: topLocation.layerId,
    };
  }

  return {
    layout: committed.layout,
    folders: committed.folders,
    extractedInserted: false,
    insertLayerId: null,
  };
}

export function moveFolderEntityWithinFolder(
  folders: FolderMap,
  folderId: string,
  sourceIndex: number,
  targetIndex: number
) {
  const folder = folders[folderId];

  if (!folder) {
    return folders;
  }

  const targetLength = Math.max(
    9,
    folder.memberIds.length,
    sourceIndex + 1,
    targetIndex + 1
  );

  const paddedSlots = fillSlots(folder.memberIds, targetLength);
  const sourceEntityId = paddedSlots[sourceIndex];

  if (!sourceEntityId) {
    return folders;
  }

  if (sourceIndex === targetIndex) {
    return folders;
  }

  const targetEntityId = paddedSlots[targetIndex] ?? null;
  paddedSlots[sourceIndex] = targetEntityId;
  paddedSlots[targetIndex] = sourceEntityId;

  return {
    ...folders,
    [folderId]: {
      ...folder,
      memberIds: normalizeFolderMemberSlots(paddedSlots),
    },
  };
}

export function combineFolderMembersInFolder(
  layout: Record<string, LayerLayoutState>,
  folders: FolderMap,
  folderId: string,
  sourceIndex: number,
  targetIndex: number
) {
  const folder = folders[folderId];

  if (!folder) {
    return {
      layout,
      folders,
    };
  }

  const targetLength = Math.max(
    9,
    folder.memberIds.length,
    sourceIndex + 1,
    targetIndex + 1
  );

  const currentMembers = fillSlots(folder.memberIds, targetLength);
  const sourceEntityId = currentMembers[sourceIndex];
  const targetEntityId = currentMembers[targetIndex];

  if (!sourceEntityId || !targetEntityId || sourceEntityId === targetEntityId) {
    return {
      layout,
      folders,
    };
  }

  const nextFolders: FolderMap = { ...folders };

  if (nextFolders[targetEntityId]) {
    nextFolders[targetEntityId] = {
      ...nextFolders[targetEntityId],
      memberIds: insertIntoFolderSlots(
        nextFolders[targetEntityId].memberIds,
        sourceEntityId
      ),
    };

    currentMembers[sourceIndex] = null;
  } else {
    const newFolderId = createFolderId();

    nextFolders[newFolderId] = {
      id: newFolderId,
      type: "folder",
      memberIds: [targetEntityId, sourceEntityId],
    };

    currentMembers[targetIndex] = newFolderId;
    currentMembers[sourceIndex] = null;
  }

  const committed = commitFolderDirectMembers(
    layout,
    nextFolders,
    folderId,
    currentMembers
  );

  return {
    layout: committed.layout,
    folders: committed.folders,
  };
}

export function getLayerById(layerId: string) {
  return layerBlueprints.find((layer) => layer.id === layerId) ?? null;
}

export function getEntityLabel(entityId: string, folders: FolderMap) {
  const folder = folders[entityId];

  if (folder) {
    return getFolderDisplayName(entityId, folders);
  }

  const person = personCatalog[entityId];

  if (!person) {
    return "알 수 없음";
  }

  return getDisplayName(person);
}

function getConnectableNameFromCatalog(entityId: string): string {
  const person = personCatalog[entityId];

  if (!person) {
    return entityId;
  }

  return getDisplayName(person);
}

function getConnectableTargetPidFromCatalog(entityId: string): string {
  const person = personCatalog[entityId];

  if (person && "pathTargetPid" in person && typeof person.pathTargetPid === "string") {
    return person.pathTargetPid;
  }

  return parseDynamicConnectableTargetPid(entityId) ?? entityId;
}

function areConnectableStateRecordsEqual(
  a: ConnectableCandidateStateRecord,
  b: ConnectableCandidateStateRecord
) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function readConnectableCandidateStateMap(): ConnectableCandidateStateMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(
      CONNECTABLE_CANDIDATE_STATE_STORAGE_KEY
    );

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const nextMap: ConnectableCandidateStateMap = {};

    for (const [entityId, value] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const record = value as Record<string, unknown>;

      if (
        typeof record.entityId !== "string" ||
        typeof record.targetPid !== "string" ||
        typeof record.name !== "string" ||
        typeof record.status !== "string" ||
        typeof record.statusUpdatedAt !== "string"
      ) {
        continue;
      }

      nextMap[entityId] = {
        entityId: record.entityId,
        targetPid: record.targetPid,
        name: record.name,
        status: record.status as ConnectableCandidateStateRecord["status"],
        statusUpdatedAt: record.statusUpdatedAt,
        addedToLayerId:
          typeof record.addedToLayerId === "string"
            ? record.addedToLayerId
            : undefined,
        addedToArea:
          record.addedToArea === "visible" || record.addedToArea === "hidden"
            ? record.addedToArea
            : undefined,
        addedAt: typeof record.addedAt === "string" ? record.addedAt : undefined,
        exploredAt:
          typeof record.exploredAt === "string" ? record.exploredAt : undefined,
        dismissedUntil:
          typeof record.dismissedUntil === "string"
            ? record.dismissedUntil
            : undefined,
        deferredUntil:
          typeof record.deferredUntil === "string"
            ? record.deferredUntil
            : undefined,
        lastRecommendedAt:
          typeof record.lastRecommendedAt === "string"
            ? record.lastRecommendedAt
            : undefined,
        source: typeof record.source === "string" ? record.source : undefined,
      };
    }

    return nextMap;
  } catch {
    return {};
  }
}

export function writeConnectableCandidateStateMap(
  stateMap: ConnectableCandidateStateMap
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      CONNECTABLE_CANDIDATE_STATE_STORAGE_KEY,
      JSON.stringify(stateMap)
    );
  } catch {
    // ignore storage write error
  }
}

type UpsertConnectableStateInput = {
  entityId: string;
  targetPid?: string;
  name?: string;
  status: ConnectableCandidateStateRecord["status"];
  addedToLayerId?: string;
  addedToArea?: DragSourceArea;
  dismissedUntil?: string;
  deferredUntil?: string;
  source?: string;
};

export function upsertConnectableCandidateState(
  current: ConnectableCandidateStateMap,
  input: UpsertConnectableStateInput
): ConnectableCandidateStateMap {
  const now = new Date().toISOString();
  const existing = current[input.entityId];

  const nextRecord: ConnectableCandidateStateRecord = {
    entityId: input.entityId,
    targetPid:
      input.targetPid ??
      existing?.targetPid ??
      getConnectableTargetPidFromCatalog(input.entityId),
    name: input.name ?? existing?.name ?? getConnectableNameFromCatalog(input.entityId),
    status: input.status,
    statusUpdatedAt: now,
    addedToLayerId:
      input.status === "added_to_layer"
        ? input.addedToLayerId
        : existing?.addedToLayerId,
    addedToArea:
      input.status === "added_to_layer" ? input.addedToArea : existing?.addedToArea,
    addedAt: input.status === "added_to_layer" ? now : existing?.addedAt,
    exploredAt: input.status === "explored" ? now : existing?.exploredAt,
    dismissedUntil:
      input.status === "dismissed"
        ? input.dismissedUntil
        : existing?.dismissedUntil,
    deferredUntil:
      input.status === "deferred" ? input.deferredUntil : existing?.deferredUntil,
    lastRecommendedAt:
      input.status === "recommended" ? now : existing?.lastRecommendedAt,
    source: input.source ?? existing?.source,
  };

  if (existing && areConnectableStateRecordsEqual(existing, nextRecord)) {
    return current;
  }

  return {
    ...current,
    [input.entityId]: nextRecord,
  };
}

export function markConnectableCandidateRecommended(
  current: ConnectableCandidateStateMap,
  entityId: string,
  source?: string
) {
  return upsertConnectableCandidateState(current, {
    entityId,
    status: "recommended",
    source,
  });
}

type MarkAddedInput = {
  entityId: string;
  targetLayerId: string;
  targetArea: DragSourceArea;
  source?: string;
};

export function markConnectableCandidateAddedToLayer(
  current: ConnectableCandidateStateMap,
  input: MarkAddedInput
) {
  return upsertConnectableCandidateState(current, {
    entityId: input.entityId,
    status: "added_to_layer",
    addedToLayerId: input.targetLayerId,
    addedToArea: input.targetArea,
    source: input.source,
  });
}

type MarkExploredInput = {
  entityId: string;
  targetPid?: string;
  name?: string;
  source?: string;
};

export function markConnectableCandidateExplored(
  current: ConnectableCandidateStateMap,
  input: MarkExploredInput
) {
  return upsertConnectableCandidateState(current, {
    entityId: input.entityId,
    targetPid: input.targetPid,
    name: input.name,
    status: "explored",
    source: input.source,
  });
}

export function markConnectableCandidateDismissed(
  current: ConnectableCandidateStateMap,
  entityId: string,
  untilIsoString: string,
  source?: string
) {
  return upsertConnectableCandidateState(current, {
    entityId,
    status: "dismissed",
    dismissedUntil: untilIsoString,
    source,
  });
}

export function markConnectableCandidateDeferred(
  current: ConnectableCandidateStateMap,
  entityId: string,
  untilIsoString: string,
  source?: string
) {
  return upsertConnectableCandidateState(current, {
    entityId,
    status: "deferred",
    deferredUntil: untilIsoString,
    source,
  });
}

export function shouldSuppressConnectableCandidate(
  record: ConnectableCandidateStateRecord | undefined,
  now = Date.now()
) {
  if (!record) {
    return false;
  }

  if (record.status === "added_to_layer") {
    return true;
  }

  if (record.status === "dismissed" && record.dismissedUntil) {
    const until = Date.parse(record.dismissedUntil);
    return Number.isFinite(until) && until > now;
  }

  if (record.status === "deferred" && record.deferredUntil) {
    const until = Date.parse(record.deferredUntil);
    return Number.isFinite(until) && until > now;
  }

  return false;
}

export function getSuppressedConnectableEntityIds(
  stateMap: ConnectableCandidateStateMap,
  now = Date.now()
) {
  return new Set(
    Object.values(stateMap)
      .filter((record) => shouldSuppressConnectableCandidate(record, now))
      .map((record) => record.entityId)
  );
}

export function syncConnectableStateWithLayout(
  current: ConnectableCandidateStateMap,
  layoutState: Record<string, LayerLayoutState>
) {
  let nextMap = current;
  let changed = false;

  for (const layer of layerBlueprints) {
    const layerState = layoutState[layer.id];

    if (!layerState) {
      continue;
    }

    const entityIds = [
      ...layerState.visibleSlotIds,
      ...layerState.hiddenSlotIds,
    ].filter((value): value is string => typeof value === "string");

    for (const entityId of entityIds) {
      if (!isDynamicConnectableEntityId(entityId)) {
        continue;
      }

      const existing = nextMap[entityId];

      if (
        existing?.status === "added_to_layer" &&
        existing.addedToLayerId === layer.id
      ) {
        continue;
      }

      nextMap = markConnectableCandidateAddedToLayer(nextMap, {
        entityId,
        targetLayerId: layer.id,
        targetArea: layerState.visibleSlotIds.includes(entityId)
          ? "visible"
          : "hidden",
        source: existing?.source ?? "layout-sync",
      });
      changed = true;
    }
  }

  return changed ? nextMap : current;
}