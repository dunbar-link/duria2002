// supabase/functions/dl-path-shortest/index.ts
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

    console.log("[dl-path-shortest] creating driver", { uri, user });
    driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  }

  if (!connectivityChecked) {
    connectivityChecked = true;
    console.log("[dl-path-shortest] verifyConnectivity start");
    await driver.verifyConnectivity();
    console.log("[dl-path-shortest] verifyConnectivity ok");
  }

  return driver;
}

console.log("[dl-path-shortest] boot", new Date().toISOString());

Deno.serve(async (req) => {
  console.log("[dl-path-shortest] req", req.method, req.url);

  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const { fromPid, toPid, maxHops } = await req.json();
    const a = String(fromPid ?? "").trim();
    const b = String(toPid ?? "").trim();
    const mh = Math.min(Math.max(Number(maxHops ?? 10), 1), 20);

    if (!a || !b) return json({ ok: false, error: "fromPid and toPid are required" }, 400);

    const db = env("NEO4J_DATABASE");
    const d = await getDriver();
    const session = d.session({ database: db });

    try {
      // shortestPath는 동적 길이에서 파라미터 바인딩이 어려워 mh를 문자열로 주입(상수화)
      const cypher = `
        MATCH p = shortestPath((src:Person {pid:$fromPid})-[:CONFIRMED*..${mh}]-(dst:Person {pid:$toPid}))
        RETURN
          length(p) AS hops,
          [n IN nodes(p) | {
            pid:n.pid, handle:n.handle, name:n.name,
            company:n.company, school:n.school, city:n.city, isCelebrity:n.isCelebrity
          }] AS path
        LIMIT 1
      `;

      const res = await session.run(cypher, { fromPid: a, toPid: b });

      if (res.records.length === 0) return json({ ok: true, found: false });

      const r = res.records[0];
      const hopsVal = r.get("hops");
      const hops = neo4j.isInt(hopsVal) ? hopsVal.toNumber() : Number(hopsVal);
      const path = r.get("path");

      return json({ ok: true, found: true, hops, path });
    } finally {
      await session.close();
    }
  } catch (e) {
    console.log("[dl-path-shortest] error", e);
    return json({ ok: false, error: String((e as any)?.message ?? e) }, 500);
  }
});