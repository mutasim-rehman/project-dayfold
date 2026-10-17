import {describe,it,expect} from "vitest";
import {restrictedSourceText} from "../src/lib/source-policy";
describe("source-specific reuse filters",()=>{
 it("does not mistake the publisher's own RSS attribution footer for third-party syndication",()=>{expect(restrictedSourceText('This article was originally published on <a href="https://globalvoices.org/story">Global Voices</a>.')).toBe(false);});
 it("excludes third-party republication notices",()=>{expect(restrictedSourceText('Originally published at Another Publisher.')).toBe(true);});
 it("excludes item-level incompatible licenses",()=>{expect(restrictedSourceText('<a href="https://creativecommons.org/licenses/by-nc/4.0/">license</a>')).toBe(true);expect(restrictedSourceText('All rights reserved.')).toBe(true);});
});
