import { after } from "next/server";
import { z } from "zod";
import { adminDb,requireUser,apiError,checkOrigin,limitedJson,rateLimit,ApiError } from "@/lib/supabase";
import { generateJson } from "@/lib/llm";
import { runJob } from "@/lib/jobs";
import {semanticSearch} from "@/lib/retrieval";
export const maxDuration=120;
const output=z.object({answer:z.string().min(1).max(12000),answerable:z.boolean(),source_ids:z.array(z.string()).max(8)});
export async function GET(request:Request){
  try{const {db,user}=await requireUser();const id=new URL(request.url).searchParams.get("conversation_id");
    if(id){if(!z.string().uuid().safeParse(id).success)throw new ApiError(400,"Invalid conversation.");const {data,error}=await db.from("messages_dayfold").select("role,content,sources:source_refs").eq("user_id",user.id).eq("conversation_id",id).order("created_at").limit(100);if(error)throw error;return Response.json({messages:data},{headers:{"Cache-Control":"private, no-store"}});}
    const {data,error}=await db.from("conversations_dayfold").select("id,title").eq("user_id",user.id).order("created_at",{ascending:false}).limit(10);if(error)throw error;return Response.json({conversations:data},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return apiError(error);}
}
export async function POST(request:Request) {
  let stage="request";
  try {
    checkOrigin(request);const {db,user}=await requireUser();await rateLimit(db,"ask",20);
    const parsed=z.object({message:z.string().trim().min(3).max(4000),conversation_id:z.string().uuid().optional(),language:z.enum(["en","ur"]).default("en")}).safeParse(await limitedJson(request));
    if(!parsed.success)throw new ApiError(400,"Ask a question between 3 and 4,000 characters.");
    const admin=adminDb();let conversationId=parsed.data.conversation_id;
    if(conversationId) {
      const {data:owned}=await db.from("conversations_dayfold").select("id").eq("id",conversationId).eq("user_id",user.id).single();
      if(!owned)throw new ApiError(404,"Conversation not found.");
    } else {
      const {data,error}=await admin.from("conversations_dayfold").insert({user_id:user.id,title:parsed.data.message.slice(0,80)}).select("id").single();
      if(error)throw error;conversationId=data.id;
    }
    const [{data:profile},{data:memories},{data:recent},{data:articles,error:articleError}]=await Promise.all([
      db.from("profiles_dayfold").select("preferences,version").eq("id",user.id).single(),
      db.from("memories_dayfold").select("kind,value").eq("user_id",user.id).eq("status","accepted").limit(15),
      db.from("messages_dayfold").select("role,content").eq("user_id",user.id).eq("conversation_id",conversationId).order("created_at",{ascending:false}).limit(6),
      db.from("articles_dayfold").select("id,title,url,source,published_at,body").eq("approved",true).order("published_at",{ascending:false}).limit(100)
    ]);
    if(articleError)throw articleError;
    if(!articles?.length)throw new ApiError(409,"Generate your first paper so Ask has sourced reporting to search.");
    stage="retrieval";
    const terms=parsed.data.message.toLowerCase().split(/\s+/).filter(t=>t.length>2);
    let similarities:Record<string,number>={};
    try {const matches=await semanticSearch(parsed.data.message,30);similarities=Object.fromEntries(matches.map(a=>[a.id,a.similarity]));}catch{}
    const evidence=articles.map(a=>({...a,match:(similarities[a.id]||0)*4+terms.reduce((n,t)=>n+Number(`${a.title} ${a.body}`.toLowerCase().includes(t)),0)})).sort((a,b)=>b.match-a.match).slice(0,6);
    const {data:message,error:messageError}=await admin.from("messages_dayfold").insert({user_id:user.id,conversation_id:conversationId,role:"user",content:parsed.data.message}).select("id").single();
    if(messageError)throw messageError;
    stage="model";
    const result=await generateJson("synthesis",`You are Dayfold's news librarian. Answer in ${parsed.data.language==="ur"?"Urdu":"English"}. Return {"answer":"plain text, use [1], [2] citation markers matching evidence order","answerable":true,"source_ids":["only IDs actually supporting the answer"]}. Set answerable=false when the evidence cannot answer the question and explain the coverage gap. Only factual news claims supported by evidence are allowed. Be clear about limited Global Voices coverage and the evidence dates. Current request overrides old preferences. If evidence doesn't answer the question, say so rather than filling gaps from model knowledge. Do not claim live web search or create memory updates.`,{
      today:new Date().toISOString(),question:parsed.data.message,
      preferences:profile?.preferences || {},memories:profile?.preferences.memory_enabled?memories||[]:[],
      history:(recent||[]).reverse(),evidence:evidence.map((a,i)=>({number:i+1,id:a.id,title:a.title,date:a.published_at,text:a.body.slice(0,7000)}))
    },output);
    stage="citation_validation";
    const valid=new Set(evidence.map(a=>a.id));
    if(result.value.source_ids.some(id=>!valid.has(id)))throw new Error("Invalid citations");
    if(result.value.answerable && !result.value.source_ids.length)throw new Error("Missing evidence");
    const numbers=Array.from(result.value.answer.matchAll(/\[(\d+)\]/g)).map(m=>Number(m[1]));
    if(result.value.answerable && !numbers.length)throw new Error("Missing citation markers");
    if(numbers.some(n=>!evidence[n-1]||!result.value.source_ids.includes(evidence[n-1].id)))throw new Error("Unsupported citation marker");
    const sources=evidence.map((a,i)=>({id:a.id,title:a.title,url:a.url,number:i+1})).filter(a=>result.value.source_ids.includes(a.id));
    stage="save_answer";
    const {error:saveError}=await admin.from("messages_dayfold").insert({user_id:user.id,conversation_id:conversationId,role:"assistant",content:result.value.answer,source_refs:sources});if(saveError)throw saveError;
    await admin.from("usage_ledger_dayfold").insert({user_id:user.id,task:"ask",model:result.model,tokens:result.tokens});
    await admin.from("events_dayfold").insert({user_id:user.id,name:"ask_completed",properties:{language:parsed.data.language,source_count:sources.length}});
    if(profile?.preferences.memory_enabled) {
      const {error}=await admin.from("jobs_dayfold").insert({user_id:user.id,type:"memory",key:`memory:${message.id}`,payload:{message_id:message.id,profile_version:profile.version}});
      if(!error)after(async()=>{await runJob();});
    }
    return Response.json({answer:result.value.answer,sources,conversation_id:conversationId,memory_status:profile?.preferences.memory_enabled?"Review new memory suggestions in Preferences shortly.":"Conversational memory is off."},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error){
    if(!(error instanceof ApiError)){
      const rawCode=error&&typeof error==="object"&&"code" in error?String(error.code):"";
      const code=error instanceof z.ZodError?"INVALID_MODEL_RESPONSE":/^[A-Z0-9_]{1,40}$/.test(rawCode)?rawCode:"REQUEST_FAILED";
      console.error("Dayfold Ask failed",{stage,code});
    }
    return apiError(error);
  }
}
