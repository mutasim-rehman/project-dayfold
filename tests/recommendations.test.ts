import {describe,it,expect} from "vitest";
import {defaultPreferences,editionItemSnapshot,type Article,type EditionItem,type Preferences} from "../src/lib/domain";
import {classifyArticle,containsTerm,termMatches,inferRegions,regionMatches,enrichArticle} from "../src/lib/article-signals";
import {recommendArticles,rankArticles,readingMinutes,readingInfo,fitReadingBudget} from "../src/lib/recommendations";

const now=Date.parse("2026-10-17T09:00:00Z");
function article(id:string,title:string,topics=["world"]):Article {
  return {id,title,topics,excerpt:"Reporting on the development and its context.",body:"An attributed source body.",source:"Publisher A",author:"Reporter",url:`https://example.com/${id}`,license_url:"https://creativecommons.org/licenses/by/3.0/",published_at:"2026-10-17T08:00:00Z",regions:[],entities:[],language:"en",cluster_id:id};
}
const technology:Preferences={...defaultPreferences,topics:["technology"],entities:["AI","TECH"],regions:["USA","Europe"],minutes:15,discovery:"high",purpose:"learn"};

describe("entity and geography regressions",()=>{
  it("does not mistake AI letters in Spain, daily, or against for a followed interest",()=>{
    for(const text of ["Spain celebrates poetry","Daily life after floods","A complaint against officials"])expect(termMatches(text,"AI")).toBe(false);
    const pool=[enrichArticle(article("poetry","Spain celebrates poetry")),enrichArticle(article("flood","Daily life after Nepal floods")),enrichArticle(article("ai","Artificial intelligence research in Europe"))];
    const result=recommendArticles(pool,technology,[],now);
    expect(result.items.map(a=>a.id)).toEqual(["ai"]);
    expect(result.exclusions.relevance).toBe(2);
    expect(result.items[0].recommendation?.matches.entities).toContain("AI");
  });
  it("handles aliases, possessives, hyphens, and Urdu without substring matches",()=>{
    expect(termMatches("Artificial intelligence changes computing","AI")).toBe(true);
    expect(termMatches("AI-powered robots","artificial intelligence")).toBe(true);
    expect(termMatches("NASA’s research","NASA")).toBe(true);
    expect(termMatches("مصنوعی ذہانت کی تحقیق","AI")).toBe(true);
    expect(containsTerm("India","Ind")).toBe(false);
  });
  it("normalizes country aliases and supports country-to-continent matching",()=>{
    expect(regionMatches(["United States"],"USA")).toBe(true);
    expect(regionMatches(["Norway"],"Europe")).toBe(true);
    expect(regionMatches(["Pakistan"],"South Asia")).toBe(true);
    expect(regionMatches(["India"],"Indiana")).toBe(false);
    expect(inferRegions("US and European technology policy")).toEqual(expect.arrayContaining(["United States","Europe"]));
    expect(inferRegions("Help us understand daily life")).not.toContain("United States");
  });
  it("does not turn passing body mentions into the article's focus",()=>{
    const a=article("poetry","Philippines poetry anthology");a.body="Some readers also discuss artificial intelligence in the United States.";
    const classified=classifyArticle(a);
    expect(classified.topics).not.toContain("technology");expect(classified.regions).not.toContain("United States");
    expect(rankArticles([enrichArticle(a)],technology,[],now)).toHaveLength(0);
  });
  it("classifies telecom, AI infrastructure, global health and cricket in their main topics",()=>{
    for(const [title,topic] of [["Telenor telecom faces data lawsuit","technology"],["Undersea cables connect AI data centers","technology"],["Bangladesh vaccination health study","health"],["Pakistan cricket team wins tournament","sports"]])expect(classifyArticle(article("a",title)).topics).toContain(topic);
  });
});

