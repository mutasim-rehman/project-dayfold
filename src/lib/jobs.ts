import "server-only";
import { z } from "zod";
import { adminDb } from "./supabase";
import { fetchApprovedContent } from "./content";
import { defaultPreferences, validateMemory,groupStories, topics, editionItemSnapshot, type Article, type Preferences, type EditionItem } from "./domain";
import { generateJson } from "./llm";
import {indexArticles,retrieveEditionCandidates,ARTICLE_COLUMNS} from "./retrieval";
import {createHash} from "node:crypto";
import {enrichArticle} from "./article-signals";
import {recommendArticles,fitReadingBudget,readingInfo,RANKING_VERSION} from "./recommendations";

export async function refreshCorpus(userId:string) {
  const db=adminDb();
  const {data:source}=await db.from("sources_dayfold").select("enabled,capabilities").eq("id","global-voices").single();
  if(!source?.enabled || !source.capabilities?.summarize || !source.capabilities?.translate || !source.capabilities?.pdf)throw new Error("Source permissions unavailable");
  const fetched=await fetchApprovedContent();
  const {data:existing}=await db.from("articles_dayfold").select(ARTICLE_COLUMNS).eq("approved",true).order("published_at",{ascending:false}).limit(200);
  const articles=groupStories(fetched,existing||[]);
  if(!articles.length) throw new Error("No source evidence available");
  const {error}=await db.from("articles_dayfold").upsert(articles.map(a=>({...a,approved:true})),{onConflict:"id"});
  if(error) throw error;
  const {error:versionError}=await db.from("article_versions_dayfold").upsert(articles.map(a=>({article_id:a.id,content_hash:createHash("sha256").update(`${a.title}\n${a.body}`).digest("hex"),title:a.title,body:a.body,published_at:a.published_at,cluster_id:a.cluster_id})),{onConflict:"article_id,content_hash",ignoreDuplicates:true});if(versionError)throw versionError;
  await db.from("sources_dayfold").update({last_fetched_at:new Date().toISOString()}).eq("id","global-voices");
  // Index in separate bounded jobs; embedding time must not block the first readable paper.
  for(let i=0;i<articles.length;i+=8){const batch=articles.slice(i,i+8);const ids=batch.map(a=>a.id);const hash=createHash("sha256").update(JSON.stringify(batch.map(a=>[a.id,a.title,a.body]))).digest("hex");await db.from("jobs_dayfold").upsert({user_id:userId,type:"index",key:`index-v2:${hash}`,payload:{article_ids:ids}},{onConflict:"key",ignoreDuplicates:true});}
  return articles;
}
const summarySchema=z.object({items:z.array(z.object({id:z.string(),title:z.string().min(1).max(500),summary:z.string().min(1).max(2000)})).max(12)});
const memorySchema=z.object({candidates:z.array(z.object({operation:z.enum(["upsert","remove"]),kind:z.enum(["topic","entity","region"]),value:z.string().max(80),scope:z.enum(["ongoing","temporary"]),explicit:z.boolean(),sensitive:z.boolean(),evidence_quote:z.string().max(1000)})).max(5)});

