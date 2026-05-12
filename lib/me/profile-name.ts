const PROFILE_STORAGE_KEY_V3 = "dunbar-link-me-profile-v3";
const PROFILE_STORAGE_KEY_V2 = "dunbar-link-me-profile-v2";
const PROFILE_STORAGE_KEY_V1 = "dunbar-link-me-profile-v1";

export function readMeProfileName(): string {
  if (typeof window === "undefined") {
    return "";
  }

  for (const key of [
    PROFILE_STORAGE_KEY_V3,
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
