import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SEED_DIR = path.join(ROOT, "seed");
const OUT = path.join(SEED_DIR, "edges_celebrity_seed.csv");

// ✅ "seed/orgs_*.csv"에 있는 org 노드들에서 name을 읽어 이름→pid 매핑을 만든다.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
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

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const r: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) r[header[j]] = (cols[j] ?? "").trim();
    rows.push(r);
  }
  return rows;
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

function ensureSeedDir() {
  if (!fs.existsSync(SEED_DIR)) {
    throw new Error(`Missing seed directory: ${SEED_DIR}`);
  }
}

// ✅ org seed 파일들을 훑어서 "name -> pid" 인덱스 만들기
function buildOrgIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  const files = fs
    .readdirSync(SEED_DIR)
    .filter((f) => f.startsWith("orgs_") && f.endsWith(".csv"))
    .map((f) => path.join(SEED_DIR, f));

  for (const file of files) {
    const text = fs.readFileSync(file, "utf-8");
    const rows = parseCsv(text);

    for (const r of rows) {
      const pid = (r["pid"] || r["org_pid"] || "").trim();
      const name = (r["name"] || r["org_name"] || "").trim();
      if (!pid || !name) continue;

      const k = norm(name);
      if (!idx.has(k)) idx.set(k, pid);
    }
  }

  return idx;
}

// ✅ “존재하지 않으면” seed/orgs_kr_core.csv에 최소 노드를 추가해준다.
// (NVIDIA, Tesla, Microsoft, AI, Semiconductor, Platform, Seoul 등)
function upsertMinimalNodesIntoCore() {
  const core = path.join(SEED_DIR, "orgs_kr_core.csv");
  if (!fs.existsSync(core)) {
    // core가 없으면 하나 만든다 (프로젝트가 이미 있으면 보통 존재함)
    fs.writeFileSync(core, "pid,name,category,country,city,industry\n", "utf-8");
  }

  const text = fs.readFileSync(core, "utf-8");
  const exists = new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));

  // pid 체계는 너 프로젝트에서 org:uuid도 쓰지만,
  // 여기선 "org:seed:*" 안정 pid로 최소 노드만 만든다.
  const minimal = [
    "org:seed:Tesla,Tesla,company,US,,Automotive",
    "org:seed:SpaceX,SpaceX,company,US,,Aerospace",
    "org:seed:Microsoft,Microsoft,company,US,,Software",
    "org:seed:NVIDIA,NVIDIA,company,US,,Semiconductor",
    "org:seed:Apple,Apple,company,US,,Hardware",
    "org:seed:Google,Google,company,US,,Platform",
    "org:seed:Meta,Meta,company,US,,Platform",
    "org:seed:Amazon,Amazon,company,US,,Ecommerce",
    "org:seed:OpenAI,OpenAI,org,US,,AI",
    "org:seed:Samsung,Samsung,company,KR,Seoul,Electronics",
    "org:seed:Kakao,Kakao,company,KR,Seoul,Platform",
    "org:seed:Naver,Naver,company,KR,Seongnam,Platform",
    "org:seed:SK,SK,company,KR,Seoul,Conglomerate",
    "org:seed:Korea University,Korea University,university,KR,Seoul,Education",
    "org:seed:Seoul,Seoul,city,KR,Seoul,",
    "org:seed:AI,AI,industry,,,AI",
    "org:seed:Semiconductor,Semiconductor,industry,,,Semiconductor",
    "org:seed:Platform,Platform,industry,,,Platform",
    "org:seed:Software,Software,industry,,,Software",
    "org:seed:Electronics,Electronics,industry,,,Electronics",
  ];

  const toAppend: string[] = [];
  for (const row of minimal) {
    // header 포함 여부 체크 때문에 "pid,name"로만 존재 판단
    const pid = row.split(",")[0];
    const already = [...exists].some((l) => l.startsWith(pid + ","));
    if (!already) toAppend.push(row);
  }

  if (toAppend.length > 0) {
    const appendText = (text.endsWith("\n") ? "" : "\n") + toAppend.join("\n") + "\n";
    fs.writeFileSync(core, text + appendText, "utf-8");
    console.log("✅ appended minimal org nodes into orgs_kr_core.csv:", toAppend.length);
  } else {
    console.log("✅ minimal org nodes already present in orgs_kr_core.csv");
  }
}

