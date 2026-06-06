"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUserId } from "@/lib/auth/current-user";
import {
  readSignalsForUser,
  type SignalRecord,
} from "@/lib/signal/read-signals";
import { supabase } from "@/lib/supabase-client";
import { usePeopleStore } from "@/app/dashboard/people/store";

type LoadStatus = "idle" | "loading" | "success" | "error";

const HOME_BLUE_SIGNAL_SENDERS_STORAGE_KEY =
  "dunbar-link-home-blue-signal-senders-v1";
const HOME_BLUE_SIGNAL_CHANGE_EVENT = "dunbar-link-blue-signals-changed";

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

function readBlueSignalSenderIds() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(
      HOME_BLUE_SIGNAL_SENDERS_STORAGE_KEY,
    );
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [] as string[];
    }

    return Array.from(
      new Set(
        parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean),
      ),
    );
  } catch {
    return [] as string[];
  }
}

function writeBlueSignalSenderIds(senderIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  const uniqueIds = Array.from(
    new Set(senderIds.map((item) => item.trim()).filter(Boolean)),
  );

  window.localStorage.setItem(
    HOME_BLUE_SIGNAL_SENDERS_STORAGE_KEY,
    JSON.stringify(uniqueIds),
  );

  window.dispatchEvent(new Event(HOME_BLUE_SIGNAL_CHANGE_EVENT));
}

function removeBlueSignalSenderIds(senderIds: string[]) {
  const removeSet = new Set(senderIds.map((item) => item.trim()).filter(Boolean));

  if (removeSet.size === 0) {
    return;
  }

  const current = readBlueSignalSenderIds();
  const next = current.filter((senderId) => !removeSet.has(senderId));
  writeBlueSignalSenderIds(next);
}

