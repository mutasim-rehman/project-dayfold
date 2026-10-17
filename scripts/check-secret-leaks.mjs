import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd());
const secrets=Object.entries(process.env).filter(([name,value])=>/KEY|TOKEN|SECRET|PASS|DATABASE_URL/i.test(name)&&value&&value.length>=16).map(([,value])=>value);
let files=0;const leaks=[];
async function scan(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);
  if(entry.isDirectory()){if(['node_modules','.git','.pnpm-store','tmp','.next-build'].includes(entry.name))continue;await scan(file);}
  else if(!entry.name.startsWith('.env')&&/\.(?:ts|tsx|js|mjs|json|md|sql|css|html|yml|yaml)$/.test(entry.name)){
   const data=await readFile(file,'utf8');files++;if(secrets.some(secret=>data.includes(secret)))leaks.push(path.relative(process.cwd(),file));
  }
 }
}
for(const dir of ['src','scripts','docs','supabase','tests','.next/static'])try{await scan(dir);}catch{}
console.log(JSON.stringify({filesScanned:files,credentialLeakCount:leaks.length,affectedFiles:leaks}));
if(leaks.length)process.exitCode=1;
