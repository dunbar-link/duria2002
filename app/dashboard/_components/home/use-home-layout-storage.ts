"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { FolderMap, LayerLayoutState } from "./home-page-types";
import {
  CONNECTABLE_CANDIDATE_STATE_STORAGE_KEY,
  STORAGE_KEY,
  personCatalog,
  upsertDynamicConnectableCandidate,
} from "./home-page-types";
import { normalizeHiddenSlots, normalizeStoredState } from "./home-page-utils";

type PersistedConnectableStateRecord = {
  entityId?: string;
  targetPid?: string;
  name?: string;
};

type PersistedDashboardPersonRecord = {
  id?: string;
  name?: string;
};

type StoredHomePayload = {
  layers: Record<string, LayerLayoutState>;
  folders: FolderMap;
};

const PEOPLE_STORE_KEY = "dunbar-link-dashboard-people-store";

function extractLayerContainer(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const source = raw as Record<string, unknown>;

  if (source.layers && typeof source.layers === "object") {
    return source.layers as Record<string, unknown>;
  }

  return source;
}

function extractFolders(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const source = raw as Record<string, unknown>;

  if (source.folders && typeof source.folders === "object") {
    return source.folders as Record<string, unknown>;
  }

  return {};
}

function cleanFolders(folders: FolderMap): FolderMap {
  const cleaned: FolderMap = {};

  for (const [folderId, folder] of Object.entries(folders)) {
    const memberIds = Array.isArray(folder.memberIds)
      ? folder.memberIds.filter((memberId) => typeof memberId === "string" && memberId.trim())
      : [];

    if (memberIds.length === 0) {
      continue;
    }

    cleaned[folderId] = {
      ...folder,
      memberIds,
    };
  }

  return cleaned;
}

function extractFolderIds(raw: unknown): Set<string> {
  return new Set(Object.keys(extractFolders(raw)));
}

function extractConnectableIds(raw: unknown): string[] {
  const layersContainer = extractLayerContainer(raw);
  const collected = new Set<string>();

  for (const layerValue of Object.values(layersContainer)) {
    if (!layerValue || typeof layerValue !== "object") {
      continue;
    }

    const layerObject = layerValue as Record<string, unknown>;

    const visibleSlotIds = Array.isArray(layerObject.visibleSlotIds)
      ? layerObject.visibleSlotIds
      : [];

    const hiddenSlotIds = Array.isArray(layerObject.hiddenSlotIds)
      ? layerObject.hiddenSlotIds
      : [];

    for (const value of [...visibleSlotIds, ...hiddenSlotIds]) {
      if (typeof value === "string" && value.startsWith("connectable:")) {
        collected.add(value);
      }
    }
  }

  return [...collected];
}

function extractAllRootEntityIds(raw: unknown): string[] {
  const layersContainer = extractLayerContainer(raw);
  const foldersContainer = extractFolders(raw);
  const collected = new Set<string>();

  for (const layerValue of Object.values(layersContainer)) {
    if (!layerValue || typeof layerValue !== "object") {
      continue;
    }

    const layerObject = layerValue as Record<string, unknown>;

    const visibleSlotIds = Array.isArray(layerObject.visibleSlotIds)
      ? layerObject.visibleSlotIds
      : [];

    const hiddenSlotIds = Array.isArray(layerObject.hiddenSlotIds)
      ? layerObject.hiddenSlotIds
      : [];

    for (const value of [...visibleSlotIds, ...hiddenSlotIds]) {
      if (typeof value === "string" && value.trim()) {
        collected.add(value);
      }
    }
  }

  for (const folderValue of Object.values(foldersContainer)) {
    if (!folderValue || typeof folderValue !== "object") {
      continue;
    }

    const folderObject = folderValue as Record<string, unknown>;
    const memberIds = Array.isArray(folderObject.memberIds)
      ? folderObject.memberIds
      : [];

    for (const value of memberIds) {
      if (typeof value === "string" && value.trim()) {
        collected.add(value);
      }
    }
  }

  return [...collected];
}
function readPersistedConnectableNameMap(): Record<
  string,
  PersistedConnectableStateRecord
