import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getInviteSession } from "@/lib/auth/invite-auth";

type InviteUpsertBody = {
  token?: string;
  invitePath?: string;
  inviteeName?: string;
  name?: string;
  inviteePhone?: string | null;
  sourcePersonId?: string | null;
  tier?: number;
  relationshipType?: string;
  relationshipLabel?: string;
  inviterNote?: string;
  inviterUserId?: string | null;
  inviterName?: string | null;
  inviterPhotoUrl?: string | null;
  status?: string;
  createdAt?: string;
};

type ExistingInviteRow = {
  token: string;
  invite_path: string | null;
  status: string | null;
  source_person_id: string | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createInviteToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `invite_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role 환경변수가 없습니다.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    const session = await getInviteSession();
    if (!session.ok) {
      return NextResponse.json({ ok: false, message: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = (await request.json()) as InviteUpsertBody;

    const sourcePersonId = cleanText(body.sourcePersonId) || null;
    const requestedStatus = cleanText(body.status) || "pending";
    const inviteeName = cleanText(body.inviteeName) || cleanText(body.name);
    const safeInviteePhone = cleanText(body.inviteePhone);
    const relationshipType = cleanText(body.relationshipType) || "friend";
    const relationshipLabel = cleanText(body.relationshipLabel) || "친구";
    const createdAt = cleanText(body.createdAt) || new Date().toISOString();

    if (!inviteeName) {
      return NextResponse.json(
        { ok: false, message: "inviteeName 또는 name이 없습니다." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    if (sourcePersonId && requestedStatus === "pending") {
      const { data: existingInvites, error: existingError } = await supabase
        .from("dl_invites")
        .select("token, invite_path, status, source_person_id")
        .eq("source_person_id", sourcePersonId)
        .in("status", ["pending", "accepted"]);

      if (existingError) {
        console.error("기존 초대 조회 실패:", existingError.message);
        return NextResponse.json(
          { ok: false, message: existingError.message },
          { status: 500 },
        );
      }

      const rows = (existingInvites ?? []) as ExistingInviteRow[];
      const acceptedInvite = rows.find((row) => row.status === "accepted");
      const pendingInvite = rows.find((row) => row.status === "pending");

      if (acceptedInvite) {
        if (pendingInvite) {
          await supabase
            .from("dl_invites")
            .delete()
            .eq("source_person_id", sourcePersonId)
            .eq("status", "pending");
        }

        return NextResponse.json({
          ok: true,
          alreadyConnected: true,
          token: acceptedInvite.token,
          invitePath: acceptedInvite.invite_path || `/invite/${acceptedInvite.token}`,
          url: acceptedInvite.invite_path || `/invite/${acceptedInvite.token}`,
          message: "이미 가입 완료된 초대입니다.",
        });
      }

      if (pendingInvite) {
        return NextResponse.json({
          ok: true,
          alreadyPending: true,
          token: pendingInvite.token,
          invitePath: pendingInvite.invite_path || `/invite/${pendingInvite.token}`,
          url: pendingInvite.invite_path || `/invite/${pendingInvite.token}`,
          message: "이미 진행 중인 초대가 있습니다.",
        });
      }
    }

    const token = cleanText(body.token) || createInviteToken();
    const invitePath = cleanText(body.invitePath) || `/invite/${token}`;

    // 생성자 owner 는 client 값이 아니라 세션 legacy 집합으로 강제한다(타인 명의 생성 차단).
    const legacyIds = session.legacyIds;
    if (legacyIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "ACCOUNT_LINK_REQUIRED" },
        { status: 403 },
      );
    }
    // client 가 보낸 inviterUserId 가 내 legacy 집합에 있으면 그 값을, 안 보냈으면
    // 집합의 첫 legacy 를 owner 로 쓴다. 집합에 없는 값은 위조로 보고 차단.
    const clientInviterUserId = cleanText(body.inviterUserId);
    if (clientInviterUserId && !legacyIds.includes(clientInviterUserId)) {
      return NextResponse.json({ ok: false, message: "FORBIDDEN" }, { status: 403 });
    }
    const inviterUserId = clientInviterUserId || legacyIds[0];
    const inviterName = cleanText(body.inviterName) || null;
    // 초대 생성 snapshot: inviter 의 현재 Me 프로필 사진 public URL(빈 값=null).
    const inviterPhotoUrl = cleanText(body.inviterPhotoUrl) || null;

    const basePayload = {
      token,
      invite_path: invitePath,
      invitee_name: inviteeName,
      invitee_phone: safeInviteePhone,
      source_person_id: sourcePersonId,
      tier: typeof body.tier === "number" ? body.tier : 50,
      relationship_type: relationshipType,
      relationship_label: relationshipLabel,
      inviter_note: cleanText(body.inviterNote),
      inviter_user_id: inviterUserId,
      inviter_name: inviterName,
      status: requestedStatus,
      created_at: createdAt,
    };

    // 사진 컬럼 포함으로 먼저 upsert. 사진 컬럼이 없는 등으로 실패하면 기본
    // payload 로 폴백해 초대 생성 자체는 반드시 성공시킨다(이름 흐름 보호).
    let { error } = await supabase
      .from("dl_invites")
      .upsert(
        { ...basePayload, inviter_photo_url: inviterPhotoUrl },
        { onConflict: "token" },
      );

    if (error) {
      ({ error } = await supabase
        .from("dl_invites")
        .upsert(basePayload, { onConflict: "token" }));
    }

    if (error) {
      console.error("초대 저장 실패:", error.message);
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      token,
      invitePath,
      url: invitePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "초대 저장 실패";
    console.error("초대 API 실패:", message);

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}