async function buildEdition(payload: {edition_id:string; preferences:Preferences; user_id:string}) {
  const db=adminDb();
  const {data:edition}=await db.from("editions_dayfold").select("status").eq("id",payload.edition_id).eq("user_id",payload.user_id).single();
  if(!edition || edition.status==="published") return;
  await db.from("editions_dayfold").update({status:"building"}).eq("id",payload.edition_id);
  const {data:stored,error:storedError}=await db.from("articles_dayfold").select(ARTICLE_COLUMNS).eq("approved",true).gte("published_at",new Date(Date.now()-14*86400_000).toISOString()).order("published_at",{ascending:false}).limit(200);
  if(storedError)throw storedError;
  const {data:sourceState}=await db.from("sources_dayfold").select("last_fetched_at").eq("id","global-voices").single();
  let articles:Article[]=stored||[];let cachedSource=false;
  if(!articles.length || !sourceState?.last_fetched_at || Date.parse(sourceState.last_fetched_at)<Date.now()-3600_000){
    try {const fresh=await refreshCorpus(payload.user_id);articles=[...fresh,...articles.filter(a=>!fresh.some(f=>f.id===a.id))].slice(0,200);}catch {if(!articles.length)throw new Error("Content unavailable");cachedSource=true;}
  }
  const {data:feedback,error:feedbackError}=await db.from("feedback_dayfold").select("article_id,action,created_at").eq("user_id",payload.user_id).order("created_at",{ascending:false}).limit(200);
  if(feedbackError)throw feedbackError;
  const {data:memories,error:memoryError}=await db.from("memories_dayfold").select("kind,value").eq("user_id",payload.user_id).eq("status","accepted").or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).limit(20);
  if(memoryError)throw memoryError;
  const {data:liveProfile}=await db.from("profiles_dayfold").select("preferences").eq("id",payload.user_id).single();
  const accepted=liveProfile?.preferences.memory_enabled?memories||[]:[];
  const topicMemories=accepted.filter(m=>m.kind==="topic"&&topics.includes(m.value as typeof topics[number])).map(m=>m.value);
  const effective={...payload.preferences,topics:[...new Set([...payload.preferences.topics,...topicMemories])],entities:[...new Set([...payload.preferences.entities,...accepted.filter(m=>m.kind!=="region"&&!topicMemories.includes(m.value)).map(m=>m.value)])],regions:[...new Set([...payload.preferences.regions,...accepted.filter(m=>m.kind==="region").map(m=>m.value)])]};
  const retrieval=await retrieveEditionCandidates(effective,articles);
  articles=retrieval.articles;
  const feedbackIds=[...new Set((feedback||[]).map(f=>f.article_id))].filter(id=>!articles.some(a=>a.id===id));
  if(feedbackIds.length){const {data:history,error}=await db.from("articles_dayfold").select(ARTICLE_COLUMNS).eq("approved",true).in("id",feedbackIds);if(error)throw error;articles.push(...(history||[]).map(enrichArticle));}
  const seenClusters:Record<string,string>={};
  for(const f of feedback||[])if(f.action==="read"){const article=articles.find(a=>a.id===f.article_id);if(article&&(!seenClusters[article.cluster_id]||seenClusters[article.cluster_id]<f.created_at))seenClusters[article.cluster_id]=f.created_at;}
  const ranked=recommendArticles(articles,effective,feedback||[],Date.now(),retrieval.similarities,{seenClusters});
  let items:EditionItem[]=ranked.items;
  if(!retrieval.semanticAvailable)items=items.map(a=>({...a,reason:`${a.reason} · ${payload.preferences.language==="ur"?"آپ کی محفوظ دلچسپیوں سے منتخب؛ کچھ متعلقہ خبریں رہ گئی ہوں گی":"selected from your saved interests; some related coverage may be missing"}`}));
  if(cachedSource)items=items.map(a=>({...a,reason:`${a.reason} · source refresh unavailable; using dated saved coverage`}));
  if(items.length)try {
    const model=process.env.LLM_SYNTHESIS_MODEL||"gemini-3.8-flash";
    const hashes=Object.fromEntries(items.map(a=>[a.id,createHash("sha256").update(`${a.title}\n${a.body}`).digest("hex")]));
    const promptVersion=`2:${payload.preferences.purpose}`;
    const {data:cached}=await db.from("article_briefs_dayfold").select("article_id,content_hash,title,summary").in("article_id",items.map(a=>a.id)).eq("language",payload.preferences.language).eq("depth",payload.preferences.depth).eq("model",model).eq("prompt_version",promptVersion);
    const summaries=new Map<string,{title:string;summary:string}>((cached||[]).filter(c=>c.content_hash===hashes[c.article_id]).map(c=>[c.article_id,{title:c.title,summary:c.summary}]));
    const missing=items.filter(a=>!summaries.has(a.id));
    if(missing.length){
      const purpose=payload.preferences.purpose==="learn"?"Explain the mechanism and unfamiliar terms when the source supports them.":payload.preferences.purpose==="work"?"Include supported practical or policy implications.":payload.preferences.purpose==="explore"?"Highlight the source's distinctive perspective.":"Explain why the reported development matters, using source evidence.";
      const result=await generateJson("synthesis",`Write grounded news briefs and faithful headlines in ${payload.preferences.language==="ur" ? "Urdu" : "English"}. Return {"items":[{"id":"source id","title":"localized headline","summary":"brief"}]} with exactly one item for each supplied source ID. Only use the supplied article body. Preserve names, dates, attribution and uncertainty. No unsupported claim. ${purpose} ${payload.preferences.depth==="concise"?"Use 40–60":"Use 80–120"} words per item. Do not copy lengthy passages.`,{articles:missing.map(a=>({id:a.id,title:a.title,body:a.body?.slice(0,6500)}))},summarySchema);
      if(new Set(result.value.items.map(i=>i.id)).size!==missing.length || result.value.items.some(i=>!missing.some(a=>a.id===i.id)))throw new Error("Invalid brief identities");
      for(const item of result.value.items){
        if(payload.preferences.language==="ur" && (!/[\u0600-\u06ff]/.test(item.summary)||!/[\u0600-\u06ff]/.test(item.title)))throw new Error("Urdu output unavailable");
        summaries.set(item.id,item);
      }
      const {error:cacheError}=await db.from("article_briefs_dayfold").upsert(result.value.items.map(item=>({article_id:item.id,content_hash:hashes[item.id],language:payload.preferences.language,depth:payload.preferences.depth,model,prompt_version:promptVersion,title:item.title,summary:item.summary})),{onConflict:"article_id,content_hash,language,depth,model,prompt_version"});if(cacheError)throw cacheError;
      await db.from("usage_ledger_dayfold").insert({user_id:payload.user_id,task:"edition",model:result.model,tokens:result.tokens});
    }
    if(summaries.size!==items.length || items.some(a=>!summaries.has(a.id)))throw new Error("Incomplete briefs");
    items=items.map(a=>({...a,title:summaries.get(a.id)!.title,summary:summaries.get(a.id)!.summary,translated:payload.preferences.language==="ur"}));
  } catch {
    // Never label English excerpts as an Urdu edition or invent translated content.
    if(payload.preferences.language==="ur") throw new Error("Urdu brief generation unavailable");
    items=items.map(a=>({...a,summary:a.excerpt,reason:`${a.reason} · publisher excerpt; AI brief unavailable`}));
  }
  const safe=fitReadingBudget(items,payload.preferences.minutes,payload.preferences.language).map(a=>editionItemSnapshot({...a,evidence_hash:createHash("sha256").update(`${articles.find(v=>v.id===a.id)?.title}\n${a.body}`).digest("hex")}));
  const {error}=await db.from("editions_dayfold").update({items:safe,status:"published",published_at:new Date().toISOString(),error_code:null}).eq("id",payload.edition_id).eq("user_id",payload.user_id).neq("status","published");
  if(error) throw error;
  await db.from("events_dayfold").insert({user_id:payload.user_id,name:"edition_published",properties:{language:payload.preferences.language,story_count:safe.length,ranking_version:RANKING_VERSION,candidate_count:ranked.candidateCount,exclusions:ranked.exclusions,semantic_available:retrieval.semanticAvailable,...readingInfo({items:safe,minutes:payload.preferences.minutes,language:payload.preferences.language})}});
}

