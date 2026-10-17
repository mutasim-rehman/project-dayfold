// Applies only this project's new schema. Refuses an existing conflicting deployment.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
const require=createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());
const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:true}});
try {
  await client.connect();
  const result=await client.query("select tablename from pg_tables where schemaname='public' and tablename=any($1)",[['sources','article_versions','article_briefs','profiles','articles','editions','feedback','conversations','messages','memories','jobs','events','usage_ledger','rate_limits'].map(name=>`${name}_dayfold`)]);
  if(result.rows.length){console.log('Migration not applied: existing project tables need explicit review.');process.exitCode=1;}
  else {await client.query(await readFile(new URL('../supabase/migrations/202610170001_initial.sql',import.meta.url),'utf8'));console.log('Initial migration applied successfully.');}
}catch{console.log('Migration unavailable. Review connection/SSL settings; no credentials or raw errors were printed.');process.exitCode=1;}
finally{await client.end().catch(()=>{});}
