/**
 * ⚠️ INTERNAL TEST BUILD STUB
 *
 * Sendbird 채팅은 베타 이후 정식 정비.
 * 현재는 Path 데모 배포가 목적이므로 Sendbird 초기화를 비활성화한다.
 */

export type SendbirdClient = null;

let sbSingleton: SendbirdClient = null;

export function getSendbird(): SendbirdClient {
  return sbSingleton;
}

export async function initSendbird(): Promise<SendbirdClient> {
  sbSingleton = null;
  throw new Error("Sendbird disabled in internal test build");
}