> {
  try {
    const raw = window.localStorage.getItem(
      CONNECTABLE_CANDIDATE_STATE_STORAGE_KEY,
    );

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const source = parsed as Record<string, unknown>;
    const nextMap: Record<string, PersistedConnectableStateRecord> = {};

    for (const [key, value] of Object.entries(source)) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const record = value as Record<string, unknown>;

      nextMap[key] = {
        entityId:
          typeof record.entityId === "string" ? record.entityId : undefined,
        targetPid:
          typeof record.targetPid === "string" ? record.targetPid : undefined,
        name: typeof record.name === "string" ? record.name : undefined,
      };
    }

    return nextMap;
  } catch {
    return {};
  }
}

function readPersistedPeopleMap(): Record<string, PersistedDashboardPersonRecord> {
  try {
    const raw = window.localStorage.getItem(PEOPLE_STORE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const source = parsed as Record<string, unknown>;
    const state =
      source.state && typeof source.state === "object"
        ? (source.state as Record<string, unknown>)
        : source;

    const peopleRaw = Array.isArray(state.people) ? state.people : [];
    const nextMap: Record<string, PersistedDashboardPersonRecord> = {};

    for (const value of peopleRaw) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const person = value as Record<string, unknown>;
      const id = typeof person.id === "string" ? person.id : "";
      const name = typeof person.name === "string" ? person.name : "";

      if (!id.trim()) {
        continue;
      }

      nextMap[id] = {
        id,
        name,
      };
    }

    return nextMap;
  } catch {
    return {};
  }
}

function getFallbackNameFromPid(targetPid: string): string {
  const trimmed = targetPid.trim();

  if (!trimmed) {
    return "알 수 없음";
  }

  const lastColonIndex = trimmed.lastIndexOf(":");

  if (lastColonIndex >= 0 && lastColonIndex < trimmed.length - 1) {
    return trimmed.slice(lastColonIndex + 1);
  }

  return trimmed;
}

function getFallbackNameFromEntityId(entityId: string): string {
  const trimmed = entityId.trim();

  if (!trimmed) {
    return "알 수 없음";
  }

  const lastDashIndex = trimmed.lastIndexOf("-");

  if (lastDashIndex >= 0 && lastDashIndex < trimmed.length - 1) {
    return trimmed.slice(lastDashIndex + 1);
  }

  return trimmed;
}

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

function restorePersistedPeopleIntoCatalog(raw: unknown) {
  const persistedPeopleMap = readPersistedPeopleMap();
  const entityIds = extractAllRootEntityIds(raw);
  const folderIds = extractFolderIds(raw);

  for (const entityId of entityIds) {
    if (!entityId || entityId.startsWith("connectable:")) {
      continue;
    }

    if (folderIds.has(entityId)) {
      continue;
    }

    if (personCatalog[entityId]) {
      continue;
    }

    const persisted = persistedPeopleMap[entityId];
    const restoredName =
      persisted?.name?.trim() || getFallbackNameFromEntityId(entityId);

    personCatalog[entityId] = {
      id: entityId,
      initials: getInitialsFromName(restoredName),
      canonicalName: restoredName,
      myAlias: restoredName,
      profileHref: `/dashboard/people/${entityId}`,
      type: "person",
    };
  }
}

function restorePersistedConnectablesIntoCatalog(raw: unknown) {
  const persistedConnectableNameMap = readPersistedConnectableNameMap();
  const connectableIds = extractConnectableIds(raw);

  for (const entityId of connectableIds) {
    const targetPid = entityId.replace("connectable:", "");
    const persisted = persistedConnectableNameMap[entityId];

    const restoredName =
      persisted?.name?.trim() ||
      getFallbackNameFromPid(persisted?.targetPid?.trim() || targetPid);

    upsertDynamicConnectableCandidate({
      entityId,
      targetPid: persisted?.targetPid?.trim() || targetPid,
      name: restoredName,
    });
  }
}

