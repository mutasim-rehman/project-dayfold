import {describe,it,expect} from "vitest";
import {paperHtml} from "../src/lib/print";
import type {EditionItem} from "../src/lib/domain";
const item:EditionItem={id:"a",title:'<script>alert("x")</script>',url:"https://globalvoices.org/example",source:"Global Voices",author:"An author",published_at:"2026-10-17T08:00:00Z",excerpt:"A source excerpt",summary:"پاکستان میں تحقیق کی نئی پیش رفت۔",topics:["science"],regions:["Pakistan"],entities:[],cluster_id:"a",license_url:"https://creativecommons.org/licenses/by/3.0/",language:"ur",reason:"Science",score:1};
describe("print edition integrity",()=>{
 it("preserves Urdu direction, attribution and source links",()=>{const html=paperHtml({edition_date:"2026-10-17",language:"ur",minutes:10,items:[item]},"font-data");expect(html).toContain('dir="rtl"');expect(html).toContain(item.summary);expect(html).toContain(item.url);expect(html).toContain("An author");expect(html).toContain("CC BY 3.0");});
 it("escapes model text rather than inserting active markup",()=>{const html=paperHtml({edition_date:"2026-10-17",language:"en",minutes:10,items:[item]},"");expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');});
 it("labels a short edition with measured reading time and preserves the user's target",()=>{const html=paperHtml({edition_date:"2026-10-17",language:"en",minutes:15,items:[item]},"");expect(html).toContain("1 min estimated read");expect(html).toContain("shorter edition than your 15-minute target");expect(html).not.toContain("15 min ·");});
 it("explains empty relevant coverage rather than showing unrelated fallback stories",()=>{const html=paperHtml({edition_date:"2026-10-17",language:"en",minutes:15,items:[]},"");expect(html).toContain("No relevant reporting");expect(html).not.toContain("<article>");});
});
