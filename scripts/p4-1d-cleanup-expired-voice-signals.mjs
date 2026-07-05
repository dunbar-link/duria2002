// P4-1D 만료 음성 신호 cleanup (수동 실행용, 키/토큰 절대 미출력)
// 대상: signals.type='voice' AND expires_at < now (24시간 지난 voice row 만)
// emoji signal / 미만료 voice 는 절대 건드리지 않는다.
//
// 기본 = dry-run (아무것도 삭제하지 않음)
//   node scripts/p4-1d-cleanup-expired-voice-signals.mjs
// 실제 삭제 (대장 승인 후에만)
//   node scripts/p4-1d-cleanup-expired-voice-signals.mjs --apply
//
// 삭제 순서(멱등): expired rows 조회 → storage object 삭제 → 성공 배치의 row 삭제.
// storage 삭제 실패 배치는 row 를 남겨 다음 실행에서 재시도한다.
// 주의: process.exit() 는 Windows Node 에서 소켓 teardown 크래시를 유발해
// process.exitCode 로만 종료 상태를 남긴다.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const BUCKET = "voice-signals";
const BATCH_SIZE = 100;
const ROW_LIMIT = 1000; // 1회 실행 상한(초과분은 다음 실행에서 — 멱등이라 안전)

function loadEnvLocal() {
  const out = {};
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    console.error("FAIL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 .env.local 에서 찾지 못함");
    return 1;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowIso = new Date().toISOString();
  console.log(
    `[P4-1D] 만료 기준시각(UTC): ${nowIso} / 모드: ${APPLY ? "APPLY(실제 삭제)" : "DRY-RUN(삭제 없음)"}`,
  );

  const { data, error } = await supabase
    .from("signals")
    .select("id, audio_path, expires_at")
    .eq("type", "voice")
    .lt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(ROW_LIMIT);

  if (error) {
    console.error(`FAIL: expired voice 조회 실패 — ${error.message}`);
    return 1;
  }

  const rows = data ?? [];
  const paths = rows
    .map((r) => (typeof r.audio_path === "string" ? r.audio_path : ""))
    .filter(Boolean);

  console.log(`대상 row: ${rows.length}건 / storage object: ${paths.length}건`);
  for (const row of rows.slice(0, 5)) {
    // 경로는 앞부분만(과도 노출 방지) — receiverId prefix 확인 용도.
    const p = typeof row.audio_path === "string" ? row.audio_path : "(없음)";
    console.log(`  - ${row.id} | 만료 ${row.expires_at} | ${p.slice(0, 24)}...`);
  }
  if (rows.length > 5) console.log(`  ... 외 ${rows.length - 5}건`);

  if (rows.length === 0) {
    console.log("결과: PASS (정리할 만료 음성 없음)");
    return 0;
  }

  if (!APPLY) {
    console.log("결과: DRY-RUN 완료 (삭제 안 함). 실제 삭제는 --apply 로 실행.");
    return 0;
  }

  let removedObjects = 0;
  let deletedRows = 0;
  let failedBatches = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchPaths = batch
      .map((r) => (typeof r.audio_path === "string" ? r.audio_path : ""))
      .filter(Boolean);

    if (batchPaths.length > 0) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove(batchPaths);
      if (removeError) {
        // 이 배치는 row 를 남긴다(다음 실행에서 재시도 — 멱등).
        console.error(
          `  배치 ${i / BATCH_SIZE + 1}: storage 삭제 실패 — ${removeError.message}`,
        );
        failedBatches += 1;
        continue;
      }
      removedObjects += batchPaths.length; // 이미 없던 object 도 성공으로 간주(orphan 회수)
    }

    const ids = batch.map((r) => r.id);
    const { error: deleteError } = await supabase
      .from("signals")
      .delete()
      .in("id", ids);
    if (deleteError) {
      console.error(
        `  배치 ${i / BATCH_SIZE + 1}: row 삭제 실패 — ${deleteError.message}`,
      );
      failedBatches += 1;
      continue;
    }
    deletedRows += ids.length;
  }

  console.log(
    `APPLY 결과: row ${deletedRows}건 삭제 / object ${removedObjects}건 정리 / 실패 배치 ${failedBatches}`,
  );
  console.log(
    failedBatches === 0 ? "결과: PASS" : "결과: WARNING (실패 배치는 다음 실행에서 재시도)",
  );
  return failedBatches === 0 ? 0 : 2;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error("FAIL:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  },
);
