import {z} from "zod";
import { requireUser,adminDb,apiError,checkOrigin,limitedJson,rateLimit } from "@/lib/supabase";
export async function POST(request:Request) {
  try {checkOrigin(request);const {db,user}=await requireUser();await rateLimit(db,"feedback",120);
    const parsed=z.object({article_id:z.string().regex(/^[a-f0-9]{32}$/),action:z.enum(["more","less","read","open","impression"])}).safeParse(await limitedJson(request));
    if(!parsed.success)return Response.json({error:"Invalid feedback."},{status:400});
    const {error}=await db.from("feedback").insert({...parsed.data,user_id:user.id});
    if(error && error.code!=="23505")throw error;
    if(!error)await adminDb().from("events").insert({user_id:user.id,name:"feedback_submitted",properties:{action:parsed.data.action}});
    return Response.json({ok:true});
  }catch(error){return apiError(error);}
}
