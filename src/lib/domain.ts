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
export type EditionItem = Article & { summary: string; reason: string; score: number; translated?: boolean; evidence_hash?:string };
export type Edition = { id: string; edition_date: string; created_at: string; language: Locale; items: EditionItem[]; status: string; minutes: number; short?: boolean };
export type MemoryCandidate = { operation: "upsert" | "remove"; kind: "topic" | "entity" | "region"; value: string; scope: "ongoing" | "temporary"; explicit: boolean; sensitive: boolean; evidence_quote: string };

export function localDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)?.value).join("-");
}

export function rankArticles(articles: Article[], profile: Preferences, feedback: {article_id: string; action: string}[] = [], now = Date.now(), semanticScores:Record<string,number> = {}): EditionItem[] {
  const seen = new Set(feedback.filter(f => ["read", "less"].includes(f.action)).map(f => f.article_id));
  const likedTopics=feedback.filter(f=>f.action==="more").flatMap(f=>articles.find(a=>a.id===f.article_id)?.topics||[]);
  const scored = articles.filter(a => !seen.has(a.id) && Date.parse(a.published_at) <= now + 5 * 60_000).map(a => {
    const matched = a.topics.filter(t => profile.topics.includes(t));
    const region = a.regions.some(r => profile.regions.some(p => r.toLowerCase().includes(p.toLowerCase())));
    const articleText=`${a.title} ${a.excerpt} ${a.body||""}`.toLowerCase();
    const entity = profile.entities.some(e => e.trim().length>1 && articleText.includes(e.toLowerCase()));
    const age = Math.max(0, (now - Date.parse(a.published_at)) / 3_600_000);
    const text = `${a.title} ${a.excerpt}`.toLowerCase();
    const purposeBoost = profile.purpose === "work" ? Number(/econom|business|policy|industry/.test(text)) : profile.purpose === "learn" ? Number(/explain|research|study|history/.test(text)) : profile.purpose === "explore" ? Number(!matched.length) : 0;
    const confidencePenalty = profile.uncertainty === "confirmed" && /unconfirmed|rumou?r|alleged/.test(text) ? 2 : 0;
    const likeBoost=Math.min(2,a.topics.reduce((n,t)=>n+likedTopics.filter(v=>v===t).length*.3,0));
    const score = matched.length * 3 + Number(region) * 2 + Number(entity) * 4 + Math.exp(-age / 72) * 2 + purposeBoost - confidencePenalty + likeBoost + (semanticScores[a.id]||0)*3;
    return { ...a, summary: a.excerpt, score, reason: entity ? "A topic or organization you follow" : matched.length ? `Matches your interest in ${matched.join(", ")}` : region ? "Coverage from a region you follow" : "A different perspective to explore" };
  }).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id));
  const selected: EditionItem[] = []; const clusters = new Set<string>();
  const max = Math.min(12, Math.max(3, Math.round(profile.minutes * .8)));
  const exploration = profile.discovery === "low" ? 0 : profile.discovery === "high" ? 2 : 1;
  for (const article of scored) {
    if (clusters.has(article.cluster_id)) continue;
    if (selected.length >= max - exploration) break;
    selected.push(article); clusters.add(article.cluster_id);
  }
  const discovery = scored.filter(a => !a.topics.some(t => profile.topics.includes(t)));
  for (const article of [...discovery, ...scored]) {
    if (selected.length >= max) break;
    if (!clusters.has(article.cluster_id)) { selected.push(article); clusters.add(article.cluster_id); }
  }
  return selected;
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
