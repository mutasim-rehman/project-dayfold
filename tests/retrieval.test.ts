import {beforeEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),embed:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../src/lib/supabase",()=>({adminDb:()=>({from:mocks.from,rpc:mocks.rpc})}));
vi.mock("../src/lib/llm",()=>({embedTexts:mocks.embed}));
import {retrieveEditionCandidates,ARTICLE_COLUMNS} from "../src/lib/retrieval";
import {defaultPreferences,type Article} from "../src/lib/domain";

const article=(id:string,title="AI technology research"):Article=>({id,title,excerpt:"New research explained",body:"Source reporting",source:"Approved",author:"Reporter",url:`https://example.com/${id}`,license_url:"https://example.com/license",published_at:new Date().toISOString(),topics:["technology"],regions:["Europe"],entities:[],cluster_id:id,language:"en"});
let feeds:Record<string,Article[]>;
let failed:string|undefined;
let enabled:boolean;
let selectedColumns:string[];
beforeEach(()=>{
  vi.clearAllMocks();failed=undefined;enabled=true;selectedColumns=[];
  feeds={recent:[article("recent")],topics:[article("older-interest")],regions:[article("regional")]};
  mocks.embed.mockResolvedValue([[1,0]]);mocks.rpc.mockResolvedValue({data:[{...article("semantic"),similarity:.9}],error:null});
  mocks.from.mockImplementation((table:string)=>{
    if(table==="sources_dayfold")return {select:()=>({eq:async()=>({data:[{name:"Approved",capabilities:{summarize:enabled,translate:enabled,pdf:enabled}}],error:null})})};
    let field="recent";
    const chain={select:(value:string)=>{selectedColumns.push(value);return chain;},eq:()=>chain,in:()=>chain,gte:()=>chain,order:()=>chain,limit:()=>chain,overlaps:(value:string)=>{field=value;return chain;},then:(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown)=>Promise.resolve({data:feeds[field],error:failed===field?new Error("Query failed"):null}).then(resolve,reject)};
    return chain;
  });
});
describe("hybrid candidate retrieval boundaries",()=>{
  it("unions topic, region, recent and semantic candidates rather than ranking only the latest page",async()=>{
    const result=await retrieveEditionCandidates(defaultPreferences);
    expect(result.articles.map(a=>a.id).sort()).toEqual(["older-interest","recent","regional","semantic"]);
    expect(result.similarities.semantic).toBe(.9);expect(result.semanticAvailable).toBe(true);
    expect(selectedColumns.every(value=>value===ARTICLE_COLUMNS&&!value.includes("embedding"))).toBe(true);
  });
  it("continues with explicit retrieval when the embedding service is unavailable",async()=>{
    mocks.embed.mockRejectedValue(new Error("Provider unavailable"));
    const result=await retrieveEditionCandidates(defaultPreferences);
    expect(result.semanticAvailable).toBe(false);expect(result.similarities).toEqual({});expect(result.articles.length).toBeGreaterThan(0);
  });
  it("does not misrepresent database retrieval failures as an empty relevant corpus",async()=>{
    failed="topics";await expect(retrieveEditionCandidates(defaultPreferences)).rejects.toThrow("Query failed");
  });
  it("enforces source permissions for semantic matches and cached articles too",async()=>{
    mocks.rpc.mockResolvedValue({data:[{...article("restricted"),source:"Disabled",similarity:1}],error:null});
    const result=await retrieveEditionCandidates(defaultPreferences,[{...article("cached"),source:"Disabled"}]);
    expect(result.articles.some(a=>a.source==="Disabled")).toBe(false);
    enabled=false;await expect(retrieveEditionCandidates(defaultPreferences)).rejects.toThrow("Source permissions unavailable");
  });
  it("reclassifies legacy metadata instead of keeping previous incorrect tags",async()=>{
    feeds.recent=[{...article("legacy","Poetry anthology in Spain"),excerpt:"Literature and language",topics:["technology"],regions:["Pakistan"]}];
    const result=await retrieveEditionCandidates(defaultPreferences);const legacy=result.articles.find(a=>a.id==="legacy")!;
    expect(legacy.topics).toContain("culture");expect(legacy.topics).not.toContain("technology");expect(legacy.regions).toContain("Europe");expect(legacy.regions).not.toContain("Pakistan");
  });
});
