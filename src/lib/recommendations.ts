import type { Article, EditionItem, Locale, Preferences } from "./domain";
import { canonicalRegion, regionMatches, termMatches } from "./article-signals";

export const RANKING_VERSION = "hybrid-v2";
export type Feedback = { article_id: string; action: string; created_at?: string };
export type RankingSignals = {
  version: string; kind: "interest" | "discovery";
  matches: { topics: string[]; entities: string[]; regions: string[]; bodyEntities?: string[]; relatedTopics?: string[] };
  contributions: { topic: number; entity: number; region: number; semantic: number; freshness: number; feedback: number; purpose: number; provenance: number };
};
export type RecommendationContext = { seenClusters?: Record<string, string> };
export type RecommendationResult = { items: EditionItem[]; candidateCount: number; exclusions: Record<string, number>; version: string };
const adjacent: Record<string, string[]> = { technology: ["science", "business"], science: ["technology", "health"], business: ["technology", "regional"], health: ["science"], sports: ["health", "culture"], culture: ["regional"], regional: ["world"], world: [] };
const round = (value: number) => Math.round(value * 1000) / 1000;
export function explainRecommendation(signals: RankingSignals, language: Locale) {
  const ur=language==="ur";
  const topicNames:Record<string,string>={world:"عالمی خبریں",regional:"جنوبی ایشیا",technology:"ٹیکنالوجی",science:"سائنس",health:"صحت",business:"کاروبار",culture:"ثقافت",sports:"کھیل"};
  const {topics,entities,regions,bodyEntities=[],relatedTopics=[]}=signals.matches;
  let reason=entities.length?(ur?`آپ کی دلچسپی ${entities.join("، ")} پر مرکوز خبر`:`Focuses on ${entities.join(", ")}, which you follow`):topics.length?(ur?`آپ کی دلچسپی ${topics.map(t=>topicNames[t]||t).join("، ")} سے متعلق`:`Matches your interest in ${topics.join(", ")}`):regions.length?(ur?`آپ کے منتخب علاقوں ${regions.join("، ")} سے متعلق`:`Reporting focused on ${regions.join(", ")}`):bodyEntities.length&&relatedTopics.length?(ur?`متعلقہ ${relatedTopics.map(t=>topicNames[t]||t).join("، ")} کی خبر جس میں ${bodyEntities.join("، ")} کا ذکر ہے`:`A related ${relatedTopics.join(", ")} story mentioning ${bodyEntities.join(", ")} in its reporting`):(ur?"معنوی مماثلت کی بنیاد پر آپ کی دلچسپیوں سے متعلق":"Related to your interests by semantic similarity");
  if(regions.length&&(entities.length||topics.length))reason+=ur?`؛ ${regions.join("، ")} سے متعلق`:`; covers ${regions.join(", ")}`;
  if(signals.contributions.feedback>.5)reason+=ur?"؛ آپ کی پسند کی وجہ سے ترجیح دی گئی":"; boosted by your More like this feedback";
  return signals.kind==="discovery"?(ur?`نیا زاویہ: ${reason}`:`Discovery: ${reason}`):reason;
}
export function wordCount(text: string) { return text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length || 0; }
export function readingMinutes(items: Pick<EditionItem, "title" | "summary">[], language: Locale) {
  const words = items.reduce((sum, item) => sum + wordCount(`${item.title} ${item.summary}`), 0);
  return words ? Math.max(1, Math.ceil(words / (language === "ur" ? 140 : 180))) : 0;
}
export function readingInfo(edition: { items: EditionItem[]; language: Locale; minutes: number }) {
  const estimated_minutes = readingMinutes(edition.items, edition.language);
  return { estimated_minutes, short: estimated_minutes < edition.minutes * .8 };
}
export function fitReadingBudget(items: EditionItem[], minutes: number, language: Locale) {
  let words = 0;
  return items.filter(item => {
    const size = wordCount(`${item.title} ${item.summary}`);
    if (words + size > minutes * (language === "ur" ? 140 : 180)) return false;
    words += size; return true;
  });
}

