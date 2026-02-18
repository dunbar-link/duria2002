"use client";

import { useMemo, useState } from "react";

type ApiResult =
  | { ok: true; upstreamStatus: number; data: any; requestId?: string }
  | { ok: false; upstreamStatus?: number; error?: string; data?: any; requestId?: string };

export default function Page() {
  // DM 생성용
  const [userId1, setUserId1] = useState("me");
  const [userId2, setUserId2] = useState("u1");
  const [channelUrl, setChannelUrl] = useState("");

  // 메시지 보내기용
  const [senderId, setSenderId] = useState("me");
  const [message, setMessage] = useState("안녕하세요! 테스트 메시지입니다.");

  // 메시지 목록 조회용
  const [limit, setLimit] = useState(20);

  // 화면 표시
  const [statusText, setStatusText] = useState<string>("");
  const [jsonText, setJsonText] = useState<string>("{\n  (아직 없음)\n}");
  const [messages, setMessages] = useState<any[]>([]);

  const canSend = useMemo(() => {
    return Boolean(channelUrl && senderId && message);
  }, [channelUrl, senderId, message]);

  async function callApi(action: string, payload: any): Promise<ApiResult> {
    const res = await fetch("/api/super-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    // Next.js route.ts가 { ok, upstreamStatus, data } 형태로 내려줌
    // 혹시 모를 형태 변화에도 최대한 대응
    if (data && typeof data === "object" && "ok" in data && "upstreamStatus" in data) {
      return data as ApiResult;
    }

    return {
      ok: res.ok,
      upstreamStatus: res.status,
      data,
    } as ApiResult;
  }

  // 1) DM 생성(create_dm)
  async function onCreateDm() {
    setStatusText("요청 중...");
    setJsonText("요청 중...");
    try {
      const result = await callApi("create_dm", { userId1, userId2 });
      setJsonText(JSON.stringify(result, null, 2));

      if (!result.ok) {
        setStatusText(`에러: ${result.data?.error ?? result.error ?? "UNKNOWN"}`);
        return;
      }

      // Supabase(super-action) create_dm 성공 시 result.data.channel.channel_url 에 있음(보통)
      const ch =
        result.data?.channel?.channel_url ??
        result.data?.channel?.channel?.channel_url ??
        result.data?.channel_url;

      if (ch) {
        setChannelUrl(String(ch));
        setStatusText(`✅ DM 생성 성공: ${ch}`);
      } else {
        setStatusText("✅ DM 생성 성공(채널 URL 파싱 실패 — JSON 확인)");
      }
    } catch (e: any) {
      setStatusText(`에러: ${String(e?.message ?? e)}`);
      setJsonText(JSON.stringify({ ok: false, error: String(e?.message ?? e) }, null, 2));
    }
  }

  // 2) 메시지 보내기(send_message)
  async function onSendMessage() {
    if (!canSend) return;

    setStatusText("요청 중...");
    setJsonText("요청 중...");
    try {
      const result = await callApi("send_message", {
        channel_url: channelUrl,
        user_id: senderId,
        message,
      });
      setJsonText(JSON.stringify(result, null, 2));

      if (!result.ok) {
        setStatusText(`에러: ${result.data?.error ?? result.error ?? "UNKNOWN"}`);
        return;
      }

      setStatusText("✅ 메시지 전송 성공");

      // 전송 후 자동으로 목록 새로고침
      await onListMessages(true);
    } catch (e: any) {
      setStatusText(`에러: ${String(e?.message ?? e)}`);
      setJsonText(JSON.stringify({ ok: false, error: String(e?.message ?? e) }, null, 2));
    }
  }

  // 3) 메시지 목록 불러오기(list_messages)
  async function onListMessages(silent = false) {
    if (!channelUrl) {
      if (!silent) setStatusText("channel_url 먼저 필요해요(create_dm 먼저).");
      return;
    }

    if (!silent) {
      setStatusText("요청 중...");
      setJsonText("요청 중...");
    }

    try {
      const result = await callApi("list_messages", {
        channel_url: channelUrl,
        limit,
      });

      if (!silent) setJsonText(JSON.stringify(result, null, 2));

      if (!result.ok) {
        if (!silent) setStatusText(`에러: ${result.data?.error ?? result.error ?? "UNKNOWN"}`);
        return;
      }

      // Sendbird 메시지 목록은 보통 배열로 내려오는데, 응답 형태가 환경마다 다를 수 있어서 방어적으로 처리
      const list =
        result.data?.data?.messages ??
        result.data?.data?.message_list ??
        result.data?.data ??
        result.data;

      const arr = Array.isArray(list) ? list : Array.isArray(list?.messages) ? list.messages : [];

      setMessages(arr);
      if (!silent) setStatusText(`✅ 목록 조회 성공 (${arr.length}개)`);
      if (silent) setStatusText(`✅ 전송 후 목록 새로고침 (${arr.length}개)`);
      if (silent) setJsonText(JSON.stringify(result, null, 2));
    } catch (e: any) {
      if (!silent) {
        setStatusText(`에러: ${String(e?.message ?? e)}`);
        setJsonText(JSON.stringify({ ok: false, error: String(e?.message ?? e) }, null, 2));
      }
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 18 }}>Dunbar Link - DM 테스트</h1>

      {/* 1) DM 생성 */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>1) DM 생성 (create_dm)</h2>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>userId1</div>
          <input
            value={userId1}
            onChange={(e) => setUserId1(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #d1d5db" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>userId2</div>
          <input
            value={userId2}
            onChange={(e) => setUserId2(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #d1d5db" }}
          />
        </label>

        <button
          onClick={onCreateDm}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "1px solid #111827",
            background: "#111827",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          DM 생성(create_dm) 호출
        </button>

        <div style={{ marginTop: 12, fontSize: 13, color: "#374151" }}>
          현재 channel_url: <b>{channelUrl || "(없음)"}</b>
        </div>
      </section>

      {/* 2) 메시지 보내기 */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>2) 메시지 보내기 (send_message)</h2>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>channel_url</div>
          <input
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="create_dm 후 자동으로 채워짐"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #d1d5db" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>user_id (보내는 사람)</div>
          <input
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #d1d5db" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>message</div>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #d1d5db" }}
          />
        </label>

        <button
          onClick={onSendMessage}
          disabled={!canSend}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 12,
            border: "1px solid #111827",
            background: canSend ? "#111827" : "#9ca3af",
            color: "white",
            fontWeight: 700,
            cursor: canSend ? "pointer" : "not-allowed",
          }}
        >
          메시지 보내기(send_message) 호출
        </button>
      </section>

      {/* 3) 메시지 목록 */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>3) 메시지 목록 (list_messages)</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 14 }}>limit</span>
            <input
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{ width: 90, padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
            />
          </label>

          <button
            onClick={() => onListMessages(false)}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #111827",
              background: "white",
              color: "#111827",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            목록 새로고침
          </button>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          {messages.length === 0 ? (
            <div style={{ color: "#6b7280" }}>(메시지 없음 — 목록 새로고침을 눌러보세요)</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map((m, idx) => (
                <div
                  key={m.message_id ?? idx}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 12,
                    background: "#f9fafb",
                  }}
                >
                  <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                    <b>{m.user?.user_id ?? m.sender?.user_id ?? "(unknown)"}</b>{" "}
                    <span style={{ color: "#9ca3af" }}>
                      #{m.message_id ?? "-"} / {m.created_at ?? "-"}
                    </span>
                  </div>
                  <div style={{ fontSize: 15 }}>{m.message ?? m.data ?? JSON.stringify(m)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 상태/JSON */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 18 }}>
        <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 700 }}>상태</div>
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: statusText.startsWith("에러") ? "#fef2f2" : "#ecfdf5",
            color: statusText.startsWith("에러") ? "#991b1b" : "#065f46",
            fontWeight: 700,
            marginBottom: 14,
          }}
        >
          {statusText || "대기 중"}
        </div>

        <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 700 }}>응답(JSON)</div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            padding: 14,
            borderRadius: 12,
            background: "#0b1220",
            color: "white",
            overflow: "auto",
            maxHeight: 420,
          }}
        >
          {jsonText}
        </pre>
      </section>
    </main>
  );
}
