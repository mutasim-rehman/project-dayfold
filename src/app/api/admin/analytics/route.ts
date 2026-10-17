import { adminDb, ApiError, apiError } from "@/lib/supabase";
import { requestAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (!requestAdminSession(request)) throw new ApiError(401, "Sign in to view product analytics.");
    const { data, error } = await adminDb().rpc("admin_analytics_dayfold");
    if (error) throw error;
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
