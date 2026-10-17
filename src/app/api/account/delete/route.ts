import {requireUser,adminDb,apiError,checkOrigin,limitedJson,ApiError} from "@/lib/supabase";
export async function POST(request:Request){
  try {checkOrigin(request);const {db,user}=await requireUser();const input=await limitedJson(request) as {confirmation?:string};if(input.confirmation!=="DELETE")throw new ApiError(400,"Type DELETE to confirm account removal.");
    const admin=adminDb();
    // Stop scheduling and prevent ongoing work from obtaining a live profile.
    const {error:disableError}=await admin.from("profiles_dayfold").update({onboarding_complete:false,preferences:{memory_enabled:false}}).eq("id",user.id);if(disableError)throw disableError;
    const {error:cancelError}=await admin.from("jobs_dayfold").delete().eq("user_id",user.id);if(cancelError)throw cancelError;
    for(let page=0;page<100;page++){
      const {data:objects,error}=await admin.storage.from("edition-pdfs-dayfold").list(user.id,{limit:100});if(error)throw error;if(!objects?.length)break;
      const {error:removeError}=await admin.storage.from("edition-pdfs-dayfold").remove(objects.map(o=>`${user.id}/${o.name}`));if(removeError)throw removeError;
    }
    // Supabase Auth is shared with the other application. Delete only Dayfold records.
    const {error}=await admin.rpc("delete_account_dayfold",{p_user_id:user.id});if(error)throw error;await db.auth.signOut({scope:"local"});return Response.json({ok:true});
  }catch(error){return apiError(error);}
}
