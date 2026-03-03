// lib/messageStore.ts
export type DbMessage = {
  id: string;
  sendbird_message_id: number;
  channel_url: string;
  user_id: string | null;
  message: string | null;
  created_at: string | null;
  inserted_at?: string | null;
};

function keyOf(m: Pick<DbMessage, "sendbird_message_id">) {
  return String(m.sendbird_message_id);
}

/**
 * messages를 sendbird_message_id 기준으로 "항상 1개만" 유지하면서 병합.
 * - 동일 키가 들어오면 최신 데이터를 덮어씀 (replace)
 * - 결과는 created_at 기준 오름차순 정렬(채팅 UI용)
 */
export function mergeMessages(
  prev: DbMessage[],
  incoming: DbMessage[],
): DbMessage[] {
  const map = new Map<string, DbMessage>();

  // 기존
  for (const m of prev) map.set(keyOf(m), m);

  // 신규/업데이트 (항상 덮어쓰기)
  for (const m of incoming) map.set(keyOf(m), m);

  const out = Array.from(map.values());

  // created_at이 없으면 inserted_at -> 그래도 없으면 그대로
  out.sort((a, b) => {
    const atA = a.created_at ?? a.inserted_at ?? "";
    const atB = b.created_at ?? b.inserted_at ?? "";
    return atA.localeCompare(atB);
  });

  return out;
}

/**
 * Realtime payload가 partial인 경우가 있어서,
 * 최소 필드만 있어도 merge 되게 안전하게 normalize.
 */
export function normalizeRealtimeRow(row: any): DbMessage | null {
  if (!row) return null;
  const sendbird_message_id = row.sendbird_message_id;
  if (sendbird_message_id == null) return null;

  return {
    id: row.id,
    sendbird_message_id: Number(sendbird_message_id),
    channel_url: row.channel_url,
    user_id: row.user_id ?? null,
    message: row.message ?? null,
    created_at: row.created_at ?? null,
    inserted_at: row.inserted_at ?? null,
  };
}