function parseStorageValue(value: string | null): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function chooseStoredPayload(): unknown | null {
  return parseStorageValue(window.localStorage.getItem(STORAGE_KEY));
}

function buildPayload(
  layoutState: Record<string, LayerLayoutState>,
  folders: FolderMap,
): StoredHomePayload {
  return {
    layers: layoutState,
    folders: cleanFolders(folders),
  };
}

function writeStoragePayload(payload: StoredHomePayload): string {
  const serialized = JSON.stringify(payload);

  window.localStorage.setItem(STORAGE_KEY, serialized);

  return serialized;
}

function getExistingLayoutEntityIds(
  layoutState: Record<string, LayerLayoutState>,
): Set<string> {
  const ids = new Set<string>();

  for (const layer of Object.values(layoutState)) {
    for (const entityId of layer.visibleSlotIds) {
      if (entityId) {
        ids.add(entityId);
      }
    }

    for (const entityId of layer.hiddenSlotIds) {
      if (entityId) {
        ids.add(entityId);
      }
    }
  }

  return ids;
}

function getPreferredFallbackLayerId(
  layoutState: Record<string, LayerLayoutState>,
): string | null {
  const preferredOrder = ["maintain", "trust", "intimate", "core", "family"];

  for (const layerId of preferredOrder) {
    if (layoutState[layerId]) {
      return layerId;
    }
  }

  return Object.keys(layoutState)[0] ?? null;
}

function removeInvalidFolderIdsFromLayout(
  layoutState: Record<string, LayerLayoutState>,
  folders: FolderMap,
): Record<string, LayerLayoutState> {
  const validFolderIds = new Set(Object.keys(folders));
  const nextLayout: Record<string, LayerLayoutState> = {};

  for (const [layerId, layer] of Object.entries(layoutState)) {
    nextLayout[layerId] = {
      ...layer,
      visibleSlotIds: layer.visibleSlotIds.map((entityId) => {
        if (entityId && entityId.startsWith("folder-") && !validFolderIds.has(entityId)) {
          return null;
        }

        return entityId;
      }),
      hiddenSlotIds: layer.hiddenSlotIds.filter((entityId) => {
        if (entityId && entityId.startsWith("folder-") && !validFolderIds.has(entityId)) {
          return false;
        }

        return true;
      }),
    };
  }

  return nextLayout;
}

function reattachFolderIdsToLayout(
  layoutState: Record<string, LayerLayoutState>,
  folders: FolderMap,
  storedPayload: unknown,
): Record<string, LayerLayoutState> {
  const cleanedFolders = cleanFolders(folders);
  const nextLayout = removeInvalidFolderIdsFromLayout(
    layoutState,
    cleanedFolders,
  );

  const existingIds = getExistingLayoutEntityIds(nextLayout);
  const rawLayers = extractLayerContainer(storedPayload);

  for (const [rawLayerId, rawLayerValue] of Object.entries(rawLayers)) {
    const targetLayer = nextLayout[rawLayerId];

    if (!targetLayer || !rawLayerValue || typeof rawLayerValue !== "object") {
      continue;
    }

    const rawLayer = rawLayerValue as Record<string, unknown>;

    const rawVisibleSlotIds = Array.isArray(rawLayer.visibleSlotIds)
      ? rawLayer.visibleSlotIds
      : [];

    const rawHiddenSlotIds = Array.isArray(rawLayer.hiddenSlotIds)
      ? rawLayer.hiddenSlotIds
      : [];

    rawVisibleSlotIds.forEach((value, index) => {
      if (
        typeof value !== "string" ||
        !cleanedFolders[value] ||
        existingIds.has(value)
      ) {
        return;
      }

      if (index < targetLayer.visibleSlotIds.length) {
        targetLayer.visibleSlotIds[index] = value;
      } else {
        targetLayer.hiddenSlotIds.push(value);
      }

      existingIds.add(value);
    });

    for (const value of rawHiddenSlotIds) {
      if (
        typeof value !== "string" ||
        !cleanedFolders[value] ||
        existingIds.has(value)
      ) {
        continue;
      }

      targetLayer.hiddenSlotIds.push(value);
      existingIds.add(value);
    }
  }

  const fallbackLayerId = getPreferredFallbackLayerId(nextLayout);

  if (!fallbackLayerId) {
    return nextLayout;
  }

  const fallbackLayer = nextLayout[fallbackLayerId];

  for (const folderId of Object.keys(cleanedFolders)) {
    if (existingIds.has(folderId)) {
      continue;
    }

    const emptyVisibleIndex = fallbackLayer.visibleSlotIds.findIndex(
      (entityId) => !entityId,
    );

    if (emptyVisibleIndex >= 0) {
      fallbackLayer.visibleSlotIds[emptyVisibleIndex] = folderId;
    } else {
      fallbackLayer.hiddenSlotIds.push(folderId);
    }

    existingIds.add(folderId);
  }

  return nextLayout;
}

