import {escapeHtml,type EditionItem,type Locale} from "./domain";
export function paperHtml(edition:{edition_date:string;language:Locale;minutes:number;items:EditionItem[]},fontBase64:string){
  const rtl=edition.language==="ur";
  return `<!doctype html><html lang="${rtl?"ur":"en"}" dir="${rtl?"rtl":"ltr"}"><head><meta charset="utf-8"><style>
    @font-face{font-family:Urdu;src:url(data:font/ttf;base64,${fontBase64})}
    @page{size:A4;margin:17mm 16mm}body{color:#1e302b;font:12px/1.8 ${rtl?"Urdu":"Georgia"},serif}header{border-bottom:3px double #243f34;text-align:center;margin-bottom:20px}h1{font:43px Georgia;margin:0;direction:ltr}h2{font-size:21px;line-height:1.5;margin:10px 0}article{break-inside:avoid;border-bottom:1px solid #bbb;padding-bottom:15px;margin-bottom:15px}a{color:#215c47;overflow-wrap:anywhere}.meta{font:10px/1.5 Arial,sans-serif;color:#555}p{margin:8px 0}.notice{border:1px solid #bbb;padding:8px}footer{font-size:10px}
    </style></head><body><header><p class="meta">YOUR DAILY PERSPECTIVE</p><h1>dayfold.</h1><p>${escapeHtml(edition.edition_date)} · ${edition.minutes} min · ${rtl?"اردو":"English"}</p></header>
    <p class="notice">${rtl?"یہ اشاعت گلوبل وائسز کے محدود ذرائع پر مبنی ہے۔ ترجمہ شدہ خلاصوں کے اصل روابط نیچے موجود ہیں۔":"Limited contextual coverage from Global Voices. Adapted summaries/excerpts, not a complete breaking-news service."}</p>
    ${edition.items.map((a,i)=>`<article><span class="meta">${i+1} / ${escapeHtml(a.source)} · ${escapeHtml(a.published_at.slice(0,10))}</span><h2 dir="auto">${escapeHtml(a.title)}</h2><p dir="auto">${escapeHtml(a.summary)}</p><p class="meta">By ${escapeHtml(a.author)} · Adapted/translated for Dayfold · <a href="${escapeHtml(a.license_url)}">CC BY 3.0</a></p><a href="${escapeHtml(a.url)}">${escapeHtml(a.url)}</a></article>`).join("")}
    <footer>Sources and author attribution are part of this edition. Text adapted under the linked licenses. Third-party images are excluded.</footer></body></html>`;
}
