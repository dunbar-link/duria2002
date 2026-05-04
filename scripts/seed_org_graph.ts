import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const SUPABASE_URL =
  (process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim()) ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.trim()) ||
  "";
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

console.log("✅ seed_org_graph env OK");
console.log("✅ SUPABASE_URL =", SUPABASE_URL);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type EdgeRow = {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  edge_type: string;
  weight: number;
  verified: boolean;
  metadata: any;
};

function stripBom(s: string) {
  return s.replace(/^\uFEFF/, "");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function unwrapSingleFieldComma(cols: string[]): string[] {
  if (cols.length === 1 && cols[0].includes(",")) {
    return cols[0].split(",").map((s) => s.trim());
  }
  return cols;
}

function normalizeHeaderLine(headerLineRaw: string): string[] {
  let cols = splitCsvLine(stripBom(headerLineRaw).trim());
  cols = unwrapSingleFieldComma(cols);
  return cols.map((h) => stripBom(h).trim().toLowerCase());
}

function parseBool(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

function parseNumber(v: string | undefined, fallback: number): number {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function readEdges(csvPath: string): EdgeRow[] {
  if (!fs.existsSync(csvPath)) {
    console.warn("⚠️ Missing seed file:", csvPath);
    return [];
  }

  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = normalizeHeaderLine(lines[0]);

  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iFromExt = idx(["from_external_ref"]);
  const iFromType = idx(["from_type"]);
  const iToExt = idx(["to_external_ref"]);
  const iToType = idx(["to_type"]);
  const iEdgeType = idx(["edge_type"]);
  const iVerified = idx(["verified"]);
  const iWeightBase = idx(["weight_base"]);

  const isKrFormat = iFromExt >= 0 && iToExt >= 0 && iEdgeType >= 0;
  if (!isKrFormat) {
    console.warn("⚠️ Unrecognized header in", path.basename(csvPath));
    console.warn("   header =", header);
    return [];
  }

  const rows: EdgeRow[] = [];

  for (let li = 1; li < lines.length; li++) {
    let cols = splitCsvLine(lines[li]);
    cols = unwrapSingleFieldComma(cols);

    const from_id = (cols[iFromExt] ?? "").trim();
    const to_id = (cols[iToExt] ?? "").trim();
    if (!from_id || !to_id) continue;

    const from_type = iFromType >= 0 ? (cols[iFromType] ?? "org").trim() : "org";
    const to_type = iToType >= 0 ? (cols[iToType] ?? "org").trim() : "org";
    const edge_type = (cols[iEdgeType] ?? "unknown").trim();
    const verified = iVerified >= 0 ? parseBool(cols[iVerified]) : false;
    const weight = iWeightBase >= 0 ? parseNumber(cols[iWeightBase], 1) : 1;

    rows.push({
      from_type: from_type || "org",
      from_id,
      to_type: to_type || "org",
      to_id,
      edge_type: edge_type || "unknown",
      weight,
      verified,
      metadata: { source: path.basename(csvPath) }
    });
  }

  return rows;
}

function conflictKey(r: EdgeRow): string {
  return `${r.from_id}||${r.to_id}||${r.edge_type}`;
}

function dedupe(rows: EdgeRow[]): EdgeRow[] {
  const map = new Map<string, EdgeRow>();
  for (const r of rows) {
    const k = conflictKey(r);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, r);
      continue;
    }

    const sources = new Set<string>();
    const addSrc = (m: any) => {
      const s = m?.source;
      if (typeof s === "string" && s.trim()) sources.add(s.trim());
      const arr = m?.sources;
      if (Array.isArray(arr)) for (const x of arr) if (typeof x === "string") sources.add(x);
    };
    addSrc(prev.metadata);
    addSrc(r.metadata);

    map.set(k, {
      ...prev,
      weight: Math.max(prev.weight, r.weight),
      verified: prev.verified || r.verified,
      metadata: { ...prev.metadata, sources: Array.from(sources) }
    });
  }
  return Array.from(map.values());
}

async function upsertEdges(batch: EdgeRow[]) {
  const payload = batch.map((r) => ({
    from_type: r.from_type,
    from_id: r.from_id,
    to_type: r.to_type,
    to_id: r.to_id,
    edge_type: r.edge_type,
    weight: r.weight,
    verified: r.verified,
    metadata: r.metadata
  }));

  const { error } = await supabase
    .from("graph_edges")
    .upsert(payload, { onConflict: "from_id,to_id,edge_type" });

  if (error) throw error;
}

async function main() {
  console.log("✅ seed_org_graph starting...");

  const seedDir = path.resolve(process.cwd(), "seed");
  const files = [
    "edges_kr_core.csv",
    "edges_kr_autogen.csv",
    "edges_univ_to_company.csv",
    "edges_celebrity_seed.csv" // ✅ ADD: celebrity edges
  ].map((f) => path.join(seedDir, f));

  let all: EdgeRow[] = [];
  for (const f of files) {
    const rows = readEdges(f);
    console.log(`📄 ${path.basename(f)} -> ${rows.length} rows`);
    all = all.concat(rows);
  }

  if (all.length === 0) {
    console.log("⚠️ No edges to upsert.");
    return;
  }

  const before = all.length;
  const unique = dedupe(all);
  console.log(`🧹 dedupe: ${before} -> ${unique.length} unique (by from_id,to_id,edge_type)`);

  const BATCH = 500;
  console.log(`🚀 Upserting ${unique.length} edges in batches of ${BATCH}...`);

  let done = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    await upsertEdges(batch);
    done += batch.length;
    console.log(`✅ upserted ${done}/${unique.length}`);
  }

  console.log("✅ Done.");
}

main().catch((e) => {
  console.error("❌ seed_org_graph failed:", e?.message ?? e);
  process.exit(1);
});