import {describe,it,expect} from "vitest";
import {defaultPreferences,localDate,rankArticles,validateMemory,escapeHtml,groupStories,type Article} from "../src/lib/domain";
const now=Date.parse("2026-10-17T09:00:00Z");
function article(id:string,topic:string,cluster=id):Article{return {id,title:`A ${topic} story`,url:`https://example.com/${id}`,source:"Test",author:"Author",published_at:"2026-10-17T08:00:00Z",excerpt:"A sourced description",topics:[topic],regions:[],entities:[],cluster_id:cluster,license_url:"https://creativecommons.org/licenses/by/3.0/",language:"en"};}
describe("edition selection",()=>{
  it("prioritizes explicit interests over fresh unrelated articles",()=>{const data=[article("a","culture"),article("b","technology")];expect(rankArticles(data,{...defaultPreferences,topics:["technology"]},[],now)[0].id).toBe("b");});
  it("does not repeat a cluster or show explicitly suppressed/future articles",()=>{const future={...article("f","technology"),published_at:"2026-10-18T08:00:00Z"};const data=[article("a","technology","event"),article("b","technology","event"),article("c","world"),future];const ranked=rankArticles(data,defaultPreferences,[{article_id:"c",action:"read"}],now);expect(ranked).toHaveLength(1);expect(ranked[0].cluster_id).toBe("event");});
  it("uses the reader's local date across UTC boundaries",()=>{expect(localDate("Asia/Karachi",new Date("2026-10-16T23:30:00Z"))).toBe("2026-10-17");expect(localDate("America/New_York",new Date("2026-10-17T01:00:00Z"))).toBe("2026-10-16");});
  it("uses semantic scores without ignoring explicit interests",()=>{const data=[article("a","world"),article("b","world")];expect(rankArticles(data,{...defaultPreferences,topics:[]},[],now,{b:.9,a:.1})[0].id).toBe("b");});
  it("matches followed entities against actual story text",()=>{const data=[article("a","technology"),{...article("b","technology"),title:"NASA releases new research"}];expect(rankArticles(data,{...defaultPreferences,entities:["NASA"]},[],now)[0].id).toBe("b");});
  it("respects regional relevance independently of language",()=>{const data=[article("a","world"),{...article("b","world"),regions:["Pakistan","South Asia"]}];expect(rankArticles(data,{...defaultPreferences,language:"ur"},[],now)[0].id).toBe("b");});
  it("does not confuse opening a story with suppressing it",()=>{expect(rankArticles([article("a","world")],defaultPreferences,[{article_id:"a",action:"open"}],now)).toHaveLength(1);});
});
describe("conservative story grouping",()=>{
  it("keeps event identity across a close headline update",()=>{const a={...article("a","world"),title:"Nepal flood reconstruction funds face transparency questions"};const b={...article("b","world"),title:"Nepal flood reconstruction funds face new transparency questions"};expect(groupStories([b],[a])[0].cluster_id).toBe("a");});
  it("does not merge unrelated stories sharing only broad topic words",()=>{const a={...article("a","world"),title:"Nepal announces new research grant"};const b={...article("b","world"),title:"India announces new healthcare scheme"};expect(groupStories([b],[a])[0].cluster_id).toBe("b");});
});
describe("memory boundary",()=>{
  const candidate={operation:"upsert" as const,kind:"topic" as const,value:"batteries",scope:"ongoing" as const,explicit:true,sensitive:false,evidence_quote:"Include batteries in my paper"};
  it("requires exact user evidence",()=>{expect(validateMemory(candidate,"Include batteries in my paper")).toBe(true);expect(validateMemory(candidate,"What are batteries?")).toBe(false);});
  it("rejects temporary, implicit, and flagged sensitive memories",()=>{expect(validateMemory({...candidate,scope:"temporary"},candidate.evidence_quote)).toBe(false);expect(validateMemory({...candidate,explicit:false},candidate.evidence_quote)).toBe(false);expect(validateMemory({...candidate,sensitive:true},candidate.evidence_quote)).toBe(false);});
  it("escapes hostile text before PDF rendering",()=>{expect(escapeHtml('<script x="y">&')).toBe('&lt;script x=&quot;y&quot;&gt;&amp;');});
});
