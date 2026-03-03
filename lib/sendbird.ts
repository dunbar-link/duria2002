/**
 * ⚠️ INTERNAL TEST BUILD STUB
 *
 * Sendbird 채팅 기능은 베타 이후 정식 정비.
 * 현재는 빌드 통과 및 Path 데모 배포가 목적이므로
 * 모든 Sendbird 관련 호출을 안전하게 비활성화한다.
 */

export async function connectSendbird(_userId: string) {
  throw new Error("Sendbird disabled in internal test build");
}

export async function sendToSendbird(
  _userId: string,
  _channelUrl: string,
  _message: string
) {
  throw new Error("Sendbird disabled in internal test build");
}