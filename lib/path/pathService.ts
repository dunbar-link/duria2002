import { createClient } from "@supabase/supabase-js";
import { mapRpcResult } from "./pathMapper";
import { DiscoverResult } from "./pathTypes";

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    }
  );
}

export async function runPathProbe(params: {
  userId: string;
  targetPid: string;
  cost: number;
  maxHops: number;
}) {
  const supabase = getAdminClient();

  const { data, error } = await supabase.rpc("dl_path_probe_paid", {
    p_user_id: params.userId,
    p_target_pid: params.targetPid,
    p_cost: params.cost,
    p_max_hops: params.maxHops,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function runMappedPathProbe(params: {
  userId: string;
  targetPid: string;
  cost: number;
  maxHops: number;
}): Promise<DiscoverResult> {
  const raw = await runPathProbe(params);

  const normalized =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return mapRpcResult(normalized);
}