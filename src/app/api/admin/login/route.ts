import { z } from "zod";
import { adminDb, ApiError, apiError, checkOrigin, limitedJson } from "@/lib/supabase";
import { adminIpHash, adminPanelConfigured, adminSessionCookie, createAdminSession, verifyAdminCredentials } from "@/lib/admin-session";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!adminPanelConfigured()) throw new ApiError(503, "Admin panel access is not configured on this deployment.");
    const parsed = z.object({ name: z.string().trim().min(1).max(128), password: z.string().min(1).max(1024) }).safeParse(await limitedJson(request, 2048));
    if (!parsed.success) throw new ApiError(400, "Enter the admin name and password.");

    const { data: allowed, error } = await adminDb().rpc("consume_admin_login_limit_dayfold", { p_ip_hash: adminIpHash(request) });
    if (error) throw error;
    if (!allowed) throw new ApiError(429, "Too many sign-in attempts. Wait 15 minutes and try again.");
    if (!verifyAdminCredentials(parsed.data.name, parsed.data.password)) throw new ApiError(401, "Admin name or password is incorrect.");

    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store", "Set-Cookie": adminSessionCookie(createAdminSession()) } });
  } catch (error) {
    return apiError(error);
  }
}