export function recommendArticles(articles: Article[], profile: Preferences, feedback: Feedback[] = [], now = Date.now(), semanticScores: Record<string, number> = {}, context: RecommendationContext = {}): RecommendationResult {
  const exclusions: Record<string, number> = {};
  const exclude = (reason: string) => { exclusions[reason] = (exclusions[reason] || 0) + 1; };
  const byId = new Map(articles.map(a => [a.id, a]));
  const ageOf = (entry: Feedback) => entry.created_at ? Math.max(0, (now - Date.parse(entry.created_at)) / 86400_000) : 0;
  const read = new Set(feedback.filter(f => f.action === "read").map(f => f.article_id));
  const latest = new Map<string, Feedback>();
  for (const f of feedback.filter(f => ["more", "less"].includes(f.action)).sort((a, b) => (Date.parse(a.created_at || "") || 0) - (Date.parse(b.created_at || "") || 0))) latest.set(f.article_id, f);
  const interests = profile.topics.filter(t => !["world", "regional"].includes(t));
  const broad = !interests.length;
  const candidates: (EditionItem & { primary: boolean; related: boolean })[] = [];
  const unique = new Set<string>();
  for (const article of articles) {
    if (unique.has(article.id)) continue;
    unique.add(article.id);
    const published = Date.parse(article.published_at);
    const age = (now - published) / 3600_000;
    if (!Number.isFinite(published) || age < -5 / 60 || age > 14 * 24) { exclude("date"); continue; }
    if (!article.title.trim() || !article.excerpt.trim() || !["en", "ur"].includes(article.language)) { exclude("content"); continue; }
    if (read.has(article.id) || latest.get(article.id)?.action === "less") { exclude("explicit_feedback"); continue; }
    const seenAt = context.seenClusters?.[article.cluster_id];
    if (seenAt && (profile.updates === "major" || published <= Date.parse(seenAt))) { exclude("seen_event"); continue; }
    const focus = `${article.title} ${article.excerpt}`;
    // "Alleged" in an attributed court case is not a reason to hide reporting.
    if (profile.uncertainty === "confirmed" && /\b(unconfirmed|rumou?rs?|unverified|preliminary reports?)\b/i.test(focus)) { exclude("developing"); continue; }
    const matchedTopics = article.topics.filter(t => interests.includes(t));
    const matchedEntities = profile.entities.filter(e => termMatches(focus, e) || article.entities.some(a => termMatches(a, e)));
    const bodyEntities = profile.entities.filter(e => !matchedEntities.includes(e) && termMatches(article.body || "", e));
    const matchedRegions = profile.regions.filter(r => regionMatches(article.regions, r)).map(canonicalRegion);
    const rawSimilarity = semanticScores[article.id];
    const similarity = Number.isFinite(rawSimilarity) ? Math.max(0, Math.min(1, rawSimilarity)) : 0;
    let learned = 0;
    for (const f of latest.values()) {
      const previous = byId.get(f.article_id);
      if (!previous) continue;
      const shared = previous.topics.some(t => !["world", "regional"].includes(t) && article.topics.includes(t));
      if (shared) learned += (f.action === "more" ? 1.5 : -3) * Math.exp(-ageOf(f) / 30);
      if (f.article_id === article.id && f.action === "more") learned += 2;
    }
    learned = Math.max(-4, Math.min(3, learned));
    // Uncalibrated cosine similarity can corroborate an explicit match or admit
    // a very strong semantic match. A low score can never fill an edition.
    const primary = matchedTopics.length > 0 || matchedEntities.length > 0 ||
      profile.topics.includes("world") || (broad && matchedRegions.length > 0) || similarity >= .84 || (learned >= 1.5 && similarity >= .65);
    const relatedTopics=article.topics.filter(t=>interests.some(interest=>adjacent[interest]?.includes(t)));
    const nearTopic = relatedTopics.length>0;
    const related = !primary && (bodyEntities.length > 0 && nearTopic || nearTopic && similarity >= .60 || similarity >= .72);
    if (!primary && !related) { exclude("relevance"); continue; }
    const explainer = /\b(how|why|explained|research|study|analysis|understand)\b/i.test(focus);
    const purpose = profile.purpose === "learn" ? Number(explainer) : profile.purpose === "work" ? Number(article.topics.includes("business")) : profile.purpose === "understand" ? Number(explainer) * .5 : 0;
    const contributions = {
      topic: Math.min(6, matchedTopics.length * 4) + Number(profile.topics.includes("world")) * 2,
      entity: matchedEntities.length ? 5 : Math.min(.5, bodyEntities.length * .25),
      region: matchedRegions.length ? 2 : 0,
      semantic: round(Math.max(0, (similarity - .45) / .55) * 2),
      freshness: round(Math.exp(-Math.max(0, age) / (explainer ? 168 : 48)) * 1.5),
      feedback: round(learned), purpose,
      provenance: Number(!!article.author && !!article.license_url && !!article.url) * .5,
    };
    const recommendation: RankingSignals = { version: RANKING_VERSION, kind: primary ? "interest" : "discovery", matches: { topics: matchedTopics.length?matchedTopics:profile.topics.includes("world")?["world"]:[], entities: matchedEntities, regions: matchedRegions,bodyEntities,relatedTopics }, contributions };
    const followup=seenAt?(profile.language==="ur"?"؛ آپ کی پڑھی ہوئی خبر کے بارے میں نئی رپورٹنگ":"; new reporting in a story you read"):"";
    candidates.push({ ...article, summary: article.excerpt, reason: explainRecommendation(recommendation,profile.language)+followup, score: round(Object.values(contributions).reduce((sum, v) => sum + v, 0)), recommendation, primary, related });
  }
  const estimatedWords = profile.depth === "concise" ? 70 : 130;
  const max = Math.min(12, Math.max(1, Math.floor(profile.minutes * (profile.language === "ur" ? 140 : 180) / estimatedWords)));
  const selected: typeof candidates = [];
  const clusters = new Set<string>();
  const primary = candidates.filter(a => a.primary);
  function choose(pool: typeof candidates, limit: number) {
    while (selected.length < limit) {
      // Penalize repeated publishers/topics only when alternatives pass relevance.
      const available = pool.filter(a => !clusters.has(a.cluster_id) && !selected.some(s => s.id === a.id));
      if (!available.length) break;
      const adjusted = (a: typeof candidates[number]) => {
        const sourceRepeats = selected.filter(s => s.source === a.source).length;
        const sourceAlternatives = available.some(b => b.source !== a.source);
        const topic = a.topics.find(t => !["world", "regional"].includes(t));
        const topicRepeats = selected.filter(s => topic && s.topics.includes(topic)).length;
        return a.score - (sourceAlternatives ? sourceRepeats * 1.2 : 0) - topicRepeats * .25;
      };
      available.sort((a, b) => adjusted(b) - adjusted(a) || a.id.localeCompare(b.id));
      const otherPublisher=selected.length>=2&&selected.every(a=>a.source===selected[0].source)?available.find(a=>a.source!==selected[0].source):undefined;
      const next = otherPublisher||available[0]; selected.push(next); clusters.add(next.cluster_id);
    }
  }
  const discoveryRate = profile.discovery === "high" ? .20 : profile.discovery === "medium" ? .10 : 0;
  const reserve = candidates.some(a => a.related) ? Math.floor(max * discoveryRate) : 0;
  choose(primary, max - reserve);
  const discoveryLimit = Math.min(max - selected.length, Math.floor(selected.length * discoveryRate / (1 - discoveryRate)));
  if (discoveryLimit > 0) choose(candidates.filter(a => a.related), selected.length + discoveryLimit);
  choose(primary, max);
  const selectedIds = new Set(selected.map(a => a.id));
  for (const candidate of candidates) if (!selectedIds.has(candidate.id)) exclude(clusters.has(candidate.cluster_id) ? "duplicate_event" : "composition_limit");
  return { items: selected.map(({ primary: _primary, related: _related, ...item }) => item), candidateCount: unique.size, exclusions, version: RANKING_VERSION };
}
export function rankArticles(articles: Article[], profile: Preferences, feedback: Feedback[] = [], now = Date.now(), semanticScores: Record<string, number> = {}, context: RecommendationContext = {}) {
  return recommendArticles(articles, profile, feedback, now, semanticScores, context).items;
}
