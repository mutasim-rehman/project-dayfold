// Prints capability booleans only. Never print credentials or raw upstream errors.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const nextRequire=createRequire(require.resolve('next/package.json'));
nextRequire('@next/env').loadEnvConfig(process.cwd());
const result={database:false,schemaReady:false,googleOAuth:false,agentPlatform:false,embedding:false};
try {
  const {Client}=await import('pg');
  const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:true}});
  await client.connect();result.database=true;
  const r=await client.query("select to_regclass('public.profiles_dayfold') is not null and to_regprocedure('public.consume_rate_limit_dayfold(text,integer,integer)') is not null as ready");result.schemaReady=r.rows[0].ready;
  await client.end();
} catch(e) { result.databaseErrorCode=typeof e.code==='string'&&/^[A-Z0-9_]+$/.test(e.code)?e.code:'CONNECTION_FAILED'; }
try {
  const response=await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:process.env.SUPABASE_ANON_KEY},signal:AbortSignal.timeout(10000)});
  const settings=await response.json();result.googleOAuth=!!settings.external?.google;
}catch{}
try {
  const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles_dayfold?select=id,preferences,onboarding_complete&limit=0`,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(10000)});
  result.schemaViaRest=response.ok;
}catch{}
if(process.argv.includes('--model')) {
  try {
    const {GoogleGenAI}=await import('@google/genai');
    const credentials=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||process.env.Google_Service_Account_JSON||'{}');
    const platformKey=process.env.GOOGLE_CLOUD_API_KEY||process.env.Google_Agent_Platform_Key;
    const ai=platformKey?new GoogleGenAI({vertexai:true,apiKey:platformKey}):new GoogleGenAI({vertexai:true,project:process.env.GOOGLE_CLOUD_PROJECT||credentials.project_id,location:process.env.GOOGLE_CLOUD_LOCATION||'global',googleAuthOptions:{credentials}});
    const r=await ai.models.generateContent({model:process.env.LLM_SYNTHESIS_MODEL||'gemini-3.8-flash',contents:'Return only the JSON object {"ok":true}.',config:{responseMimeType:'application/json',maxOutputTokens:256,httpOptions:{timeout:20000}}});
    result.agentPlatform=!!r.text;result.modelRequestSucceeded=true;result.modelFinishReason=r.candidates?.[0]?.finishReason||null;result.effectiveSynthesisModel=r.modelVersion||null;
    if(process.argv.includes('--embedding')){try{const e=await ai.models.embedContent({model:process.env.GOOGLE_EMBEDDING_MODEL||'gemini-embedding-001',contents:'News about science in South Asia',config:{outputDimensionality:768,taskType:'RETRIEVAL_QUERY',httpOptions:{timeout:20000}}});result.embedding=e.embeddings?.[0]?.values?.length===768;}catch(err){result.embeddingStatus=typeof err.status==='number'?err.status:null;}}
    if(process.argv.includes('--extraction')){try{const e=await ai.models.generateContent({model:process.env.LLM_EXTRACTION_MODEL||'gemini-3.7-flash',contents:'Return only {"candidates":[]}.',config:{responseMimeType:'application/json',maxOutputTokens:256,httpOptions:{timeout:20000}}});result.extraction=!!e.text;result.effectiveExtractionModel=e.modelVersion||null;}catch(err){result.extractionStatus=typeof err.status==='number'?err.status:null;}}
  }catch(e){result.modelStatus=typeof e.status==='number'?e.status:null;result.modelErrorCode=typeof e.code==='string'&&/^[A-Z0-9_]+$/.test(e.code)?e.code:'REQUEST_FAILED';const m=String(e.message||'');result.modelCategory=['invalid_grant','invalid_scope','API_KEY_INVALID','SERVICE_DISABLED','BILLING_DISABLED','NOT_FOUND','PERMISSION_DENIED','INVALID_ARGUMENT','invalid JWT','Invalid JWT','invalid signature'].find(k=>m.includes(k))||'UNCLASSIFIED';}
}
console.log(JSON.stringify(result));