type SlotLocation = {
  layerId: string;
  area: "visible" | "hidden";
  index: number;
};

// Defensive consistency scrubber for layoutState/folders.
// Run once after hydration to repair pre-existing corrupt persisted state
// (duplicate person ids across root + folder, orphan folder references,
// empty / single-member folders, unknown person ids, etc.).
// Idempotent: returns the input references unchanged when already clean.
function scrubLayoutAndFolders(
  layout: Record<string, LayerLayoutState>,
  folders: FolderMap,
): { layout: Record<string, LayerLayoutState>; folders: FolderMap; changed: boolean } {
  const personCatalogIds = new Set(Object.keys(personCatalog));

  // ---- Pass 1: dedupe folder memberships ----
  // First-folder wins for any person id or nested folder id.
  const personOwnerFolder = new Map<string, string>();
  const folderOwnerFolder = new Map<string, string>();
  const cleanedFolders: FolderMap = {};
  let foldersChanged = false;

  for (const [folderId, folder] of Object.entries(folders)) {
    if (!folder) {
      foldersChanged = true;
      continue;
    }

    const cleanedMembers: string[] = [];
    const seenInThisFolder = new Set<string>();
    const originalFilledCount = folder.memberIds.filter(
      (memberId): memberId is string =>
        typeof memberId === "string" && memberId.trim().length > 0,
    ).length;

    for (const memberId of folder.memberIds) {
      if (typeof memberId !== "string" || !memberId.trim()) {
        continue;
      }

      if (seenInThisFolder.has(memberId)) {
        continue; // policy 3: within-folder dedup
      }

      if (memberId === "family-me") {
        continue; // family-me must never be inside a folder
      }

      if (memberId.startsWith("folder-")) {
        if (folderOwnerFolder.has(memberId)) {
          continue; // policy 4: cross-folder dedup for nested folder
        }
        folderOwnerFolder.set(memberId, folderId);
      } else {
        if (!personCatalogIds.has(memberId)) {
          continue; // policy 8: drop unknown person ids
        }
        if (personOwnerFolder.has(memberId)) {
          continue; // policy 4: cross-folder dedup for person
        }
        personOwnerFolder.set(memberId, folderId);
      }

      seenInThisFolder.add(memberId);
      cleanedMembers.push(memberId);
    }

    if (cleanedMembers.length !== originalFilledCount) {
      foldersChanged = true;
    }

    cleanedFolders[folderId] = {
      ...folder,
      memberIds: cleanedMembers,
    };
  }

  // ---- Pass 2: dedupe root slots, drop folder-owned persons, drop orphan folder ids ----
  const seenInRoot = new Set<string>();
  const intermediateLayout: Record<string, LayerLayoutState> = {};
  let layoutChanged = false;

  function processSlot(entityId: string | null): string | null {
    if (!entityId || !entityId.trim()) return null;

    if (entityId.startsWith("folder-")) {
      // policy 6: orphan folder id reference cleanup
      if (!cleanedFolders[entityId]) {
        layoutChanged = true;
        return null;
      }
      // nested folder must not also appear in root
      if (folderOwnerFolder.has(entityId)) {
        layoutChanged = true;
        return null;
      }
      if (seenInRoot.has(entityId)) {
        layoutChanged = true;
        return null;
      }
      seenInRoot.add(entityId);
      return entityId;
    }

    if (entityId === "family-me") {
      if (seenInRoot.has(entityId)) {
        layoutChanged = true;
        return null;
      }
      seenInRoot.add(entityId);
      return entityId;
    }

    // plain person id
    if (!personCatalogIds.has(entityId)) {
      layoutChanged = true;
      return null; // policy 8
    }
    if (personOwnerFolder.has(entityId)) {
      layoutChanged = true;
      return null; // policy 1: folder membership wins
    }
    if (seenInRoot.has(entityId)) {
      layoutChanged = true;
      return null; // policy 2: root dedup, first wins
    }
    seenInRoot.add(entityId);
    return entityId;
  }

  for (const [layerId, layer] of Object.entries(layout)) {
    const nextVisible = layer.visibleSlotIds.map(processSlot);
    const nextHiddenRaw = layer.hiddenSlotIds.map(processSlot);
    const nextHidden = normalizeHiddenSlots(nextHiddenRaw);
    intermediateLayout[layerId] = {
      visibleSlotIds: nextVisible,
      hiddenSlotIds: nextHidden,
    };
  }

  // ---- Pass 3: dissolve 0/1-member folders, iterate to fixed point ----
  let workLayout: Record<string, LayerLayoutState> = intermediateLayout;
  let workFolders: FolderMap = cleanedFolders;
  let dissolveChanged = false;

  const MAX_ITER = 16;

  for (let iter = 0; iter < MAX_ITER; iter += 1) {
    const folderLocations = new Map<string, SlotLocation>();
    for (const [layerId, layer] of Object.entries(workLayout)) {
      layer.visibleSlotIds.forEach((slot, index) => {
        if (slot && slot.startsWith("folder-") && workFolders[slot]) {
          folderLocations.set(slot, { layerId, area: "visible", index });
        }
      });
      layer.hiddenSlotIds.forEach((slot, index) => {
        if (slot && slot.startsWith("folder-") && workFolders[slot]) {
          folderLocations.set(slot, { layerId, area: "hidden", index });
        }
      });
    }

    let passChanged = false;
    const nextFolders: FolderMap = { ...workFolders };
    const nextLayout: Record<string, LayerLayoutState> = {};
    for (const [layerId, layer] of Object.entries(workLayout)) {
      nextLayout[layerId] = {
        visibleSlotIds: [...layer.visibleSlotIds],
        hiddenSlotIds: [...layer.hiddenSlotIds],
      };
    }

    function writeSlot(location: SlotLocation, value: string | null) {
      const array =
        location.area === "visible"
          ? nextLayout[location.layerId].visibleSlotIds
          : nextLayout[location.layerId].hiddenSlotIds;
      array[location.index] = value;
    }

    for (const [folderId, folder] of Object.entries(nextFolders)) {
      const count = folder.memberIds.length;
      const location = folderLocations.get(folderId);

      if (count === 0) {
        delete nextFolders[folderId];
        if (location) {
          writeSlot(location, null);
        }
        passChanged = true;
        continue;
      }

      if (count === 1) {
        const member = folder.memberIds[0];
        if (!member) {
          delete nextFolders[folderId];
          if (location) writeSlot(location, null);
          passChanged = true;
          continue;
        }
        delete nextFolders[folderId];
        if (location) {
          // policy 5: dissolve. Place member where the folder used to be.
          writeSlot(location, member);
        }
        passChanged = true;
      }
    }

    if (!passChanged) break;

    for (const layerId of Object.keys(nextLayout)) {
      nextLayout[layerId] = {
        visibleSlotIds: nextLayout[layerId].visibleSlotIds,
        hiddenSlotIds: normalizeHiddenSlots(nextLayout[layerId].hiddenSlotIds),
      };
    }

    workLayout = nextLayout;
    workFolders = nextFolders;
    dissolveChanged = true;
  }

  const changed = foldersChanged || layoutChanged || dissolveChanged;
  return changed
    ? { layout: workLayout, folders: workFolders, changed: true }
    : { layout, folders, changed: false };
}

