"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUserId } from "@/lib/auth/current-user";
import {
  isIncompleteMeName,
  ME_NAME_REQUIRED_MESSAGE,
  readMeProfileName,
} from "@/lib/me/profile-name";
import {
  readSignalsForUser,
  type SignalRecord,
} from "@/lib/signal/read-signals";
import { supabase } from "@/lib/supabase-client";
import { sendSignal } from "@/lib/signal/send-signal";
import { usePeopleStore } from "@/app/dashboard/people/store";
import {
  getPersonDisplayName,
  isConnectedSignalUserId,
} from "@/app/dashboard/people/data";
import SignalBottomSheet, {
  type SignalRecipient,
} from "@/app/dashboard/_components/home/signal-bottom-sheet";

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

// P2-7A: 사람별 신호 묶음. group key 는 반드시 상대 remote PID(oppositeUserId)다
// (이름 groupBy 금지 — 동명이인 충돌 방지). 같은 사람의 보낸/받은 신호가 한 그룹.
type SignalGroup = {
  key: string;
  name: string;
  signals: SignalRecord[];
  count: number;
  latestAt: string;
  latestEmojis: string[];
  unreadCount: number;
  canReply: boolean;
};

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
  // 신호함 카드에서 바로 답신호를 보낼 대상. 설정되면 기존 SignalBottomSheet
  // (이모지 피커)가 열리고, 선택 시 기존 sendSignal 흐름으로 1명에게 전송한다.
  const [replyTarget, setReplyTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  // P2-5b: 신호함 "또 보내기/답신호" 받는 사람 선택용 연결된 사람 풀(PID 기준).
  const connectedSignalPool = useMemo<SignalRecipient[]>(() => {
    const pick = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : "";
    const out: SignalRecipient[] = [];
    const seen = new Set<string>();
    for (const p of people) {
      const rec = p as Record<string, unknown>;
      const receiverId =
        pick(rec.userId) || pick(rec.dlUserId) || pick(rec.acceptedPersonId);
      if (!receiverId || receiverId === "me" || seen.has(receiverId)) continue;
      seen.add(receiverId);
      out.push({ receiverId, personId: p.id, name: getPersonDisplayName(p) });
    }
    return out;
  }, [people]);

  // 기본 받는 사람 = 이 신호의 상대 1명. personId 는 연결 풀에서 보강(없으면 빈값).
  const replyRecipients = useMemo<SignalRecipient[]>(() => {
    if (!replyTarget) return [];
    const matched = connectedSignalPool.find(
      (r) => r.receiverId === replyTarget.userId,
    );
    return [
      {
        receiverId: replyTarget.userId,
        personId: matched?.personId ?? "",
        name: replyTarget.name,
      },
    ];
  }, [replyTarget, connectedSignalPool]);
  // me 이름 미완성으로 답신호가 차단된 카드의 signal.id. 상단 message 영역은
  // 스크롤 페이지 최상단에 있어 아래쪽 카드에서 버튼을 누르면 뷰포트 밖이라
  // 안내가 안 보였다(실기기 확인). 차단된 카드 바로 아래에 inline 안내를
  // 함께 띄워 사용자가 그 자리에서 이유를 볼 수 있게 한다.
  const [replyGuardSignalId, setReplyGuardSignalId] = useState<string | null>(
    null,
  );
  // P2-7A: 현재 펼친 사람별 신호 기록 패널의 group key(상대 PID). null = 모두 접힘.
  // 로컬 상태만 사용(URL/스토리지 미변경). 그룹이 사라지면 매칭 실패로 자연히 닫힘.
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

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

  // 받은 신호는 sender 가 현재 연결된 사람으로 resolve 될 때만 노출한다.
  // 연결을 삭제한 상대가 보낸 신호는 인박스 카드 / 미확인 카운트에서 제외한다.
  // 보낸 신호는 그대로 유지한다(받는 사람 표시/카드 동작 변경 없음).
  const visibleSignals = useMemo(() => {
    return signals.filter((signal) => {
      const isReceived = signal.receiver_id === currentUserId;
      if (!isReceived) {
        return true;
      }
      return isConnectedSignalUserId(signal.sender_id, people, inviteDrafts);
    });
  }, [signals, currentUserId, people, inviteDrafts]);

  const unreadSignals = useMemo(() => {
    return visibleSignals.filter(
      (signal) => signal.receiver_id === currentUserId && !signal.is_read,
    );
  }, [currentUserId, visibleSignals]);

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

      if (matched) {
        // 표시 우선순위: localAlias > remoteProfileName > person.name.
        const display = getPersonDisplayName(matched);
        if (display && display !== "알 수 없음") {
          return display;
        }
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

  // P2-7A: visibleSignals 를 상대 PID(oppositeUserId) 기준으로 묶는다.
  //  - oppositeUserId = 받은 신호면 sender_id, 보낸 신호면 receiver_id.
  //  - visibleSignals 는 created_at desc 라 각 그룹 내부도 desc 순서를 유지한다.
  //  - canReply 는 기존 카드 게이트와 동일(연결됨 + 이름 resolve + 자기 자신 아님).
  //  - 그룹 목록은 최근 활동(latestAt) desc. 데이터/네트워크 호출 없음(순수 파생).
  const signalGroups = useMemo<SignalGroup[]>(() => {
    const map = new Map<string, SignalRecord[]>();
    for (const signal of visibleSignals) {
      const isReceived = signal.receiver_id === currentUserId;
      const oppositeUserId = isReceived ? signal.sender_id : signal.receiver_id;
      if (!oppositeUserId) continue;
      const list = map.get(oppositeUserId);
      if (list) list.push(signal);
      else map.set(oppositeUserId, [signal]);
    }

    const groups: SignalGroup[] = Array.from(map.entries()).map(
      ([key, list]) => {
        const name = getPersonName(key);
        const unreadCount = list.filter(
          (s) => s.receiver_id === currentUserId && !s.is_read,
        ).length;
        const canReply =
          Boolean(key) &&
          key !== currentUserId &&
          name !== "알 수 없음" &&
          isConnectedSignalUserId(key, people, inviteDrafts);

        return {
          key,
          name,
          signals: list,
          count: list.length,
          latestAt: list[0]?.created_at ?? "",
          latestEmojis: list.slice(0, 3).map((s) => s.emoji),
          unreadCount,
          canReply,
        };
      },
    );

    groups.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
    return groups;
  }, [visibleSignals, currentUserId, people, inviteDrafts, getPersonName]);

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

  // 답신호 전송. 기존 sendSignal(1명 수신) 흐름 재사용 — 새 API/스키마 없음.
  // 시트(onSelect)가 호출하며, 시트는 선택 직후 onClose 로 replyTarget 을
  // 비우므로 여기서는 전송 결과 메시지와 목록 갱신만 책임진다. (보낸 신호는
  // receiver 기준 realtime 구독에 안 잡히므로 loadSignals 로 직접 갱신.)
  // P2-5b: 받는 사람 선택 모드. 시트에서 고른 receiverIds(기본=답신호 1명 +
  // 추가한 연결된 사람)로 보낸다. 기존 sendSignal(다중 수신) 흐름 재사용.
  async function handleSendReply(emoji: string, receiverIds: string[]) {
    if (!currentUserId || currentUserId === "me") {
      return;
    }

    // 안전망: 버튼 탭 시점 가드를 우회해 시트가 열렸더라도 me 이름이
    // 미완성("나"/빈 값)이면 전송하지 않는다 — 홈 파란점 답장과 동일 기준.
    if (isIncompleteMeName(readMeProfileName())) {
      setMessage(ME_NAME_REQUIRED_MESSAGE);
      return;
    }

    const ids = Array.from(new Set(receiverIds.filter(Boolean)));
    if (ids.length === 0) {
      setMessage("받는 사람을 1명 이상 선택해 주세요.");
      return;
    }

    const success = await sendSignal(currentUserId, ids, emoji);

    if (!success) {
      setMessage("신호 전송에 실패했어요.");
      return;
    }

    setMessage(`${ids.length}명에게 신호를 보냈어요.`);
    void loadSignals();
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
    <>
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

        <section className="flex flex-col gap-2">
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

          {loadStatus !== "loading" && visibleSignals.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
              아직 신호가 없어요.
            </div>
          ) : null}

          {/* P2-7A: 첫 화면 = 사람별 신호 목록(같은 사람과 주고받은 신호를 한 row로).
              row tap → 같은 페이지 인라인 "신호 기록" 패널. 새 라우트/DB 변경 없음. */}
          {signalGroups.map((group) => {
            const isOpen = selectedGroupKey === group.key;

            return (
              <div key={group.key} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedGroupKey((prev) =>
                      prev === group.key ? null : group.key,
                    )
                  }
                  aria-expanded={isOpen}
                  className={[
                    "flex items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 text-left shadow-sm transition active:scale-[0.99]",
                    group.unreadCount > 0
                      ? "border-rose-200 ring-1 ring-rose-100"
                      : "border-slate-200",
                    isOpen ? "border-slate-300" : "",
                  ].join(" ")}
                >
                  {/* 최신 이모지 1~3개 미리보기 */}
                  <div className="flex h-10 shrink-0 items-center justify-center gap-0.5 rounded-xl bg-slate-100 px-2 text-lg">
                    {group.latestEmojis.map((emoji, index) => (
                      <span key={index} className="leading-none">
                        {emoji}
                      </span>
                    ))}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                        {group.name}
                      </p>
                      {group.unreadCount > 0 ? (
                        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-rose-400 px-1 text-[10px] font-bold text-white">
                          {group.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      신호 {group.count}개 · {formatSignalTime(group.latestAt)}
                    </p>
                  </div>

                  <span
                    aria-hidden
                    className={`shrink-0 text-[18px] leading-none text-slate-300 transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  >
                    ›
                  </span>
                </button>

                {isOpen ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5">
                    {/* 패널 헤더: 상대 이름 + 주고받은 신호 수 + 신호 보내기 1개 */}
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {group.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          주고받은 신호 {group.count}개
                        </p>
                      </div>
                      {group.canReply ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (isIncompleteMeName(readMeProfileName())) {
                              setMessage(ME_NAME_REQUIRED_MESSAGE);
                              setReplyGuardSignalId(group.key);
                              return;
                            }
                            setReplyGuardSignalId(null);
                            setReplyTarget({
                              userId: group.key,
                              name: group.name,
                            });
                          }}
                          className="shrink-0 rounded-full bg-rose-400 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
                        >
                          신호 보내기
                        </button>
                      ) : null}
                    </div>

                    {replyGuardSignalId === group.key ? (
                      <p className="mb-2 px-1 text-right text-[11px] text-rose-500">
                        {ME_NAME_REQUIRED_MESSAGE}
                      </p>
                    ) : null}

                    {/* 신호 기록: 기존 압축 row 재사용(이모지·보냄/받음·시간·삭제 ✕) */}
                    <ul className="flex flex-col gap-1.5">
                      {group.signals.map((signal) => {
                        const isReceived =
                          signal.receiver_id === currentUserId;
                        const isUnread = isReceived && !signal.is_read;

                        return (
                          <li
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
                              "flex items-center gap-3 rounded-xl border bg-white px-2.5 py-2 transition",
                              isUnread
                                ? "cursor-pointer border-rose-200 active:scale-[0.99]"
                                : "border-slate-200",
                            ].join(" ")}
                          >
                            <span className="text-xl leading-none">
                              {signal.emoji}
                            </span>

                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
                                {isReceived ? "받음" : "보냄"}
                                {isUnread ? (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                                ) : null}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                {formatSignalTime(signal.created_at)}
                                {isUnread ? " · 눌러서 읽음" : ""}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteSignal(signal.id);
                              }}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-slate-300 active:scale-90 disabled:opacity-40"
                              disabled={busySignalId === signal.id}
                              aria-label="신호 지우기"
                            >
                              ✕
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      </div>
    </main>

    <SignalBottomSheet
      open={replyTarget !== null}
      onClose={() => setReplyTarget(null)}
      recipients={replyRecipients}
      candidates={connectedSignalPool}
      onSendSignal={(emoji, receiverIds) => {
        void handleSendReply(emoji, receiverIds);
      }}
    />
    </>
  );
}
