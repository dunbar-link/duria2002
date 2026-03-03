// ./lib/auth/jwt.ts
import { SignJWT, jwtVerify } from "jose";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const secret = () => new TextEncoder().encode(requireEnv("DL_JWT_SECRET"));
const issuer = () => requireEnv("DL_JWT_ISSUER");
const audience = () => requireEnv("DL_JWT_AUDIENCE");

export type DlJwtPayload = {
  sub: string; // userId
  plan: "free" | "strongest";
};

export async function signDlJwt(payload: DlJwtPayload, expiresIn: string = "7d") {
  // expiresIn examples: "15m", "7d"
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({ plan: payload.plan })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer())
    .setAudience(audience())
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verifyDlJwt(token: string): Promise<DlJwtPayload> {
  const { payload } = await jwtVerify(token, secret(), {
    issuer: issuer(),
    audience: audience(),
  });

  const sub = payload.sub;
  const plan = payload.plan;

  if (typeof sub !== "string") throw new Error("Invalid JWT: sub");
  if (plan !== "free" && plan !== "strongest") throw new Error("Invalid JWT: plan");

  return { sub, plan };
}