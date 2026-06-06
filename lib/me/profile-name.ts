export const PROFILE_STORAGE_KEY = "dunbar-link-me-profile-v3";
const PROFILE_STORAGE_KEY_V2 = "dunbar-link-me-profile-v2";
const PROFILE_STORAGE_KEY_V1 = "dunbar-link-me-profile-v1";
export const PROFILE_UPDATED_EVENT = "dunbar-link-me-profile-updated";

/** 핵심 기능(초대/수락/신호) 차단 시 보여줄 정확한 안내 문구. */
export const ME_NAME_REQUIRED_MESSAGE = "이름을 입력하세요";

/**
 * me 이름이 "미완성"인지 판정한다.
 * - trim 후 빈 값
 * - trim 후 "나" (실제 이름이 아닌 임시 placeholder)
 *
 * 이 두 경우 초대 보내기 / 초대 수락 / 신호 보내기를 막고,
 * "나"/빈 값이 dl_invites 등 서버에 박제되지 않도록 한다.
 */
export function isIncompleteMeName(name: string | null | undefined): boolean {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed === "" || trimmed === "나";
}

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
