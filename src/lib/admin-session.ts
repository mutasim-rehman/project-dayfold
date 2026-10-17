import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "dayfold_admin_session";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

type AdminCredentials = Record<string, string | undefined>;

function equalSecret(candidate: string, expected: string) {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function adminPanelConfigured(env: AdminCredentials = process.env) {
  return Boolean(env.Admin_Panel_Name?.trim() && env.Admin_Panel_Pass);
}

export function verifyAdminCredentials(name: string, password: string, env: AdminCredentials = process.env) {
  if (!adminPanelConfigured(env)) return false;
  const validName = equalSecret(name, env.Admin_Panel_Name!.trim());
  const validPassword = equalSecret(password, env.Admin_Panel_Pass!);
  return validName && validPassword;
}

function signingKey(env: AdminCredentials) {
  return createHash("sha256").update(`${env.Admin_Panel_Name!.trim()}\0${env.Admin_Panel_Pass}`).digest();
}

export function createAdminSession(now = Date.now(), env: AdminCredentials = process.env) {
  if (!adminPanelConfigured(env)) throw new Error("Admin panel credentials are not configured.");
  const payload = Buffer.from(JSON.stringify({ name: env.Admin_Panel_Name!.trim(), exp: Math.floor(now / 1000) + ADMIN_SESSION_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", signingKey(env)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminSession(token: string | undefined, now = Date.now(), env: AdminCredentials = process.env) {
  if (!token || !adminPanelConfigured(env)) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", signingKey(env)).update(payload).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return false; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { name?: string; exp?: number };
    return data.name === env.Admin_Panel_Name!.trim() && Number.isInteger(data.exp) && data.exp! > Math.floor(now / 1000);
  } catch { return false; }
}

export function requestAdminSession(request: Request, env: AdminCredentials = process.env) {
  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader.split(";").map(item => item.trim()).find(item => item.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1);
  return verifyAdminSession(token, Date.now(), env);
}

export function adminSessionCookie(token: string, secure = process.env.NODE_ENV === "production") {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

export function clearAdminSessionCookie(secure = process.env.NODE_ENV === "production") {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

export function adminIpHash(request: Request, env: AdminCredentials = process.env) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHmac("sha256", env.Admin_Panel_Pass || "dayfold-admin-unconfigured").update(address).digest("hex");
}
