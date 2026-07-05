import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// P4-1D: 만료(24시간 경과) 음성 신호 cleanup cron.
// - 대상: signals.type='voice' AND expires_at < now — emoji/미만료 voice 는 절대 미대상.
// - 인증: Authorization: Bearer ${CRON_SECRET} (Vercel Cron 이 자동으로 붙여줌).
//   CRON_SECRET env 가 없으면 503(action-needed) — 인증 없이 절대 동작하지 않는다.
// - 삭제 순서(멱등): storage object 삭제 성공 배치만 row 삭제. 실패 배치는 남겨서
//   다음 실행에서 재시도. 응답은 count 만(raw audio path 미노출).
export const dynamic = "force-dynamic";

const BUCKET = "voice-signals";
const BATCH_SIZE = 100;
const ROW_LIMIT = 1000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // 운영 env 미설정 상태 — 대장이 Vercel 에 CRON_SECRET 추가 전까지 비활성.
    return NextResponse.json(
      { ok: false, error: "cron_secret_not_configured" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("signals")
      .select("id, audio_path")
      .eq("type", "voice")
      .lt("expires_at", nowIso)
      .order("expires_at", { ascending: true })
      .limit(ROW_LIMIT);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "query_failed" },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as { id: string; audio_path: string | null }[];
    let deletedRows = 0;
    let removedObjects = 0;
    let failedBatches = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const batchPaths = batch
        .map((row) => row.audio_path ?? "")
        .filter(Boolean);

      if (batchPaths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from(BUCKET)
          .remove(batchPaths);
        if (removeError) {
          console.error("voice-cleanup storage 삭제 실패:", removeError.message);
          failedBatches += 1;
          continue; // row 를 남겨 다음 실행에서 재시도(멱등).
        }
        removedObjects += batchPaths.length;
      }

      const ids = batch.map((row) => row.id);
      const { error: deleteError } = await supabase
        .from("signals")
        .delete()
        .in("id", ids);
      if (deleteError) {
        console.error("voice-cleanup row 삭제 실패:", deleteError.message);
        failedBatches += 1;
        continue;
      }
      deletedRows += ids.length;
    }

    return NextResponse.json({
      ok: true,
      expiredFound: rows.length,
      deletedRows,
      removedObjects,
      failedBatches,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    console.error("voice-cleanup 실패:", message);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
