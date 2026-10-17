import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function publicConfig() {
  const url = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Account service is not configured.");
  return { url, key };
}
export async function userDb() {
  const {url,key} = publicConfig(); const jar = await cookies();
  return createServerClient(url, key, { cookies: {
    getAll: () => jar.getAll(),
    setAll: values => { try { values.forEach(({name,value,options}) => jar.set(name,value,options)); } catch { /* Read-only server component; routes refresh cookies. */ } }
  }});
}
export function adminDb() {
  const {url} = publicConfig(); const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Background processing is not configured.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function requireUser() {
  const db = await userDb(); const {data,error} = await db.auth.getUser();
  if (error || !data.user) throw new ApiError(401,"Sign in to continue.");
  return { db, user: data.user };
}
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function apiError(error: unknown) {
  if (error instanceof ApiError) return Response.json({error:error.message},{status:error.status});
  // Database/provider errors can contain private request details. Do not echo or log them.
  return Response.json({error:"This request could not be completed. Please try again. If setup is incomplete, check the deployment guide."},{status:503});
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new ApiError(403,"Request origin is not allowed.");
}
export async function limitedJson(request: Request, max = 16_000): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > max) throw new ApiError(413,"Request is too large.");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > max) throw new ApiError(413,"Request is too large.");
  try { return JSON.parse(raw); } catch { throw new ApiError(400,"Invalid request."); }
}
export async function rateLimit(db: Awaited<ReturnType<typeof userDb>>, action: string, limit: number, seconds = 3600) {
  const {data,error} = await db.rpc("consume_rate_limit", {p_action:action,p_limit:limit,p_seconds:seconds});
  if (error) throw new Error("Rate limit unavailable");
  if (!data) throw new ApiError(429,"You've reached the request limit. Please try again later.");
}
