import { apiError, checkOrigin } from "@/lib/supabase";
import { clearAdminSessionCookie } from "@/lib/admin-session";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store", "Set-Cookie": clearAdminSessionCookie() } });
  } catch (error) {
    return apiError(error);
  }
}
