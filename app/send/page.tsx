"use client";

import { useEffect, useMemo, useState } from "react";

type SendbirdClient = {
  connect: (userId: string, accessToken?: string) => Promise<unknown>;
  updateCurrentUserInfo: (params: { nickname: string }) => Promise<unknown>;
  groupChannel: {
    getChannel: (channelUrl: string) => Promise<{
      sendUserMessage: (params: { message: string }) => Promise<unknown>;
    }>;
  };
};

type SendbirdInitResult = SendbirdClient | null;

async function loadSendbird(appId: string): Promise<SendbirdInitResult> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<any>;

    const chatModule = await dynamicImport("@sendbird/chat");
    const groupChannelModule = await dynamicImport(
      "@sendbird/chat/groupChannel",
    );

    const SendbirdChat = chatModule.default ?? chatModule.SendbirdChat;
    const GroupChannelModule = groupChannelModule.GroupChannelModule;

    if (!SendbirdChat || !GroupChannelModule) {
      throw new Error("Sendbird 모듈을 불러오지 못했어요.");
    }

    return SendbirdChat.init({
      appId,
      modules: [new GroupChannelModule()],
    }) as SendbirdClient;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export default function SendPage() {
  const appId = process.env.NEXT_PUBLIC_SENDBIRD_APP_ID;

  const [userId, setUserId] = useState("tester1");
  const [nickname, setNickname] = useState("Tester 1");
  const [accessToken, setAccessToken] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [text, setText] = useState("테스트 메시지");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ch = sp.get("channel");
    if (ch) setChannelUrl(ch);
  }, []);

  const canUseSendbird = useMemo(() => Boolean(appId), [appId]);

  async function send() {
    try {
      setStatus("connecting...");

      if (!appId) {
        throw new Error("NEXT_PUBLIC_SENDBIRD_APP_ID가 없습니다 (.env.local 확인)");
      }

      const sb = await loadSendbird(appId);

      if (!sb) {
        throw new Error(
          "Sendbird 패키지가 설치되어 있지 않거나 불러오지 못했어요. 현재 베타에서는 홈의 신호 기능을 사용하세요.",
        );
      }

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
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`error: ${message}`);
    }
  }

  return (
    <main
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        maxWidth: 720,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
          Sendbird Test Sender
        </h1>
        <a href="/dashboard" style={{ fontSize: 12, opacity: 0.8 }}>
          ← Back to Home
        </a>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          App ID: <code>{appId ?? "(missing)"}</code>
        </div>

        {!canUseSendbird ? (
          <div
            style={{
              border: "1px solid #f5c2c7",
              borderRadius: 12,
              background: "#fff5f5",
              color: "#9f1239",
              fontSize: 12,
              lineHeight: 1.55,
              padding: 12,
            }}
          >
            Sendbird 환경변수가 없어요. 베타에서는 홈 화면의 신호 기능을 우선 사용하면 됩니다.
          </div>
        ) : null}

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
          onClick={() => {
            void send();
          }}
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
