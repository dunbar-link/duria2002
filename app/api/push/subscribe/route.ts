import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type PushSubscriptionBody = {
  userId?: string;
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PushSubscriptionBody;

    const userId = cleanText(body.userId);
    const endpoint = cleanText(body.subscription?.endpoint);
    const p256dh = cleanText(body.subscription?.keys?.p256dh);
    const auth = cleanText(body.subscription?.keys?.auth);

    if (!userId || userId === "me") {
      return NextResponse.json(
        {
          ok: false,
          message: "실제 user_id가 없습니다.",
        },
        { status: 400 },
      );
    }

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        {
          ok: false,
          message: "푸시 구독 정보가 부족합니다.",
        },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        updated_at: new Date().toISOString(),
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
      userId,
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
