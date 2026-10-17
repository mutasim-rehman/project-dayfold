import {beforeEach,describe,it,expect,vi} from "vitest";
import {readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";
const mocks=vi.hoisted(()=>({requireUser:vi.fn(),adminDb:vi.fn(),signOut:vi.fn(),rpc:vi.fn(),from:vi.fn(),storage:vi.fn(),profileSelect:vi.fn()}));
vi.mock("@/lib/supabase",()=>({requireUser:mocks.requireUser,adminDb:mocks.adminDb,checkOrigin:vi.fn(),limitedJson:async()=>({confirmation:"DELETE"}),apiError:()=>Response.json({error:"Failed"},{status:503}),ApiError:class extends Error{}}));
import {POST} from "../src/app/api/account/delete/route";
import {GET} from "../src/app/api/account/export/route";
describe("shared Supabase project boundaries",()=>{
  it("keeps runtime table/RPC references consistent with the isolated SQL contract",()=>{
    const sql=readFileSync(new URL("../supabase/migrations/202610170001_initial.sql",import.meta.url),"utf8");
    const tables=[...sql.matchAll(/create table public\.(\w+)/g)].map(m=>m[1]);
    const functions=[...sql.matchAll(/create function public\.(\w+)/g)].map(m=>m[1]);
    expect(tables).toHaveLength(14);expect(tables.every(t=>t.endsWith("_dayfold"))).toBe(true);
    expect(functions.every(f=>f.endsWith("_dayfold"))).toBe(true);
    const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
    for(const file of walk("src").filter(p=>/\.tsx?$/.test(p))){
      const source=readFileSync(file,"utf8");
      for(const m of source.matchAll(/\.from\("([\w-]+)"\)/g))expect([...tables,"edition-pdfs-dayfold"]).toContain(m[1]);
      for(const m of source.matchAll(/\.rpc\("(\w+)"/g))expect(functions).toContain(m[1]);
    }
    // Domain values and API response keys stay stable when database objects are namespaced.
    expect(sql).toContain("'feedback','pdf','preferences'");expect(sql).toContain("'events',coalesce");
    expect(sql).not.toMatch(/delete\s+from\s+auth\.users/i);
    expect(sql).not.toContain("extensions.vector");
    expect(sql).not.toMatch(/alter\s+extension\s+vector\s+set\s+schema/i);
    expect(sql).toMatch(/\bsource_refs jsonb not null/);
  });
  beforeEach(()=>{
    vi.clearAllMocks();mocks.rpc.mockResolvedValue({error:null});mocks.signOut.mockResolvedValue({error:null});
    mocks.profileSelect.mockReturnValue({eq:()=>({limit:async()=>({data:[],error:null})})});
    mocks.from.mockReturnValue({update:()=>({eq:async()=>({error:null})}),delete:()=>({eq:async()=>({error:null})}),select:mocks.profileSelect});
    mocks.storage.mockReturnValue({list:async()=>({data:[],error:null})});
    mocks.requireUser.mockResolvedValue({user:{id:"reader-id",email:"reader@example.invalid"},db:{from:mocks.from,auth:{signOut:mocks.signOut}}});
    mocks.adminDb.mockReturnValue({from:mocks.from,rpc:mocks.rpc,storage:{from:mocks.storage}});
  });
  it("removes only Dayfold records, preserving the shared Auth identity",async()=>{
    const response=await POST(new Request("http://localhost/api/account/delete",{method:"POST"}));
    expect(response.status).toBe(200);expect(mocks.from.mock.calls.map(c=>c[0])).toEqual(["profiles_dayfold","jobs_dayfold"]);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_account_dayfold",{p_user_id:"reader-id"});
    expect(mocks.storage).toHaveBeenCalledWith("edition-pdfs-dayfold");
    expect(mocks.signOut).toHaveBeenCalledWith({scope:"local"});
  });
  it("exports only Dayfold tables with stable user-facing section names",async()=>{
    const response=await GET();expect(response.status).toBe(200);const data=await response.json();
    expect(data).toHaveProperty("profiles");expect(data).toHaveProperty("memories");
    expect(mocks.from.mock.calls.map(c=>c[0])).toEqual(["profiles_dayfold","editions_dayfold","feedback_dayfold","conversations_dayfold","messages_dayfold","memories_dayfold"]);
  });
});
