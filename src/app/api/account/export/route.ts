import {requireUser,apiError} from "@/lib/supabase";
export async function GET(){
  try {const {db,user}=await requireUser();const output:Record<string,unknown>={exported_at:new Date().toISOString(),account:{id:user.id,email:user.email}};
    for(const table of ["profiles","editions","feedback","conversations","messages","memories"]){const {data,error}=await db.from(table).select("*").eq(table==="profiles"?"id":"user_id",user.id).limit(10000);if(error)throw error;output[table]=data;}
    return new Response(JSON.stringify(output,null,2),{headers:{"Content-Type":"application/json","Content-Disposition":'attachment; filename="dayfold-data.json"',"Cache-Control":"private, no-store"}});
  }catch(error){return apiError(error);}
}