export function useHomeLayoutStorage({
  layoutState,
  folders,
  setLayoutState,
  setFolders,
}: {
  layoutState: Record<string, LayerLayoutState>;
  folders: FolderMap;
  setLayoutState: Dispatch<SetStateAction<Record<string, LayerLayoutState>>>;
  setFolders: Dispatch<SetStateAction<FolderMap>>;
}) {
  const [storageReady, setStorageReady] = useState(false);

  const lastSavedSerializedRef = useRef("");
  const saveEnabledRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    try {
      const storedPayload = chooseStoredPayload();

      if (!storedPayload) {
        saveEnabledRef.current = true;

        if (mounted) {
          setStorageReady(true);
        }

        return;
      }

      restorePersistedPeopleIntoCatalog(storedPayload);
      restorePersistedConnectablesIntoCatalog(storedPayload);

      const normalized = normalizeStoredState(storedPayload);

      if (!normalized) {
        saveEnabledRef.current = true;

        if (mounted) {
          setStorageReady(true);
        }

        return;
      }

      const cleanedFolders = cleanFolders(normalized.folders);

      const restoredLayout = reattachFolderIdsToLayout(
        normalized.layout,
        cleanedFolders,
        storedPayload,
      );

      // Defensive scrubber: repair pre-existing duplicates / orphan refs /
      // empty/single-member folders / unknown person ids. Idempotent on
      // already-clean state.
      const scrubbed = scrubLayoutAndFolders(restoredLayout, cleanedFolders);
      const finalLayout = scrubbed.layout;
      const finalFolders = scrubbed.folders;

      const loadedPayload = buildPayload(finalLayout, finalFolders);
      lastSavedSerializedRef.current = JSON.stringify(loadedPayload);

      setLayoutState(finalLayout);
      setFolders(finalFolders);

      window.setTimeout(() => {
        saveEnabledRef.current = true;

        if (mounted) {
          setStorageReady(true);
        }
      }, 250);
    } catch (error) {
      console.error("Failed to load home layout storage:", error);
      saveEnabledRef.current = true;

      if (mounted) {
        setStorageReady(true);
      }
    }

    return () => {
      mounted = false;
    };
  }, [setFolders, setLayoutState]);

  useEffect(() => {
    if (!storageReady || !saveEnabledRef.current) {
      return;
    }

    try {
      const cleanedFolders = cleanFolders(folders);

      const layoutWithFolders = reattachFolderIdsToLayout(
        layoutState,
        cleanedFolders,
        {
          layers: layoutState,
          folders: cleanedFolders,
        },
      );

      const payload = buildPayload(layoutWithFolders, cleanedFolders);
      const serialized = JSON.stringify(payload);

      if (serialized === lastSavedSerializedRef.current) {
        return;
      }

      lastSavedSerializedRef.current = writeStoragePayload(payload);
    } catch (error) {
      console.error("Failed to save home layout storage:", error);
    }
  }, [folders, layoutState, storageReady]);

  useEffect(() => {
    if (!storageReady || !saveEnabledRef.current) {
      return;
    }

    function forceSave() {
      try {
        const cleanedFolders = cleanFolders(folders);

        const layoutWithFolders = reattachFolderIdsToLayout(
          layoutState,
          cleanedFolders,
          {
            layers: layoutState,
            folders: cleanedFolders,
          },
        );

        const payload = buildPayload(layoutWithFolders, cleanedFolders);
        lastSavedSerializedRef.current = writeStoragePayload(payload);
      } catch {
        // ignore force save error
      }
    }

    function handleBeforeUnload() {
      forceSave();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        forceSave();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [folders, layoutState, storageReady]);
}