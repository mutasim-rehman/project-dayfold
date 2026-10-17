// Read-only evaluation against an account's real corpus. Secrets and message
// content are never logged. --semantic makes one configured embedding request.
import {createRequire,stripTypeScriptTypes} from "node:module";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {createClient} from "@supabase/supabase-js";

const args=process.argv.slice(2);
const userId=args[args.indexOf("--user-id")+1];
if(!args.includes("--live")||!args.includes("--user-id")||!/^[-a-f0-9]{36}$/i.test(userId||"")) {
  console.log("Usage: npm run evaluate:recommendations -- --live --user-id <account UUID> [--semantic] [--fresh]");
  process.exit(1);
}
let stage="configuration";
try {
  const require=createRequire(import.meta.url);
  const nextRequire=createRequire(require.resolve("next/package.json"));
  stage="load_environment";
  nextRequire("@next/env").loadEnvConfig(process.cwd());
  stage="compile_pure_modules";
  const output=resolve("tmp/recommendation-evaluation");await mkdir(output,{recursive:true});
  // Compile the exact production pure functions, rather than a second scoring implementation.
  for(const name of ["domain","article-signals","recommendations","llm","source-policy","content"]) {
    const source=await readFile(resolve(`src/lib/${name}.ts`),"utf8");
    const compiled=stripTypeScriptTypes(source.replace(/import "server-only";\s*/,""))
      .replace(/(from\s+["']\.\/)([^"']+)(["'])/g,"$1$2.mjs$3").replace('from "next/cache"','from "next/cache.js"');
    await writeFile(resolve(output,`${name}.mjs`),compiled);
  }
  const {recommendArticles,RANKING_VERSION}=await import(pathToFileURL(resolve(output,"recommendations.mjs")).href);
  const {enrichArticle,canonicalRegion}=await import(pathToFileURL(resolve(output,"article-signals.mjs")).href);
  const db=createClient(process.env.SUPABASE_URL||process.env.SUPABASE_PROJECT_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  stage="read_profile";
  const {data:profile,error:profileError}=await db.from("profiles_dayfold").select("preferences").eq("id",userId).single();
  if(profileError)throw new Error("Profile unavailable");
  stage="read_corpus";
  const {data:corpus,error:corpusError}=await db.from("articles_dayfold").select("id,title,url,source,author,published_at,excerpt,body,topics,regions,entities,cluster_id,license_url,language").eq("approved",true).gte("published_at",new Date(Date.now()-14*86400_000).toISOString()).limit(400);
  if(corpusError)throw new Error("Corpus unavailable");
  const {data:feedback,error:feedbackError}=await db.from("feedback_dayfold").select("article_id,action,created_at").eq("user_id",userId).limit(200);
  if(feedbackError)throw new Error("Feedback unavailable");
  let semantic={};
  if(args.includes("--semantic")) {
    stage="semantic_search";
    const {embedTexts}=await import(pathToFileURL(resolve(output,"llm.mjs")).href);
    const p=profile.preferences;
    const [embedding]=await embedTexts([`News topics: ${p.topics.join(", ")}; followed interests: ${p.entities.join(", ")}; geographic focus: ${p.regions.map(canonicalRegion).join(", ")}`],"RETRIEVAL_QUERY");
    const {data,error}=await db.rpc("search_articles_dayfold",{query_embedding:embedding,match_count:100});
    if(error)throw new Error("Semantic search unavailable");
    semantic=Object.fromEntries(data.map(a=>[a.id,a.similarity]));
  }
  stage="rank";
  let candidates=corpus;
  if(args.includes("--fresh")) {
    stage="fetch_licensed_feeds";
    const {fetchFreshContent}=await import(pathToFileURL(resolve(output,"content.mjs")).href);
    const fresh=await fetchFreshContent();
    candidates=[...new Map([...corpus,...fresh].map(a=>[a.id,a])).values()];
  }
  const result=recommendArticles(candidates.map(enrichArticle),profile.preferences,feedback,Date.now(),semantic);
  console.log(JSON.stringify({ranking_version:RANKING_VERSION,mode:args.includes("--semantic")?"hybrid":"explicit_fallback",candidate_count:result.candidateCount,selected_count:result.items.length,discovery_count:result.items.filter(a=>a.recommendation.kind==="discovery").length,exclusions:result.exclusions,selected:result.items.map(a=>({title:a.title,reason:a.reason,score:a.score,matches:a.recommendation.matches,contributions:a.recommendation.contributions}))},null,2));
} catch(error) {
  const code=typeof error?.code==="string"&&/^[A-Z0-9_]{1,40}$/.test(error.code)?error.code:undefined;
  console.error(JSON.stringify({error:"EVALUATION_FAILED",stage,type:error?.name,code}));process.exitCode=1;
}
