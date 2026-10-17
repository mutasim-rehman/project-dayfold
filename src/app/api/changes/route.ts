import {z} from "zod";
import {requireUser,apiError,checkOrigin,limitedJson,rateLimit,ApiError,adminDb} from "@/lib/supabase";
import {generateJson} from "@/lib/llm";
import type {EditionItem} from "@/lib/domain";
export async function POST(request:Request) {
  try {checkOrigin(request);const {db,user}=await requireUser();await rateLimit(db,"ask",20);
    const input=z.object({edition_id:z.string().uuid(),article_id:z.string(),language:z.enum(["en","ur"])}).safeParse(await limitedJson(request));if(!input.success)throw new ApiError(400,"Invalid story.");
    const {data:edition}=await db.from("editions_dayfold").select("items,created_at,published_at").eq("id",input.data.edition_id).eq("user_id",user.id).single();
    const baseline=(edition?.items as EditionItem[]|undefined)?.find(a=>a.id===input.data.article_id);if(!baseline)throw new ApiError(404,"Story not found in this edition.");
    await adminDb().from("events_dayfold").insert({user_id:user.id,name:"change_brief_opened",properties:{edition_id:input.data.edition_id}});
    const cutoff=edition!.published_at||edition!.created_at;
    const {data:original}=await db.from("article_versions_dayfold").select("body,published_at").eq("article_id",baseline.id).eq("content_hash",baseline.evidence_hash||"").maybeSingle();
    const {data:later}=await db.from("article_versions_dayfold").select("article_id,title,published_at,first_seen_at,body,articles:articles_dayfold!inner(url,approved)").eq("articles.approved",true).eq("cluster_id",baseline.cluster_id).gt("first_seen_at",cutoff).neq("content_hash",baseline.evidence_hash||"").limit(5);
    if(!later?.length)return Response.json({answer:input.data.language==="ur"?"اس اشاعت کے بعد اس خبر کے بارے میں کوئی نئی، مصدقہ پیش رفت ہمارے ذرائع میں موجود نہیں ہے۔":"No supported new development is available in our sources since this edition. This reflects limited coverage, not proof that nothing happened.",sources:[],baseline:edition!.created_at});
    if(!original)return Response.json({answer:"The full baseline evidence is unavailable, so a reliable change comparison cannot be made.",sources:[],baseline:edition!.created_at});
    const result=await generateJson("synthesis",`Compare full baseline evidence with later-observed reporting. Answer in ${input.data.language==="ur"?"Urdu":"English"}. Return {"answer":"supported changes with numbered citations and remaining uncertainty"}. Repetition and details already in the baseline are not developments. first_seen_at is when our system observed reporting, not proof of when events happened. Preserve publication dates. Do not assume the reader understood the baseline.`,{baseline:{date:edition!.created_at,title:baseline.title,text:original.body.slice(0,10000)},later:later.map(a=>({...a,body:a.body.slice(0,8000)}))},z.object({answer:z.string().max(8000)}));
    await adminDb().from("usage_ledger_dayfold").insert({user_id:user.id,task:"changes",model:result.model,tokens:result.tokens});
    return Response.json({answer:result.value.answer,sources:later.map(a=>({title:a.title,url:(a.articles as unknown as {url:string}).url})),baseline:edition!.created_at});
  }catch(error){return apiError(error);}
}
