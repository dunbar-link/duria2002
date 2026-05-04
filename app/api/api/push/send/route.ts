import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webPush from "web-push";

type SendPushBody = {
  receiverIds?: string[];
  title?: string;
  body?: string;
  url?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendPushBody;

    const receiverIds = body.receiverIds ?? [];

    if (receiverIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "receiverIds가 없습니다.",
        },
        { status: 400 },
      );
    }

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

    const payload = JSON.stringify({
      title: body.title ?? "새 신호가 도착했어요",
      body: body.body ?? "던바링크에서 확인해요.",
      url: body.url ?? "/dashboard/signals",
    });

    const results = await Promise.allSettled(
      (data ?? []).map((item) =>
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