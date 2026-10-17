import {adminDb,requireUser,apiError,ApiError} from "@/lib/supabase";
export async function GET(){
  try {const {user}=await requireUser();const admins=(process.env.ADMIN_USER_IDS||"").split(",").map(s=>s.trim());if(!admins.includes(user.id))throw new ApiError(403,"Staff access required.");
    const {data,error}=await adminDb().rpc("product_metrics_dayfold");if(error)throw error;return Response.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return apiError(error);}
}
