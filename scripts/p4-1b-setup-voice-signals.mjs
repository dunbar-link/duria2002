// P4-1B 고정 셋업/검증 스크립트 (키/토큰은 절대 출력하지 않는다)
// 1) private bucket "voice-signals" 생성(이미 있으면 통과) + private 여부 확인
// 2) signals 테이블에 voice 컬럼(migration 20260702_p4_1b_signals_voice.sql)이
//    적용됐는지 read-only 로 확인
// 실행: node scripts/p4-1b-setup-voice-signals.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const env = loadEnvLocal();
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error("FAIL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 .env.local 에서 찾지 못함");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "voice-signals";
let failed = false;

// 1) bucket 생성/확인
{
  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 307200, // 300KB
    allowedMimeTypes: ["audio/webm", "audio/mp4"],
  });
  if (createError && !/already exists/i.test(createError.message)) {
    console.error(`FAIL: bucket 생성 실패 — ${createError.message}`);
    failed = true;
  }

  const { data: bucket, error: getError } = await supabase.storage.getBucket(BUCKET);
  if (getError || !bucket) {
    console.error(`FAIL: bucket 조회 실패 — ${getError?.message ?? "not found"}`);
    failed = true;
  } else if (bucket.public) {
    console.error("FAIL: voice-signals bucket 이 public 임 — private 로 바꿔야 함");
    failed = true;
  } else {
    console.log(`PASS: bucket "${BUCKET}" private 확인 (fileSizeLimit=${bucket.file_size_limit ?? "?"})`);
  }
}

// 2) signals voice 컬럼 확인 (read-only select 1행)
{
  const { error } = await supabase
    .from("signals")
    .select("id, type, audio_path, audio_mime, audio_duration_ms, audio_size_bytes, expires_at")
    .limit(1);
  if (error) {
    console.error(`FAIL: signals voice 컬럼 미적용 — migration SQL 을 Supabase SQL Editor 에서 실행 필요 (${error.message})`);
    failed = true;
  } else {
    console.log("PASS: signals voice 컬럼(type/audio_*/expires_at) 적용 확인");
  }
}

console.log(failed ? "결과: FAIL" : "결과: PASS");
process.exit(failed ? 1 : 0);
