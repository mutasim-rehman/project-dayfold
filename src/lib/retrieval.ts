import "server-only";
import {embedTexts} from "./llm";
import {adminDb} from "./supabase";
import type {Article} from "./domain";

export async function indexArticles(articles:Article[]) {
  const db=adminDb();
  for(let i=0;i<articles.length;i+=8){
    const batch=articles.slice(i,i+8);
    const vectors=await embedTexts(batch.map(a=>`${a.title}\n${a.body?.slice(0,5000)||a.excerpt}`),"RETRIEVAL_DOCUMENT");
    for(let j=0;j<batch.length;j++){
      const {error}=await db.from("articles").update({embedding:vectors[j]}).eq("id",batch[j].id);if(error)throw error;
    }
  }
}
export async function semanticSearch(query:string,limit=30) {
  const [vector]=await embedTexts([query],"RETRIEVAL_QUERY");
  const {data,error}=await adminDb().rpc("search_articles",{query_embedding:vector,match_count:limit});
  if(error)throw error;
  return data as (Article&{similarity:number})[];
}
