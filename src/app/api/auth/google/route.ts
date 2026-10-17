import { NextResponse } from "next/server";
import { userDb } from "@/lib/supabase";
import {deploymentAuthOrigin,incomingOrigin,productionOrigin} from "@/lib/auth-origin";
export const dynamic="force-dynamic";
export async function GET(request: Request) {
  try {
    const origin=deploymentAuthOrigin(request);
    // Redirect BEFORE creating the PKCE verifier so the cookie is scoped to the callback host.
    if(origin!==incomingOrigin(request)) return NextResponse.redirect(`${origin}/api/auth/google`,{headers:{"Cache-Control":"no-store"}});
    const db = await userDb();
    const {data,error} = await db.auth.signInWithOAuth({provider:"google",options:{redirectTo:`${origin}/auth/callback`,scopes:"openid email profile"}});
    if (error || !data.url) return NextResponse.redirect(`${origin}/?auth_error=provider`);
    return NextResponse.redirect(data.url,{headers:{"Cache-Control":"no-store"}});
  } catch { return NextResponse.redirect(new URL("/?auth_error=configuration",process.env.VERCEL === "1" ? productionOrigin : incomingOrigin(request)),{headers:{"Cache-Control":"no-store"}}); }
}
