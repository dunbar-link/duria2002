"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const PROJECT_ROOT = "C:\\work\\nextjs-server";
const SEED_DIR = path_1.default.join(PROJECT_ROOT, "seed");
const CELEBRITY_MASTER_FILE = path_1.default.join(SEED_DIR, "celebrity_master.csv");
const ORG_RULES_FILE = path_1.default.join(SEED_DIR, "org_celebrity_rules.csv");
const OUTPUT_FILE = path_1.default.join(SEED_DIR, "edges_celebrity_autogen.csv");
function stripBom(value) {
    return value.replace(/^\uFEFF/, "");
}
function detectDelimiter(headerLine) {
    const commaCount = (headerLine.match(/,/g) ?? []).length;
    const semicolonCount = (headerLine.match(/;/g) ?? []).length;
    const tabCount = (headerLine.match(/\t/g) ?? []).length;
    if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) {
        return "\t";
    }
    if (semicolonCount > commaCount) {
        return ";";
    }
    return ",";
}
function normalizeText(raw) {
    return stripBom(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function splitSimple(line, delimiter) {
    return line.split(delimiter).map((cell) => {
        return cell
            .trim()
            .replace(/^"+/, "")
            .replace(/"+$/, "")
            .replace(/""/g, '"');
    });
}
function readCsvAsObjects(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error(`CSV file not found: ${filePath}`);
    }
    const raw = fs_1.default.readFileSync(filePath, "utf-8");
    const normalized = normalizeText(raw);
    const lines = normalized
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length < 2) {
        return [];
    }
    const delimiter = detectDelimiter(lines[0]);
    const headers = splitSimple(lines[0], delimiter).map((header) => stripBom(header));
    return lines.slice(1).map((line) => {
        const values = splitSimple(line, delimiter);
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] ?? "";
        });
        return obj;
    });
}
function toCsv(rows) {
    const header = ["from_pid", "to_pid", "trust", "tier", "status", "label"];
    const body = rows.map((row) => [
        row.from_pid,
        row.to_pid,
        String(row.trust),
        String(row.tier),
        row.status,
        row.label,
    ].join(","));
    return [header.join(","), ...body].join("\n");
}
function normalizeTrust(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 70;
    return Math.max(0, Math.min(100, Math.round(n)));
}
function normalizeTier(value) {
    const n = Number(value);
    const allowed = new Set([1, 5, 15, 50, 150]);
    if (allowed.has(n))
        return n;
    return 50;
}
function buildEdgeKey(fromPid, toPid) {
    return `${fromPid}__${toPid}`;
}
function main() {
    const celebrityRows = readCsvAsObjects(CELEBRITY_MASTER_FILE);
    const ruleRows = readCsvAsObjects(ORG_RULES_FILE);
    console.log("DEBUG celebrity sample:", celebrityRows[0]);
    console.log("DEBUG rule sample:", ruleRows[0]);
    const celebrityMap = new Map();
    for (const celeb of celebrityRows) {
        if (!celeb.pid)
            continue;
        celebrityMap.set(celeb.pid, celeb);
    }
    const edges = [];
    const seen = new Set();
    for (const rule of ruleRows) {
        if (!rule.org_pid || !rule.celeb_pid) {
            console.warn("Skipping rule because org_pid or celeb_pid is empty:", rule);
            continue;
        }
        const celeb = celebrityMap.get(rule.celeb_pid);
        if (!celeb) {
            console.warn(`Skipping rule because celebrity not found: ${rule.celeb_pid}`);
            continue;
        }
        const trust = normalizeTrust(rule.trust);
        const tier = normalizeTier(rule.tier);
        const labelParts = [rule.label || "seed:auto", rule.match_type || "unknown"].filter(Boolean);
        const edge = {
            from_pid: rule.org_pid,
            to_pid: rule.celeb_pid,
            trust,
            tier,
            status: "accepted",
            label: labelParts.join(":"),
        };
        const key = buildEdgeKey(edge.from_pid, edge.to_pid);
        if (!seen.has(key)) {
            seen.add(key);
            edges.push(edge);
        }
        const reverseEdge = {
            from_pid: rule.celeb_pid,
            to_pid: rule.org_pid,
            trust,
            tier,
            status: "accepted",
            label: labelParts.join(":"),
        };
        const reverseKey = buildEdgeKey(reverseEdge.from_pid, reverseEdge.to_pid);
        if (!seen.has(reverseKey)) {
            seen.add(reverseKey);
            edges.push(reverseEdge);
        }
    }
    const csv = toCsv(edges);
    fs_1.default.writeFileSync(OUTPUT_FILE, csv, "utf-8");
    console.log("✅ celebrity edge generation complete");
    console.log({
        projectRoot: PROJECT_ROOT,
        celebrityMasterFile: CELEBRITY_MASTER_FILE,
        rulesFile: ORG_RULES_FILE,
        outputFile: OUTPUT_FILE,
        celebrityCount: celebrityRows.length,
        ruleCount: ruleRows.length,
        edgeCount: edges.length,
    });
}
main();
