// supabase/functions/dl-search/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import neo4j, { Driver } from "npm:neo4j-driver";

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

let driver: Driver | null = null;
let connectivityChecked = false;

async function getDriver(): Promise<Driver> {
  if (!driver) {
    const uri = env("NEO4J_URI");
    const user = env("NEO4J_USER");
    const pass = env("NEO4J_PASSWORD");

    console.log("[dl-search] creating driver", { uri, user });
    driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  }

  // 1회만 연결 검증 (인증 실패면 여기서 바로 로그로 잡힘)
  if (!connectivityChecked) {
    connectivityChecked = true;
    console.log("[dl-search] verifyConnectivity start");
    await driver.verifyConnectivity();
    console.log("[dl-search] verifyConnectivity ok");
  }

  return driver;
}

console.log("[dl-search] boot", new Date().toISOString());

Deno.serve(async (req) => {
  console.log("[dl-search] req", req.method, req.url);

  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const { q, limit } = await req.json();
    const query = String(q ?? "").trim();
    const lim = Math.min(Math.max(Number(limit ?? 20), 1), 50);

    if (!query) return json({ ok: false, error: "q is required" }, 400);

    const db = env("NEO4J_DATABASE");
    const d = await getDriver();
    const session = d.session({ database: db });

    try {
      const cypher = `
        WITH toLower($q) AS q
        MATCH (p:Person)
        WHERE
          (p.name IS NOT NULL AND toLower(p.name) CONTAINS q) OR
          (p.email IS NOT NULL AND toLower(p.email) CONTAINS q) OR
          (p.company IS NOT NULL AND toLower(p.company) CONTAINS q) OR
          (p.school IS NOT NULL AND toLower(p.school) CONTAINS q) OR
          (p.city IS NOT NULL AND toLower(p.city) CONTAINS q)
        RETURN
          p.pid AS pid,
          p.handle AS handle,
          p.name AS name,
          p.company AS company,
          p.school AS school,
          p.city AS city,
          p.isCelebrity AS isCelebrity
        ORDER BY p.isCelebrity DESC, p.name ASC
        LIMIT $limit
      `;

      const res = await session.run(cypher, { q: query, limit: neo4j.int(lim) });

      const items = res.records.map((r) => ({
        pid: r.get("pid"),
        handle: r.get("handle"),
        name: r.get("name"),
        company: r.get("company"),
        school: r.get("school"),
        city: r.get("city"),
        isCelebrity: r.get("isCelebrity"),
      }));

      return json({ ok: true, items });
    } finally {
      await session.close();
    }
  } catch (e) {
    console.log("[dl-search] error", e);
    return json({ ok: false, error: String((e as any)?.message ?? e) }, 500);
  }
});