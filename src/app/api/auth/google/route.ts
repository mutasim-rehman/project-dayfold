import { NextResponse } from "next/server";
import { userDb } from "@/lib/supabase";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const db = await userDb();
    const {data,error} = await db.auth.signInWithOAuth({provider:"google",options:{redirectTo:`${url.origin}/auth/callback`,scopes:"openid email profile"}});
    if (error || !data.url) return NextResponse.redirect(new URL("/?auth_error=unavailable",request.url));
    return NextResponse.redirect(data.url);
  } catch { return NextResponse.redirect(new URL("/?auth_error=configuration",request.url)); }
}
