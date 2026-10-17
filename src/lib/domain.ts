export const topics = ["world", "regional", "technology", "business", "science", "health", "sports", "culture"] as const;
export type Topic = typeof topics[number];
export type Locale = "en" | "ur";
export type Preferences = {
  topics: string[]; regions: string[]; entities: string[]; minutes: number;
  language: Locale; purpose: string; depth: string; discovery: string;
  uncertainty: string; updates: string; timezone: string; memory_enabled: boolean;
};
export const defaultPreferences: Preferences = {
  topics: ["world", "technology", "regional"], regions: ["South Asia"], entities: [],
  minutes: 10, language: "en", purpose: "understand", depth: "context",
  discovery: "medium", uncertainty: "confirmed", updates: "major",
  timezone: "Asia/Karachi", memory_enabled: false
};
export type Article = {
  id: string; title: string; url: string; source: string; author: string;
  published_at: string; excerpt: string; body?: string; topics: string[];
  regions: string[]; entities: string[]; cluster_id: string; license_url: string;
  language: string;
};
export type EditionItem = Article & { summary: string; reason: string; score: number; translated?: boolean; evidence_hash?:string; recommendation?: import("./recommendations").RankingSignals };
export type Edition = { id: string; edition_date: string; created_at: string; language: Locale; items: EditionItem[]; status: string; minutes: number; short?: boolean; estimated_minutes?: number };
export type MemoryCandidate = { operation: "upsert" | "remove"; kind: "topic" | "entity" | "region"; value: string; scope: "ongoing" | "temporary"; explicit: boolean; sensitive: boolean; evidence_quote: string };

export function localDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)?.value).join("-");
}

export {rankArticles} from "./recommendations";

// Allowlist the frozen snapshot: database vectors and source bodies are never
// copied into personalized JSON or sent to the browser, including older editions.
export function editionItemSnapshot(item: EditionItem): EditionItem {
  const {id,title,url,source,author,published_at,excerpt,topics,regions,entities,cluster_id,license_url,language,summary,reason,score,translated,evidence_hash,recommendation}=item;
  return {id,title,url,source,author,published_at,excerpt,topics,regions,entities,cluster_id,license_url,language,summary,reason,score,translated,evidence_hash,recommendation};
}

export function validateMemory(candidate: MemoryCandidate, message: string) {
  const value = candidate.value.trim();
  if (!candidate.explicit || candidate.sensitive || candidate.scope !== "ongoing" || !value || value.length > 80) return false;
  if (!candidate.evidence_quote || !message.includes(candidate.evidence_quote)) return false;
  if (/\b(health condition|religion|political affiliation|sexual orientation)\b/i.test(value)) return false;
  return true;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
}

export function groupStories(incoming:Article[],existing:Article[]) {
  const pool=[...existing];const stop=new Set(["about","after","before","their","there","these","those","which","with","from","this","that","have","been","into","over","under"]);
  const tokens=(s:string)=>new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(t=>t.length>3&&!stop.has(t))||[]);
  return incoming.map(article=>{
    const same=pool.find(a=>a.id===article.id);if(same)return {...article,cluster_id:same.cluster_id};
    const a=tokens(article.title);
    const match=pool.find(other=>{
      if(Math.abs(Date.parse(other.published_at)-Date.parse(article.published_at))>3*86400_000)return false;
      const b=tokens(other.title);const overlap=[...a].filter(t=>b.has(t)).length;
      return overlap>=4 && overlap/new Set([...a,...b]).size>=.7;
    });
    const result={...article,cluster_id:match?.cluster_id||article.id};pool.push(result);return result;
  });
}
