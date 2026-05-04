import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const keys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

console.log("CWD =", process.cwd());
console.log("Loading =", path.resolve(process.cwd(), ".env.local"));

for (const k of keys) {
  const v = process.env[k];
  console.log(`${k} =`, v ? `${v.slice(0, 6)}... (len=${v.length})` : "(missing)");
}