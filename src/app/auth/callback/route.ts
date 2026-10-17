import { NextResponse } from "next/server";
import { userDb } from "@/lib/supabase";
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code");
  if (code) {
    try {
      const db = await userDb(); const {error} = await db.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/",url.origin));
    } catch { /* Show a safe, actionable error without leaking provider content. */ }
  }
  return NextResponse.redirect(new URL("/?auth_error=callback",url.origin));
}
