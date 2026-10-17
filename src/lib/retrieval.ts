import "server-only";
import {embedTexts} from "./llm";
import {adminDb} from "./supabase";
import type {Article,Preferences} from "./domain";
import {canonicalRegion,enrichArticle} from "./article-signals";

// Never select vectors into editions, model prompts, or browser responses.
export const ARTICLE_COLUMNS="id,title,url,source,author,published_at,excerpt,body,topics,regions,entities,cluster_id,license_url,language";

export async function retrieveEditionCandidates(profile:Preferences, cached:Article[] = []) {
  const db=adminDb();
  const {data:sources,error:sourceError}=await db.from("sources_dayfold").select("name,capabilities").eq("enabled",true);
  if(sourceError)throw sourceError;
  const allowed=(sources||[]).filter(s=>s.capabilities?.summarize&&s.capabilities?.translate&&s.capabilities?.pdf).map(s=>s.name);
  if(!allowed.length)throw new Error("Source permissions unavailable");
  const cutoff=new Date(Date.now()-14*86400_000).toISOString();
  const query=()=>db.from("articles_dayfold").select(ARTICLE_COLUMNS).eq("approved",true).in("source",allowed).gte("published_at",cutoff).order("published_at",{ascending:false}).limit(100);
  const semantic=semanticSearch(`News topics: ${profile.topics.join(", ")}; followed interests: ${profile.entities.join(", ")}; geographic focus: ${profile.regions.map(canonicalRegion).join(", ")}`,100);
  const [recent,topic,region,meaning]=await Promise.all([
    query(),query().overlaps("topics",profile.topics),
    profile.regions.length?query().overlaps("regions",profile.regions.map(canonicalRegion)):Promise.resolve({data:[],error:null}),
    semantic.then(data=>({data,available:true})).catch(()=>({data:[],available:false}))
  ]);
  // A failed explicit query is not an empty interest or a silent fallback.
  for(const result of [recent,topic,region])if(result.error)throw result.error;
  const union=new Map<string,Article>();
  for(const a of [...cached,...recent.data||[],...topic.data||[],...region.data||[],...meaning.data]) {
    if(allowed.includes(a.source))union.set(a.id,enrichArticle(a));
  }
  return {articles:[...union.values()],semanticAvailable:meaning.available,similarities:Object.fromEntries(meaning.data.map(a=>[a.id,a.similarity]))};
}

export async function indexArticles(articles:Article[]) {
  const db=adminDb();
  for(let i=0;i<articles.length;i+=8){
    const batch=articles.slice(i,i+8);
    const vectors=await embedTexts(batch.map(a=>`${a.title}\n${a.body?.slice(0,5000)||a.excerpt}`),"RETRIEVAL_DOCUMENT");
    for(let j=0;j<batch.length;j++){
      const {error}=await db.from("articles_dayfold").update({embedding:vectors[j]}).eq("id",batch[j].id);if(error)throw error;
    }
  }
}
export async function semanticSearch(query:string,limit=30) {
  const [vector]=await embedTexts([query],"RETRIEVAL_QUERY");
  const {data,error}=await adminDb().rpc("search_articles_dayfold",{query_embedding:vector,match_count:limit});
  if(error)throw error;
  return data as (Article&{similarity:number})[];
}
