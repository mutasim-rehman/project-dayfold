import { NextResponse } from "next/server";
import { userDb } from "@/lib/supabase";
import {authFailureCode,incomingOrigin,productionOrigin} from "@/lib/auth-origin";
export const dynamic="force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code");
  // Vercel may expose an internal request hostname. Never redirect a deployed
  // callback to that host or to an accidentally copied local APP_URL.
  const origin=process.env.VERCEL === "1" ? productionOrigin : incomingOrigin(request);
  if(url.searchParams.has("error"))return NextResponse.redirect(`${origin}/?auth_error=denied`);
  if (code) {
    try {
      const db = await userDb(); const {error} = await db.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}/`,{headers:{"Cache-Control":"private, no-store"}});
      return NextResponse.redirect(`${origin}/?auth_error=${authFailureCode(error)}`);
    } catch { return NextResponse.redirect(`${origin}/?auth_error=exchange`); }
  }
  return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
}
