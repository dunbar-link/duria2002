import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 연결 스냅샷은 항상 최신/본인 것이어야 하므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

const TABLE = "dl_user_graph_snapshot";
// 현재 지원하는 스냅샷 포맷 버전. 향후 정규화(C형) 전환 시 증가.
const SUPPORTED_SCHEMA_VERSION = 1;

type SnapshotRow = {
  people: unknown;
  home_layout: unknown;
  me_profile: unknown;
  schema_version: number;
  updated_at: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// people 최소 타입 검증: 배열이고, 각 항목이 string id 를 가진 객체.
// (서버는 사람을 정규화하지 않는다 — 통짜 보존이라 최소 형태만 막는다.)
function isValidPeople(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      isPlainObject(item) &&
      typeof item.id === "string" &&
      item.id.trim().length > 0,
  );
}

// people 에 실제 사람이 한 명이라도 있는지(빈 배열 덮어쓰기 가드용).
function peopleHasContent(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

// homeLayout 이 "의미 있는 배치"를 담고 있는지.
// layers 안 visible/hidden 에 family-me 외의 non-null slot 이 하나라도 있거나,
// folders 가 하나라도 있으면 content 로 본다. 기본 골격(빈 layer + family-me)만
// 있는 상태는 content 없음으로 보고, 그게 기존 서버 배치를 덮지 못하게 막는다.
function homeLayoutHasContent(value: unknown): boolean {
  if (!isPlainObject(value)) return false;

  const layers = isPlainObject(value.layers) ? value.layers : value;

  if (isPlainObject(layers)) {
    for (const layer of Object.values(layers)) {
      if (!isPlainObject(layer)) continue;
      const visible = Array.isArray(layer.visibleSlotIds)
        ? layer.visibleSlotIds
        : [];
      const hidden = Array.isArray(layer.hiddenSlotIds)
        ? layer.hiddenSlotIds
        : [];
      const meaningful = [...visible, ...hidden].some(
        (slot) =>
          typeof slot === "string" &&
          slot.trim().length > 0 &&
          slot !== "family-me",
      );
      if (meaningful) return true;
    }
  }

  const folders = isPlainObject(value.folders) ? value.folders : null;
  if (folders && Object.keys(folders).length > 0) return true;

  return false;
}

// meProfile 에 imageDataUrl(base64) 가 실려 있으면 서버 저장 대상이 아니다.
function meProfileHasImageDataUrl(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const v = value.imageDataUrl;
  return typeof v === "string" && v.trim().length > 0;
}

// 페이로드 어디에든 base64 이미지/데이터 URL 이 섞여 있으면 차단(방어적).
function containsBase64Image(payload: unknown): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    // 직렬화 불가(순환 등)면 안전하게 차단.
    return true;
  }
  if (!serialized) return false;
  if (/data:image\//i.test(serialized)) return true;
  if (/;base64,/i.test(serialized)) return true;
  return false;
}

// 두 timestamptz 가 같은 시점인지(밀리초 기준 비교). conflict 판정 전용.
function sameInstant(a: string, b: string): boolean {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta === tb;
}

function toStatePayload(row: SnapshotRow) {
  return {
    people: row.people,
    homeLayout: row.home_layout,
    meProfile: row.me_profile,
  };
}

