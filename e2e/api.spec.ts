import {test,expect} from "@playwright/test";
test("private account data requires authentication",async({request})=>{
 for(const route of ["/api/me","/api/editions","/api/memories","/api/admin","/api/account/export"]){const response=await request.get(route);expect(response.status(),route).toBe(401);}
});
test("foreign origins cannot mutate personal data",async({request})=>{
 for(const route of ["/api/ask","/api/editions","/api/account/delete"]){const response=await request.post(route,{headers:{origin:"https://untrusted.example"},data:{}});expect(response.status(),route).toBe(403);}
});
test("background worker rejects missing credentials",async({request})=>{expect((await request.post("/api/internal/worker")).status()).toBe(401);});
test("public reading shell responds without an account",async({request})=>{const response=await request.get("/");expect(response.ok()).toBe(true);expect(await response.text()).toContain("dayfold");});
test("OAuth canonicalizes the cookie host before starting PKCE",async({request})=>{
 const alias=await request.get("http://127.0.0.1:3000/api/auth/google",{maxRedirects:0});
 expect(alias.status()).toBe(307);expect(alias.headers().location).toBe("http://localhost:3000/api/auth/google");expect(alias.headers()["set-cookie"]).toBeUndefined();
 const canonical=await request.get("http://localhost:3000/api/auth/google",{maxRedirects:0});
 expect(canonical.status()).toBe(307);const target=new URL(canonical.headers().location);
 expect(target.pathname).toBe("/auth/v1/authorize");expect(target.searchParams.get("redirect_to")).toBe("http://localhost:3000/auth/callback");
 expect(target.searchParams.has("code_challenge")).toBe(true);expect(canonical.headers()["set-cookie"]).toContain("code-verifier");
});
test("callback reports missing verification distinctly",async({request})=>{
 const response=await request.get("http://localhost:3000/auth/callback",{maxRedirects:0});expect(response.status()).toBe(307);expect(new URL(response.headers().location).searchParams.get("auth_error")).toBe("missing_code");
});
test("same-origin loopback mutations reach authentication rather than a false CSRF rejection",async({request})=>{
 const response=await request.post("/api/editions",{headers:{origin:"http://127.0.0.1:3000"},data:{}});expect(response.status()).toBe(401);
});
