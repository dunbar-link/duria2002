export const PROFILE_STORAGE_KEY = "dunbar-link-me-profile-v3";
const PROFILE_STORAGE_KEY_V2 = "dunbar-link-me-profile-v2";
const PROFILE_STORAGE_KEY_V1 = "dunbar-link-me-profile-v1";
export const PROFILE_UPDATED_EVENT = "dunbar-link-me-profile-updated";

export function readMeProfileName(): string {
  if (typeof window === "undefined") {
    return "";
  }

  for (const key of [
    PROFILE_STORAGE_KEY,
    PROFILE_STORAGE_KEY_V2,
    PROFILE_STORAGE_KEY_V1,
  ]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { name?: unknown };
      const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
      if (name) {
        return name;
      }
    } catch {
      // ignore parse errors and fall through to the next key
    }
  }

  return "";
}

export function writeMeProfileNameIfEmpty(name: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }

  let profile: Record<string, unknown> = {};
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        profile = parsed as Record<string, unknown>;
      }
    }
  } catch {
    profile = {};
  }

  const existing =
    typeof profile.name === "string" ? profile.name.trim() : "";
  if (existing) {
    return false;
  }

  profile.name = trimmed;

  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    return false;
  }

  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
  return true;
}
