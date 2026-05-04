"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const supabase_js_1 = require("@supabase/supabase-js");
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env.local"), override: true });
const PROJECT_ROOT = "C:\\work\\nextjs-server";
const SUPABASE_URL = (process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim()) ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.trim()) ||
    "";
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!SUPABASE_URL)
    throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
console.log("✅ seed_dl_people env OK");
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
function splitMultiValue(value) {
    if (!value.trim())
        return [];
    return value
        .split(/[|;/]/)
        .map((v) => v.trim())
        .filter(Boolean);
}
function firstOrNull(value) {
    const parts = splitMultiValue(value);
    return parts.length > 0 ? parts[0] : null;
}
function readCelebrityCsv(filePath) {
    const rows = parseCsv(readText(filePath));
    return rows.map((row) => ({
        pid: (row.pid ?? "").trim(),
        display_name: (row.display_name ?? "").trim(),
        country: (row.country ?? "").trim(),
        schools: (row.schools ?? "").trim(),
        companies: (row.companies ?? "").trim(),
        cities: (row.cities ?? "").trim(),
    }));
}
async function main() {
    console.log("🚀 seed_dl_people starting...");
    console.log("PROJECT_ROOT =", PROJECT_ROOT);
    const csv = path_1.default.resolve(process.cwd(), "seed", "celebrity_master.csv");
    if (!fs_1.default.existsSync(csv)) {
        throw new Error(`Missing file: ${csv}`);
    }
    const rows = readCelebrityCsv(csv).filter((r) => r.pid && r.display_name);
    console.log(`📄 celebrity_master.csv -> ${rows.length} rows`);
    const payload = rows.map((r) => ({
        pid: r.pid,
        name: r.display_name,
        is_celebrity: true,
        city: firstOrNull(r.cities),
        school: firstOrNull(r.schools),
        company: firstOrNull(r.companies),
    }));
    const { error } = await supabase
        .from("dl_people")
        .upsert(payload, { onConflict: "pid" });
    if (error)
        throw error;
    console.log(`✅ inserted/updated ${payload.length} dl_people rows`);
    console.log("sample payload =", payload.slice(0, 5));
}
main().catch((e) => {
    console.error("❌ seed_dl_people failed:", e?.message ?? e);
    process.exit(1);
});
