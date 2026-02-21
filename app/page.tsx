"use client";

import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [channelUrl, setChannelUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function createDM() {
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
  }

  async function loadMessages(url: string) {
    const res = await fetch("/api/super-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "list_messages",
        channel_url: url,
        limit: 50,
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: "0 auto" }}>
      <h1>Dunbar Link - Chat</h1>

      {!channelUrl && (
        <button onClick={createDM}>DM 생성</button>
      )}

      {channelUrl && (
        <>
          <div
            style={{
              border: "1px solid #ddd",
              padding: 20,
              height: 400,
              overflowY: "auto",
              background: "#f7f7f7",
              borderRadius: 10,
            }}
          >
            {messages.map((msg) => {
              const isMe = msg.user?.user_id === "me";

              return (
                <div
                  key={msg.message_id}
                  style={{
                    display: "flex",
                    justifyContent: isMe ? "flex-end" : "flex-start",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      background: isMe ? "#007aff" : "#e5e5ea",
                      color: isMe ? "white" : "black",
                      padding: "10px 14px",
                      borderRadius: 18,
                      maxWidth: "70%",
                    }}
                  >
                    {msg.message}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
            />
            <button
              onClick={sendMessage}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: "#007aff",
                color: "white",
              }}
            >
              전송
            </button>
          </div>
        </>
      )}
    </div>
  );
}
