"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const PROJECT_ROOT = "C:\\work\\nextjs-server";
const SEED_DIR = path_1.default.join(PROJECT_ROOT, "seed");
const ORG_NODES_FILE = path_1.default.join(SEED_DIR, "org_nodes_master.csv");
const CELEBRITY_MASTER_FILE = path_1.default.join(SEED_DIR, "celebrity_master.csv");
const OUTPUT_FILE = path_1.default.join(SEED_DIR, "edges_celebrity_autogen.csv");
const DEFAULT_LABEL = "connection";
const DEFAULT_STATUS = "accepted";
const DEFAULT_TIER = 50;
const DEFAULT_TRUST = 80;
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
function escapeCsv(value) {
    if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
function writeCsv(filePath, rows) {
    const headers = [
        "created_at",
        "tier",
        "status",
        "id",
        "trust",
        "from_pid",
        "to_pid",
        "label",
    ];
    const lines = [
        headers.join(","),
        ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(",")),
    ];
    fs_1.default.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}
function normalizeKey(value) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}
function splitMultiValue(value) {
    if (!value.trim())
        return [];
    return value
        .split(/[|;/]/)
        .map((v) => v.trim())
        .filter(Boolean);
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
function buildOrgNameToPidMap(orgRows) {
    const map = new Map();
    for (const row of orgRows) {
        const pid = (row.pid ?? "").trim();
        const name = (row.name ?? "").trim();
        if (!pid || !name)
            continue;
        map.set(normalizeKey(name), pid);
    }
    return map;
}
function toEdge(fromPid, toPid, createdAt) {
    const label = DEFAULT_LABEL;
    return {
        created_at: createdAt,
        tier: String(DEFAULT_TIER),
        status: DEFAULT_STATUS,
        id: stableUuidFromPair(fromPid, toPid, label),
        trust: String(DEFAULT_TRUST),
        from_pid: fromPid,
        to_pid: toPid,
        label,
    };
}
function main() {
    console.log("🚀 generate_celebrity_edges_v2 starting...");
    console.log("PROJECT_ROOT =", PROJECT_ROOT);
    if (!fs_1.default.existsSync(ORG_NODES_FILE)) {
        throw new Error(`Missing file: ${ORG_NODES_FILE}`);
    }
    if (!fs_1.default.existsSync(CELEBRITY_MASTER_FILE)) {
        throw new Error(`Missing file: ${CELEBRITY_MASTER_FILE}`);
    }
    const orgRows = parseCsv(readText(ORG_NODES_FILE));
    const celebRows = parseCsv(readText(CELEBRITY_MASTER_FILE));
    const orgNameToPid = buildOrgNameToPidMap(orgRows);
    const createdAt = new Date().toISOString();
    const dedupe = new Map();
    const unmatchedOrgNames = new Set();
    for (const celeb of celebRows) {
        const celebPid = (celeb.pid ?? "").trim();
        if (!celebPid.startsWith("celeb:"))
            continue;
        const schools = splitMultiValue(celeb.schools ?? "");
        const companies = splitMultiValue(celeb.companies ?? "");
        const sourceOrgNames = [...schools, ...companies];
        for (const orgName of sourceOrgNames) {
            const orgPid = orgNameToPid.get(normalizeKey(orgName));
            if (!orgPid) {
                unmatchedOrgNames.add(orgName);
                continue;
            }
            const edge = toEdge(orgPid, celebPid, createdAt);
            const key = `${edge.from_pid}|${edge.to_pid}|${edge.label}`;
            dedupe.set(key, edge);
        }
    }
    const rows = Array.from(dedupe.values()).sort((a, b) => {
        if (a.from_pid !== b.from_pid)
            return a.from_pid.localeCompare(b.from_pid);
        return a.to_pid.localeCompare(b.to_pid);
    });
    writeCsv(OUTPUT_FILE, rows);
    console.log("✅ generated", {
        outputFile: OUTPUT_FILE,
        rowCount: rows.length,
        unmatchedOrgNameCount: unmatchedOrgNames.size,
        unmatchedOrgNames: Array.from(unmatchedOrgNames).slice(0, 20),
        sample: rows.slice(0, 10),
    });
}
main();
