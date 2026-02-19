"use client";

import { useEffect, useState } from "react";

const API = "/api/super-action";

export default function Page() {
  const [channelUrl, setChannelUrl] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");

  const userId = "me";

  async function createDM() {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_dm",
        userId1: "me",
        userId2: "u1",
      }),
    });

    const data = await res.json();
    setChannelUrl(data.channel?.channel_url);
  }

  async function sendMessage() {
    if (!input || !channelUrl) return;

    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_message",
        channel_url: channelUrl,
        user_id: userId,
        message: input,
      }),
    });

    setInput("");
    fetchMessages();
  }

  async function fetchMessages() {
    if (!channelUrl) return;

    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "list_messages",
        channel_url: channelUrl,
        limit: 20,
      }),
    });

    const data = await res.json();
    setMessages(data.messages || []);
  }

  useEffect(() => {
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [channelUrl]);

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h2>Dunbar Link - Chat</h2>

      {!channelUrl && (
        <button onClick={createDM} style={{ padding: 10 }}>
          DM 생성
        </button>
      )}

      {channelUrl && (
        <>
          <div
            style={{
              border: "1px solid #ddd",
              padding: 10,
              height: 400,
              overflowY: "auto",
              marginBottom: 10,
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  textAlign: m.user?.user_id === userId ? "right" : "left",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    display: "inline-block",
                    background:
                      m.user?.user_id === userId ? "#0070f3" : "#eee",
                    color:
                      m.user?.user_id === userId ? "white" : "black",
                    padding: "8px 12px",
                    borderRadius: 10,
                  }}
                >
                  {m.message}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              style={{ flex: 1, padding: 8 }}
              placeholder="메시지 입력..."
            />
            <button onClick={sendMessage} style={{ padding: 8 }}>
              전송
            </button>
          </div>
        </>
      )}
    </div>
  );
}
