import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({
  path: path.join(process.cwd(), ".env.local"),
  override: true,
});

const ROOT = process.cwd();
const SEED_DIR = path.join(ROOT, "seed");

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!SUPABASE_URL) throw new Error("Missing env: SUPABASE_URL (check .env.local)");
if (!/^https?:\/\//i.test(SUPABASE_URL)) throw new Error(`Invalid SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)}`);
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY (check .env.local)");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- CSV parsing (quoted-safe) ----------
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return { header: [], rows: [] };

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map(splitCsvLine);
  return { header, rows };
}

function norm(s: string) {
  return (s ?? "").trim().toLowerCase();
}

function pickIndex(header: string[], candidates: string[]): number {
  const h = header.map(norm);

  for (const c of candidates) {
    const idx = h.indexOf(norm(c));
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < h.length; i++) {
    for (const c of candidates) {
      if (h[i].includes(norm(c))) return i;
    }
  }
  return -1;
}

function findEdgeFiles(): string[] {
  if (!fs.existsSync(SEED_DIR)) throw new Error(`Missing seed dir: ${SEED_DIR}`);
  return fs
    .readdirSync(SEED_DIR)
    .filter((f) => f.startsWith("edges_") && f.endsWith(".csv"))
    .map((f) => path.join(SEED_DIR, f));
}

function pidToType(pid: string): string {
  const p = pid.trim();
  if (p.startsWith("org:")) return "org";
  if (p.startsWith("u_") || p.startsWith("user:") || p.startsWith("me")) return "person";
  if (p.startsWith("celeb:")) return "celebrity";
  if (/^KR-(UNIV|COMP|CITY|IND)/i.test(p)) return "org";
  return "entity";
}

function toWeight(v: string | undefined, fallback: number): number {
  const t = (v ?? "").trim();
  if (!t) return fallback;
  const n = Number(t);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function safeJsonParse(raw: string): any {
  const t = (raw ?? "").trim();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t };
  }
}

async function main() {
  const files = findEdgeFiles();
  console.log("✅ edge files:", files.map((f) => path.basename(f)));
  console.log("✅ using SUPABASE_URL:", SUPABASE_URL);

  const skippedFiles: any[] = [];
  let skippedRows = 0;

  // ✅ 핵심: (from_id,to_id,edge_type) 기준으로 dedupe
  const dedup = new Map<
    string,
    {
      from_type: string;
      from_id: string;
      to_type: string;
      to_id: string;
      edge_type: string;
      weight: number;
      metadata: any;
      verified: boolean;
    }
  >();

  for (const file of files) {
    const text = fs.readFileSync(file, "utf-8");
    const { header, rows } = parseCsv(text);

    if (header.length === 0) {
      skippedFiles.push({ file: path.basename(file), reason: "empty header" });
      continue;
    }

    const srcI = pickIndex(header, ["src_pid", "from_id", "from", "src", "a", "source"]);
    const dstI = pickIndex(header, ["dst_pid", "to_id", "to", "dst", "b", "target"]);
    const typeI = pickIndex(header, ["edge_type", "type", "rel", "relation", "edge", "kind"]);
    const wI = pickIndex(header, ["weight", "w", "score"]);
    const metaI = pickIndex(header, ["meta", "metadata", "props", "data", "json"]);

    if (srcI < 0 || dstI < 0 || typeI < 0) {
      skippedFiles.push({ file: path.basename(file), reason: "missing required columns", header });
      continue;
    }

    for (const cols of rows) {
      const from_id = (cols[srcI] ?? "").trim();
      const to_id = (cols[dstI] ?? "").trim();
      const edge_type = (cols[typeI] ?? "").trim();

      if (!from_id || !to_id || !edge_type) {
        skippedRows++;
        continue;
      }

      const weight = wI >= 0 ? toWeight(cols[wI], 0.3) : 0.3;
      const metadata = metaI >= 0 ? safeJsonParse(cols[metaI] ?? "") : {};

      const key = `${from_id}__${to_id}__${edge_type}`;

      const existing = dedup.get(key);
      if (!existing) {
        dedup.set(key, {
          from_type: pidToType(from_id),
          from_id,
          to_type: pidToType(to_id),
          to_id,
          edge_type,
          weight,
          metadata,
          verified: false,
        });
      } else {
        // ✅ 중복이 있으면 “더 큰 weight”를 선택 + metadata 병합
        if (weight > existing.weight) existing.weight = weight;
        existing.metadata = { ...existing.metadata, ...metadata };
      }
    }
  }

  const allRows = Array.from(dedup.values());

  console.log("✅ total edges parsed (raw):", 2139); // 너 로그 기준 참고
  console.log("✅ total edges after dedupe:", allRows.length);
  console.log("ℹ️ skippedRows:", skippedRows);
  if (skippedFiles.length > 0) console.log("⚠️ skippedFiles:", JSON.stringify(skippedFiles, null, 2));

  if (allRows.length === 0) {
    console.log("❌ No edges parsed. Check CSV headers.");
    return;
  }

  const batchSize = 1000;

  for (let i = 0; i < allRows.length; i += batchSize) {
    const batch = allRows.slice(i, i + batchSize);

    const { error } = await supabase.from("graph_edges").upsert(batch, {
      onConflict: "from_id,to_id,edge_type",
    });

    if (error) throw error;
    console.log(`✅ upsert batch ${Math.floor(i / batchSize) + 1} (${batch.length})`);
  }

  console.log("✅ done");
}

main().catch((e) => {
  console.error("❌ seed_edges_only failed:", e);
  process.exit(1);
});