"use client";

import { useEffect, useMemo, useState } from "react";
import SendbirdChat from "@sendbird/chat";
import { GroupChannelModule } from "@sendbird/chat/groupChannel";

export default function SendPage() {
  const appId = process.env.NEXT_PUBLIC_SENDBIRD_APP_ID;

  const [userId, setUserId] = useState("tester1");
  const [nickname, setNickname] = useState("Tester 1");
  const [accessToken, setAccessToken] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [text, setText] = useState("테스트 메시지");
  const [status, setStatus] = useState<string>("");

  // ✅ /send?channel=... 로 들어오면 자동 채움
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ch = sp.get("channel");
    if (ch) setChannelUrl(ch);
  }, []);

  const sb = useMemo(() => {
    if (!appId) return null;
    return SendbirdChat.init({
      appId,
      modules: [new GroupChannelModule()],
    });
  }, [appId]);

  async function send() {
    try {
      setStatus("connecting...");

      if (!appId) throw new Error("NEXT_PUBLIC_SENDBIRD_APP_ID가 없습니다 (.env.local 확인)");
      if (!sb) throw new Error("Sendbird init failed");
      if (!userId.trim()) throw new Error("userId를 입력하세요");
      if (!channelUrl.trim()) throw new Error("channelUrl을 입력하세요");

      if (accessToken.trim()) {
        await sb.connect(userId.trim(), accessToken.trim());
      } else {
        await sb.connect(userId.trim());
      }

      if (nickname.trim()) {
        await sb.updateCurrentUserInfo({ nickname: nickname.trim() });
      }

      setStatus("connected. sending...");

      const channel = await sb.groupChannel.getChannel(channelUrl.trim());
      await channel.sendUserMessage({ message: text });

      setStatus("sent ✅ (webhook → DB까지 몇 초 후 반영)");
    } catch (e: any) {
      console.error(e);
      setStatus(`error: ${e?.message ?? String(e)}`);
    }
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto", maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Sendbird Test Sender</h1>
        <a href="/" style={{ fontSize: 12, opacity: 0.8 }}>← Back to DB</a>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          App ID: <code>{appId ?? "(missing)"}</code>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>User ID</div>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Nickname</div>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Access Token (선택)</div>
          <input
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="(optional)"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Channel URL</div>
          <input
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="sendbird_group_channel_..."
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Message</div>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </label>

        <button
          onClick={send}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #000",
            background: "#000",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Send message
        </button>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
          Status: <code>{status}</code>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          전송 후 DB 화면에서 새로고침하거나, 다음 단계에서 Realtime 붙이면 자동 반영됩니다.
        </div>
      </div>
    </main>
  );
}