async function extractMemory(payload:{message_id:string;user_id:string;profile_version:number}) {
  const db=adminDb();
  const {data:profile}=await db.from("profiles_dayfold").select("preferences,version").eq("id",payload.user_id).single();
  if(!profile?.preferences.memory_enabled || profile.version!==payload.profile_version) return;
  const {data:message}=await db.from("messages_dayfold").select("content").eq("id",payload.message_id).eq("user_id",payload.user_id).eq("role","user").single();
  if(!message) return;
  const result=await generateJson("extraction",'Extract only explicit ongoing news preferences expressed by THIS user. Ignore questions, temporary research, negations, quotations and third-party facts. Do not infer sensitive beliefs/identity/health. Return {"candidates":[{"operation":"upsert|remove","kind":"topic|entity|region","value":"short value","scope":"ongoing|temporary","explicit":true,"sensitive":false,"evidence_quote":"exact user text"}]}. Empty candidates is valid. Deletion requests must be proposed for user review, never executed automatically.',{message:message.content},memorySchema);
  const {data:current}=await db.from("profiles_dayfold").select("preferences,version").eq("id",payload.user_id).single();
  if(!current?.preferences.memory_enabled || current.version!==payload.profile_version) return;
  for(const candidate of result.value.candidates) {
    if(!validateMemory(candidate,message.content) || candidate.operation==="remove") continue;
    // Propose all new memories initially; explicit user confirmation is safer than trusting a model's sensitivity flag.
    const {error}=await db.rpc("propose_memory_dayfold",{p_user_id:payload.user_id,p_profile_version:payload.profile_version,p_message_id:payload.message_id,p_kind:candidate.kind,p_value:candidate.value.toLowerCase().trim(),p_quote:candidate.evidence_quote});
    if(error) throw error;
  }
  await db.from("usage_ledger_dayfold").insert({user_id:payload.user_id,task:"memory",model:result.model,tokens:result.tokens});
}

