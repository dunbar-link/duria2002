import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

type OrgNodeRow = {
  pid: string;
  name: string;
  node_type: string;
  country_code: string;
  meta_json: string;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function unwrapWholeLineQuotes(line: string): string {
  const trimmed = line.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const inner = trimmed.slice(1, -1);

    if (!inner.includes('","')) {
      return inner.replace(/""/g, '"');
    }
  }

  return line;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function parseCsv(filePath: string): OrgNodeRow[] {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => unwrapWholeLineQuotes(line))
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  console.log("🧪 header raw:", lines[0]);
  console.log("🧪 first data raw:", lines[1]);

  const rawHeader = parseCsvLine(lines[0]);
  const header = rawHeader.map(normalizeHeader);

  console.log("🧪 parsed header:", header);

  return lines.slice(1).map((line, rowIndex) => {
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};

    header.forEach((key, idx) => {
      row[key] = (cols[idx] ?? "").trim();
    });

    if (rowIndex < 3) {
      console.log(`🧪 parsed row ${rowIndex + 1}:`, row);
    }

    return {
      pid: row["pid"] ?? "",
      name: row["name"] ?? "",
      node_type: row["node_type"] ?? "",
      country_code: row["country_code"] ?? "",
      meta_json: row["meta_json"] ?? "",
    };
  });
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  const csvPath = path.join(process.cwd(), "seed", "org_nodes_master.csv");
  const rows = parseCsv(csvPath);

  console.log(`📄 org_nodes_master.csv -> ${rows.length} rows`);

  if (rows.length === 0) {
    console.log("No organization rows found. Exiting.");
    return;
  }

  const payload = rows.map((row) => {
    let meta: Record<string, unknown> = {};

    try {
      meta = row.meta_json ? JSON.parse(row.meta_json) : {};
    } catch {
      throw new Error(`Invalid meta_json for pid=${row.pid}`);
    }

    const orgType = typeof meta.orgType === "string" ? meta.orgType : null;
    const cityFromMeta = typeof meta.city === "string" ? meta.city : null;

    return {
      pid: row.pid,
      name: row.name,
      is_celebrity: false,
      city: orgType === "city" ? row.name : cityFromMeta,
      school: orgType === "university" ? row.name : null,
      company: orgType === "company" ? row.name : null,
    };
  });

  console.log("🧪 payload preview:", payload.slice(0, 3));

  const invalidRows = payload.filter((row) => !row.pid || !row.name);

  if (invalidRows.length > 0) {
    console.error("❌ invalid payload rows found:", invalidRows.slice(0, 5));
    throw new Error("CSV parsing failed: pid/name missing");
  }

  const { error } = await supabase
    .from("dl_people")
    .upsert(payload, { onConflict: "pid" });

  if (error) {
    throw error;
  }

  console.log(`✅ inserted/updated ${payload.length} organization nodes into dl_people`);
}

main().catch((err) => {
  console.error("❌ seed_dl_org_people failed");
  console.error(err);
  process.exit(1);
});