// lib/supabase-admin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function readSupabaseUrl() {
  const fromServer = normalizeText(process.env.SUPABASE_URL);
  const fromPublic = normalizeText(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const url = fromServer || fromPublic;

  if (!url) {
    throw new Error(
      "Missing Supabase URL. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env.local"
    );
  }

  try {
    const parsed = new URL(url);

    if (!parsed.hostname) {
      throw new Error("hostname missing");
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error(
      `Invalid Supabase URL: "${url}". Check .env.local and make sure it is a full https URL.`
    );
  }
}

function readServiceRoleKey() {
  const key = normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  return key;
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = readSupabaseUrl();
  const serviceKey = readServiceRoleKey();

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: fetch,
    },
  });
}

export function getSupabaseEnvDebug() {
  const rawServerUrl = normalizeText(process.env.SUPABASE_URL);
  const rawPublicUrl = normalizeText(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const usingUrl = rawServerUrl || rawPublicUrl;

  let hostname = "";
  try {
    hostname = usingUrl ? new URL(usingUrl).hostname : "";
  } catch {
    hostname = "";
  }

  return {
    hasSupabaseUrl: Boolean(rawServerUrl || rawPublicUrl),
    usingUrlSource: rawServerUrl ? "SUPABASE_URL" : rawPublicUrl ? "NEXT_PUBLIC_SUPABASE_URL" : "missing",
    hostname,
    hasServiceRoleKey: Boolean(normalizeText(process.env.SUPABASE_SERVICE_ROLE_KEY)),
  };
}

export const supabaseAdmin = getSupabaseAdmin();

export default getSupabaseAdmin;
