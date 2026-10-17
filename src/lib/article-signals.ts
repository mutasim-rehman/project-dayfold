import type { Article } from "./domain";

// Deliberately bounded, inspectable aliases. Unknown followed names still match
// as complete Unicode phrases, never as substrings of unrelated words.
const aliases: Record<string, string[]> = {
  ai: ["ai", "artificial intelligence", "machine learning", "large language model", "large language models", "مصنوعی ذہانت"],
  tech: ["tech", "technology", "technologies", "technological", "ٹیکنالوجی"],
  nasa: ["nasa", "national aeronautics and space administration", "ناسا"],
};
export function normalizeTerm(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[’']s\b/g, "").replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function containsTerm(text: string, term: string) {
  const needle = normalizeTerm(term);
  if (!needle) return false;
  return ` ${normalizeTerm(text)} `.includes(` ${needle} `);
}
export function termMatches(text: string, term: string) {
  const normalized = normalizeTerm(term);
  const group = Object.values(aliases).find(values => values.some(v => normalizeTerm(v) === normalized));
  return (group || [term]).some(value => containsTerm(text, value));
}

const geography: Record<string, { aliases: string[]; parent?: string }> = {
  "United States": { aliases: ["USA", "US", "U.S.", "U.S.A.", "United States of America", "United States", "American", "امریکہ"], parent: "North America" },
  Canada: { aliases: ["Canada", "Canadian", "کینیڈا"], parent: "North America" },
  Mexico: { aliases: ["Mexico", "Mexican"], parent: "North America" },
  "United Kingdom": { aliases: ["UK", "U.K.", "Britain", "British", "United Kingdom", "برطانیہ"], parent: "Europe" },
  Germany: { aliases: ["Germany", "German", "جرمنی"], parent: "Europe" },
  France: { aliases: ["France", "French", "فرانس"], parent: "Europe" },
  Norway: { aliases: ["Norway", "Norwegian"], parent: "Europe" },
  Spain: { aliases: ["Spain", "Spanish"], parent: "Europe" },
  Italy: { aliases: ["Italy", "Italian"], parent: "Europe" },
  Netherlands: { aliases: ["Netherlands", "Dutch"], parent: "Europe" },
  Sweden: { aliases: ["Sweden", "Swedish"], parent: "Europe" },
  Finland: { aliases: ["Finland", "Finnish"], parent: "Europe" },
  Switzerland: { aliases: ["Switzerland", "Swiss"], parent: "Europe" },
  Poland: { aliases: ["Poland", "Polish"], parent: "Europe" },
  Ukraine: { aliases: ["Ukraine", "Ukrainian"], parent: "Europe" },
  Pakistan: { aliases: ["Pakistan", "Pakistani", "پاکستان"], parent: "South Asia" },
  India: { aliases: ["India", "Indian", "بھارت", "انڈیا"], parent: "South Asia" },
  Bangladesh: { aliases: ["Bangladesh", "Bangladeshi", "بنگلہ دیش"], parent: "South Asia" },
  Nepal: { aliases: ["Nepal", "Nepali", "Nepalese", "نیپال"], parent: "South Asia" },
  "Sri Lanka": { aliases: ["Sri Lanka", "Sri Lankan", "سری لنکا"], parent: "South Asia" },
  Afghanistan: { aliases: ["Afghanistan", "Afghan", "افغانستان"], parent: "South Asia" },
  Bhutan: { aliases: ["Bhutan", "Bhutanese"], parent: "South Asia" },
  Maldives: { aliases: ["Maldives", "Maldivian"], parent: "South Asia" },
  China: { aliases: ["China", "Chinese", "چین"], parent: "East Asia" },
  Japan: { aliases: ["Japan", "Japanese", "جاپان"], parent: "East Asia" },
  "South Korea": { aliases: ["South Korea", "South Korean"], parent: "East Asia" },
  Taiwan: { aliases: ["Taiwan", "Taiwanese"], parent: "East Asia" },
  Myanmar: { aliases: ["Myanmar", "Burmese"], parent: "Southeast Asia" },
  Malaysia: { aliases: ["Malaysia", "Malaysian"], parent: "Southeast Asia" },
  Philippines: { aliases: ["Philippines", "Filipino", "Philippine"], parent: "Southeast Asia" },
  Indonesia: { aliases: ["Indonesia", "Indonesian"], parent: "Southeast Asia" },
  Singapore: { aliases: ["Singapore", "Singaporean"], parent: "Southeast Asia" },
  Thailand: { aliases: ["Thailand", "Thai"], parent: "Southeast Asia" },
  Russia: { aliases: ["Russia", "Russian", "روس"], parent: "Eastern Europe and Central Asia" },
  Kyrgyzstan: { aliases: ["Kyrgyzstan", "Kyrgyz"], parent: "Central Asia" },
  Iran: { aliases: ["Iran", "Iranian", "ایران"], parent: "Middle East" },
  "Saudi Arabia": { aliases: ["Saudi Arabia", "Saudi", "سعودی عرب"], parent: "Middle East" },
  Israel: { aliases: ["Israel", "Israeli"], parent: "Middle East" },
  Palestine: { aliases: ["Palestine", "Palestinian", "Gaza"], parent: "Middle East" },
  Brazil: { aliases: ["Brazil", "Brazilian"], parent: "South America" },
  Ecuador: { aliases: ["Ecuador", "Ecuadorian"], parent: "South America" },
  Argentina: { aliases: ["Argentina", "Argentine"], parent: "South America" },
  Mozambique: { aliases: ["Mozambique", "Mozambican"], parent: "Africa" },
  "South Africa": { aliases: ["South Africa", "South African"], parent: "Africa" },
  Nigeria: { aliases: ["Nigeria", "Nigerian"], parent: "Africa" },
  Kenya: { aliases: ["Kenya", "Kenyan"], parent: "Africa" },
  Australia: { aliases: ["Australia", "Australian"], parent: "Oceania" },
  "New Zealand": { aliases: ["New Zealand"], parent: "Oceania" },
  Europe: { aliases: ["Europe", "European", "European Union", "EU", "یورپ"] },
  "South Asia": { aliases: ["South Asia", "South Asian", "جنوبی ایشیا"] },
  "North America": { aliases: ["North America", "North American"] },
  "South America": { aliases: ["South America", "South American"] },
  "Latin America": { aliases: ["Latin America", "Latin American"] },
  "Middle East": { aliases: ["Middle East", "Middle Eastern"] },
  Africa: { aliases: ["Africa", "African", "افریقہ"] },
  Asia: { aliases: ["Asia", "Asian", "ایشیا"] },
};
export function canonicalRegion(value: string) {
  const key = normalizeTerm(value);
  return Object.entries(geography).find(([name, data]) => [name, ...data.aliases].some(a => normalizeTerm(a) === key))?.[0] || value.trim();
}
export function regionMatches(regions: string[], preference: string) {
  const target = canonicalRegion(preference);
  return regions.some(value => {
    const country = canonicalRegion(value);
    return normalizeTerm(country) === normalizeTerm(target) || geography[country]?.parent === target ||
      (target === "Asia" && /Asia$/.test(geography[country]?.parent || country)) ||
      (target === "Latin America" && ["South America", "Mexico"].includes(geography[country]?.parent || country));
  });
}
export function inferRegions(focus: string) {
  const countries = Object.entries(geography).filter(([, data]) => data.aliases.some(a => {
    if (["US", "USA", "UK", "EU"].includes(a)) return new RegExp(`(^|[^\\p{L}\\p{N}])${a}($|[^\\p{L}\\p{N}])`, "u").test(focus);
    return containsTerm(focus, a);
  })).map(([name]) => name);
  return [...new Set([...countries, ...countries.flatMap(name => geography[name]?.parent ? [geography[name].parent!] : [])])];
}

const topicPatterns: Record<string, RegExp> = {
  technology: /\b(ai|artificial intelligence|machine learning|large language models?|openai|anthropic|nvidia|alibaba|google|microsoft|tsmc|technolog\w*|digital|internet|software|comput\w*|data cent\w*|telecom\w*|cyber\w*|robot\w*|semiconductor\w*|satellite\w*|surveillance|subsea cables|undersea cables)\b|مصنوعی ذہانت|ٹیکنالوجی|انٹرنیٹ/iu,
  business: /\b(econom\w*|business\w*|trade|industr\w*|financ\w*|invest\w*|market\w*|migration|recruitment|labou?r|oil|energy)\b|معیشت|کاروبار/iu,
  science: /\b(climate|scien\w*|research\w*|environment\w*|astronom\w*|nasa|space|experiment\w*|biodiversity|physics)\b|سائنس|ماحول/iu,
  health: /\b(health\w*|hospital\w*|disease\w*|medical|medicine|vaccin\w*|trans fats?|nutrition|disabilit\w*|clinical)\b|صحت|بیماری/iu,
  sports: /\b(sport\w*|cricket|football|soccer|tennis|olympic\w*|tournament\w*|athlet\w*)\b|کرکٹ|کھیل/iu,
  culture: /\b(cultur\w*|music\w*|arts?|language\w*|film\w*|histor\w*|poetr\w*|literatur\w*|heritage|hip hop)\b|ثقافت|شاعری|موسیقی/iu,
};
export function classifyArticle(article: Pick<Article, "title" | "excerpt" | "body">) {
  // Headline/standfirst carry focus. Body-only passing mentions cannot set topics
  // or geography; body is reserved for a weaker, separately recorded signal.
  const focus = `${article.title} ${article.excerpt}`;
  const regions = inferRegions(focus);
  const topics = Object.entries(topicPatterns).filter(([, pattern]) => pattern.test(focus)).map(([topic]) => topic);
  if (regions.includes("South Asia")) topics.push("regional");
  return { topics: ["world", ...topics], regions, entities: Object.entries(aliases).filter(([, names]) => names.some(a => containsTerm(focus, a))).map(([key]) => key) };
}
export function enrichArticle(article: Article): Article {
  return { ...article, ...classifyArticle(article) };
}
