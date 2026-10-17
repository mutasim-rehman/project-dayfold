import "server-only";
import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import type { Article } from "./domain";
import {unstable_cache} from "next/cache";
import {restrictedSourceText} from "./source-policy";

const permittedHost = "globalvoices.org";
function text(value: unknown) {
  return String(value ?? "").replace(/<[^>]*>/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#8217;|&apos;/g,"’").replace(/&#8216;/g,"‘").replace(/&#8211;/g,"–").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
}
function classify(value: string) {
  const t = value.toLowerCase(); const found: string[] = [];
  if (/technolog|internet|digital|artificial intelligence/.test(t)) found.push("technology");
  if (/econom|business|trade|industr|financ/.test(t)) found.push("business");
  if (/climate|scient|research|environment/.test(t)) found.push("science");
  if (/health|hospital|disease/.test(t)) found.push("health");
  if (/sport|cricket|football/.test(t)) found.push("sports");
  if (/cultur|music|art\b|language|film|histor/.test(t)) found.push("culture");
  if (/pakistan|india|bangladesh|nepal|sri lanka|afghanistan|south asia/.test(t)) found.push("regional");
  return [...new Set(["world",...found])];
}
async function fetchFreshContent(): Promise<Article[]> {
  const response = await fetch("https://globalvoices.org/feed/", {headers:{"User-Agent":"Dayfold/0.1 (attributed news reader)"},signal:AbortSignal.timeout(15_000),cache:"no-store",redirect:"error"});
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
      const body = text(item["content:encoded"]); const title = text(item.title);
      const author=text(item["dc:creator"]) || "Global Voices contributors";
      // Licensed original text only; syndicated/restricted notices require manual review.
      if (!body || restrictedSourceText(String(item["content:encoded"]))) return [];
      if (["Hong Kong Free Press","Cool Earth","Peace News","EngageMedia"].includes(author)) return [];
      const excerpt = text(item.description).slice(0,800);
      const combined = `${title} ${body}`;
      const regions = ["Pakistan","India","Bangladesh","Nepal","Sri Lanka","Afghanistan"].filter(r => combined.toLowerCase().includes(r.toLowerCase()));
      if (regions.length) regions.push("South Asia");
      const id = createHash("sha256").update(url.href).digest("hex").slice(0,32);
      return [{id,title,url:url.href,source:"Global Voices",author,published_at:published.toISOString(),excerpt,body:body.slice(0,30_000),topics:classify(`${title} ${excerpt}`),regions,entities:[],cluster_id:id,license_url:"https://creativecommons.org/licenses/by/3.0/",language:"en"}];
    } catch { return []; }
  }).slice(0,30);
}
// Shared public-content cache only. Never place personalized records in this cache.
export const fetchApprovedContent=unstable_cache(fetchFreshContent,["global-voices-original-text-v3"],{revalidate:900});
