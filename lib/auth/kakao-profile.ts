// Supabase Kakao OAuth 후 user.user_metadata 에서 닉네임/사진 후보를 안전하게
// 추출한다. metadata 는 unknown 으로 받아 타입을 검증한 뒤에만 사용한다.
// - 문자열만 허용, trim 후 빈 값 제외
// - 사진은 https:// URL 만 허용(javascript:/data:/file: 등 차단)
// - metadata 원문/토큰은 저장하지 않는다(여기서는 추출만)

export type KakaoProfileCandidate = {
  nickname: string | null;
  photoUrl: string | null;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asHttpsUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  try {
    return new URL(text).protocol === "https:" ? text : null;
  } catch {
    return null;
  }
}

function getNested(source: unknown, path: readonly string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (current && typeof current === "object" && key in (current as object)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

// 실제 Supabase Kakao metadata 구조는 환경에 따라 다를 수 있어 후보를 순서대로
// 확인한다(존재·타입 검증 후 첫 유효값 사용).
const NICKNAME_PATHS: readonly (readonly string[])[] = [
  ["nickname"],
  ["name"],
  ["full_name"],
  ["preferred_username"],
  ["user_name"],
  ["properties", "nickname"],
  ["kakao_account", "profile", "nickname"],
];

const PHOTO_PATHS: readonly (readonly string[])[] = [
  ["avatar_url"],
  ["picture"],
  ["profile_image"],
  ["profile_image_url"],
  ["properties", "profile_image"],
  ["kakao_account", "profile", "profile_image_url"],
  ["kakao_account", "profile", "thumbnail_image_url"],
];

export function extractKakaoProfile(metadata: unknown): KakaoProfileCandidate {
  let nickname: string | null = null;
  for (const path of NICKNAME_PATHS) {
    nickname = asString(getNested(metadata, path));
    if (nickname) break;
  }

  let photoUrl: string | null = null;
  for (const path of PHOTO_PATHS) {
    photoUrl = asHttpsUrl(getNested(metadata, path));
    if (photoUrl) break;
  }

  return { nickname, photoUrl };
}
