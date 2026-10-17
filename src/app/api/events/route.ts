import {z} from "zod";
import {adminDb,requireUser,apiError,checkOrigin,limitedJson,rateLimit} from "@/lib/supabase";
export async function POST(request:Request){
  try{checkOrigin(request);const {db,user}=await requireUser();await rateLimit(db,"telemetry",120);
    const input=z.object({name:z.enum(["edition_opened","story_impression","source_link_opened","pdf_download_requested","change_brief_opened"]),edition_id:z.string().uuid()}).safeParse(await limitedJson(request));
    if(!input.success)return Response.json({error:"Invalid event."},{status:400});
    const {data}=await db.from("editions_dayfold").select("id").eq("id",input.data.edition_id).eq("user_id",user.id).single();if(!data)return Response.json({error:"Edition not found."},{status:404});
    const {error}=await adminDb().from("events_dayfold").insert({user_id:user.id,name:input.data.name,properties:{edition_id:input.data.edition_id}});if(error)throw error;return Response.json({ok:true});
  }catch(error){return apiError(error);}
}