describe("relevance and constrained composition",()=>{
  it("returns a short edition instead of filling with the entire available corpus",()=>{
    const pool=[article("a","AI policy",["technology"]),...Array.from({length:8},(_,i)=>article(`c${i}`,"Poetry anthology",["culture"]))];
    expect(rankArticles(pool,technology,[],now).map(a=>a.id)).toEqual(["a"]);
  });
  it("returns an honest empty edition when coverage does not match",()=>{
    expect(rankArticles([article("a","Poetry anthology",["culture"])],technology,[],now)).toEqual([]);
  });
  it("keeps high discovery at or below twenty percent and requires related evidence",()=>{
    const core=Array.from({length:8},(_,i)=>article(`t${i}`,`Software technology ${i}`,["technology"]));
    const adjacent=Array.from({length:5},(_,i)=>article(`s${i}`,`Energy research ${i}`,["science"]));
    const scores=Object.fromEntries(adjacent.map(a=>[a.id,.67]));
    const result=rankArticles([...core,...adjacent],technology,[],now,scores);
    const discovery=result.filter(a=>a.recommendation?.kind==="discovery");
    expect(discovery).toHaveLength(2);expect(discovery.length/result.length).toBeLessThanOrEqual(.2);
    expect(rankArticles([...core,...adjacent],{...technology,discovery:"low"},[],now,scores).every(a=>a.recommendation?.kind==="interest")).toBe(true);
    expect(rankArticles([...core.slice(0,2),...adjacent],technology,[],now,scores)).toHaveLength(2);
  });
  it("uses strong semantic matches while excluding weak unrelated matches",()=>{
    const result=rankArticles([article("relevant","Chip designs",["world"]),article("unrelated","Poetry",["culture"])],technology,[],now,{relevant:.9,unrelated:.3});
    expect(result.map(a=>a.id)).toEqual(["relevant"]);
    expect(result[0].reason).toContain("semantic similarity");expect(result[0].recommendation?.matches.entities).toEqual([]);
  });
  it("does not equate a geographic match with a specific topic match",()=>{
    const a={...article("a","European poetry",["culture"]),regions:["Europe"]};
    expect(rankArticles([a],technology,[],now)).toEqual([]);
    expect(rankArticles([a],{...technology,topics:["regional"],entities:[]},[],now)).toHaveLength(1);
  });
  it("deduplicates story clusters and invalid, future, and expired publication dates",()=>{
    const a=article("a","AI research",["technology"]);
    const pool=[a,{...a,id:"b"}, {...a,id:"future",cluster_id:"future",published_at:"2026-10-18T00:00:00Z"},{...a,id:"old",published_at:"2026-09-01T00:00:00Z"},{...a,id:"invalid",published_at:"invalid"}];
    expect(rankArticles(pool,technology,[],now)).toHaveLength(1);
  });
  it("diversifies publishers when equally relevant alternatives exist",()=>{
    const pool=Array.from({length:6},(_,i)=>({...article(`a${i}`,"Software technology",["technology"]),source:i===5?"Publisher B":"Publisher A"}));
    const result=rankArticles(pool,technology,[],now);
    expect(result.slice(0,2).map(a=>a.source)).toEqual(["Publisher A","Publisher B"]);
  });
  it("filters developing rumours for confirmed-only readers, preserving attributed court reporting",()=>{
    const pool=[article("rumor","Unconfirmed AI release rumor",["technology"]),article("court","Telecom faces alleged privacy violations in court",["technology"])];
    expect(rankArticles(pool,{...technology,uncertainty:"confirmed"},[],now).map(a=>a.id)).toEqual(["court"]);
    expect(rankArticles(pool,{...technology,uncertainty:"early"},[],now)).toHaveLength(2);
  });
  it("permits later cluster coverage for incremental updates but suppresses already read events for major-only",()=>{
    const next={...article("new","AI research update",["technology"]),cluster_id:"event"};
    const context={seenClusters:{event:"2026-10-17T07:00:00Z"}};
    expect(rankArticles([next],{...technology,updates:"major"},[],now,{},context)).toHaveLength(0);
    expect(rankArticles([next],{...technology,updates:"incremental"},[],now,{},context)).toHaveLength(1);
  });
});

