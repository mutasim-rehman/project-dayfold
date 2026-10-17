import { userDb, checkOrigin, apiError } from "@/lib/supabase";
export async function POST(request: Request) {
  try { checkOrigin(request); const db=await userDb(); await db.auth.signOut(); return Response.json({ok:true}); }
  catch(error) { return apiError(error); }
}
