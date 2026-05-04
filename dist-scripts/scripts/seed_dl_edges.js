"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_js_1 = require("@supabase/supabase-js");
dotenv_1.default.config({ path: ".env.local" });
const PROJECT_ROOT = "C:\\work\\nextjs-server";
const CSV_FILES = [
    path_1.default.join(PROJECT_ROOT, "seed", "edges_celebrity_autogen.csv"),
    path_1.default.join(PROJECT_ROOT, "seed", "edges_bridge_manual.csv"),
];
const KOREA_UNIV_PID = "org:univ:korea-university";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL) {
    throw new Error("Missing env: SUPABASE_URL");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
function readText(filePath) {
    return fs_1.default.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}
function parseCsv(text) {
    const lines = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
    if (lines.length === 0)
        return [];
    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const row = {};
        for (let i = 0; i < headers.length; i += 1) {
            row[headers[i]] = values[i] ?? "";
        }
        return row;
    });
}
function parseCsvLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
            }
            else {
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
    return result.map((v) => v.trim());
}
function normalizeOrgPid(raw) {
    const v = raw.trim();
    if (!v)
        return "";
    const lower = v.toLowerCase();
    if (lower === "org:kr-univ-korea")
        return KOREA_UNIV_PID;
    if (lower === "org:univ:korea-university")
        return KOREA_UNIV_PID;
    if (lower.includes("korea-university"))
        return KOREA_UNIV_PID;
    if (lower.includes("korea university"))
        return KOREA_UNIV_PID;
    if (lower.includes("고려대학교"))
        return KOREA_UNIV_PID;
    if (lower.startsWith("org:")) {
        return lower.replace(/\s+/g, "-");
    }
    return `org:${lower.replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "")}`;
}
function normalizeCelebPid(raw) {
    const v = raw.trim();
    if (!v)
        return "";
    const lower = v.toLowerCase();
    if (lower.startsWith("celeb:")) {
        return lower.replace(/\s+/g, "-");
    }
    return `celeb:${lower.replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "")}`;
}
function normalizeAnyPid(raw) {
    const v = raw.trim();
    if (!v)
        return "";
    if (v.startsWith("celeb:"))
        return normalizeCelebPid(v);
    if (v.startsWith("org:"))
        return normalizeOrgPid(v);
    if (v.startsWith("u_"))
        return v;
    return v;
}
function stableUuidFromPair(fromPid, toPid, label) {
    const hash = crypto_1.default
        .createHash("sha1")
        .update(`${fromPid}|${toPid}|${label}`)
        .digest("hex");
    const hex = hash.slice(0, 32);
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        "4" + hex.slice(13, 16),
        "a" + hex.slice(17, 20),
        hex.slice(20, 32),
    ].join("-");
}
function toEdgeRow(row) {
    const fromPidRaw = row.from_pid ?? "";
    const toPidRaw = row.to_pid ?? "";
    const label = (row.label ?? "connection").trim() || "connection";
    const from_pid = normalizeAnyPid(fromPidRaw);
    const to_pid = normalizeAnyPid(toPidRaw);
    const id = (row.id ?? "").trim() || stableUuidFromPair(from_pid, to_pid, label);
    const trust = Number(row.trust ?? "80");
    const tier = Number(row.tier ?? "50");
    return {
        created_at: (row.created_at ?? "").trim() || new Date().toISOString(),
        tier: Number.isFinite(tier) ? tier : 50,
        status: (row.status ?? "accepted").trim() || "accepted",
        id,
        trust: Number.isFinite(trust) ? trust : 80,
        from_pid,
        to_pid,
        label,
    };
}
async function upsertLike(rows) {
    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
        const { data: existing, error: selectError } = await supabase
            .from("dl_edges")
            .select("id")
            .eq("from_pid", row.from_pid)
            .eq("to_pid", row.to_pid)
            .eq("label", row.label)
            .maybeSingle();
        if (selectError) {
            throw new Error(`select failed: ${selectError.message}`);
        }
        if (existing?.id) {
            const { error: updateError } = await supabase
                .from("dl_edges")
                .update({
                created_at: row.created_at,
                tier: row.tier,
                status: row.status,
                trust: row.trust,
                from_pid: row.from_pid,
                to_pid: row.to_pid,
                label: row.label,
            })
                .eq("id", existing.id);
            if (updateError) {
                throw new Error(`update failed (${row.from_pid} -> ${row.to_pid}): ${updateError.message}`);
            }
            updated += 1;
        }
        else {
            const { error: insertError } = await supabase.from("dl_edges").insert(row);
            if (insertError) {
                throw new Error(`insert failed (${row.from_pid} -> ${row.to_pid}): ${insertError.message}`);
            }
            inserted += 1;
        }
    }
    return { inserted, updated };
}
async function normalizeLegacyPidsInDb() {
    const legacyPid = "org:KR-UNIV-KOREA";
    const { error: updateFromError } = await supabase
        .from("dl_edges")
        .update({ from_pid: KOREA_UNIV_PID })
        .eq("from_pid", legacyPid);
    if (updateFromError) {
        throw new Error(`normalize from_pid failed: ${updateFromError.message}`);
    }
    const { error: updateToError } = await supabase
        .from("dl_edges")
        .update({ to_pid: KOREA_UNIV_PID })
        .eq("to_pid", legacyPid);
    if (updateToError) {
        throw new Error(`normalize to_pid failed: ${updateToError.message}`);
    }
}
function loadAllRows() {
    const rawRows = [];
    for (const file of CSV_FILES) {
        if (!fs_1.default.existsSync(file)) {
            console.log(`⚠️ skip missing file: ${file}`);
            continue;
        }
        const rows = parseCsv(readText(file));
        console.log(`📄 ${path_1.default.basename(file)} -> ${rows.length} rows`);
        rawRows.push(...rows);
    }
    const mapped = rawRows
        .map(toEdgeRow)
        .filter((row) => row.from_pid && row.to_pid && row.label);
    const dedupe = new Map();
    for (const row of mapped) {
        dedupe.set(`${row.from_pid}|${row.to_pid}|${row.label}`, row);
    }
    return Array.from(dedupe.values());
}
async function main() {
    console.log("🚀 seed_dl_edges starting...");
    console.log("PROJECT_ROOT =", PROJECT_ROOT);
    const finalRows = loadAllRows();
    await normalizeLegacyPidsInDb();
    const result = await upsertLike(finalRows);
    console.log("✅ seed_dl_edges done", {
        csvFiles: CSV_FILES,
        finalRows: finalRows.length,
        inserted: result.inserted,
        updated: result.updated,
        unifiedOrgPid: KOREA_UNIV_PID,
        sample: finalRows.slice(0, 8),
    });
}
main().catch((err) => {
    console.error("❌ seed_dl_edges failed");
    console.error(err);
    process.exit(1);
});
