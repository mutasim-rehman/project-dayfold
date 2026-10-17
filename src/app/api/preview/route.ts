import { fetchApprovedContent } from "@/lib/content";
export const dynamic="force-dynamic";
export async function GET() {
  try {
    const articles=await fetchApprovedContent();
    return Response.json({articles:articles.map(({body,...a})=>a),coverage:"Global Voices · limited contextual coverage"},{headers:{"Cache-Control":"public, s-maxage=900, stale-while-revalidate=1800"}});
  }catch {return Response.json({articles:[],error:"The source is temporarily unavailable. Please try again later."},{status:503});}
}
