import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function hexFromBytes(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(key: string, msg: string) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return hexFromBytes(sig);
}

function pickFirstString(...vals: any[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function extractChannelUrl(body: any, payload: any): string | null {
  return pickFirstString(
    payload?.channel_url,
    payload?.channel?.channel_url,
    payload?.channel?.url,
    body?.channel_url,
    body?.channel?.channel_url,
  );
}

function extractSenderId(body: any, payload: any): string | null {
  // 가장 흔한 케이스들부터 우선
  const sender = payload?.sender ?? payload?.user ?? body?.sender ?? body?.user ?? null;

  return pickFirstString(
    // sender 객체 안
    sender?.user_id,
    sender?.userId,
    sender?.id,

    // payload 최상단
    payload?.sender_id,
    payload?.senderId,
    payload?.user_id,
    payload?.userId,

    // 일부 구조: payload.message.sender.user_id 같은 중첩
    payload?.message?.sender?.user_id,
    payload?.message?.sender?.userId,
    payload?.message?.sender_id,
    payload?.message?.senderId,

    // body 최상단 (혹시 모를 케이스)
    body?.sender_id,
    body?.senderId,
    body?.user_id,
    body?.userId,
  );
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const rawBody = await req.text();

  // 1) Signature verify
  const headerSig = req.headers.get("x-sendbird-signature") ?? "";
  const masterApiToken = Deno.env.get("SENDBIRD_MASTER_API_TOKEN") ?? "";
  if (!headerSig || !masterApiToken) {
    console.error(`[${requestId}] missing signature or master token`);
    return new Response("missing signature or secret", { status: 401 });
  }

  const computed = await hmacSha256Hex(masterApiToken, rawBody);
  if (computed !== headerSig) {
    console.error(`[${requestId}] invalid signature`);
    return new Response("invalid signature", { status: 401 });
  }

  // 2) Parse JSON
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error(`[${requestId}] invalid json`);
    return new Response("invalid json", { status: 400 });
  }

  const category = body?.category ?? null;
  if (category !== "group_channel:message_send") {
    // 필요하면 나중에 update/delete도 추가
    return new Response("ignored", { status: 200 });
  }

  const payload = body?.payload;
  if (!payload) return new Response("missing payload", { status: 400 });

  const channelUrl = extractChannelUrl(body, payload);
  const senderId = extractSenderId(body, payload) ?? "unknown";

  // ✅ 디버그 로그 (sender가 unknown일 때만 payload 구조 단서 출력)
  if (senderId === "unknown") {
    const payloadKeys = payload ? Object.keys(payload) : [];
    const senderKeys = payload?.sender ? Object.keys(payload.sender) : [];
    const userKeys = payload?.user ? Object.keys(payload.user) : [];
    console.error(
      `[${requestId}] sender unknown. payloadKeys=${payloadKeys.join(",")} senderKeys=${senderKeys.join(",")} userKeys=${userKeys.join(",")}`,
    );
  } else {
    console.log(`[${requestId}] sender resolved: ${senderId}`);
  }

  if (!channelUrl) {
    console.error(`[${requestId}] missing channel_url`);
    return new Response("missing channel_url", { status: 200 });
  }

  // 3) Supabase client (runtime env 우선, SB_ fallback)
  const supabaseUrl =
    Deno.env.get("SUPABASE_URL") ??
    Deno.env.get("SB_SUPABASE_URL") ??
    "";

  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SB_SUPABASE_SERVICE_ROLE_KEY") ??
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`[${requestId}] missing supabase envs url=${!!supabaseUrl} key=${!!serviceRoleKey}`);
    return new Response("missing supabase envs", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const record = {
    sendbird_message_id: payload.message_id ?? null,
    channel_url: channelUrl,
    sender_id: senderId,
    message: payload.message ?? null,
    message_type: payload.type ?? null,
    created_at: new Date(payload.created_at ?? Date.now()),
    raw: payload,
  };

  const { error } = await supabase.from("messages").insert(record);

  if (error) {
    if (String(error.code) === "23505") return new Response("duplicate ok", { status: 200 });
    console.error(`[${requestId}] db error`, error);
    return new Response("db error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});