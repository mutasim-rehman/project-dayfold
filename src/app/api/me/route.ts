import { requireUser, apiError, checkOrigin, limitedJson, rateLimit, databaseError } from "@/lib/supabase";
import { defaultPreferences } from "@/lib/domain";
import { z } from "zod";
export const dynamic = "force-dynamic";
const preferences = z.object({
  topics:z.array(z.enum(["world","regional","technology","business","science","health","sports","culture"])).min(1).max(8),
  regions:z.array(z.string().trim().min(1).max(80)).max(10),entities:z.array(z.string().trim().min(1).max(80)).max(15),
  minutes:z.union([z.literal(5),z.literal(10),z.literal(15)]),language:z.enum(["en","ur"]),
  purpose:z.enum(["understand","work","learn","explore"]),depth:z.enum(["concise","context"]),
  discovery:z.enum(["low","medium","high"]),uncertainty:z.enum(["early","confirmed"]),updates:z.enum(["major","incremental"]),
  timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat("en",{timeZone:v});return true;}catch{return false;}}),memory_enabled:z.boolean()
});
export async function GET() {
  try {
    const {db,user}=await requireUser(); const {data,error}=await db.from("profiles_dayfold").select("preferences,onboarding_complete,last_active_at").eq("id",user.id).maybeSingle();
    // Identity is independently verified above. Missing application tables must not masquerade as sign-out.
    if(data)await db.from("profiles_dayfold").update({last_active_at:new Date().toISOString()}).eq("id",user.id);
    return Response.json({user:{name:user.user_metadata.full_name || user.user_metadata.name || "Reader",email:user.email,is_admin:(process.env.ADMIN_USER_IDS||"").split(",").map(s=>s.trim()).includes(user.id)},preferences:{...defaultPreferences,...data?.preferences},onboarding_complete:data?.onboarding_complete || false,setup_required:!!error},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {return apiError(error);}
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request); const {db,user}=await requireUser(); await rateLimit(db,"preferences",60);
    const parsed=preferences.safeParse(await limitedJson(request));
    if(!parsed.success) return Response.json({error:"Please check your reading preferences."},{status:400});
    const {error}=await db.from("profiles_dayfold").upsert({id:user.id,preferences:parsed.data,onboarding_complete:true,last_active_at:new Date().toISOString()});
    if(error) throw databaseError(error); return Response.json({ok:true});
  }catch(error){return apiError(error);}
}
