"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [channelUrl, setChannelUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function createDM() {
    setLoading(true);

    const res = await fetch("/api/super-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_dm",
        userId1: "me",
        userId2: "u1",
      }),
    });

    const data = await res.json();
    setChannelUrl(data?.data?.channel?.channel_url);
    setLoading(false);
  }

  async function loadMessages(url: string) {
    const res = await fetch("/api/super-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "list_messages",
        channel_url: url,
        limit: 20,
      }),
    });

    const data = await res.json();
    setMessages(data?.data?.messages ?? []);
  }

  async function sendMessage() {
    if (!channelUrl || !text) return;

    await fetch("/api/super-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_message",
        channel_url: channelUrl,
        user_id: "me",
        message: text,
      }),
    });

    setText("");
    loadMessages(channelUrl);
  }

  useEffect(() => {
    if (channelUrl) {
      loadMessages(channelUrl);
    }
  }, [channelUrl]);

  return (
    <div style={{ padding: 40, maxWidth: 600 }}>
      <h1>Dunbar Link - Chat</h1>

      {!channelUrl && (
        <button onClick={createDM} disabled={loading}>
          {loading ? "생성 중..." : "DM 생성"}
        </button>
      )}

      {channelUrl && (
        <>
          <div
            style={{
              border: "1px solid #ccc",
              padding: 20,
              height: 300,
              overflowY: "auto",
              marginBottom: 10,
            }}
          >
            {messages.map((msg) => (
              <div key={msg.message_id} style={{ marginBottom: 10 }}>
                <b>{msg.user?.user_id}</b>: {msg.message}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ flex: 1 }}
            />
            <button onClick={sendMessage}>전송</button>
          </div>
        </>
      )}
    </div>
  );
}