function writeCelebrityEdges(orgIndex: Map<string, string>) {
  // 최소 유명인 8명만 먼저 생성 (너가 300명으로 늘리면 됨)
  const celebs = [
    { pid: "celeb:elon_musk", name: "Elon Musk", companies: ["Tesla", "SpaceX"], industries: ["Platform", "AI", "Semiconductor"], cities: ["Seoul"] },
    { pid: "celeb:jensen_huang", name: "Jensen Huang", companies: ["NVIDIA"], industries: ["Semiconductor", "AI"], cities: [] },
    { pid: "celeb:bill_gates", name: "Bill Gates", companies: ["Microsoft"], industries: ["Software", "Platform"], cities: [] },
    { pid: "celeb:sam_altman", name: "Sam Altman", companies: ["OpenAI"], industries: ["AI"], cities: [] },
    { pid: "celeb:tim_cook", name: "Tim Cook", companies: ["Apple"], industries: ["Platform", "Hardware"], cities: [] },
    { pid: "celeb:sundar_pichai", name: "Sundar Pichai", companies: ["Google"], industries: ["Platform", "AI"], cities: [] },
    { pid: "celeb:mark_zuckerberg", name: "Mark Zuckerberg", companies: ["Meta"], industries: ["Platform", "AI"], cities: [] },
    { pid: "celeb:lee_jae_yong", name: "Lee Jae-yong", companies: ["Samsung"], industries: ["Semiconductor", "Electronics"], cities: ["Seoul"] },
  ];

  const W_COMPANY = 0.62;
  const W_INDUSTRY = 0.44;
  const W_CITY = 0.32;

  const edges: { src_pid: string; dst_pid: string; edge_type: string; weight: number; meta: string }[] = [];
  const dedup = new Set<string>();

  function addEdgeBySrcName(srcName: string, dstPid: string, edgeType: string, weight: number, meta: any) {
    const srcPid = orgIndex.get(norm(srcName));
    if (!srcPid) return false;

    const key = `${srcPid}__${dstPid}__${edgeType}`;
    if (dedup.has(key)) return true;
    dedup.add(key);

    edges.push({
      src_pid: srcPid,
      dst_pid: dstPid,
      edge_type: edgeType,
      weight,
      meta: JSON.stringify(meta),
    });

    return true;
  }

  for (const c of celebs) {
    for (const co of c.companies) {
      addEdgeBySrcName(co, c.pid, "affiliated_with", W_COMPANY, {
        source: "celebrity_quick_seed",
        celeb_name: c.name,
        relation: "company",
        src_name: co,
      });
    }
    for (const ind of c.industries) {
      addEdgeBySrcName(ind, c.pid, "in_industry", W_INDUSTRY, {
        source: "celebrity_quick_seed",
        celeb_name: c.name,
        relation: "industry",
        src_name: ind,
      });
    }
    for (const city of c.cities) {
      addEdgeBySrcName(city, c.pid, "located_in", W_CITY, {
        source: "celebrity_quick_seed",
        celeb_name: c.name,
        relation: "city",
        src_name: city,
      });
    }
  }

  const header = "src_pid,dst_pid,edge_type,weight,meta";
  const lines = [header];

  for (const e of edges) {
    // meta에는 콤마가 있으니 반드시 CSV quoted 처리
    const metaEscaped = `"${e.meta.replace(/"/g, '""')}"`;
    lines.push(`${e.src_pid},${e.dst_pid},${e.edge_type},${e.weight},${metaEscaped}`);
  }

  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf-8");

  console.log("✅ created:", path.relative(ROOT, OUT));
  console.log("✅ edges:", edges.length);
}

function main() {
  ensureSeedDir();

  // 1) core에 최소 노드를 넣어 매칭 실패를 방지
  upsertMinimalNodesIntoCore();

  // 2) org index 재생성
  const orgIndex = buildOrgIndex();

  // 3) celebrity edges 생성
  writeCelebrityEdges(orgIndex);
}

main();