import { userDb, checkOrigin, apiError } from "@/lib/supabase";
export async function POST(request: Request) {
  try { checkOrigin(request); const db=await userDb(); const {error}=await db.auth.signOut({scope:"local"}); if(error)throw error; return Response.json({ok:true}); }
  catch(error) { return apiError(error); }
}
