import {describe,it,expect} from "vitest";
import {authOrigin,incomingOrigin,authFailureCode} from "../src/lib/auth-origin";
describe("OAuth cookie-host consistency",()=>{
  it("canonicalizes the browser's loopback alias before issuing a PKCE cookie",()=>{const request=new Request("http://localhost:3000/api/auth/google",{headers:{host:"127.0.0.1:3000"}});expect(incomingOrigin(request)).toBe("http://127.0.0.1:3000");expect(authOrigin(request)).toBe("http://localhost:3000");});
  it("keeps a canonical localhost request on the same cookie host",()=>{expect(authOrigin(new Request("http://localhost:3000/api/auth/google",{headers:{host:"localhost:3000"}}))).toBe("http://localhost:3000");});
  it("honors an explicitly configured loopback origin",()=>{expect(authOrigin(new Request("http://localhost:3000/"),"http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");});
  it("does not let an arbitrary host header control production redirects",()=>{expect(authOrigin(new Request("https://dayfold.example/",{headers:{host:"evil.example"}}),"https://dayfold.example")).toBe("https://dayfold.example");});
  it("rejects an accidental localhost production callback and insecure public origins",()=>{expect(()=>authOrigin(new Request("https://dayfold.example/"),"http://localhost:3000")).toThrow();expect(()=>authOrigin(new Request("https://dayfold.example/"),"http://evil.example")).toThrow();});
  it("exposes only safe failure categories",()=>{expect(authFailureCode({code:"bad_code_verifier",message:"private provider details"})).toBe("verification");expect(authFailureCode({code:"unknown"})).toBe("exchange");});
});
