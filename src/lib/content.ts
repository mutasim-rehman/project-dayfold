import "server-only";
import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import type { Article } from "./domain";
import {unstable_cache} from "next/cache";
import {restrictedSourceText} from "./source-policy";
import {classifyArticle} from "./article-signals";

const permittedHost = "globalvoices.org";
export const GLOBAL_VOICES_FEEDS = [
  "https://globalvoices.org/feed/",
  "https://globalvoices.org/-/topics/technology/feed/",
  "https://globalvoices.org/-/topics/science/feed/",
  "https://globalvoices.org/-/topics/health/feed/",
  "https://globalvoices.org/-/topics/sport/feed/",
  "https://globalvoices.org/-/topics/economics-business/feed/",
];
function text(value: unknown) {
  return String(value ?? "").replace(/<[^>]*>/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#8217;|&apos;/g,"’").replace(/&#8216;/g,"‘").replace(/&#8211;/g,"–").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
}
async function fetchFeed(feedUrl:string): Promise<Article[]> {
  const response = await fetch(feedUrl, {headers:{"User-Agent":"Dayfold/0.1 (attributed news reader)"},signal:AbortSignal.timeout(15_000),cache:"no-store",redirect:"error"});
  if (!response.ok) throw new Error("Source unavailable");
  const raw = await response.text(); if (raw.length > 3_000_000) throw new Error("Feed exceeds limit");
  const parsed = new XMLParser({ignoreAttributes:false,processEntities:false}).parse(raw);
  const items = parsed?.rss?.channel?.item;
  if (!items) throw new Error("Invalid feed");
  return (Array.isArray(items) ? items : [items]).flatMap((item: Record<string,unknown>) => {
    try {
      const url = new URL(String(item.link));
      if (url.protocol !== "https:" || url.hostname !== permittedHost) return [];
      const published = new Date(String(item.pubDate));
      if (!Number.isFinite(published.getTime()) || published.getTime() > Date.now() + 300_000) return [];
      if(published.getTime()<Date.now()-14*86400_000)return [];
      const body = text(item["content:encoded"]); const title = text(item.title);
      const author=text(item["dc:creator"]) || "Global Voices contributors";
      // Licensed original text only; syndicated/restricted notices require manual review.
      if (!body || restrictedSourceText(String(item["content:encoded"]))) return [];
      if (["Hong Kong Free Press","Cool Earth","Peace News","EngageMedia"].includes(author)) return [];
      const excerpt = text(item.description).slice(0,800);
      const signals = classifyArticle({title, excerpt, body});
      const id = createHash("sha256").update(url.href).digest("hex").slice(0,32);
      return [{id,title,url:url.href,source:"Global Voices",author,published_at:published.toISOString(),excerpt,body:body.slice(0,30_000),...signals,cluster_id:id,license_url:"https://creativecommons.org/licenses/by/3.0/",language:"en"}];
    } catch { return []; }
  }).slice(0,30);
}
export async function fetchFreshContent():Promise<Article[]> {
  const results=await Promise.allSettled(GLOBAL_VOICES_FEEDS.map(fetchFeed));
  const articles=new Map<string,Article>();
  for(const result of results)if(result.status==="fulfilled")for(const article of result.value)articles.set(article.id,article);
  if(!articles.size)throw new Error("No licensed source evidence available");
  return [...articles.values()].sort((a,b)=>b.published_at.localeCompare(a.published_at)).slice(0,150);
}
// Shared public-content cache only. Never place personalized records in this cache.
export const fetchApprovedContent=unstable_cache(fetchFreshContent,["global-voices-original-text-v4"],{revalidate:900});
