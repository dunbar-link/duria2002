"use client";

import { useState } from "react";
import type { SignalRecord } from "@/lib/signal/read-signals";
import VoiceSignalPreview, {
  type VoiceSendPayload,
} from "../home/voice-signal-preview";

// P4-PIVOT: 사람 상세 "2초 신호방".
// 채팅방처럼 익숙하게 보이되 텍스트 채팅은 없다 — 2초 음성/이모지 신호만 흐른다.
// 우선순위: 🎙️ 2초 음성(메인) > 🎥 2초 영상(준비중, P4-2) > 😊 이모지(보조).
// 전송 권한/연결 검증은 서버(/api/signals/voice)가 다시 한다.

type Props = {
  connected: boolean;
  currentUserId: string;
  // null = 불러오는 중, [] = 기록 없음.
  signals: SignalRecord[] | null;
  onSendVoice: (
    payload: VoiceSendPayload,
  ) => Promise<{ ok: boolean; error?: string }>;
  onOpenEmoji: () => void;
  onVideoNotice: () => void;
};

function isVoiceSignal(signal: SignalRecord) {
  return signal.type === "voice";
}

function isExpiredVoice(signal: SignalRecord) {
  if (!isVoiceSignal(signal)) return false;
  const t = signal.expires_at ? Date.parse(signal.expires_at) : Number.NaN;
  return !Number.isFinite(t) || t <= Date.now();
}

function formatSignalTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "방금";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function TwoSecondRoom({
  connected,
  currentUserId,
  signals,
  onSendVoice,
  onOpenEmoji,
  onVideoNotice,
}: Props) {
  const [recorderOpen, setRecorderOpen] = useState(false);
  // 음성 재생: signalId → signed URL(120초 TTL) / 에러 문구. 신호함과 동일 흐름.
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  const [voiceErrors, setVoiceErrors] = useState<Record<string, string>>({});
  const [voiceLoadingId, setVoiceLoadingId] = useState<string | null>(null);

  async function handleLoadVoiceUrl(signal: SignalRecord) {
    if (voiceLoadingId === signal.id) return;
    setVoiceLoadingId(signal.id);
    setVoiceErrors((current) => ({ ...current, [signal.id]: "" }));

    try {
      const res = await fetch(
        `/api/signals/voice-url?signalId=${encodeURIComponent(signal.id)}`,
      );
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; url?: string }
        | null;

      if (res.status === 410) {
        setVoiceErrors((current) => ({
          ...current,
          [signal.id]: "만료된 음성 신호예요.",
        }));
        return;
      }
      if (!res.ok || !data?.ok || !data.url) {
        setVoiceErrors((current) => ({
          ...current,
          [signal.id]: "음성을 불러오지 못했어요.",
        }));
        return;
      }
      setVoiceUrls((current) => ({ ...current, [signal.id]: data.url as string }));
    } catch {
      setVoiceErrors((current) => ({
        ...current,
        [signal.id]: "음성을 불러오지 못했어요.",
      }));
    } finally {
      setVoiceLoadingId(null);
    }
  }

  // 채팅방처럼 오래된 신호가 위, 최신이 아래.
  const ordered = signals ? [...signals].slice().reverse() : null;

  return (
    <div className="rounded-[22px] bg-[#FAFAF8] px-4 py-3.5 shadow-sm ring-1 ring-[#D3D1C7]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">2초 신호방</h2>
        <span className="rounded-full bg-[#F2F0E9] px-2.5 py-1 text-[11px] font-semibold text-[#8D99AE]">
          24시간 후 사라져요
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-[#64748B]">
        대화 대신 2초 신호만 주고받는 방이에요.
      </p>

      {/* 신호 기록(채팅처럼 보이는 영역 — 텍스트 입력 없음) */}
      <div className="mt-2.5 rounded-[16px] bg-white/70 px-2.5 py-2.5 ring-1 ring-[#E7E4DA]">
        {!connected ? (
          <p className="py-4 text-center text-[13px] leading-5 text-[#64748B]">
            연결되면 주고받은 2초 신호가 여기에 표시돼요.
          </p>
        ) : ordered === null ? (
          <p className="py-4 text-center text-[13px] text-[#8D99AE]">
            불러오는 중...
          </p>
        ) : ordered.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-[13px] font-semibold text-[#334155]">
              아직 주고받은 2초 신호가 없어요
            </p>
            <p className="mt-1 text-[12px] text-[#8D99AE]">
              짧게 목소리를 남겨보세요
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ordered.map((signal) => {
              const isSent = signal.sender_id === currentUserId;
              const isVoice = isVoiceSignal(signal);
              const expired = isExpiredVoice(signal);
              const voiceUrl = voiceUrls[signal.id] ?? "";
              const voiceError = voiceErrors[signal.id] ?? "";

              return (
                <li
                  key={signal.id}
                  className={`flex ${isSent ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-[16px] px-3 py-2 ring-1 ${
                      isSent
                        ? "bg-[#EFE7FA] ring-[#CDB7EE]"
                        : "bg-white ring-[#E7E4DA]"
                    }`}
                  >
                    {isVoice ? (
                      <div>
                        <p className="text-[12px] font-semibold text-[#334155]">
                          🎙️ 2초 음성 신호
                        </p>
                        {expired ? (
                          <p className="mt-1 text-[11px] text-[#8D99AE]">
                            만료된 음성 신호예요.
                          </p>
                        ) : voiceUrl ? (
                          /* 자동재생 금지 — 사용자가 직접 재생. 다운로드 버튼 없음. */
                          <audio
                            src={voiceUrl}
                            controls
                            controlsList="nodownload"
                            preload="metadata"
                            className="mt-1 h-[32px] w-[200px] max-w-full"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void handleLoadVoiceUrl(signal);
                            }}
                            disabled={voiceLoadingId === signal.id}
                            className="mt-1 rounded-full bg-[#0F172A] px-3 py-1.5 text-[11px] font-semibold text-white active:scale-95 disabled:opacity-40"
                          >
                            {voiceLoadingId === signal.id
                              ? "불러오는 중..."
                              : "▶ 듣기"}
                          </button>
                        )}
                        {voiceError ? (
                          <p className="mt-1 text-[11px] text-rose-500">
                            {voiceError}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[22px] leading-none">
                        {signal.emoji}
                      </span>
                    )}
                    <p className="mt-1 text-[10px] text-[#8D99AE]">
                      {formatSignalTime(signal.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 액션 바: 음성 메인 / 영상 준비중 / 이모지 보조 */}
      <div className="mt-3 flex items-stretch gap-[8px]">
        <button
          type="button"
          onClick={() => setRecorderOpen((value) => !value)}
          disabled={!connected}
          className="flex h-[48px] flex-1 items-center justify-center gap-1.5 rounded-[16px] bg-[#0F172A] text-[14px] font-bold text-white active:scale-[0.98] disabled:opacity-40"
        >
          🎙️ 2초 음성
        </button>
        <button
          type="button"
          onClick={onVideoNotice}
          className="flex h-[48px] shrink-0 flex-col items-center justify-center rounded-[16px] bg-white px-3 ring-1 ring-[#D3D1C7] active:scale-[0.98]"
        >
          <span className="text-[13px] font-semibold text-[#94A3B8]">
            🎥 2초 영상
          </span>
          <span className="text-[9px] font-semibold text-[#B7BEC8]">준비중</span>
        </button>
        <button
          type="button"
          onClick={onOpenEmoji}
          aria-label="이모지 신호 보내기"
          className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[16px] bg-white text-[20px] ring-1 ring-[#D3D1C7] active:scale-[0.98]"
        >
          😊
        </button>
      </div>

      {!connected ? (
        <p className="mt-2 text-center text-[12px] text-[#8D99AE]">
          연결된 친구에게만 보낼 수 있어요.
        </p>
      ) : null}

      {recorderOpen && connected ? (
        <div className="mt-2.5">
          <VoiceSignalPreview
            onSend={async (payload) => {
              const result = await onSendVoice(payload);
              if (result.ok) {
                setRecorderOpen(false);
              }
              return result;
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
