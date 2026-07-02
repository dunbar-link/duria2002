"use client";

import { useEffect, useRef, useState } from "react";

// P4-1A: 2초 음성 신호 local preview.
// 녹음 가능성(권한/MediaRecorder/포맷) 검증 전용 — 전송/업로드/DB/푸시 없음.
// 실전송은 P4-1B(서버 route + private storage)에서 별도 승인 후 진행.

const RECORD_LIMIT_MS = 2000;

// iOS Safari 는 webm 미지원(audio/mp4 로 fallback). 순서대로 첫 지원 타입 사용.
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

type VoiceState = "idle" | "recording" | "preview" | "unsupported" | "error";

function pickSupportedMimeType(): string {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return "";
  }
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      // isTypeSupported 가 예외를 던지는 브라우저는 후보를 건너뛴다.
    }
  }
  return "";
}

function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

export default function VoiceSignalPreview() {
  const [state, setState] = useState<VoiceState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewSize, setPreviewSize] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  // 취소 시 onstop 에서 preview 를 만들지 않기 위한 플래그.
  const discardRef = useRef(false);
  const previewUrlRef = useRef("");

  useEffect(() => {
    if (!isRecordingSupported()) {
      setState("unsupported");
    }
    return () => {
      cleanupRecording(true);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearTimers() {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }

  function stopStreamTracks() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }

  function cleanupRecording(discard: boolean) {
    clearTimers();
    discardRef.current = discard;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // 이미 정지된 recorder 는 무시.
      }
    }
    recorderRef.current = null;
    stopStreamTracks();
  }

  function releasePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
    setPreviewUrl("");
    setPreviewSize(0);
  }

  async function startRecording() {
    if (!isRecordingSupported()) {
      setState("unsupported");
      return;
    }
    // 재녹음: 이전 preview blob/url 정리.
    releasePreview();
    setErrorMessage("");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMessage("마이크 권한을 허용하면 녹음할 수 있어요.");
      setState("error");
      return;
    }

    let recorder: MediaRecorder;
    try {
      const mimeType = pickSupportedMimeType();
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      setErrorMessage("이 브라우저에서는 아직 녹음이 어려워요.");
      setState("unsupported");
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    discardRef.current = false;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      clearTimers();
      discardRef.current = true;
      stopStreamTracks();
      recorderRef.current = null;
      setErrorMessage("녹음 중 문제가 생겼어요. 다시 시도해줘요.");
      setState("error");
    };

    recorder.onstop = () => {
      clearTimers();
      stopStreamTracks();
      recorderRef.current = null;

      if (discardRef.current) {
        chunksRef.current = [];
        return;
      }

      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];

      if (blob.size === 0) {
        setErrorMessage("녹음이 비어 있어요. 다시 시도해줘요.");
        setState("error");
        return;
      }

      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewSize(blob.size);
      setState("preview");
    };

    try {
      recorder.start();
    } catch {
      cleanupRecording(true);
      setErrorMessage("녹음을 시작하지 못했어요.");
      setState("error");
      return;
    }

    setElapsedMs(0);
    setState("recording");

    const startedAt = Date.now();
    tickTimerRef.current = window.setInterval(() => {
      setElapsedMs(Math.min(RECORD_LIMIT_MS, Date.now() - startedAt));
    }, 100);
    // 2초 자동 정지.
    stopTimerRef.current = window.setTimeout(() => {
      const active = recorderRef.current;
      if (active && active.state !== "inactive") {
        try {
          active.stop();
        } catch {
          // stop 실패는 onerror 쪽에서 처리.
        }
      }
    }, RECORD_LIMIT_MS);
  }

  function stopEarly() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      clearTimers();
      try {
        recorder.stop();
      } catch {
        // 무시.
      }
    }
  }

  function cancelRecording() {
    cleanupRecording(true);
    setElapsedMs(0);
    setState("idle");
  }

  function resetToIdle() {
    releasePreview();
    setErrorMessage("");
    setElapsedMs(0);
    setState("idle");
  }

  const remainSeconds = Math.max(0, (RECORD_LIMIT_MS - elapsedMs) / 1000);
  const progressPercent = Math.min(100, (elapsedMs / RECORD_LIMIT_MS) * 100);

  return (
    <div className="rounded-[18px] border border-slate-200 bg-white px-[13px] py-[12px] shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
      <div className="mb-[6px] flex items-center justify-between">
        <span className="text-[13px] font-bold text-slate-800">
          🎙️ 2초 음성 신호
        </span>
        <span className="rounded-full bg-slate-100 px-[8px] py-[2px] text-[10px] font-semibold text-slate-500">
          미리듣기 전용
        </span>
      </div>

      {state === "unsupported" ? (
        <p className="text-[11px] text-slate-400">
          이 브라우저에서는 아직 녹음이 어려워요.
        </p>
      ) : null}

      {state === "idle" ? (
        <div>
          <p className="mb-[8px] text-[11px] text-slate-400">
            짧게 목소리만 남겨요. 지금은 내 기기에서만 미리듣기.
          </p>
          <button
            type="button"
            onClick={() => {
              void startRecording();
            }}
            className="h-[34px] rounded-full bg-slate-800 px-[16px] text-[12px] font-semibold text-white active:scale-95"
          >
            녹음 시작
          </button>
        </div>
      ) : null}

      {state === "recording" ? (
        <div>
          <div className="mb-[6px] flex items-center gap-[8px]">
            <span className="h-[8px] w-[8px] animate-pulse rounded-full bg-red-500" />
            <span className="text-[12px] font-semibold text-slate-700">
              녹음 중... {remainSeconds.toFixed(1)}초
            </span>
          </div>
          <div className="mb-[8px] h-[4px] w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-red-400 transition-[width] duration-100"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex gap-[8px]">
            <button
              type="button"
              onClick={stopEarly}
              className="h-[32px] rounded-full bg-slate-800 px-[14px] text-[12px] font-semibold text-white active:scale-95"
            >
              정지
            </button>
            <button
              type="button"
              onClick={cancelRecording}
              className="h-[32px] rounded-full border border-slate-200 bg-white px-[14px] text-[12px] font-semibold text-slate-500 active:scale-95"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {state === "preview" ? (
        <div>
          {/* 자동재생 금지 — 사용자가 눌러서 재생. */}
          <audio
            src={previewUrl}
            controls
            preload="metadata"
            className="mb-[8px] h-[36px] w-full"
          />
          <p className="mb-[8px] text-[11px] text-slate-400">
            {Math.round(previewSize / 1024)}KB · 전송은 다음 단계에서 열려요.
          </p>
          <div className="flex gap-[8px]">
            <button
              type="button"
              onClick={() => {
                void startRecording();
              }}
              className="h-[32px] rounded-full bg-slate-800 px-[14px] text-[12px] font-semibold text-white active:scale-95"
            >
              다시 녹음
            </button>
            <button
              type="button"
              onClick={resetToIdle}
              className="h-[32px] rounded-full border border-slate-200 bg-white px-[14px] text-[12px] font-semibold text-slate-500 active:scale-95"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {state === "error" ? (
        <div>
          <p className="mb-[8px] text-[11px] text-slate-400">{errorMessage}</p>
          <button
            type="button"
            onClick={resetToIdle}
            className="h-[32px] rounded-full border border-slate-200 bg-white px-[14px] text-[12px] font-semibold text-slate-500 active:scale-95"
          >
            다시 시도
          </button>
        </div>
      ) : null}
    </div>
  );
}
