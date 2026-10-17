import "server-only";
import { chromium as playwright } from "playwright-core";
import chromium from "@sparticuz/chromium";
import { adminDb } from "./supabase";
import { type EditionItem } from "./domain";
import {paperHtml} from "./print";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

function windowsBrowserPath() {
  const configured=process.env.CHROMIUM_EXECUTABLE_PATH;
  if(configured){if(existsSync(configured))return configured;throw new Error("Configured PDF browser executable is unavailable");}
  const roots=[process.env.PROGRAMFILES,process.env["PROGRAMFILES(X86)"],process.env.LOCALAPPDATA].filter((v):v is string=>!!v);
  const candidates=roots.flatMap(root=>[
    join(root,"Google","Chrome","Application","chrome.exe"),
    join(root,"Microsoft","Edge","Application","msedge.exe")
  ]);
  const found=candidates.find(existsSync);
  if(!found)throw new Error("PDF browser unavailable: install Chrome/Edge or set CHROMIUM_EXECUTABLE_PATH");
  return found;
}

export function pdfFailureCode(error:unknown) {
  const message=error instanceof Error?error.message.toLowerCase():"";
  if(message.includes("browser")||message.includes("chromium")||message.includes("executable"))return "PDF_BROWSER_UNAVAILABLE";
  if(message.includes("font"))return "PDF_FONT_UNAVAILABLE";
  if(message.includes("storage")||message.includes("upload"))return "PDF_STORAGE_FAILED";
  return "PDF_PROCESSING_FAILED";
}

export async function makePdf(editionId:string,userId:string) {
  const db=adminDb();const {data,error}=await db.from("editions_dayfold").select("*").eq("id",editionId).eq("user_id",userId).eq("status","published").single();
  if(error || !data)throw new Error("Edition not available");
  if(data.pdf_path)return;
  const rtl=data.language==="ur";const items=data.items as EditionItem[];
  let fontBase64="";
  try {fontBase64=(await readFile(join(process.cwd(),"public/fonts/NotoNaskhArabic-Regular.ttf"))).toString("base64");}catch{if(rtl)throw new Error("Urdu PDF font missing");}
  const html=paperHtml({...data,items},fontBase64);
  const useWindowsBrowser=process.platform==="win32";
  const executablePath=useWindowsBrowser?windowsBrowserPath():await chromium.executablePath();
  const browser=await playwright.launch({executablePath,args:useWindowsBrowser?[]:chromium.args,headless:true});
  try {
    const page=await browser.newPage();await page.route("**/*",route=>route.abort());
    await page.setContent(html,{waitUntil:"load"});await page.evaluate(()=>document.fonts.ready);
    const pdf=await page.pdf({format:"A4",printBackground:true,displayHeaderFooter:true,headerTemplate:"<span></span>",footerTemplate:'<div style="font-size:9px;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',margin:{bottom:"20mm",top:"17mm",left:"16mm",right:"16mm"}});
    const {data:live}=await db.from("profiles_dayfold").select("onboarding_complete").eq("id",userId).single();if(!live?.onboarding_complete)throw new Error("Account unavailable");
    const path=`${userId}/${editionId}.pdf`;const {error:uploadError}=await db.storage.from("edition-pdfs-dayfold").upload(path,pdf,{contentType:"application/pdf",upsert:true});if(uploadError)throw uploadError;
    const {data:stillLive}=await db.from("profiles_dayfold").select("onboarding_complete").eq("id",userId).single();if(!stillLive?.onboarding_complete){await db.storage.from("edition-pdfs-dayfold").remove([path]);throw new Error("Account unavailable");}
    const {error:saveError}=await db.from("editions_dayfold").update({pdf_path:path}).eq("id",editionId).eq("user_id",userId);if(saveError)throw saveError;
    await db.from("events_dayfold").insert({user_id:userId,name:"pdf_ready",properties:{language:data.language}});
  } finally {await browser.close();}
}
