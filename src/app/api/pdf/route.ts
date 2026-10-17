import {z} from "zod";
import {adminDb,requireUser,apiError,checkOrigin,limitedJson,rateLimit,ApiError} from "@/lib/supabase";
import {runJob} from "@/lib/jobs";
export const runtime="nodejs";
export const maxDuration=120;
export async function POST(request:Request) {
  try {checkOrigin(request);const {db,user}=await requireUser();await rateLimit(db,"pdf",10);
    const parsed=z.object({edition_id:z.string().uuid()}).safeParse(await limitedJson(request));if(!parsed.success)throw new ApiError(400,"Invalid edition.");
    const {data:edition,error}=await db.from("editions_dayfold").select("id,pdf_path,status").eq("id",parsed.data.edition_id).eq("user_id",user.id).single();if(error || !edition)throw new ApiError(404,"Edition not found.");
    if(edition.status!=="published")throw new ApiError(409,"Your paper is still being prepared.");
    const admin=adminDb();
    if(edition.pdf_path){const {data,error}=await admin.storage.from("edition-pdfs-dayfold").createSignedUrl(edition.pdf_path,60,{download:true});if(error)throw error;return Response.json({url:data.signedUrl});}
    const key=`pdf:${edition.id}`;
    const {data:created,error:jobError}=await admin.from("jobs_dayfold").upsert({user_id:user.id,type:"pdf",key,payload:{edition_id:edition.id}},{onConflict:"key",ignoreDuplicates:true}).select("id,status").maybeSingle();if(jobError)throw jobError;
    const {data:existing,error:lookupError}=await admin.from("jobs_dayfold").select("id,status").eq("key",key).eq("user_id",user.id).maybeSingle();if(lookupError)throw lookupError;
    const job=created||existing;
    if(job?.status==="running")return Response.json({pending:true,message:"Your PDF is being prepared. Try the download again shortly."},{status:202});
    if(job&&(job.status==="failed"||job.status==="succeeded")){
      const {error}=await admin.from("jobs_dayfold").update({status:"queued",attempts:0,error_code:null,locked_until:null,available_at:new Date().toISOString()}).eq("id",job.id).eq("user_id",user.id);
      if(error)throw error;
    }
    if(job)await runJob(job.id);
    const {data:ready,error:readyError}=await admin.from("editions_dayfold").select("pdf_path").eq("id",edition.id).eq("user_id",user.id).single();if(readyError)throw readyError;
    if(ready?.pdf_path){const {data,error}=await admin.storage.from("edition-pdfs-dayfold").createSignedUrl(ready.pdf_path,60,{download:true});if(error)throw error;return Response.json({url:data.signedUrl});}
    const {data:failed,error:statusError}=await admin.from("jobs_dayfold").select("status,error_code").eq("key",key).eq("user_id",user.id).single();if(statusError)throw statusError;
    if(failed.status==="failed")throw new ApiError(503,failed.error_code==="PDF_BROWSER_UNAVAILABLE"?"PDF creation needs Chrome or Edge installed. On Windows, set CHROMIUM_EXECUTABLE_PATH to the browser executable.":"PDF creation failed. Please try again shortly.");
    return Response.json({pending:true,message:"Your PDF is being prepared. Try the download again shortly."},{status:202});
  }catch(error){return apiError(error);}
}