// GET /api/me/sync-state
// - 미로그인: 401
// - 스냅샷 없음: 200 { ok:true, state:null }
// - 스냅샷 있음: 200 { ok:true, state, updatedAt, schemaVersion }
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { data, error } = await supabase
      .from(TABLE)
      .select("people, home_layout, me_profile, schema_version, updated_at")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ ok: true, state: null });
    }

    const row = data as SnapshotRow;
    return NextResponse.json({
      ok: true,
      state: toStatePayload(row),
      updatedAt: row.updated_at,
      schemaVersion: row.schema_version,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// PUT /api/me/sync-state
// body: { people, homeLayout, meProfile, schemaVersion, baseUpdatedAt? }
// - 미로그인: 401
// - schemaVersion !== 1 / 타입 불량 / base64 이미지 포함: 400
// - 빈 people / 빈 homeLayout 으로 기존(내용 있는) 스냅샷 덮어쓰기: 400 (손실 방지)
// - baseUpdatedAt 과 서버 updated_at 불일치(또는 기존 존재인데 base 누락): 409
// - 성공: 200 { ok:true, updatedAt }
export async function PUT(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    let body: {
      people?: unknown;
      homeLayout?: unknown;
      meProfile?: unknown;
      schemaVersion?: unknown;
      baseUpdatedAt?: unknown;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { ok: false, error: "INVALID_JSON" },
        { status: 400 },
      );
    }

    // schemaVersion 은 1 만 허용.
    if (body.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      return NextResponse.json(
        { ok: false, error: "UNSUPPORTED_SCHEMA_VERSION" },
        { status: 400 },
      );
    }

    const { people, homeLayout, meProfile } = body;

    // 최소 타입 검증.
    if (!isValidPeople(people)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_PEOPLE" },
        { status: 400 },
      );
    }
    if (!isPlainObject(homeLayout)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_HOME_LAYOUT" },
        { status: 400 },
      );
    }
    if (!isPlainObject(meProfile)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_ME_PROFILE" },
        { status: 400 },
      );
    }

    // imageDataUrl(base64) 차단: me_profile 명시 필드 + 페이로드 전체 스캔.
    if (
      meProfileHasImageDataUrl(meProfile) ||
      containsBase64Image({ people, homeLayout, meProfile })
    ) {
      return NextResponse.json(
        { ok: false, error: "IMAGE_DATA_URL_NOT_ALLOWED" },
        { status: 400 },
      );
    }

    const baseUpdatedAt =
      typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt.trim() : "";

    // 기존 스냅샷 조회(본인 것, RLS 강제). conflict / 빈값 가드 판정에 사용.
    const { data: existing, error: readError } = await supabase
      .from(TABLE)
      .select("people, home_layout, me_profile, schema_version, updated_at")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (readError) {
      return NextResponse.json(
        { ok: false, error: readError.message },
        { status: 500 },
      );
    }

    if (existing) {
      const existingRow = existing as SnapshotRow;

      // 낙관적 동시성: base 가 없거나(blind overwrite) 서버 시점과 다르면 409.
      if (!baseUpdatedAt || !sameInstant(baseUpdatedAt, existingRow.updated_at)) {
        return NextResponse.json(
          {
            ok: false,
            error: "CONFLICT",
            serverState: toStatePayload(existingRow),
            updatedAt: existingRow.updated_at,
            schemaVersion: existingRow.schema_version,
          },
          { status: 409 },
        );
      }

      // 데이터 손실 방지: 내용 있는 기존 people 을 빈 배열로 덮지 못한다.
      if (!peopleHasContent(people) && peopleHasContent(existingRow.people)) {
        return NextResponse.json(
          { ok: false, error: "EMPTY_PEOPLE_OVERWRITE_BLOCKED" },
          { status: 400 },
        );
      }

      // 데이터 손실 방지: 내용 있는 기존 home_layout 을 빈 배치로 덮지 못한다.
      if (
        !homeLayoutHasContent(homeLayout) &&
        homeLayoutHasContent(existingRow.home_layout)
      ) {
        return NextResponse.json(
          { ok: false, error: "EMPTY_HOME_LAYOUT_OVERWRITE_BLOCKED" },
          { status: 400 },
        );
      }
    }

    // upsert. updated_at 은 트리거(before update)가 now() 로 갱신,
    // 최초 insert 는 컬럼 default now(). auth_user_id 는 세션 user.id 로 강제.
    const { data: saved, error: writeError } = await supabase
      .from(TABLE)
      .upsert(
        {
          auth_user_id: user.id,
          people,
          home_layout: homeLayout,
          me_profile: meProfile,
          schema_version: SUPPORTED_SCHEMA_VERSION,
        },
        { onConflict: "auth_user_id" },
      )
      .select("updated_at")
      .single();

    if (writeError) {
      return NextResponse.json(
        { ok: false, error: writeError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      updatedAt: (saved as { updated_at: string }).updated_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
