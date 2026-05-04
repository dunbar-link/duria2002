export const CURRENT_USER_ID_STORAGE_KEY = "dunbar-link-current-user-id-v1";

function createLocalUserId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dl-user-${crypto.randomUUID()}`;
  }

  return `dl-user-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getCurrentUserId() {
  if (typeof window === "undefined") {
    return "";
  }

  const stored = window.localStorage.getItem(CURRENT_USER_ID_STORAGE_KEY)?.trim();

  if (stored && stored !== "me") {
    return stored;
  }

  const nextUserId = createLocalUserId();
  window.localStorage.setItem(CURRENT_USER_ID_STORAGE_KEY, nextUserId);

  return nextUserId;
}

export function resetCurrentUserIdForLocalTest() {
  if (typeof window === "undefined") {
    return "";
  }

  const nextUserId = createLocalUserId();
  window.localStorage.setItem(CURRENT_USER_ID_STORAGE_KEY, nextUserId);

  return nextUserId;
}
