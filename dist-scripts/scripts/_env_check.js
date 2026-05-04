"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env.local") });
const keys = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];
console.log("CWD =", process.cwd());
console.log("Loading =", path_1.default.resolve(process.cwd(), ".env.local"));
for (const k of keys) {
    const v = process.env[k];
    console.log(`${k} =`, v ? `${v.slice(0, 6)}... (len=${v.length})` : "(missing)");
}
