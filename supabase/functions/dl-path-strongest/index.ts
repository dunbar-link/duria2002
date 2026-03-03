import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import neo4j, { Driver } from "npm:neo4j-driver";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ✅ Service role로 DB 접근 (RLS 무시)
const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

let driver: Driver | null = null;
let connectivityChecked = false;

async function getDriver(): Promise<Driver> {
  if (!driver) {
    driver = neo4j.driver(env("NEO4J_URI"), neo4j.auth.basic(env("NEO4J_USER"), env("NEO4J_PASSWORD")));
  }
  if (!connectivityChecked) {
    connectivityChecked = true;
    await driver.verifyConnectivity();
  }
  return driver;
}

async function spendCoinOrThrow(userId: string) {
  // 1) 지갑 조회
  const { data: wallet, error } = await supabase
    .from("wallets")
    .select("coin")
    .eq("user_id", userId)
    .single();

  if (error || !wallet) throw new Error("wallet not found");

  const coin = Number(wallet.coin ?? 0);
  if (coin < 1) {
    const err = new Error("Not enough COIN");
    (err as any).status = 402;
    throw err;
  }

  // 2) 원자적으로 차감 (coin >= 1 조건)
  // update ... where coin >= 1 로 경쟁상황에서도 안전하게
  const { data: updated, error: updErr } = await supabase
    .from("wallets")
    .update({ coin: coin - 1, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("coin", coin) // 낙관적 락(간단)
    .select("coin")
    .single();

  if (updErr || !updated) {
    const err = new Error("COIN spend conflict, retry");
    (err as any).status = 409;
    throw err;
  }

  // 3) ledger 기록
  const { error: ledErr } = await supabase.from("wallet_ledger").insert({
    user_id: userId,
    currency: "COIN",
    delta: -1,
    reason: "STRONGEST_PATH",
    ref_type: "PATH",
    ref_id: null,
  });

  if (ledErr) throw new Error(`ledger insert failed: ${ledErr.message}`);

  return { remainingCoin: updated.coin };
}

console.log("[dl-path-strongest] boot", new Date().toISOString());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  try {
    const { fromPid, toPid, userId } = await req.json();

    const a = String(fromPid ?? "").trim();
    const b = String(toPid ?? "").trim();
    const u = String(userId ?? "").trim();

    if (!a || !b) return json({ ok: false, error: "fromPid and toPid are required" }, 400);
    if (!u) return json({ ok: false, error: "userId is required" }, 400);

    // ✅ COIN 차감 (실패 시 여기서 종료)
    const spend = await spendCoinOrThrow(u);

    // ✅ Neo4j strongest 실행
    const db = env("NEO4J_DATABASE");
    const d = await getDriver();
    const session = d.session({ database: db });

    try {
      const cypher = `
        MATCH (src:Person {pid:$fromPid})
        MATCH (dst:Person {pid:$toPid})
        CALL apoc.algo.dijkstra(src, dst, 'CONFIRMED', 'cost') YIELD path, weight
        RETURN
          length(path) AS hops,
          round(exp(weight), 3) AS dlScore,
          [n IN nodes(path) | {
            pid:n.pid, handle:n.handle, name:n.name,
            company:n.company, school:n.school, city:n.city, isCelebrity:n.isCelebrity
          }] AS path
        LIMIT 1
      `;

      const res = await session.run(cypher, { fromPid: a, toPid: b });

      if (res.records.length === 0) {
        return json({ ok: true, found: false, spentCoin: 1, remainingCoin: spend.remainingCoin });
      }

      const r = res.records[0];
      const hopsVal = r.get("hops");
      const hops = neo4j.isInt(hopsVal) ? hopsVal.toNumber() : Number(hopsVal);

      return json({
        ok: true,
        found: true,
        hops,
        dlScore: r.get("dlScore"),
        path: r.get("path"),
        spentCoin: 1,
        remainingCoin: spend.remainingCoin,
      });
    } finally {
      await session.close();
    }
  } catch (e) {
    const status = Number((e as any)?.status ?? 500);
    console.log("[dl-path-strongest] error", e);
    return json({ ok: false, error: String((e as any)?.message ?? e) }, status);
  }
});