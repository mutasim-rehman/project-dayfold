import {after} from "next/server";
import {z} from "zod";
import {adminDb,requireUser,apiError,checkOrigin,limitedJson,rateLimit,ApiError} from "@/lib/supabase";
import {runJob} from "@/lib/jobs";
export const runtime="nodejs";
export const maxDuration=120;
export async function POST(request:Request) {
  try {checkOrigin(request);const {db,user}=await requireUser();await rateLimit(db,"pdf",10);
    const parsed=z.object({edition_id:z.string().uuid()}).safeParse(await limitedJson(request));if(!parsed.success)throw new ApiError(400,"Invalid edition.");
    const {data:edition,error}=await db.from("editions").select("id,pdf_path,status").eq("id",parsed.data.edition_id).eq("user_id",user.id).single();if(error || !edition)throw new ApiError(404,"Edition not found.");
    if(edition.status!=="published")throw new ApiError(409,"Your paper is still being prepared.");
    const admin=adminDb();
    if(edition.pdf_path){const {data,error}=await admin.storage.from("edition-pdfs").createSignedUrl(edition.pdf_path,60,{download:true});if(error)throw error;return Response.json({url:data.signedUrl});}
    const {data:job,error:jobError}=await admin.from("jobs").upsert({user_id:user.id,type:"pdf",key:`pdf:${edition.id}`,payload:{edition_id:edition.id}},{onConflict:"key",ignoreDuplicates:true}).select("id").maybeSingle();if(jobError)throw jobError;
    after(async()=>{await runJob(job?.id);});
    return Response.json({pending:true,message:"Your PDF is being prepared. Try the download again shortly."},{status:202});
  }catch(error){return apiError(error);}
}