export async function runJob(id?:string) {
  const db=adminDb(); const {data,error}=await db.rpc("claim_job_dayfold",{p_id:id||null});
  if(error) throw error; const job=data?.[0]; if(!job) return false;
  try {
    // Recheck account existence before any processing; deletion cascades remove outstanding jobs.
    const {data:profile}=await db.from("profiles_dayfold").select("id").eq("id",job.user_id).single();
    if(!profile) return false;
    if(job.type==="edition") await buildEdition({...job.payload,user_id:job.user_id});
    else if(job.type==="memory") await extractMemory({...job.payload,user_id:job.user_id});
    else if(job.type==="pdf") { const {makePdf}=await import("./pdf"); await makePdf(job.payload.edition_id,job.user_id); }
    else if(job.type==="index") {const {data:articles,error}=await db.from("articles_dayfold").select(ARTICLE_COLUMNS).eq("approved",true).in("id",job.payload.article_ids);if(error)throw error;if(articles?.length)await indexArticles(articles);}
    await db.from("jobs_dayfold").update({status:"succeeded",locked_until:null,error_code:null}).eq("id",job.id);
    return true;
  } catch(error) {
    const terminal=job.attempts>=3;
    const errorCode=job.type==="pdf"?(await import("./pdf")).pdfFailureCode(error):"PROCESSING_UNAVAILABLE";
    await db.from("jobs_dayfold").update({status:terminal?"failed":"queued",locked_until:null,error_code:errorCode,available_at:new Date(Date.now()+job.attempts*30_000).toISOString()}).eq("id",job.id);
    if(job.type==="edition") await db.from("editions_dayfold").update({status:terminal?"unavailable":"pending",error_code:"PROCESSING_UNAVAILABLE"}).eq("id",job.payload.edition_id).neq("status","published");
    return false;
  }
}

export async function queueEdition(userId:string,date:string,preferences:Preferences,version:number) {
  const db=adminDb();
  const {data,error}=await db.rpc("request_edition_dayfold",{p_user_id:userId,p_date:date,p_preferences:{...defaultPreferences,...preferences},p_version:version});
  if(error || !data?.[0])throw error||new Error("Edition request unavailable");
  return data[0];
}

export async function runEditionJob(editionId:string,userId:string) {
  const {data,error}=await adminDb().from("jobs_dayfold").select("id").eq("key",`edition:${editionId}`).eq("user_id",userId).maybeSingle();
  if(error)throw error;
  if(data)await runJob(data.id);
}