describe("deliberate feedback, explanations, and multilingual reading",()=>{
  const pool=[article("a","Technology research",["technology"]),article("b","Technology research",["technology"])];
  it("does not treat clicks or impressions as deliberate preference changes",()=>{
    expect(rankArticles(pool,technology,[{article_id:"b",action:"open"},{article_id:"b",action:"impression"}],now)).toEqual(rankArticles(pool,technology,[],now));
  });
  it("lets a newer explicit More override Less and suppresses read articles",()=>{
    const feedback=[{article_id:"a",action:"less",created_at:"2026-10-16T01:00:00Z"},{article_id:"a",action:"more",created_at:"2026-10-17T01:00:00Z"}];
    expect(rankArticles(pool,technology,feedback,now)[0].id).toBe("a");
    expect(rankArticles(pool,technology,[{article_id:"a",action:"read"}],now).map(a=>a.id)).toEqual(["b"]);
  });
  it("decays topic feedback and caps repeated reactions",()=>{
    const recent=rankArticles(pool,technology,[{article_id:"a",action:"more",created_at:"2026-10-17T01:00:00Z"}],now).find(a=>a.id==="b")!;
    const old=rankArticles(pool,technology,[{article_id:"a",action:"more",created_at:"2026-07-01T01:00:00Z"}],now).find(a=>a.id==="b")!;
    expect(recent.recommendation!.contributions.feedback).toBeGreaterThan(old.recommendation!.contributions.feedback);
    const repeated=Array.from({length:50},()=>({article_id:"a",action:"more"}));
    expect(rankArticles(pool,technology,repeated,now)[0].recommendation!.contributions.feedback).toBeLessThanOrEqual(3);
  });
  it("records contributions that sum to the score and explains genuine region matches",()=>{
    const a={...pool[0],regions:["Norway","Europe"]};
    const item=rankArticles([a],{...technology,entities:[]},[],now)[0];
    expect(item.reason).toContain("Europe");expect(item.reason).not.toContain("which you follow");
    expect(item.score).toBeCloseTo(Object.values(item.recommendation!.contributions).reduce((a,b)=>a+b,0),2);
  });
  it("preserves story relevance across English and Urdu and localizes explanations",()=>{
    const en=rankArticles(pool,technology,[],now);const ur=rankArticles(pool,{...technology,language:"ur"},[],now);
    expect(ur.map(a=>a.id)).toEqual(en.map(a=>a.id));expect(ur[0].reason).toMatch(/[\u0600-\u06ff]/);
  });
  it("estimates actual text duration separately from the selected target",()=>{
    const item={...pool[0],summary:Array(150).fill("word").join(" "),reason:"Matched",score:1};
    expect(readingMinutes([item],"en")).toBe(1);expect(readingMinutes([item],"ur")).toBe(2);
    expect(readingInfo({items:[item],language:"en",minutes:15})).toEqual({estimated_minutes:1,short:true});
    expect(fitReadingBudget([item,{...item,id:"other"}],1,"en")).toHaveLength(1);
  });
  it("excludes source bodies, vectors, and arbitrary database fields from snapshots",()=>{
    const item={...pool[0],summary:"Brief",reason:"Matched",score:1,embedding:[1,2],approved:true} as EditionItem;
    const frozen=editionItemSnapshot(item);
    expect(frozen).not.toHaveProperty("embedding");expect(frozen).not.toHaveProperty("body");expect(frozen).not.toHaveProperty("approved");
  });
});

describe("contrasting reader evaluation",()=>{
  const corpus=[
    article("ai-eu","European AI regulation explained",["technology"]),
    article("chips","US semiconductor technology advances",["technology"]),
    article("data","Undersea AI cables explained",["technology"]),
    article("cricket","Pakistan cricket tournament results",["sports"]),
    article("football","Football match analysis",["sports"]),
    article("tennis","Tennis tournament results",["sports"]),
    article("health","Bangladesh vaccination health research",["health"]),
    article("medicine","New clinical medicine study",["health"]),
    article("hospital","Hospital disease prevention explained",["health"]),
    article("poetry","Poetry and literature festival",["culture"]),
    article("music","Music heritage and culture",["culture"]),
    article("film","Film history explored",["culture"]),
  ].map(enrichArticle);
  const cases=[
    {topic:"technology",region:"Europe",entities:["AI"],relevant:["ai-eu","chips","data"]},
    {topic:"sports",region:"Pakistan",entities:["cricket"],relevant:["cricket","football","tennis"]},
    {topic:"health",region:"Bangladesh",entities:[],relevant:["health","medicine","hospital"]},
    {topic:"culture",region:"Philippines",entities:[],relevant:["poetry","music","film"]},
  ];
  for(const c of cases)it(`keeps precision@3 high for the ${c.topic} reader`,()=>{
    const items=rankArticles(corpus,{...technology,topics:[c.topic],regions:[c.region],entities:c.entities},[],now);
    expect(items).toHaveLength(3);
    expect(items.slice(0,3).filter(a=>c.relevant.includes(a.id)).length/3).toBe(1);
  });
  it("does not serve the same paper to contrasting profiles",()=>{
    const sets=cases.map(c=>new Set(rankArticles(corpus,{...technology,topics:[c.topic],regions:[c.region],entities:c.entities},[],now).map(a=>a.id)));
    expect([...sets[0]].filter(id=>sets[1].has(id))).toHaveLength(0);
  });
});
