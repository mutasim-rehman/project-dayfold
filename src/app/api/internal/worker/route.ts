import {timingSafeEqual} from "node:crypto";
import {runJob} from "@/lib/jobs";
import {adminDb} from "@/lib/supabase";
export const maxDuration=120;
export async function POST(request:Request) {
  const expected=process.env.WORKER_SECRET;const supplied=request.headers.get("authorization")?.replace(/^Bearer /,"") || "";
  if(!expected || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return Response.json({error:"Unauthorized"},{status:401});
  try {
    const db=adminDb();
    const {error}=await db.rpc("enqueue_morning_editions");if(error)throw error;
    const worked=await runJob();return Response.json({processed:worked?1:0});
  }catch {return Response.json({error:"Worker unavailable"},{status:503});}
}
