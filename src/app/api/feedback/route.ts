import {z} from "zod";
import { requireUser,adminDb,apiError,checkOrigin,limitedJson,rateLimit } from "@/lib/supabase";
export async function POST(request:Request) {
  try {checkOrigin(request);const {db,user}=await requireUser();await rateLimit(db,"feedback",120);
    const parsed=z.object({article_id:z.string().regex(/^[a-f0-9]{32}$/),action:z.enum(["more","less","read","open","impression"])}).safeParse(await limitedJson(request));
    if(!parsed.success)return Response.json({error:"Invalid feedback."},{status:400});
    const {data:article,error:articleError}=await db.from("articles_dayfold").select("id").eq("id",parsed.data.article_id).eq("approved",true).maybeSingle();
    if(articleError)throw articleError;
    if(!article)return Response.json({error:"Story not found."},{status:404});
    const deliberate=["more","less"].includes(parsed.data.action);
    // Repeating More after Less must become the newest choice. Authenticated
    // ownership is supplied by requireUser, never accepted from the request.
    const {error}=deliberate?await adminDb().from("feedback_dayfold").upsert({...parsed.data,user_id:user.id,created_at:new Date().toISOString()},{onConflict:"user_id,article_id,action"}):await db.from("feedback_dayfold").insert({...parsed.data,user_id:user.id});
    if(error && error.code!=="23505")throw error;
    if(!error||error.code==="23505"){
      const eventName=deliberate?"feedback_submitted":parsed.data.action==="read"?"source_link_opened":`story_${parsed.data.action}`;
      await adminDb().from("events_dayfold").insert({user_id:user.id,name:eventName,properties:{action:parsed.data.action}});
    }
    return Response.json({ok:true});
  }catch(error){return apiError(error);}
}
