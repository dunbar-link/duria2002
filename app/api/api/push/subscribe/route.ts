import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type PushSubscriptionBody = {
  userId?: string;
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PushSubscriptionBody;

    const userId = body.userId;
    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const auth = body.subscription?.keys?.auth;

    if (!userId || !endpoint || !p256dh || !auth) {
      return NextResponse.json(
        {
          ok: false,
          message: "푸시 구독 정보가 부족합니다.",
        },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
      },
      {
        onConflict: "endpoint",
      },
    );

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
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