import { z } from "zod";
import { adminDb,requireUser,apiError,checkOrigin,limitedJson,rateLimit } from "@/lib/supabase";
export async function GET() {
  try {const {db,user}=await requireUser();const {data,error}=await db.from("memories").select("id,kind,value,status,created_at").eq("user_id",user.id).neq("status","forgotten").or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at",{ascending:false});if(error)throw error;return Response.json({memories:data},{headers:{"Cache-Control":"private, no-store"}});}
  catch(error){return apiError(error);}
}
export async function PATCH(request:Request) {
  try {checkOrigin(request);const {db,user}=await requireUser();await rateLimit(db,"memory",60);
    const parsed=z.object({id:z.string().uuid(),action:z.enum(["accept","forget"])}).safeParse(await limitedJson(request));if(!parsed.success)return Response.json({error:"Invalid memory change."},{status:400});
    const {error}=await adminDb().from("memories").update({status:parsed.data.action==="accept"?"accepted":"forgotten",confirmed:parsed.data.action==="accept",expires_at:null}).eq("id",parsed.data.id).eq("user_id",user.id);if(error)throw error;return Response.json({ok:true});
  }catch(error){return apiError(error);}
}
