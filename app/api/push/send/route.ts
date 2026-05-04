import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webPush from "web-push";

type SendPushBody = {
  receiverIds?: string[];
  title?: string;
  body?: string;
  url?: string;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL이 없습니다.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function cleanReceiverIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => cleanText(item))
        .filter((item) => item && item !== "me"),
    ),
  );
}

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendPushBody;
    const receiverIds = cleanReceiverIds(body.receiverIds);

    if (receiverIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "receiverIds가 없습니다.",
        },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .in("user_id", receiverIds);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        { status: 500 },
      );
    }

    const subscriptions = (data ?? []) as PushSubscriptionRow[];

    const payload = JSON.stringify({
      title: cleanText(body.title) || "새 신호가 도착했어요",
      body: cleanText(body.body) || "던바링크에서 확인해요.",
      url: cleanText(body.url) || "/dashboard/signals",
    });

    const results = await Promise.allSettled(
      subscriptions.map((item) =>
        webPush.sendNotification(
          {
            endpoint: item.endpoint,
            keys: {
              p256dh: item.p256dh,
              auth: item.auth,
            },
          },
          payload,
        ),
      ),
    );

    return NextResponse.json({
      ok: true,
      requested: receiverIds.length,
      subscriptions: subscriptions.length,
      sent: results.filter((item) => item.status === "fulfilled").length,
      failed: results.filter((item) => item.status === "rejected").length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
