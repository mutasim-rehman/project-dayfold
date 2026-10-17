import {test,expect} from "@playwright/test";
test("private account data requires authentication",async({request})=>{
 for(const route of ["/api/me","/api/editions","/api/memories","/api/admin","/api/account/export"]){const response=await request.get(route);expect(response.status(),route).toBe(401);}
});
test("foreign origins cannot mutate personal data",async({request})=>{
 for(const route of ["/api/ask","/api/editions","/api/account/delete"]){const response=await request.post(route,{headers:{origin:"https://untrusted.example"},data:{}});expect(response.status(),route).toBe(403);}
});
test("background worker rejects missing credentials",async({request})=>{expect((await request.post("/api/internal/worker")).status()).toBe(401);});
test("public reading shell responds without an account",async({request})=>{const response=await request.get("/");expect(response.ok()).toBe(true);expect(await response.text()).toContain("dayfold");});