export default function SignalsPage() {
  const people = usePeopleStore((state) => state.people);
  const inviteDrafts = usePeopleStore((state) => state.inviteDrafts);
  const syncAcceptedInvitesToPeople = usePeopleStore(
    (state) => state.syncAcceptedInvitesToPeople,
  );

  const [currentUserId, setCurrentUserId] = useState("");
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [message, setMessage] = useState("");
  const [busySignalId, setBusySignalId] = useState<string | null>(null);

  useEffect(() => {
    const userId = getCurrentUserId();
    setCurrentUserId(userId);
  }, []);

  // 신호함 진입 시에도 연결된 사람 이름을 최신화한다. 상대가 Me 이름을
  // 바꾸면(refresh-name) /api/invites/mine 재조회로 people.name 이 갱신되어
  // 보낸사람/받는사람 표시가 stale 되지 않는다.
  useEffect(() => {
    void syncAcceptedInvitesToPeople();
  }, [syncAcceptedInvitesToPeople]);

  const unreadSignals = useMemo(() => {
    return signals.filter(
      (signal) => signal.receiver_id === currentUserId && !signal.is_read,
    );
  }, [currentUserId, signals]);

  const unreadCount = unreadSignals.length;

  const getPersonName = useCallback(
    (userId: string) => {
      if (!userId) {
        return "알 수 없음";
      }

      if (userId === currentUserId) {
        return "나";
      }

      // 1순위: people store 에서 senderId 매핑(직접 라벨링한 이름).
      const matched = people.find((person) => {
        const record = person as unknown as Record<string, unknown>;
        return (
          person.id === userId ||
          record.userId === userId ||
          record.dlUserId === userId ||
          record.acceptedPersonId === userId
        );
      });

      if (matched?.name?.trim()) {
        return matched.name;
      }

      // 2순위: inviteDrafts 로 senderId 보강. signals 테이블에는 sender_name
      // 컬럼이 없어(스키마 변경 금지) 렌더 시 senderId 로 이름을 찾아야 하는데,
      // people 에 아직 반영되지 않은 연결(초대자/수락자)이 있으면 여기서 찾는다.
      // A 가 me 이름을 바꾸면 refresh-name 으로 inviterName 이 갱신되어 이 경로로
      // 새 이름이 표시된다. 매핑이 가능하면 "알 수 없음" 으로 떨어지지 않는다.
      const draftMatch = inviteDrafts.find(
        (draft) =>
          (draft.inviterUserId && draft.inviterUserId === userId) ||
          (draft.acceptedPersonId && draft.acceptedPersonId === userId),
      );

      if (draftMatch) {
        if (
          draftMatch.inviterUserId === userId &&
          draftMatch.inviterName?.trim()
        ) {
          return draftMatch.inviterName;
        }
        if (
          draftMatch.acceptedPersonId === userId &&
          draftMatch.acceptedPersonName?.trim()
        ) {
          return draftMatch.acceptedPersonName;
        }
        if (draftMatch.inviteeName?.trim()) {
          return draftMatch.inviteeName;
        }
      }

      return "알 수 없음";
    },
    [currentUserId, people, inviteDrafts],
  );

  const loadSignals = useCallback(async () => {
    if (!currentUserId || currentUserId === "me") {
      return;
    }

    setLoadStatus("loading");
    setMessage("");

    try {
      const rows = await readSignalsForUser(currentUserId);
      setSignals(rows);
      setLoadStatus("success");
    } catch (error) {
      console.error("신호함 로딩 실패:", error);
      setLoadStatus("error");
      setMessage("신호를 불러오지 못했어요.");
    }
  }, [currentUserId]);

  useEffect(() => {
    void loadSignals();
  }, [loadSignals]);

  useEffect(() => {
    if (!currentUserId || currentUserId === "me") {
      return;
    }

    const channel = supabase
      .channel(`signals-page-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signals",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        () => {
          void loadSignals();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "signals",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        () => {
          void loadSignals();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadSignals]);

  async function markSignalRead(signal: SignalRecord) {
    if (signal.receiver_id !== currentUserId || signal.is_read) {
      return;
    }

    setBusySignalId(signal.id);
    setMessage("");

    const { error } = await supabase
      .from("signals")
      .update({ is_read: true })
      .eq("id", signal.id)
      .eq("receiver_id", currentUserId);

    setBusySignalId(null);

    if (error) {
      console.error("신호 읽음 처리 실패:", error);
      setMessage("읽음 처리에 실패했어요.");
      return;
    }

    setSignals((current) =>
      current.map((item) =>
        item.id === signal.id
          ? {
              ...item,
              is_read: true,
            }
          : item,
      ),
    );

    removeBlueSignalSenderIds([signal.sender_id]);
  }

  async function handleMarkAllRead() {
    if (!currentUserId || currentUserId === "me") {
      return;
    }

    if (unreadSignals.length === 0) {
      setMessage("읽지 않은 신호가 없어요.");
      return;
    }

    setMessage("");

    const { error } = await supabase
      .from("signals")
      .update({ is_read: true })
      .eq("receiver_id", currentUserId)
      .eq("is_read", false);

    if (error) {
      console.error("신호 읽음 처리 실패:", error);
      setMessage("읽음 처리에 실패했어요.");
      return;
    }

    const senderIds = unreadSignals.map((signal) => signal.sender_id);

    setSignals((current) =>
      current.map((signal) =>
        signal.receiver_id === currentUserId
          ? {
              ...signal,
              is_read: true,
            }
          : signal,
      ),
    );

    removeBlueSignalSenderIds(senderIds);
    setMessage("모든 신호를 읽음 처리했어요.");
  }

  async function handleDeleteSignal(signalId: string) {
    setBusySignalId(signalId);
    setMessage("");

    const { error } = await supabase.from("signals").delete().eq("id", signalId);

    setBusySignalId(null);

    if (error) {
      console.error("신호 삭제 실패:", error);
      setMessage("신호 삭제에 실패했어요.");
      return;
    }

    setSignals((current) => current.filter((signal) => signal.id !== signalId));
    setMessage("신호를 지웠어요.");
  }

  return (
    <main className="h-[100dvh] overflow-y-auto bg-slate-50 px-4 pb-36 pt-5 text-slate-950">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Dunbar Link
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              신호함
            </h1>
          </div>

          <Link
            href="/dashboard"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          >
            홈
          </Link>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">읽지 않은 신호</p>
              <p className="mt-1 text-3xl font-semibold text-slate-950">
                {unreadCount}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadSignals()}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                새로고침
              </button>

              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="rounded-full bg-rose-400 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
                disabled={unreadCount === 0}
              >
                모두 읽음
              </button>
            </div>
          </div>
        </section>

        {message ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            {message}
          </p>
        ) : null}

        <section className="flex flex-col gap-3">
          {loadStatus === "loading" ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
              신호를 불러오는 중이에요.
            </div>
          ) : null}

          {loadStatus === "error" ? (
            <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-sm text-rose-500">
              신호를 불러오지 못했어요.
            </div>
          ) : null}

          {loadStatus !== "loading" && signals.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
              아직 신호가 없어요.
            </div>
          ) : null}

          {signals.map((signal) => {
            const isReceived = signal.receiver_id === currentUserId;
            const isUnread = isReceived && !signal.is_read;
            const oppositeName = isReceived
              ? getPersonName(signal.sender_id)
              : getPersonName(signal.receiver_id);

            return (
              <article
                key={signal.id}
                role={isUnread ? "button" : undefined}
                tabIndex={isUnread ? 0 : undefined}
                onClick={() => {
                  if (isUnread) {
                    void markSignalRead(signal);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && isUnread) {
                    void markSignalRead(signal);
                  }
                }}
                className={[
                  "rounded-3xl border bg-white p-4 shadow-sm transition",
                  isUnread
                    ? "border-rose-200 ring-2 ring-rose-100"
                    : "border-slate-200",
                  isUnread ? "cursor-pointer active:scale-[0.99]" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                      {signal.emoji}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-950">
                          {isReceived ? "받은 신호" : "보낸 신호"}
                        </p>
                        {isUnread ? (
                          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                        ) : null}
                      </div>

                      <p className="mt-1 text-xs text-slate-400">
                        {formatSignalTime(signal.created_at)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteSignal(signal.id);
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 disabled:opacity-40"
                    disabled={busySignalId === signal.id}
                  >
                    지우기
                  </button>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {isReceived ? "보낸 사람" : "받는 사람"}: {oppositeName}
                </div>

                {isUnread ? (
                  <p className="mt-3 text-xs text-rose-400">
                    카드를 누르면 읽음 처리돼요.
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
