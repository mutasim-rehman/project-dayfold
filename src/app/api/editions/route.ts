import { after } from "next/server";
import { requireUser, apiError, checkOrigin, rateLimit } from "@/lib/supabase";
import { defaultPreferences, localDate,editionItemSnapshot } from "@/lib/domain";
import { queueEdition,runEditionJob } from "@/lib/jobs";
import {readingInfo} from "@/lib/recommendations";
export const maxDuration=120;
export async function GET() {
  try {const {db,user}=await requireUser();const {data,error}=await db.from("editions_dayfold").select("id,edition_date,created_at,language,status,items,minutes").eq("user_id",user.id).order("edition_date",{ascending:false}).limit(30);if(error)throw error;return Response.json({editions:(data||[]).map(edition=>({...edition,items:edition.items.map(editionItemSnapshot),...readingInfo(edition)}))},{headers:{"Cache-Control":"private, no-store"}});}
  catch(error){return apiError(error);}
}
export async function POST(request:Request) {
  try {
    checkOrigin(request);const {db,user}=await requireUser();await rateLimit(db,"edition",5);
    const {data:profile,error}=await db.from("profiles_dayfold").select("preferences,version,onboarding_complete").eq("id",user.id).single();
    if(error||!profile?.onboarding_complete)return Response.json({error:"Set your reading preferences first."},{status:409});
    const preferences={...defaultPreferences,...profile.preferences};const edition=await queueEdition(user.id,localDate(preferences.timezone),preferences,profile.version);
    if(edition.status!=="published") after(async()=>{await runEditionJob(edition.id,user.id);});
    return Response.json({edition:{...edition,items:edition.items.map(editionItemSnapshot),...readingInfo(edition)}},{status:edition.status==="published"?200:202,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return apiError(error);}
}
