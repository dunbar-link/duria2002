// 기존 브라우저 localStorage 의 dl-user-id(legacy_user_id) 형식 검증.
// lib/auth/current-user.ts 의 createLocalUserId 가 만드는 두 형식을 모두 허용한다:
//   - dl-user-<uuid>                     (crypto.randomUUID)
//   - dl-user-<timestamp>-<base36 rand>  (fallback)
// 빈 값 / 과도한 길이 / prefix 불일치는 거부한다.
const LEGACY_USER_ID_PATTERN = /^dl-user-[A-Za-z0-9-]{6,80}$/;

export function isValidLegacyUserId(value: unknown): value is string {
  return typeof value === "string" && LEGACY_USER_ID_PATTERN.test(value.trim());
}

export function normalizeLegacyUserId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return isValidLegacyUserId(trimmed) ? trimmed : null;
}
