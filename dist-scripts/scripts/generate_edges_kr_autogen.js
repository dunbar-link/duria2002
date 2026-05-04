"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// C:\work\nextjs-server\scripts\generate_edges_kr_autogen.ts
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function clean(s) {
    return (s ?? "")
        .replace(/^\uFEFF/, "")
        .trim()
        .replace(/^"+/, "")
        .replace(/"+$/, "");
}
function splitCsvLine(line) {
    return line.split(",").map((x) => clean(x));
}
function readCsvFlexible(fileAbs) {
    if (!node_fs_1.default.existsSync(fileAbs))
        return [];
    const text = node_fs_1.default.readFileSync(fileAbs, "utf8").trim();
    if (!text)
        return [];
    const [rawHeader, ...lines] = text.split(/\r?\n/);
    const headers = splitCsvLine(rawHeader);
    const has = (h) => headers.includes(h);
    const idx = (h) => headers.indexOf(h);
    const isA = has("name") &&
        has("type") &&
        has("country") &&
        has("city") &&
        has("industry") &&
        has("external_ref");
    const isB = has("external_ref") &&
        has("name") &&
        has("org_type") &&
        has("country") &&
        has("city") &&
        has("industry");
    if (!isA && !isB) {
        throw new Error(`Unsupported CSV header in ${fileAbs}\nGot: ${headers.join(",")}\nExpected either:\n- name,type,country,city,industry,external_ref\n- external_ref,name,org_type,country,city,industry,(tags...)`);
    }
    const rows = [];
    for (const line of lines) {
        if (!line.trim())
            continue;
        const cols = splitCsvLine(line);
        if (isA) {
            rows.push({
                name: cols[idx("name")],
                type: cols[idx("type")],
                country: cols[idx("country")],
                city: cols[idx("city")],
                industry: cols[idx("industry")],
                external_ref: cols[idx("external_ref")],
            });
        }
        else {
            rows.push({
                name: cols[idx("name")],
                type: cols[idx("org_type")] || "company",
                country: cols[idx("country")],
                city: cols[idx("city")],
                industry: cols[idx("industry")],
                external_ref: cols[idx("external_ref")],
            });
        }
    }
    return rows;
}
function cityRef(city) {
    return `KR-CITY-${clean(city || "SEOUL").toUpperCase().replace(/\s+/g, "-")}`;
}
function indRef(ind) {
    return `KR-IND-${clean(ind || "GENERAL").toUpperCase().replace(/\s+/g, "-")}`;
}
function edgeKey(e) {
    return `${e.from_type}|${e.from_external_ref}|${e.edge_type}|${e.to_type}|${e.to_external_ref}`;
}
function writeEdges(outAbs, edges) {
    const header = "from_external_ref,from_type,to_external_ref,to_type,edge_type,verified,weight_base";
    const lines = edges.map((e) => [
        clean(e.from_external_ref),
        e.from_type,
        clean(e.to_external_ref),
        e.to_type,
        e.edge_type,
        e.verified ? "true" : "false",
        String(e.weight_base),
    ].join(","));
    node_fs_1.default.writeFileSync(outAbs, [header, ...lines].join("\n"), "utf8");
}
function writeOrgSeed(outAbs, rows) {
    const header = "name,type,country,city,industry,external_ref";
    const lines = rows.map((r) => [r.name, r.type, r.country, r.city, r.industry, r.external_ref]
        .map(clean)
        .join(","));
    node_fs_1.default.writeFileSync(outAbs, [header, ...lines].join("\n"), "utf8");
}
/**
 * ✅ Dense edges 생성 (결정성 유지)
 * - 같은 그룹(도시/산업) 내에서 회사당 최대 K개만 연결
 * - 정렬 기준: external_ref ASC (고정)
 * - 방향: 양방향 2개 엣지 생성 (BFS에서 방향성 신경 안 쓰게 안전)
 */
function addDenseEdges(edges, seen, companyRefs, edgeType, weightBase, kMaxNeighbors) {
    // 결정성: 정렬 고정
    const refs = [...companyRefs].map(clean).filter(Boolean).sort();
    const n = refs.length;
    if (n <= 1)
        return;
    // 각 노드는 자기보다 뒤에 있는 노드 중 상위 K개에만 연결
    for (let i = 0; i < n; i++) {
        const from = refs[i];
        let added = 0;
        for (let j = i + 1; j < n && added < kMaxNeighbors; j++) {
            const to = refs[j];
            const e1 = {
                from_external_ref: from,
                from_type: "org",
                to_external_ref: to,
                to_type: "org",
                edge_type: edgeType,
                verified: false,
                weight_base: weightBase,
            };
            const k1 = edgeKey(e1);
            if (!seen.has(k1)) {
                seen.add(k1);
                edges.push(e1);
            }
            const e2 = {
                from_external_ref: to,
                from_type: "org",
                to_external_ref: from,
                to_type: "org",
                edge_type: edgeType,
                verified: false,
                weight_base: weightBase,
            };
            const k2 = edgeKey(e2);
            if (!seen.has(k2)) {
                seen.add(k2);
                edges.push(e2);
            }
            added++;
        }
    }
}
function main() {
    const root = process.cwd();
    const seedDir = node_path_1.default.join(root, "seed");
    // ✅ 회사 CSV (헤더 혼합 지원)
    const companyFiles = [
        node_path_1.default.join(seedDir, "orgs_kr_companies_100.csv"),
        node_path_1.default.join(seedDir, "orgs_kr_companies_300.csv"),
    ];
    const companies = companyFiles.flatMap((f) => readCsvFlexible(f));
    // external_ref 기준 dedupe
    const byRef = new Map();
    for (const c of companies) {
        const ref = clean(c.external_ref);
        if (!ref)
            continue;
        if (!byRef.has(ref))
            byRef.set(ref, { ...c, external_ref: ref });
    }
    // ✅ 도시/산업 노드 자동 생성(엣지 참조 안전)
    const cityRefs = new Map(); // ref -> name
    const indRefs = new Map(); // ref -> name
    for (const c of byRef.values()) {
        const cRef = cityRef(c.city);
        cityRefs.set(cRef, clean(c.city || "Seoul"));
        const iRef = indRef(c.industry);
        indRefs.set(iRef, clean(c.industry || "General"));
    }
    const cityIndustryOrgRows = [];
    for (const [ref, cityName] of cityRefs.entries()) {
        cityIndustryOrgRows.push({
            name: cityName,
            type: "city",
            country: "KR",
            city: cityName,
            industry: "",
            external_ref: ref,
        });
    }
    for (const [ref, indName] of indRefs.entries()) {
        cityIndustryOrgRows.push({
            name: indName,
            type: "industry",
            country: "KR",
            city: "",
            industry: indName,
            external_ref: ref,
        });
    }
    cityIndustryOrgRows.sort((a, b) => a.external_ref.localeCompare(b.external_ref));
    const cityIndustryAbs = node_path_1.default.join(seedDir, "orgs_kr_cities_industries.csv");
    writeOrgSeed(cityIndustryAbs, cityIndustryOrgRows);
    // ✅ 엣지 생성
    const edges = [];
    const seen = new Set();
    // (1) 회사 → 도시/산업 (기존 autogen)
    for (const c of byRef.values()) {
        const fromRef = clean(c.external_ref);
        const eCity = {
            from_external_ref: fromRef,
            from_type: "org",
            to_external_ref: cityRef(c.city),
            to_type: "org",
            edge_type: "located_in",
            verified: false,
            weight_base: 1,
        };
        const k1 = edgeKey(eCity);
        if (!seen.has(k1)) {
            seen.add(k1);
            edges.push(eCity);
        }
        const eInd = {
            from_external_ref: fromRef,
            from_type: "org",
            to_external_ref: indRef(c.industry),
            to_type: "org",
            edge_type: "in_industry",
            verified: false,
            weight_base: 1,
        };
        const k2 = edgeKey(eInd);
        if (!seen.has(k2)) {
            seen.add(k2);
            edges.push(eInd);
        }
    }
    // (2) ✅ Dense edges: same_city / same_industry
    // 튜닝 파라미터 (결정적)
    const K_CITY = 12; // 회사당 최대 이웃 수 (도시)
    const K_INDUSTRY = 10; // 회사당 최대 이웃 수 (산업)
    const W_CITY = 0.14; // 약한 연결
    const W_INDUSTRY = 0.12;
    // city -> companies
    const byCity = new Map();
    const byInd = new Map();
    for (const c of byRef.values()) {
        const ref = clean(c.external_ref);
        const cKey = cityRef(c.city);
        const iKey = indRef(c.industry);
        if (!byCity.has(cKey))
            byCity.set(cKey, []);
        byCity.get(cKey).push(ref);
        if (!byInd.has(iKey))
            byInd.set(iKey, []);
        byInd.get(iKey).push(ref);
    }
    for (const [, refs] of byCity.entries()) {
        addDenseEdges(edges, seen, refs, "same_city", W_CITY, K_CITY);
    }
    for (const [, refs] of byInd.entries()) {
        addDenseEdges(edges, seen, refs, "same_industry", W_INDUSTRY, K_INDUSTRY);
    }
    const edgesAbs = node_path_1.default.join(seedDir, "edges_kr_autogen.csv");
    writeEdges(edgesAbs, edges);
    console.log("✅ generated", {
        companiesFiles: companyFiles.map((p) => node_path_1.default.relative(root, p)),
        companiesUnique: byRef.size,
        edgesLines: edges.length,
        cityIndustryNodes: cityIndustryOrgRows.length,
        edgesFile: node_path_1.default.relative(root, edgesAbs),
        cityIndustryFile: node_path_1.default.relative(root, cityIndustryAbs),
        denseParams: { K_CITY, K_INDUSTRY, W_CITY, W_INDUSTRY },
    });
}
main();
